import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseItemizedBillText,
  benchmarkCptLineItem,
  auditMedicalBill,
  generateNegotiationStrategy,
} from '../lib/billing/medicalBillAuditor.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('parseItemizedBillText parses Jordan Lee seed hospital bill accurately', () => {
  const seedPath = path.resolve(__dirname, '../data/seed/jordan-itemized-bill.txt');
  const raw = fs.readFileSync(seedPath, 'utf8');
  const parsed = parseItemizedBillText(raw);

  assert.equal(parsed.patientName, 'Jordan Lee');
  assert.equal(parsed.accountNumber, 'MRN-204811');
  assert.equal(parsed.claimNumber, 'CLM-771920');
  assert.equal(parsed.totalCharges, 4400);
  assert.equal(parsed.insurancePaid, 1900);
  assert.equal(parsed.patientResponsibility, 2500);
  assert.equal(parsed.lineItems.length, 6);
  assert.equal(parsed.lineItems[0].code, '99284');
  assert.equal(parsed.lineItems[0].amount, 1850);
});

test('benchmarkCptLineItem calculates locality-adjusted CMS Medicare rates and markup multiples', () => {
  const bm = benchmarkCptLineItem(
    { code: '99284', description: 'ED Visit Level 4', quantity: 1, amount: 1850 },
    { locality: 'nyc', fairMultiple: 1.75 }
  );
  assert.equal(bm.knownCpt, true);
  assert.equal(bm.medicareAllowed, 332.32);
  assert.ok(bm.markupMultiple > 5.0);
  assert.ok(bm.potentialOvercharge > 1200);
});

test('auditMedicalBill detects duplicate CPT 80053, opaque PHARM code, extreme markups, and missing EOB adjustment', () => {
  const seedPath = path.resolve(__dirname, '../data/seed/jordan-itemized-bill.txt');
  const raw = fs.readFileSync(seedPath, 'utf8');
  const report = auditMedicalBill(raw, { locality: 'nyc' });

  const types = new Set(report.issues.map((i) => i.type));
  assert.equal(types.has('duplicate_charge'), true);
  assert.equal(types.has('unclear_charge'), true);
  assert.equal(types.has('excessive_markup'), true);
  assert.equal(types.has('insurance_mismatch'), true);
  assert.ok(report.estimatedLineSavings > 2500);
});

test('auditMedicalBill detects NCCI unbundling violations and respects distinct-service modifiers (-59/-91)', () => {
  const unbundledBill = {
    patientName: 'Alex Rivera',
    providerName: 'Metro Hospital',
    serviceDates: '2026-08-01',
    totalCharges: 950,
    insurancePaid: 0,
    patientResponsibility: 950,
    lineItems: [
      { id: '1', code: '80053', description: 'Comprehensive metabolic panel', quantity: 1, amount: 300 },
      { id: '2', code: '80048', description: 'Basic metabolic panel', quantity: 1, amount: 220 },
      { id: '3', code: '96360', description: 'IV hydration initial hour', quantity: 1, amount: 350 },
      { id: '4', code: '36415', description: 'Routine venipuncture', quantity: 1, amount: 80 },
    ],
  };

  const report = auditMedicalBill(unbundledBill, { locality: 'national' });
  const ncci = report.issues.filter((i) => i.type === 'ncci_unbundling');
  assert.equal(ncci.length, 2);

  // Adding modifier -91 to repeat lab and -59 to separate venipuncture suppresses duplicate/unbundling flags
  const modifiedBill = {
    ...unbundledBill,
    lineItems: [
      { id: '1', code: '80053', description: 'CMP morning', quantity: 1, amount: 300 },
      { id: '2', code: '80053', modifier: '91', description: 'CMP repeat evening', quantity: 1, amount: 300 },
      { id: '3', code: '96360', description: 'IV hydration', quantity: 1, amount: 270 },
      { id: '4', code: '36415', modifier: '59', description: 'Separate arterial/venous site draw', quantity: 1, amount: 80 },
    ],
  };
  const modReport = auditMedicalBill(modifiedBill, { locality: 'national' });
  assert.equal(modReport.issues.filter((i) => i.type === 'duplicate_charge').length, 0);
  assert.equal(modReport.issues.filter((i) => i.type === 'ncci_unbundling').length, 0);
});

