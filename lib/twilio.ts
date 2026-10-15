import twilio from "twilio";
import { getRuntime } from "./store";

export function twilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set");
  return twilio(sid, token);
}

export function twilioNumber() {
  const n = process.env.TWILIO_PHONE_NUMBER;
  if (!n) throw new Error("TWILIO_PHONE_NUMBER not set");
  return n;
}

/** Public base URL (ngrok tunnel written by server.ts, or PUBLIC_URL override). */
export function publicUrl(): string {
  const fromEnv = process.env.PUBLIC_URL;
  const fromRuntime = getRuntime().publicUrl;
  const url = fromEnv || fromRuntime;
  if (!url) throw new Error("No public URL available — is the ngrok tunnel up? (set NGROK_AUTHTOKEN or PUBLIC_URL)");
  return url.replace(/\/$/, "");
}

export async function sendSms(to: string, body: string) {
  const client = twilioClient();
  return client.messages.create({ from: twilioNumber(), to, body });
}

/** Places the approved outbound billing call. */
export async function placeCall(to: string, caseId: string, callId: string) {
  const client = twilioClient();
  const base = publicUrl();
  const twimlUrl = `${base}/api/twilio/twiml?caseId=${encodeURIComponent(caseId)}&callId=${encodeURIComponent(callId)}`;
  let preflight: Response;
  try {
    preflight = await fetch(twimlUrl, {
      headers: { "ngrok-skip-browser-warning": "true" },
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    throw new Error("The public voice tunnel is offline. Wait a few seconds and press Call now again.");
  }
  if (!preflight.ok || !preflight.headers.get("content-type")?.includes("text/xml")) {
    throw new Error(`The public voice tunnel failed its preflight check (HTTP ${preflight.status}). Wait a few seconds and retry.`);
  }
  return client.calls.create({
    from: twilioNumber(),
    to,
    url: twimlUrl,
    timeout: 60, // ring as long as carriers allow before voicemail

    statusCallback: `${base}/api/twilio/status?caseId=${encodeURIComponent(caseId)}&callId=${encodeURIComponent(callId)}`,
    statusCallbackEvent: ["initiated", "answered", "completed"],
  });
}
