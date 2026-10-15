import fs from "node:fs";
import path from "node:path";
import { generateText, Output } from "ai";
import { z } from "zod";
import { mainModel, SAFETY_RULES } from "../ai";
import { audit, newId, nowIso, saveCase } from "../store";
import type { BillCase, BillIssueType, Confidence } from "../types";

const money = z.number().nonnegative();
const extracted = z.object({
  patientName: z.string().nullable(),
  accountNumber: z.string().nullable(),
  providerName: z.string().nullable(),
  providerPhone: z.string().nullable(),
  providerAddress: z.string().nullable(),
  insurerName: z.string().nullable(),
  memberId: z.string().nullable(),
  claimNumber: z.string().nullable(),
  insurerPhone: z.string().nullable(),
  serviceDates: z.string().nullable(),
  dueDate: z.string().nullable(),
  totalCharges: money,
  insurancePaid: money,
  patientPaid: money,
  patientResponsibility: money,
  lineItems: z.array(z.object({
    date: z.string().nullable(), description: z.string(), code: z.string().nullable(),
    quantity: z.number().int().positive(), unitPrice: z.number().nonnegative().nullable(),
    amount: money, source: z.string(), confidence: z.enum(["high", "medium", "low"]),
  })).max(60),
  issues: z.array(z.object({
    type: z.enum(["duplicate_charge", "service_not_received", "incorrect_quantity", "insurance_mismatch", "surprise_or_out_of_network", "unclear_charge", "negotiable_charge"]),
    title: z.string(), explanation: z.string(), lineIndexes: z.array(z.number().int().nonnegative()),
    amountAtStake: money, confidence: z.enum(["high", "medium", "low"]), evidence: z.string(),
  })).max(12),
  summary: z.string(),
});

export async function analyzeBill(caseId: string, filePath: string, fileName: string) {
  const buffer = fs.readFileSync(filePath);
  const extension = path.extname(fileName).toLowerCase();
  const content: Array<{ type: "text"; text: string } | { type: "file"; mediaType: string; data: Buffer; filename?: string }> = [
    { type: "text", text: "Extract and audit this itemized medical bill. Flag potential issues for human investigation; do not state suspicions as proven errors." },
  ];
  if ([".txt", ".md", ".csv"].includes(extension)) content.push({ type: "text", text: buffer.toString("utf8") });
  else if (extension === ".pdf") content.push({ type: "file", mediaType: "application/pdf", data: buffer, filename: fileName });
  else content.push({ type: "file", mediaType: extension === ".png" ? "image/png" : "image/jpeg", data: buffer, filename: fileName });

  const { output } = await generateText({
    model: mainModel(),
    output: Output.object({ schema: extracted }),
    instructions: `You are ClaimLess's Medical Bill Analyst. Read itemized bills precisely. Check arithmetic, repeated descriptions/codes/dates/amounts, unusual quantities, vague facility charges, patient/insurer balance mismatches, and charges that merit explanation or negotiation. A duplicate-looking line is only a potential duplicate until confirmed. ${SAFETY_RULES}`,
    messages: [{ role: "user", content }],
  });

  const lineIds = output.lineItems.map(() => newId("line"));
  const value: BillCase = {
    id: caseId, createdAt: nowIso(), updatedAt: nowIso(), status: "interview",
    patient: { name: output.patientName || "Patient", accountNumber: output.accountNumber || undefined },
    provider: { name: output.providerName || "Healthcare provider", phone: output.providerPhone || undefined, address: output.providerAddress || undefined },
    insurer: { name: output.insurerName || undefined, memberId: output.memberId || undefined, claimNumber: output.claimNumber || undefined, phone: output.insurerPhone || undefined },
    bill: {
      fileName, serviceDates: output.serviceDates || undefined, dueDate: output.dueDate || undefined,
      totalCharges: output.totalCharges, insurancePaid: output.insurancePaid, patientPaid: output.patientPaid,
      patientResponsibility: output.patientResponsibility,
      lineItems: output.lineItems.map((line, index) => ({
        id: lineIds[index], date: line.date || undefined, description: line.description, code: line.code || undefined,
        quantity: line.quantity, unitPrice: line.unitPrice ?? undefined, amount: line.amount,
        source: line.source, confidence: line.confidence as Confidence,
      })),
    },
    issues: output.issues.map((issue) => ({
      id: newId("issue"), type: issue.type as BillIssueType, title: issue.title, explanation: issue.explanation,
      lineItemIds: issue.lineIndexes.map((index) => lineIds[index]).filter(Boolean), amountAtStake: issue.amountAtStake,
      confidence: issue.confidence as Confidence, evidence: issue.evidence, selected: true,
    })),
    analysisSummary: output.summary, interview: {}, calls: [],
  };
  saveCase(value);
  audit(caseId, "bill_analyst", "analysis_complete", `Audited ${value.bill.lineItems.length} line items and surfaced ${value.issues.length} questions worth investigating.`);
  return value;
}

