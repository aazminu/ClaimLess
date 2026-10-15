/**
 * ClaimLess Deterministic Medical Bill Auditor, CMS Medicare Fee Schedule Benchmarker,
 * NCCI Unbundling Detector, and Patient Negotiation Strategy Engine.
 */

// Representative CMS Medicare National Facility/Non-Facility Allowed Amounts (USD)
export const CMS_MEDICARE_FEE_SCHEDULE = {
  '99282': { description: 'Emergency department visit - Level 2', medicareRate: 84.0, category: 'E&M' },
  '99283': { description: 'Emergency department visit - Level 3', medicareRate: 142.0, category: 'E&M' },
  '99284': { description: 'Emergency department visit - Level 4', medicareRate: 268.0, category: 'E&M' },
  '99285': { description: 'Emergency department visit - Level 5', medicareRate: 395.0, category: 'E&M' },
  '80048': { description: 'Basic metabolic panel (BMP)', medicareRate: 11.5, category: 'Lab' },
  '80051': { description: 'Electrolyte panel', medicareRate: 9.5, category: 'Lab' },
  '80053': { description: 'Comprehensive metabolic panel (CMP)', medicareRate: 14.3, category: 'Lab' },
  '85025': { description: 'Complete blood count (CBC) with differential', medicareRate: 10.6, category: 'Lab' },
  '96360': { description: 'IV hydration infusion, initial 31 min to 1 hour', medicareRate: 62.0, category: 'Infusion' },
  '96361': { description: 'IV hydration infusion, each additional hour', medicareRate: 21.0, category: 'Infusion' },
  '36415': { description: 'Routine venipuncture (blood draw)', medicareRate: 8.5, category: 'Lab' },
  '71045': { description: 'Chest X-ray, single view', medicareRate: 28.0, category: 'Radiology' },
  '71046': { description: 'Chest X-ray, 2 views', medicareRate: 36.5, category: 'Radiology' },
  '70450': { description: 'CT head/brain without contrast', medicareRate: 148.0, category: 'Radiology' },
  '74177': { description: 'CT abdomen and pelvis with contrast', medicareRate: 285.0, category: 'Radiology' },
  '93000': { description: 'Electrocardiogram (ECG/EKG), 12-lead complete', medicareRate: 24.0, category: 'Cardiology' },
};

export const GPCI_LOCALITY_MULTIPLIERS = {
  national: 1.0,
  nyc: 1.24,
  sf: 1.31,
  chicago: 1.08,
  miami: 1.10,
};

// National Correct Coding Initiative (NCCI) Column 1 -> Column 2 bundled / mutually exclusive code pairs
export const NCCI_BUNDLED_PAIRS = [
  {
    primary: '80053',
    bundled: '80048',
    reason: 'CPT 80048 (Basic Metabolic Panel) is a strict subset of CPT 80053 (Comprehensive Metabolic Panel) and cannot be billed separately on the same date.',
  },
  {
    primary: '80053',
    bundled: '80051',
    reason: 'CPT 80051 (Electrolyte Panel) is already included in CPT 80053 (Comprehensive Metabolic Panel).',
  },
  {
    primary: '71046',
    bundled: '71045',
    reason: 'CPT 71045 (1-view Chest X-Ray) is bundled into CPT 71046 (2-view Chest X-Ray) when performed during the same encounter.',
  },
  {
    primary: '99285',
    bundled: '99284',
    reason: 'Multiple Emergency Department evaluation & management levels (99284 and 99285) cannot be billed for the same encounter.',
  },
  {
    primary: '96360',
    bundled: '36415',
    reason: 'Routine venipuncture (36415) is bundled into IV infusion setup (96360) unless performed at a separate anatomical site with modifier -59.',
  },
];

const DISTINCT_SERVICE_MODIFIERS = new Set(['59', '76', '77', '91', 'XE', 'XP', 'XS', 'XU']);
const OPAQUE_REVENUE_CODES = new Set(['PHARM', 'MISC', 'SUPPLY', '0250', '0270', '99070']);

function parseCurrency(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (!raw || typeof raw !== 'string') return 0;
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  const val = Number(cleaned);
  return Number.isFinite(val) ? val : 0;
}

/**
 * Parse raw itemized medical statement text into structured patient/provider metadata,
 * line items, and financial totals.
 * @param {string} text
 */
