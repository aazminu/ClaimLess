import { NextRequest } from "next/server";
import { publicUrl } from "@/lib/twilio";

/** TwiML that connects the answered call to our ConversationRelay WebSocket. */
function twiml(req: NextRequest) {
  const caseId = req.nextUrl.searchParams.get("caseId") ?? "";
  const callId = req.nextUrl.searchParams.get("callId") ?? "";
  const wsUrl = `${publicUrl().replace(/^http/, "ws")}/voice/ws?caseId=${encodeURIComponent(caseId)}&amp;callId=${encodeURIComponent(callId)}&amp;opening=wait`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay url="${wsUrl}" ttsProvider="ElevenLabs" voice="NYC9WEgkq1u4jiqBseQ9-flash_v2_5-0.95_0.45_0.8" elevenlabsTextNormalization="on" interruptible="speech" interruptSensitivity="medium" reportInputDuringAgentSpeech="speech" ignoreBackchannel="true" preemptible="true" speechTimeout="800">
      <Parameter name="caseId" value="${caseId}"/>
      <Parameter name="callId" value="${callId}"/>
    </ConversationRelay>
  </Connect>
</Response>`;
  return new Response(xml, { headers: { "Content-Type": "text/xml" } });
}

export async function POST(req: NextRequest) {
  return twiml(req);
}

export async function GET(req: NextRequest) {
  return twiml(req);
}
