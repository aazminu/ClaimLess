import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import { SAFETY_RULES, voiceModel } from "../ai";
import { audit, getCase, newId, nowIso, updateCase } from "../store";
import type { BillCase, CallOutcome, CallSession } from "../types";

export function createCallSession(caseId: string): CallSession {
  const value = getCase(caseId);
  if (!value?.plan?.approvedAt) throw new Error("The user must approve the call plan first");
  const plan = value.plan;
  const objectives = [
    "Confirm the representative has the uploaded bill open",
    ...value.issues.filter((issue) => plan.selectedIssueIds.includes(issue.id)).map((issue) => `Investigate: ${issue.title}`),
    `Request correction, rebilling, or at least ${plan.targetSavings} dollars in savings`,
    "Get exact next steps and timing",
  ].map((text) => ({ id: newId("objective"), text, done: false }));
  const call: CallSession = {
    id: newId("call"), to: plan.officePhone, target: plan.target, status: "dialing", startedAt: nowIso(),
    objectives, transcript: [], confirmedFacts: [], nextSteps: [],
  };
  updateCase(caseId, (current) => { current.calls.push(call); current.status = "calling"; });
  audit(caseId, "voice_negotiator", "call_started", `Calling ${plan.officeName} with the user-approved plan.`);
  return call;
}

