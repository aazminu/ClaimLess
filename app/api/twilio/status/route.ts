import { NextRequest, NextResponse } from "next/server";
import { audit, getCase, nowIso, updateCase } from "@/lib/store";

/** Twilio call status callbacks (initiated / answered / completed). */
export async function POST(req: NextRequest) {
  const caseId = req.nextUrl.searchParams.get("caseId") ?? "";
  const callId = req.nextUrl.searchParams.get("callId") ?? "";
  const form = await req.formData();
  const status = String(form.get("CallStatus") ?? "");

  const c = getCase(caseId);
  if (c && callId) {
    if (status === "completed") {
      updateCase(caseId, (cs) => {
        const cl = cs.calls.find((x) => x.id === callId);
        if (cl && cl.status !== "completed") {
          cl.status = cl.transcript.length > 0 ? "completed" : "failed";
          cl.endedAt = nowIso();
          cs.status = cl.transcript.length > 0 ? "needs_follow_up" : "approved";
        }
      });
    }
    if (status === "no-answer" || status === "failed" || status === "busy") {
      updateCase(caseId, (cs) => {
        const cl = cs.calls.find((x) => x.id === callId);
        if (cl) cl.status = "failed";
      });
      audit(caseId, "voice_negotiator", "call_failed", `Call ${status}`);
    }
  }
  return NextResponse.json({ ok: true });
}