export function createDemoCase(caseId: string): BillCase {
  const createdAt = nowIso();
  const lines = [
    { id: newId("line"), date: "2026-06-18", description: "Emergency department visit — Level 4", code: "99284", quantity: 1, amount: 1850, source: "Page 1, line 1", confidence: "high" as const },
    { id: newId("line"), date: "2026-06-18", description: "Comprehensive metabolic panel", code: "80053", quantity: 1, amount: 410, source: "Page 1, line 2", confidence: "high" as const },
    { id: newId("line"), date: "2026-06-18", description: "Comprehensive metabolic panel", code: "80053", quantity: 1, amount: 410, source: "Page 1, line 3", confidence: "high" as const },
    { id: newId("line"), date: "2026-06-18", description: "IV hydration, first hour", code: "96360", quantity: 1, amount: 620, source: "Page 1, line 4", confidence: "high" as const },
    { id: newId("line"), date: "2026-06-18", description: "Pharmacy — miscellaneous", code: "PHARM", quantity: 1, amount: 385, source: "Page 1, line 5", confidence: "medium" as const },
    { id: newId("line"), date: "2026-06-18", description: "Radiology interpretation", code: "71046", quantity: 1, amount: 725, source: "Page 1, line 6", confidence: "high" as const },
  ];
  const value: BillCase = {
    id: caseId, createdAt, updatedAt: createdAt, status: "interview",
    patient: { name: "Jordan Lee", accountNumber: "MRN-204811" },
    provider: { name: "Riverside Medical Center", phone: "+13475445527", address: "225 Hudson Avenue, New York, NY" },
    insurer: { name: "Northstar Health", memberId: "NSH-8821904", claimNumber: "CLM-771920" },
    bill: { fileName: "jordan-itemized-bill.pdf", serviceDates: "June 18, 2026", totalCharges: 4400, insurancePaid: 1900, patientPaid: 0, patientResponsibility: 2500, dueDate: "2026-07-25", lineItems: lines },
    issues: [
      { id: newId("issue"), type: "duplicate_charge", title: "Possible duplicate lab panel", explanation: "The same CPT 80053 appears twice on the same date with the same amount. Ask whether two panels were actually performed.", lineItemIds: [lines[1].id, lines[2].id], amountAtStake: 410, confidence: "high", evidence: "Two identical CPT 80053 entries, each $410, on June 18.", selected: true },
      { id: newId("issue"), type: "unclear_charge", title: "Unclear pharmacy charge", explanation: "The $385 line does not identify a medication, dose, or quantity. Request the medication administration detail.", lineItemIds: [lines[4].id], amountAtStake: 385, confidence: "high", evidence: "Description only says “Pharmacy — miscellaneous.”", selected: true },
      { id: newId("issue"), type: "insurance_mismatch", title: "Patient balance needs explanation", explanation: "The statement shows $2,500 due but does not show contractual adjustments or an EOB breakdown.", lineItemIds: [], amountAtStake: 2500, confidence: "medium", evidence: "$4,400 charges minus $1,900 insurer payment equals the full stated balance with no adjustment shown.", selected: true },
    ],
    analysisSummary: "ClaimLess found a likely duplicate laboratory line, an opaque pharmacy charge, and no visible contractual-adjustment breakdown. These are investigation leads, not confirmed billing errors.", interview: {}, calls: [],
  };
  saveCase(value);
  audit(caseId, "bill_analyst", "analysis_complete", "Demo bill audited: 3 issues worth investigating across $2,500 of patient responsibility.");
  return value;
}
