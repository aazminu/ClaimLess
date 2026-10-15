import { openai } from "@ai-sdk/openai";

export function mainModel() {
  return openai(process.env.OPENAI_MODEL || "gpt-5.4");
}

export function voiceModel() {
  return openai(process.env.OPENAI_VOICE_MODEL || "gpt-5.4-mini");
}

export const SAFETY_RULES = `Use only facts present in the case or stated by the representative.
Never invent codes, prices, coverage, laws, authorizations, or promises.
Clearly distinguish a suspected billing issue from a confirmed error.
Never threaten, impersonate a clinician or lawyer, provide legal advice, authorize payment, or accept terms outside the user's approved boundaries.
Protect private health information and disclose only what is necessary for the billing task.`;