function prompt(value: BillCase, firstRepresentativeTurn: boolean, call: CallSession) {
  const plan = value.plan!;
  const issues = value.issues.filter((issue) => plan.selectedIssueIds.includes(issue.id));
  return `You are Avery on a live phone call with ${plan.officeName}. You are one person helping a patient with their medical bill, with the patient's permission. Act like a prepared, friendly customer who already reviewed the statement before calling. You know the visible bill facts and potential issues below. Speak cooperatively and work toward a correction, rebilling, discount, or clear follow-up.

Authorized case facts:
- Your call identity: Avery, personally helping the patient review their bill
- Your callback number: ${process.env.TWILIO_PHONE_NUMBER ?? "not available"}
- Patient: ${value.patient.name}; account: ${value.patient.accountNumber ?? "not provided"}
- Provider: ${value.provider.name}; insurer: ${value.insurer?.name ?? "not provided"}
- Service dates: ${value.bill.serviceDates ?? "not provided"}
- Bill: total charges $${value.bill.totalCharges}; patient responsibility $${value.bill.patientResponsibility}
- Suspected issues (not confirmed errors):
${issues.map((issue) => `  • ${issue.title}: ${issue.evidence} (up to $${issue.amountAtStake})`).join("\n")}

Approved objective: ${plan.objective}
Opening position: ${plan.openingPosition}
Target savings: $${plan.targetSavings}
Boundaries:
${plan.boundaries.map((boundary) => `- ${boundary}`).join("\n")}

Current call progress (use these exact numbers with mark_objective_done):
${call.objectives.map((objective, index) => `${index + 1}. [${objective.done ? "done" : "open"}] ${objective.text}`).join("\n")}

Conversation rules:
- The representative speaks first. Listen to their introduction and respond naturally.
- On your FIRST reply, briefly introduce yourself, say you are calling with the patient's permission, group every suspected issue into plain-language categories, and ask to work through them.
- The hospital must not discover or explain the problem for you. You already analyzed the bill. Never open by asking "what is wrong with the bill," "what do you see," "can you explain the bill," or any similar question.
- Do not stop after introducing yourself. The complete issue brief must be part of that same first reply.
- Once the representative says the bill or account is open, assume both of you are looking at the same uploaded bill. Never ask them to repeat the account number, bill number, claim number, phone number, or a call reference number.
- Sound like a capable, friendly customer—not a boss, employee, salesperson, or confused caller. Be prepared, appreciative, direct, and easy to help.
- Treat this as a real two-person conversation, not a questionnaire. Respond to what the representative actually said before moving the agenda forward.
- If the representative gives their name, use it naturally once near the beginning. Don't use their name in every turn.
- If one answer covers several issues, record everything and skip those later questions. Never march through a fixed checklist.
- Typical replies are six to fifteen words. Occasional fragments are natural, but do not repeat the same acknowledgment.
- Vary your phrasing and rhythm. Don't begin every reply with "Thank you," "Could you," or "I understand."
- Don't overdo politeness, filler words, or the phrases below. One genuine reaction is enough.
- Never say ClaimLess or mention any company, product, AI, language model, call objective, or script.
- Never use "we," "we've," "our," or "us" when speaking. Speak as one person: say "I noticed," "the statement shows," "the patient," or "this bill."
- Prefer gentle phrases such as "I was hoping you could help me understand…", "Would you mind checking…?", "Do you happen to know…?", and "Is there any chance…?"
- Never use commanding language such as "I need you to", "You need to", "Confirm that", "Provide the number", "Escalate this", or "Remove this charge."
- Use "got it" no more than once every four turns. Never begin two consecutive replies with the same phrase.
- Most turns should be one short sentence under twenty words. The first issue brief may use two or three concise sentences.
- Don't repeat the account, bill total, or the representative's answer unless clarification is genuinely needed.
- Answer routine verification questions directly when the fact is available. If asked your name, say only "Avery." If asked for a number, give the callback number digit by digit.
- Never dodge a reasonable question. If you cannot provide something required, apologize briefly and ask whether there is another way to continue.
- Avoid corporate phrases like "I understand that you are stating," "according to our records," or "Could you provide." Speak plainly.
- Don't narrate your reasoning, list objectives aloud, or mention tools. Use natural pauses through punctuation.
- In the opening issue brief, cover every issue category without reading codes, dates, quantities, or long evidence strings aloud. Save those details for when the representative asks.
- State only what is visibly true: repeated same-day codes, high unit counts, missing descriptions, the displayed balance, and large charges. Call them "items that need review," not proven errors.
- End the brief with one action-oriented question such as: "Could you help me figure out what can be explained, reviewed, or adjusted?"
- Never ask for facts already present on the bill, including the total, patient balance, service dates, provider, or codes. Use those facts to move the call forward.
- Ask only questions whose answers require hospital or insurer knowledge: what a flagged line represents, whether repetitions are separate services, what can be corrected, what assistance is available, who owns the next action, and the timeline.
- Do not interrogate each issue in a fixed order. Let the representative respond to the full brief, record everything they resolve, then follow up only on unresolved items.
- You may name a suspected issue, but preserve uncertainty: "The same code appears several times and needs review," never "you duplicated this charge."
- If an answer is vague, ask one friendly follow-up. Only ask whether someone else might help after the representative cannot resolve it.
- If speech is unclear or sounds nonsensical, do not pretend to understand. Ask one short clarification such as "Sorry, did you say you can review those?"
- If the representative says hello or introduces themselves again after the call has started, say "Yep, I’m here" and continue the current unresolved issue. Never introduce yourself twice.
- Acknowledging that charges are visible does not resolve them. Find out what each category represents and what action can be taken.
- Never ask the representative to choose what to review first. Do not say "which of those can be reviewed?" Select the earliest open issue objective yourself and ask one focused question about it.
- When the representative offers a review, your very next question must confirm what the review covers and when it should be completed. Do not move to the next issue until the timing is answered.
- If asked "anything else?", check the open objectives above and raise the remaining issues. Never say "that’s all" or "that’s the main one" while an issue objective remains open.
- Do not say "please submit" or order the representative to act. Ask naturally: "Would you be able to put that in for review?"
- Mark an issue objective done only after the representative explains it, agrees to review/correct it, or clearly says it cannot be handled. Do not mark it done merely because they can see the charge.
- After understanding the bill, gently ask: "Are there any options that might help lower what the patient owes?" Let the representative offer the solution.
- Immediately record concrete facts, offers, outcomes, and next steps with tools.
- If the representative asks for information that is not on the uploaded bill, or asks the patient to choose between meaningful options, use ask_user. Ask one clear private question with useful reply suggestions. Do not ask the representative to supply that patient information and do not guess it.
- Never use ask_user to ask whether you should continue, discuss remaining approved issues, accept a free review, or request a corrected statement. The patient already approved those actions before the call. Only pause for a new patient-only fact or a consequential choice such as financial assistance, payment terms, or consent not covered by the plan.
- After using ask_user, say only a natural holding sentence such as "Let me check that quickly—one moment." The patient will answer privately in the website, and you will receive their guidance before continuing.
- Never accept a payment plan or binding settlement. If authorization or patient participation is required, escalate.
- Thank the representative when they check something or offer help. Only summarize once, at the end.
- Do not end the call until every issue objective is done or the representative has explicitly refused/cannot address it, and exact next steps and timing are known.
- Write money, dates, codes, and abbreviations the way a person should say them aloud. Keep the spoken response free of markdown and bullet points.

Natural tone example—use the style, not the exact words:
Representative: "Hi, this is Sam in billing. How can I help?"
Avery: "Hi Sam, thanks. I'm Avery. I'm helping someone with a hospital bill, and I'm calling with their permission. I noticed repeated same-day codes, high unit counts, missing descriptions, and a large balance after insurance. Could you help me figure out what can be reviewed or adjusted?"
Representative: "The repeated codes were separate services, and the quantities are medication units."
Avery: "Got it—that clears up those two. Could the missing descriptions be added to a corrected statement?"
Representative: "Yes, and I can also check financial assistance for the balance."
Avery: "That would be really helpful. What would the next step be?"
${firstRepresentativeTurn ? `
MANDATORY FOR THIS RESPONSE: This is your first reply to the representative. Introduce yourself and state all ${issues.length} suspected bill issue${issues.length === 1 ? "" : "s"} now, in this same response. Do not make the representative identify the problems.` : ""}
${SAFETY_RULES}`;
}

