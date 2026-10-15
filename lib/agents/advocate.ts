import { audit, nowIso, updateCase } from "../store";
import type { InterviewAnswers, NegotiationPlan } from "../types";

function dollars(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }

export function buildPlan(caseId: string, answers: InterviewAnswers, selectedIssueIds: string[]) {
  return updateCase(caseId, (value) => {
    const selected = value.issues.filter((issue) => selectedIssueIds.includes(issue.id));
    const atStake = Math.min(value.bill.patientResponsibility, selected.reduce((sum, issue) => sum + issue.amountAtStake, 0));
    const percent = Math.max(0, Math.min(100, answers.targetReductionPercent ?? 25));
    const targetSavings = Math.max(answers.minimumAcceptableSavings ?? 0, Math.round(value.bill.patientResponsibility * percent / 100));
    const target = answers.officeType ?? "hospital";
    const officeName = answers.officeName?.trim() || (target === "hospital" ? value.provider.name : value.insurer?.name) || "Billing office";
    const officePhone = answers.officePhone?.trim() || (target === "hospital" ? value.provider.phone : value.insurer?.phone) || "";
    const plan: NegotiationPlan = {
      createdAt: nowIso(), target, officeName, officePhone, selectedIssueIds,
      objective: answers.desiredOutcome?.trim() || answers.goal?.trim() || "Verify questionable charges and reduce the patient balance where appropriate.",
      requestedAdjustment: atStake,
      targetSavings,
      openingPosition: `Request a line-by-line review of ${selected.length} flagged issue${selected.length === 1 ? "" : "s"} affecting up to ${dollars(atStake)}, then ask for correction, rebilling, or an available discount.`,
      talkingPoints: selected.map((issue) => `${issue.title}: ${issue.evidence}`),
      questions: [
        ...selected.map((issue) => `Explain the evidence for ${issue.title.toLowerCase()}, then ask what can be reviewed or corrected.`),
        "When will the corrected statement or decision be available?",
      ],
      boundaries: [
        `Do not accept an outcome below ${dollars(answers.minimumAcceptableSavings ?? 0)} in savings as final without the user.`,
        "Do not authorize payment, agree to a payment plan, or disclose unrelated health information.",
        "Escalate to a human if identity verification, consent, or a binding agreement is required.",
      ],
    };
    value.interview = answers;
    value.issues.forEach((issue) => { issue.selected = selectedIssueIds.includes(issue.id); });
    value.plan = plan;
    value.status = "plan_ready";
    audit(caseId, "patient_advocate", "plan_created", `Prepared a call plan for ${officeName} targeting ${dollars(targetSavings)} in savings.`);
  });
}

export function approvePlan(caseId: string) {
  return updateCase(caseId, (value) => {
    if (!value.plan) throw new Error("Create a call plan first");
    if (!value.interview.authorizationConfirmed) throw new Error("Patient authorization is required");
    value.plan.approvedAt = nowIso();
    value.status = "approved";
    audit(caseId, "user", "plan_approved", "User approved the call target, objectives, negotiation boundaries, and real outbound call.");
  });
}