test('generateNegotiationStrategy produces actionable settlement offer and dispute steps', () => {
  const seedPath = path.resolve(__dirname, '../data/seed/jordan-itemized-bill.txt');
  const report = auditMedicalBill(fs.readFileSync(seedPath, 'utf8'), { locality: 'nyc' });
  const strategy = generateNegotiationStrategy(report);

  assert.ok(strategy.targetReductionUsd > 0);
  assert.ok(strategy.openingSettlementOfferUsd > 0);
  assert.ok(strategy.walkAwayCeilingUsd >= strategy.openingSettlementOfferUsd);
  assert.ok(strategy.scriptSteps.length >= 3);
});

test('parseItemizedBillText handles multi-page OCR headers, accounting negative parentheses, optional Qty, and inline negative adjustments', () => {
  const multiPageOcrBill = [
    '--- Page 1 of 2 ---',
    'Northwestern Memorial Hospital - Statement of Account',
    'Patient: Taylor Morgan',
    'Account: ACCT-99812',
    'Service date: 2026-09-10',
    '99284 Emergency Dept Level 4 $1,850.00',
    '80053 Comprehensive Metabolic Panel Qty 1 $410.00',
    'Continued on next page',
    '=== Page 2 of 2 ===',
    'ADJ01 Plan Contractual Adjustment Qty 1 ($360.00)',
    'ADJ02 Prompt Pay Credit -$100.00',
    'Total charges: $2,260.00 (est. - see page 2)',
    'Contractual adjustment: ($200.00)',
    'Due 2026-10-15',
  ].join('\n');

  const parsed = parseItemizedBillText(multiPageOcrBill);
  assert.equal(parsed.providerName, 'Northwestern Memorial Hospital');
  assert.equal(parsed.patientName, 'Taylor Morgan');
  assert.equal(parsed.lineItems.length, 2);
  assert.equal(parsed.lineItems[0].code, '99284');
  assert.equal(parsed.lineItems[0].quantity, 1);
  assert.equal(parsed.lineItems[0].amount, 1850);
  assert.equal(parsed.totalCharges, 2260);
  assert.equal(parsed.contractualAdjustment, 660);
  assert.equal(parsed.patientResponsibility, 1600);
});

test('auditMedicalBill does not double-count excessive markup across 3+ duplicate charges and handles unlisted CPT codes', () => {
  const tripleDuplicateBill = {
    patientName: 'Casey Kim',
    providerName: 'Metro Health',
    serviceDates: '2026-09-12',
    totalCharges: 3230,
    lineItems: [
      { id: 'line-1', code: '80053', description: 'CMP #1', quantity: 1, amount: 410 },
      { id: 'line-2', code: '80053', description: 'CMP #2', quantity: 1, amount: 410 },
      { id: 'line-3', code: '80053', description: 'CMP #3', quantity: 1, amount: 410 },
      { id: 'line-4', code: '29881', description: 'Knee arthroscopy meniscectomy', quantity: 1, amount: 2000 },
    ],
  };

  const report = auditMedicalBill(tripleDuplicateBill, { locality: 'nyc' });
  // 2 duplicates ($820) + markup on first 80053 ($378.97) = $1198.97 (must never exceed $1230 billed for 80053)
  assert.ok(report.estimatedLineSavings < 1230, `Expected savings < 1230, got ${report.estimatedLineSavings}`);
  assert.equal(report.patientResponsibility, 3230);
  assert.ok(report.recommendedSettlementOffer >= 1000, `Expected positive settlement offer for unlisted surgical code, got ${report.recommendedSettlementOffer}`);
});

import { summarizeAuditDiagnostics } from '../lib/billing/medicalBillAuditor.mjs';

test('summarizeAuditDiagnostics computes overcharge ratio and validates invariants', () => {
  const report = auditMedicalBill({
    lineItems: [
      { id: '1', code: '99285', description: 'ER Visit Level 5', amount: 4200, quantity: 1 },
      { id: '2', code: '36415', description: 'Routine Venipuncture', amount: 180, quantity: 1 },
      { id: '3', code: '80053', description: 'Comprehensive Metabolic Panel', amount: 650, quantity: 1 },
    ],
  });
  const diag = summarizeAuditDiagnostics(report);
  assert.equal(diag.invariantsOk, true);
  assert.ok(diag.overchargeRatio > 0 && diag.overchargeRatio <= 1);
  assert.ok(diag.findingCount >= 1);
  assert.throws(() => summarizeAuditDiagnostics(null), /auditReport must be a valid object/);
});