export function parseItemizedBillText(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error('Itemized bill text must be a non-empty string');
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const parsed = {
    providerName: lines[0]?.includes(' - ') ? lines[0].split(' - ')[0].trim() : lines[0] || 'Healthcare Provider',
    patientName: null,
    accountNumber: null,
    serviceDates: null,
    insurerName: null,
    claimNumber: null,
    dueDate: null,
    totalCharges: 0,
    insurancePaid: 0,
    contractualAdjustment: 0,
    patientPaid: 0,
    patientResponsibility: 0,
    lineItems: [],
  };

  const lineRegex = /^([A-Z0-9]{4,5}(?:-[A-Z0-9]{2})?)\s+(.+?)\s+Qty\s+(\d+)\s+\$?([\d,]+(?:\.\d{2})?)$/i;

  lines.forEach((line, idx) => {
    const mLine = line.match(lineRegex);
    if (mLine) {
      const rawCode = mLine[1].toUpperCase();
      const [code, modifier] = rawCode.split('-');
      parsed.lineItems.push({
        id: `line-${parsed.lineItems.length + 1}`,
        code,
        modifier: modifier || null,
        description: mLine[2].trim(),
        quantity: Number(mLine[3]) || 1,
        amount: parseCurrency(mLine[4]),
        source: `Line ${idx + 1}`,
      });
      return;
    }

    if (/^Patient:/i.test(line)) parsed.patientName = line.replace(/^Patient:\s*/i, '').trim();
    else if (/^Account:/i.test(line)) parsed.accountNumber = line.replace(/^Account:\s*/i, '').trim();
    else if (/^Service date:/i.test(line)) parsed.serviceDates = line.replace(/^Service date:\s*/i, '').trim();
    else if (/^Insurance:/i.test(line)) parsed.insurerName = line.replace(/^Insurance:\s*/i, '').trim();
    else if (/^Claim:/i.test(line)) parsed.claimNumber = line.replace(/^Claim:\s*/i, '').trim();
    else if (/^Total charges:/i.test(line)) parsed.totalCharges = parseCurrency(line.split(':')[1]);
    else if (/^Insurance paid:/i.test(line)) parsed.insurancePaid = parseCurrency(line.split(':')[1]);
    else if (/^(?:Contractual adjustment|Plan discount):/i.test(line)) {
      parsed.contractualAdjustment = parseCurrency(line.split(':')[1]);
    } else if (/^Patient paid:/i.test(line)) parsed.patientPaid = parseCurrency(line.split(':')[1]);
    else if (/^Patient responsibility:/i.test(line)) {
      parsed.patientResponsibility = parseCurrency(line.split(':')[1]);
    } else if (/^Due\s+/i.test(line)) parsed.dueDate = line.replace(/^Due\s+/i, '').trim();
  });

  if (parsed.totalCharges === 0 && parsed.lineItems.length > 0) {
    parsed.totalCharges = parsed.lineItems.reduce((acc, item) => acc + item.amount, 0);
  }

  return parsed;
}

/**
 * Benchmark a single CPT/HCPCS line item against locality-adjusted CMS Medicare rates.
 */
export function benchmarkCptLineItem(item, { locality = 'nyc', fairMultiple = 1.75 } = {}) {
  const code = String(item?.code || '').toUpperCase().split('-')[0];
  const entry = CMS_MEDICARE_FEE_SCHEDULE[code];
  const qty = Math.max(1, Number(item?.quantity) || 1);
  const billed = Number(item?.amount) || 0;
  const gpci = GPCI_LOCALITY_MULTIPLIERS[locality] || 1.0;

  if (!entry) {
    return {
      code,
      knownCpt: false,
      billedAmount: billed,
      medicareAllowed: null,
      fairPriceTarget: null,
      markupMultiple: null,
      potentialOvercharge: 0,
    };
  }

  const medicareAllowed = Number((entry.medicareRate * gpci * qty).toFixed(2));
  const fairPriceTarget = Number((medicareAllowed * fairMultiple).toFixed(2));
  const markupMultiple = medicareAllowed > 0 ? Number((billed / medicareAllowed).toFixed(2)) : null;
  const potentialOvercharge = Math.max(0, Number((billed - fairPriceTarget).toFixed(2)));

  return {
    code,
    knownCpt: true,
    category: entry.category,
    billedAmount: billed,
    medicareAllowed,
    fairPriceTarget,
    markupMultiple,
    potentialOvercharge,
  };
}

/**
 * Deterministically audit a structured medical bill for duplicate charges,
 * NCCI unbundling violations, opaque pharmacy/supply lines, extreme CMS markups,
 * and EOB balance arithmetic discrepancies.
 */