function makeSpokenReplyPersonal(reply: string) {
  return reply
    .replace(/\bClaimLess\b/gi, "")
    .replace(/\bwe've\b/gi, "I've")
    .replace(/\bwe're\b/gi, "I'm")
    .replace(/\bwe are\b/gi, "I am")
    .replace(/\bwe have\b/gi, "I have")
    .replace(/\bwe\b/gi, "I")
    .replace(/\bour\b/gi, "the")
    .replace(/\bus\b/gi, "me")
    .replace(/\bplease keep\b/gi, "would you mind keeping")
    .replace(/\bplease submit\b/gi, "would you be able to submit")
    .replace(/\bplease include\b/gi, "would you be able to include")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function similarFact(left: string, right: string) {
  const tokens = (text: string) => new Set(text.toLowerCase().replace(/\b(representative|said|confirmed|may|might|could|would|will|the|a|an|be|to|for|and)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean).map((token) => token.replace(/(ed|ing|s)$/, "")));
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return false;
  const shared = [...a].filter((token) => b.has(token)).length;
  return shared / Math.min(a.size, b.size) >= 0.72;
}

function completeIssueOpening(value: BillCase, representativeText: string) {
  const categoryText = {
    duplicate_charge: "some repeated-looking lab, pharmacy, or supply charges",
    service_not_received: "services the patient does not recognize",
    incorrect_quantity: "some unusually high quantities",
    insurance_mismatch: "a balance that does not clearly match the insurance adjustments",
    surprise_or_out_of_network: "possible out-of-network or surprise charges",
    unclear_charge: "facility, therapy, or imaging lines with unclear descriptions",
    negotiable_charge: "large charges and possible balance-reduction options",
  } as const;
  const categories = [...new Set(value.issues
    .filter((issue) => value.plan?.selectedIssueIds.includes(issue.id))
    .map((issue) => categoryText[issue.type]))];
  const issueList = categories.length < 2
    ? categories[0] ?? "a few items that need review"
    : `${categories.slice(0, -1).join(", ")}, and ${categories.at(-1)}`;
  const name = representativeText.match(/\b(?:this is|i(?:'|’)m|my name is)\s+([a-z][a-z'-]*)/i)?.[1];
  const greeting = name ? `Hi ${name},` : "Hi,";
  return `${greeting} I’m Avery. I’m helping someone review a hospital bill, with their permission. I found ${issueList}. Could you help me work through those?`;
}

function representativeAddressedObjective(objective: string, representativeText: string) {
  const objectiveText = objective.toLowerCase();
  const said = representativeText.toLowerCase();
  const signals: Array<[RegExp, RegExp]> = [
    [/\blab|laborator/, /\blab|laborator/],
    [/pharmacy|supply/, /pharmacy|supply/],
    [/quantit/, /quantit/],
    [/facility|admission/, /facility|admission/],
    [/therapy|imaging/, /therapy|imaging/],
    [/insurance|\beob\b|adjustment/, /insurance|\beob\b|adjustment|reprocess/],
    [/gross charges|remaining balance|balance-reduction|negotiable/, /financial assistance|discount|lower|reduce|remaining balance/],
    [/description|unclear/, /description|itemized statement/],
  ];
  const relevant = signals.filter(([objectiveSignal]) => objectiveSignal.test(objectiveText));
  if (relevant.length) return relevant.every(([, responseSignal]) => responseSignal.test(said));
  const meaningful = objectiveText.replace(/^investigate:\s*/, "").split(/[^a-z0-9]+/).filter((token) => token.length > 4 && !["potential", "should", "review", "charges"].includes(token));
  return meaningful.some((token) => said.includes(token));
}

function questionForObjective(objective: string) {
  const text = objective.toLowerCase();
  if (/\blab|laborator/.test(text)) return "Could you also check the repeated laboratory charges?";
  if (/pharmacy|supply/.test(text)) return "Could you also check the pharmacy and supply lines?";
  if (/quantit/.test(text)) return "Could you also check the unusually high quantities?";
  if (/facility|admission/.test(text)) return "Could you also explain the large facility or admission charge?";
  if (/therapy|imaging/.test(text)) return "Could you also clarify the therapy and imaging lines?";
  if (/insurance|\beob\b|adjustment/.test(text)) return "Could you also check whether the balance matches the insurance adjustments?";
  if (/gross charges|remaining balance|balance-reduction|negotiable/.test(text)) return "Are there any options that could lower the remaining balance?";
  return "Could you also help with the next unresolved item on the bill?";
}

export async function voiceAgentReply(caseId: string, callId: string, humanText: string | null, userGuidance?: string) {
  const value = getCase(caseId);
  if (!value) throw new Error("Case not found");
  const call = value.calls.find((item) => item.id === callId);
  if (!call) throw new Error("Call not found");
  const unanswered = call.guidancePrompts?.find((item) => item.status === "waiting");
  if (unanswered && humanText && !userGuidance) {
    updateCase(caseId, (current) => {
      current.calls.find((item) => item.id === callId)!.transcript.push({ role: "human", text: humanText, at: nowIso() });
    });
    return { text: "", end: false };
  }
  if (humanText && !userGuidance && /financial assistance/i.test(humanText) && /\b(would you|do(?:es)? the patient|interested|want|apply|like)\b/i.test(humanText)) {
    const promptId = newId("guidance");
    const text = "Let me check that quickly—one moment.";
    updateCase(caseId, (current) => {
      const active = current.calls.find((item) => item.id === callId)!;
      active.guidancePrompts ??= [];
      active.guidancePrompts.push({
        id: promptId,
        question: "Would you like Avery to pursue financial assistance if a balance remains?",
        context: "The representative offered financial assistance. This is your decision, so Avery paused the call for your answer.",
        suggestedReplies: ["Yes, pursue financial assistance.", "No, continue without it.", "Ask what the eligibility requirements are first."],
        status: "waiting",
        createdAt: nowIso(),
      });
      active.transcript.push({ role: "human", text: humanText, at: nowIso() });
      active.transcript.push({ role: "agent", text, at: nowIso() });
    });
    audit(caseId, "voice_negotiator", "user_guidance_requested", "Patient decision requested for financial assistance.");
    return { text, end: false };
  }
  let shouldEnd = false;

  const tools = {
    record_fact: tool({
      description: "Record one concrete fact confirmed by the representative under a stable topic. Update the topic instead of recording the same information twice.",
      inputSchema: z.object({
        topic: z.enum(["bill_access", "lab_charges", "pharmacy_supply", "facility_services", "insurance_balance", "financial_assistance", "timing", "account_hold", "other"]),
        fact: z.string(),
      }),
      execute: async ({ topic, fact }) => {
        updateCase(caseId, (current) => {
          const active = current.calls.find((item) => item.id === callId)!;
          const existing = active.confirmedFacts.findIndex((item) => item.topic === topic || similarFact(item.fact, fact));
          if (existing >= 0) active.confirmedFacts[existing] = { topic, fact, at: nowIso() };
          else active.confirmedFacts.push({ topic, fact, at: nowIso() });
        });
        audit(caseId, "voice_negotiator", "fact_confirmed", fact);
        return { recorded: true };
      },
    }),
    record_offer: tool({
      description: "Record a concrete dollar adjustment or discount offered by the representative.",
      inputSchema: z.object({ amount: z.number().nonnegative(), detail: z.string() }),
      execute: async ({ amount, detail }) => {
        updateCase(caseId, (current) => { current.calls.find((item) => item.id === callId)!.offeredAdjustment = amount; });
        audit(caseId, "voice_negotiator", "offer_recorded", `$${amount} offer: ${detail}`);
        return { recorded: true };
      },
    }),
    record_outcome: tool({
      description: "Record the current outcome and next steps.",
      inputSchema: z.object({
        outcome: z.enum(["adjustment_promised", "discount_offered", "insurance_rebilling", "investigation_opened", "payment_plan_offered", "no_resolution", "follow_up_required"]),
        nextSteps: z.array(z.string()).max(5),
      }),
      execute: async ({ outcome, nextSteps }) => {
        updateCase(caseId, (current) => { const active = current.calls.find((item) => item.id === callId)!; active.outcome = outcome as CallOutcome; active.nextSteps = nextSteps; });
        return { recorded: true };
      },
    }),
    ask_user: tool({
      description: "Privately ask for a new patient-only fact or consequential choice. Never use this to ask whether to continue, pursue already-approved issues, accept a free review, or request a corrected statement.",
      inputSchema: z.object({
        question: z.string(),
        context: z.string(),
        suggestedReplies: z.array(z.string()).min(1).max(3),
      }),
      execute: async ({ question, context, suggestedReplies }) => {
        if (/\b(continue|keep going|remaining issues?|other charges?|coding review|submit.*review|corrected statement)\b/i.test(question)) {
          return { waitingForPatient: false, rejected: true, reason: "This action is already covered by the approved call plan. Continue the call without pausing." };
        }
        const promptId = newId("guidance");
        updateCase(caseId, (current) => {
          const active = current.calls.find((item) => item.id === callId)!;
          active.guidancePrompts ??= [];
          if (!active.guidancePrompts.some((item) => item.status === "waiting")) {
            active.guidancePrompts.push({ id: promptId, question, context, suggestedReplies, status: "waiting", createdAt: nowIso() });
          }
        });
        audit(caseId, "voice_negotiator", "user_guidance_requested", question);
        return { waitingForPatient: true, promptId };
      },
    }),
    mark_objective_done: tool({
      description: "Mark a numbered objective complete only when the representative's latest statement explicitly addressed that exact issue. Vague claims such as 'everything' are not evidence.",
      inputSchema: z.object({ objectiveNumber: z.number().int().min(1), evidence: z.string() }),
      execute: async ({ objectiveNumber, evidence }) => {
        const active = getCase(caseId)?.calls.find((item) => item.id === callId);
        const objective = active?.objectives[objectiveNumber - 1];
        if (!objective) return { done: false, reason: "Objective not found" };
        if (objective.text.startsWith("Investigate:") && !representativeAddressedObjective(objective.text, humanText ?? evidence)) {
          return { done: false, reason: "The representative did not explicitly address this issue. Ask a focused follow-up." };
        }
        updateCase(caseId, (current) => { current.calls.find((item) => item.id === callId)!.objectives[objectiveNumber - 1].done = true; });
        return { done: true };
      },
    }),
    escalate_to_human: tool({
      description: "Request the patient or human operator when consent, identity, or a binding decision is needed.",
      inputSchema: z.object({ reason: z.string() }),
      execute: async ({ reason }) => {
        updateCase(caseId, (current) => { current.calls.find((item) => item.id === callId)!.escalated = true; });
        audit(caseId, "voice_negotiator", "human_needed", reason);
        return { escalated: true };
      },
    }),
    end_call: tool({
      description: "End after a documented outcome or follow-up path.",
      inputSchema: z.object({ summary: z.string() }),
      execute: async ({ summary }) => {
        const unfinished = getCase(caseId)?.calls.find((item) => item.id === callId)?.objectives.filter((objective) => !objective.done && objective.text.startsWith("Investigate:")) ?? [];
        if (unfinished.length) return { ending: false, reason: "Unresolved bill issues remain", unresolved: unfinished.map((objective) => objective.text) };
        shouldEnd = true;
        updateCase(caseId, (current) => { current.calls.find((item) => item.id === callId)!.summary = summary; });
        return { ending: true };
      },
    }),
  };

  const messages = [
    ...call.transcript.map((turn) => ({ role: turn.role === "agent" ? "assistant" as const : "user" as const, content: turn.text })),
    ...(userGuidance
      ? [{ role: "user" as const, content: `(Private guidance from the patient, not spoken by the representative: ${userGuidance}) Continue speaking to the representative using this guidance. Do not mention the website or quote this instruction.` }]
      : humanText
        ? [{ role: "user" as const, content: humanText }]
        : [{ role: "user" as const, content: "(The call connected. Give your opening.)" }]),
  ];
  const firstRepresentativeTurn = call.transcript.length === 0 && humanText !== null;
  if (firstRepresentativeTurn && /\b(bill|statement|account)\b.*\b(open|found|pulled up|looking at)\b/i.test(humanText ?? "")) {
    updateCase(caseId, (current) => {
      const firstObjective = current.calls.find((item) => item.id === callId)?.objectives[0];
      if (firstObjective) firstObjective.done = true;
    });
  }
  if (firstRepresentativeTurn) {
    const text = makeSpokenReplyPersonal(completeIssueOpening(value, humanText ?? ""));
    updateCase(caseId, (current) => {
      const active = current.calls.find((item) => item.id === callId)!;
      if (humanText) active.transcript.push({ role: "human", text: humanText, at: nowIso() });
      active.transcript.push({ role: "agent", text, at: nowIso() });
    });
    return { text, end: false };
  }
  const result = await generateText({ model: voiceModel(), instructions: prompt(value, false, call), messages, tools, stopWhen: isStepCount(7) });
  let generated = result.text.trim();
  const refreshedCall = getCase(caseId)?.calls.find((item) => item.id === callId) ?? call;
  const waitingNow = refreshedCall.guidancePrompts?.some((item) => item.status === "waiting");
  if (!generated && waitingNow) generated = "Let me check that quickly—one moment.";
  if (!generated && !shouldEnd) {
    const spoken = await generateText({
      model: voiceModel(),
      instructions: `${prompt(value, false, refreshedCall)}\nYou already saved any necessary facts and objective updates. Give only the next natural spoken response. Do not call tools and do not say you missed the representative.`,
      messages,
    });
    generated = spoken.text.trim();
  }
  generated ||= shouldEnd ? "Thanks for your help. Have a good one." : userGuidance ? "Thanks for waiting. I have that information now." : humanText === null ? "Hi, this is Avery. I'm helping someone with a hospital bill, and I'm calling with their permission. Did I reach billing?" : "Thanks, that confirms it. What happens next?";
  const openIssue = (getCase(caseId)?.calls.find((item) => item.id === callId)?.objectives ?? []).find((objective) => !objective.done && objective.text.startsWith("Investigate:"));
  if (openIssue && /\b(i(?:'|’)ll wait|wait for|follow up after|that(?:'|’)s everything|that is everything|no,? that(?:'|’)s everything)\b/i.test(generated)) {
    generated = `Thanks. ${questionForObjective(openIssue.text)}`;
  }
  if (openIssue && !/gross charges|remaining balance|balance-reduction|negotiable/i.test(openIssue.text) && /options?.{0,30}(lower|reduce)|financial assistance|discount/i.test(generated)) {
    generated = `Thanks. ${questionForObjective(openIssue.text)}`;
  }
  const text = makeSpokenReplyPersonal(generated);
  updateCase(caseId, (current) => {
    const active = current.calls.find((item) => item.id === callId)!;
    if (humanText) active.transcript.push({ role: "human", text: humanText, at: nowIso() });
    active.transcript.push({ role: "agent", text, at: nowIso() });
    if (shouldEnd) { active.status = "completed"; active.endedAt = nowIso(); current.status = active.nextSteps.length ? "needs_follow_up" : "completed"; }
  });
  return { text, end: shouldEnd };
}

export function finishDisconnectedCall(caseId: string, callId: string) {
  updateCase(caseId, (current) => {
    const call = current.calls.find((item) => item.id === callId);
    if (call && call.status === "in_progress") { call.status = "completed"; call.endedAt = nowIso(); current.status = "needs_follow_up"; }
  });
  audit(caseId, "voice_negotiator", "call_complete", "Call ended and the transcript was saved.");
}
