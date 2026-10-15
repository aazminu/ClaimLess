import { createCallSession } from "@/lib/agents/voice-negotiator";
import { audit, listCases, updateCase } from "@/lib/store";
import { publicUrl } from "@/lib/twilio";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const from = String(form?.get("From") ?? "unknown");
  const target = listCases().find((value) => value.status === "approved" || value.status === "calling");
  if (!target) {
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>There is no approved call waiting. Goodbye.</Say></Response>',
      { headers: { "Content-Type": "text/xml" } },
    );
  }
  let call = target.calls.find((item) => item.status === "dialing" || item.status === "in_progress");
  if (!call) call = createCallSession(target.id);
  updateCase(target.id, (value) => { value.status = "calling"; });
  audit(target.id, "voice_negotiator", "inbound", `Representative demo call connected from ${from}.`);
  const wsUrl = `${publicUrl().replace(/^http/, "ws")}/voice/ws?caseId=${encodeURIComponent(target.id)}&amp;callId=${encodeURIComponent(call.id)}&amp;opening=wait`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Connect><ConversationRelay url="${wsUrl}" ttsProvider="ElevenLabs" voice="NYC9WEgkq1u4jiqBseQ9-flash_v2_5-0.95_0.45_0.8" elevenlabsTextNormalization="on" interruptible="speech" interruptSensitivity="medium" reportInputDuringAgentSpeech="speech" ignoreBackchannel="true" preemptible="true" speechTimeout="800"><Parameter name="caseId" value="${target.id}"/><Parameter name="callId" value="${call.id}"/></ConversationRelay></Connect></Response>`;
  return new Response(xml, { headers: { "Content-Type": "text/xml" } });
}