export function auditMedicalBill(billInput, { locality = 'nyc', markupThreshold = 3.5 } = {}) {
  const bill = typeof billInput === 'string' ? parseItemizedBillText(billInput) : billInput;
  const lineItems = Array.isArray(bill?.lineItems) ? bill.lineItems : [];
  const issues = [];
  const benchmarks = [];

  // 1. Duplicate charge detection (same CPT code and date without distinct-service modifier)
  const byCodeDate = new Map();
  for (const item of lineItems) {
    const code = String(item.code || '').toUpperCase();
    const dateKey = item.date || bill.serviceDates || 'same-day';
    const key = `${code}::${dateKey}`;
    if (!byCodeDate.has(key)) byCodeDate.set(key, []);
    byCodeDate.get(key).push(item);
  }

  for (const [, group] of byCodeDate.entries()) {
    if (group.length > 1) {
      const hasModifier = group.some((g) => g.modifier && DISTINCT_SERVICE_MODIFIERS.has(String(g.modifier).toUpperCase()));
      if (!hasModifier) {
        const dupAmount = group.slice(1).reduce((s, g) => s + (Number(g.amount) || 0), 0);
        issues.push({
          type: 'duplicate_charge',
          code: group[0].code,
          title: `Duplicate CPT ${group[0].code} charge on same service date`,
          explanation: `CPT ${group[0].code} (${group[0].description}) is billed ${group.length} times without a repeat-procedure modifier (-59, -76, -91).`,
          lineItemIds: group.map((g) => g.id),
          amountAtStake: Number(dupAmount.toFixed(2)),
          confidence: 'high',
        });
      }
    }
  }

  // 2. NCCI unbundling / mutually exclusive code pair detection
  const presentCodes = new Map();
  for (const item of lineItems) {
    const c = String(item.code || '').toUpperCase();
    if (!presentCodes.has(c)) presentCodes.set(c, []);
    presentCodes.get(c).push(item);
  }

  for (const pair of NCCI_BUNDLED_PAIRS) {
    if (presentCodes.has(pair.primary) && presentCodes.has(pair.bundled)) {
      const bundledItems = presentCodes.get(pair.bundled);
      const hasDistinctMod = bundledItems.some(
        (b) => b.modifier && DISTINCT_SERVICE_MODIFIERS.has(String(b.modifier).toUpperCase())
      );
      if (!hasDistinctMod) {
        const stake = bundledItems.reduce((s, b) => s + (Number(b.amount) || 0), 0);
        issues.push({
          type: 'ncci_unbundling',
          code: `${pair.primary}+${pair.bundled}`,
          title: `NCCI unbundling violation: CPT ${pair.bundled} billed alongside CPT ${pair.primary}`,
          explanation: pair.reason,
          lineItemIds: [
            ...presentCodes.get(pair.primary).map((x) => x.id),
            ...bundledItems.map((x) => x.id),
          ],
          amountAtStake: Number(stake.toFixed(2)),
          confidence: 'high',
        });
      }
    }
  }

  // 3. Opaque revenue code & CMS Medicare fee-schedule markup benchmarking
  for (const item of lineItems) {
    const code = String(item.code || '').toUpperCase();
    const bm = benchmarkCptLineItem(item, { locality });
    benchmarks.push({ id: item.id, ...bm });

    if (OPAQUE_REVENUE_CODES.has(code) || /miscellaneous|unlisted/i.test(item.description || '')) {
      issues.push({
        type: 'unclear_charge',
        code,
        title: `Unitemized revenue code (${code}: ${item.description})`,
        explanation: `Line item "${item.description}" ($${item.amount}) lacks a specific HCPCS J-code or National Drug Code (NDC). Demand the Medication Administration Record (MAR).`,
        lineItemIds: [item.id],
        amountAtStake: Number((item.amount || 0).toFixed(2)),
        confidence: 'high',
      });
    } else if (bm.knownCpt && bm.markupMultiple !== null && bm.markupMultiple >= markupThreshold) {
      issues.push({
        type: 'excessive_markup',
        code,
        title: `CPT ${code} billed at ${bm.markupMultiple}x Medicare allowed rate`,
        explanation: `Billed $${bm.billedAmount} vs locality-adjusted CMS Medicare rate of $${bm.medicareAllowed} (fair commercial benchmark ~$${bm.fairPriceTarget}).`,
        lineItemIds: [item.id],
        amountAtStake: bm.potentialOvercharge,
        confidence: 'medium',
      });
    }
  }

  // 4. Statement arithmetic & missing contractual adjustment check
  const sumLines = Number(lineItems.reduce((s, i) => s + (Number(i.amount) || 0), 0).toFixed(2));
  const totalCharges = Number(bill.totalCharges || sumLines);
  const insurancePaid = Number(bill.insurancePaid || 0);
  const contractualAdj = Number(bill.contractualAdjustment || 0);
  const patientPaid = Number(bill.patientPaid || 0);
  const patientResp = Number(bill.patientResponsibility || 0);

  if (lineItems.length > 0 && Math.abs(sumLines - totalCharges) > 0.05) {
    issues.push({
      type: 'arithmetic_mismatch',
      code: 'TOTAL',
      title: 'Sum of line items does not match stated total charges',
      explanation: `Line items sum to $${sumLines.toFixed(2)} but statement total charges is $${totalCharges.toFixed(2)}.`,
      lineItemIds: [],
      amountAtStake: Number(Math.abs(totalCharges - sumLines).toFixed(2)),
      confidence: 'high',
    });
  }

  if (insurancePaid > 0 && contractualAdj === 0 && Math.abs(totalCharges - insurancePaid - patientPaid - patientResp) < 0.05) {
    issues.push({
      type: 'insurance_mismatch',
      code: 'EOB',
      title: 'Missing network contractual adjustment on insured claim',
      explanation: `Insurer paid $${insurancePaid.toFixed(2)} on $${totalCharges.toFixed(2)} charges, leaving the full unadjusted balance ($${patientResp.toFixed(2)}) to the patient with $0 contractual write-off shown.`,
      lineItemIds: [],
      amountAtStake: patientResp,
      confidence: 'medium',
    });
  }

  // Deduplicate savings estimate across line items so we don't double-count > billed amount
  const lineStakeById = new Map();
  for (const iss of issues) {
    if (iss.type === 'duplicate_charge' || iss.type === 'ncci_unbundling' || iss.type === 'unclear_charge') {
      const targetId = iss.lineItemIds[iss.lineItemIds.length - 1];
      if (targetId) {
        lineStakeById.set(targetId, Math.max(lineStakeById.get(targetId) || 0, iss.amountAtStake));
      }
    } else if (iss.type === 'excessive_markup') {
      const targetId = iss.lineItemIds[0];
      if (targetId && !lineStakeById.has(targetId)) {
        lineStakeById.set(targetId, iss.amountAtStake);
      }
    }
  }

  const estimatedLineSavings = Number(
    Array.from(lineStakeById.values()).reduce((a, b) => a + b, 0).toFixed(2)
  );
  const totalMedicareAllowed = Number(
    benchmarks.reduce((s, b) => s + (b.medicareAllowed || 0), 0).toFixed(2)
  );
  const totalFairTarget = Number(
    benchmarks.reduce((s, b) => s + (b.fairPriceTarget || 0), 0).toFixed(2)
  );

  return {
    patientName: bill.patientName || 'Patient',
    providerName: bill.providerName || 'Provider',
    totalCharges,
    insurancePaid,
    patientResponsibility: patientResp,
    totalMedicareAllowed,
    totalFairTarget,
    estimatedLineSavings,
    recommendedSettlementOffer: Number(Math.max(0, Math.min(patientResp, totalFairTarget)).toFixed(2)),
    issues,
    benchmarks,
  };
}

