import { createCallSession } from "@/lib/agents/voice-negotiator";
import { audit, updateCase } from "@/lib/store";
import { placeCall } from "@/lib/twilio";

export async function POST(_request: Request, context: RouteContext<"/api/cases/[id]/call">) {
  const { id } = await context.params;
  let createdCallId: string | undefined;
  try {
    const call = createCallSession(id);
    createdCallId = call.id;
    const twilioCall = await placeCall(call.to, id, call.id);
    updateCase(id, (value) => { const active = value.calls.find((item) => item.id === call.id); if (active) active.callSid = twilioCall.sid; });
    return Response.json({ callId: call.id, callSid: twilioCall.sid });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Call failed";
    try {
      updateCase(id, (value) => {
        const call = value.calls.find((item) => item.id === createdCallId);
        if (call) {
          call.status = "failed";
          call.endedAt = new Date().toISOString();
        }
        value.status = "approved";
      });
      audit(id, "voice_negotiator", "call_failed", message);
    } catch {}
    return Response.json({ error: message }, { status: 400 });
  }
}
