export type Confidence = "high" | "medium" | "low";

export type BillLine = {
  id: string;
  date?: string;
  description: string;
  code?: string;
  quantity: number;
  unitPrice?: number;
  amount: number;
  source: string;
  confidence: Confidence;
};

export type BillIssueType =
  | "duplicate_charge"
  | "service_not_received"
  | "incorrect_quantity"
  | "insurance_mismatch"
  | "surprise_or_out_of_network"
  | "unclear_charge"
  | "negotiable_charge";

export type BillIssue = {
  id: string;
  type: BillIssueType;
  title: string;
  explanation: string;
  lineItemIds: string[];
  amountAtStake: number;
  confidence: Confidence;
  evidence: string;
  selected: boolean;
};

export type InterviewAnswers = {
  goal?: string;
  desiredOutcome?: string;
  servicesNotReceived?: string;
  insuranceContext?: string;
  priorContact?: string;
  targetReductionPercent?: number;
  minimumAcceptableSavings?: number;
  officeType?: "hospital" | "insurer";
  officeName?: string;
  officePhone?: string;
  additionalContext?: string;
  authorizationConfirmed?: boolean;
};

export type NegotiationPlan = {
  createdAt: string;
  target: "hospital" | "insurer";
  officeName: string;
  officePhone: string;
  selectedIssueIds: string[];
  objective: string;
  requestedAdjustment: number;
  targetSavings: number;
  openingPosition: string;
  talkingPoints: string[];
  questions: string[];
  boundaries: string[];
  approvedAt?: string;
};

export type TranscriptTurn = {
  role: "agent" | "human";
  text: string;
  at: string;
  interrupted?: boolean;
};

export type CallOutcome =
  | "adjustment_promised"
  | "discount_offered"
  | "insurance_rebilling"
  | "investigation_opened"
  | "payment_plan_offered"
  | "no_resolution"
  | "follow_up_required";

export type CallGuidancePrompt = {
  id: string;
  question: string;
  context: string;
  suggestedReplies: string[];
  status: "waiting" | "answered" | "used";
  answer?: string;
  createdAt: string;
  answeredAt?: string;
};

export type CallSession = {
  id: string;
  to: string;
  target: "hospital" | "insurer";
  status: "dialing" | "in_progress" | "completed" | "failed";
  startedAt: string;
  endedAt?: string;
  callSid?: string;
  objectives: { id: string; text: string; done: boolean }[];
  transcript: TranscriptTurn[];
  confirmedFacts: { fact: string; at: string; topic?: string }[];
  offeredAdjustment?: number;
  outcome?: CallOutcome;
  referenceNumber?: string;
  summary?: string;
  nextSteps: string[];
  escalated?: boolean;
  guidancePrompts?: CallGuidancePrompt[];
};

export type ActivityEvent = {
  id: string;
  at: string;
  actor: "bill_analyst" | "patient_advocate" | "voice_negotiator" | "system" | "user";
  action: string;
  message: string;
};

export type BillCase = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "analyzing" | "interview" | "plan_ready" | "approved" | "calling" | "completed" | "needs_follow_up";
  patient: { name: string; phone?: string; accountNumber?: string };
  provider: { name: string; phone?: string; address?: string };
  insurer?: { name?: string; memberId?: string; claimNumber?: string; phone?: string };
  bill: {
    fileName: string;
    serviceDates?: string;
    totalCharges: number;
    insurancePaid: number;
    patientPaid: number;
    patientResponsibility: number;
    dueDate?: string;
    lineItems: BillLine[];
  };
  issues: BillIssue[];
  analysisSummary: string;
  interview: InterviewAnswers;
  plan?: NegotiationPlan;
  calls: CallSession[];
};

export type RuntimeConfig = { publicUrl?: string; updatedAt?: string };