/**
 * Generate a structured patient negotiation strategy and dispute script from an audit report.
 */
export function generateNegotiationStrategy(auditReport) {
  const highConfIssues = (auditReport.issues || []).filter((i) => i.confidence === 'high');
  const markupIssues = (auditReport.issues || []).filter((i) => i.type === 'excessive_markup');

  const steps = [
    `Request coding review and freeze billing collection hold on account while ${auditReport.issues.length} flagged items are audited.`,
  ];

  for (const iss of highConfIssues) {
    steps.push(`Dispute ${iss.title}: ${iss.explanation} ($${iss.amountAtStake.toFixed(2)} at stake).`);
  }
  if (markupIssues.length > 0) {
    steps.push(
      `Cite CMS Medicare benchmark ($${auditReport.totalMedicareAllowed.toFixed(2)}) and propose prompt-pay settlement at 175% of Medicare ($${auditReport.recommendedSettlementOffer.toFixed(2)}).`
    );
  }

  return {
    targetReductionUsd: auditReport.estimatedLineSavings,
    openingSettlementOfferUsd: auditReport.recommendedSettlementOffer,
    walkAwayCeilingUsd: Number((auditReport.recommendedSettlementOffer * 1.2).toFixed(2)),
    scriptSteps: steps,
  };
}
