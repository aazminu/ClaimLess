import type { WebSocket } from "ws";
import { audit, getCase, updateCase } from "../store";
import { finishDisconnectedCall, voiceAgentReply } from "../agents/voice-negotiator";

type RelayInbound =
  | { type: "setup"; callSid: string; customParameters?: Record<string, string> }
  | { type: "prompt"; voicePrompt: string; last?: boolean }
  | { type: "interrupt" }
  | { type: "error"; description: string }
  | { type: "dtmf"; digit: string };

export function handleRelayConnection(ws: WebSocket, params: URLSearchParams) {
  let caseId = params.get("caseId") ?? "";
  let callId = params.get("callId") ?? "";
  let busy = false;
  let ending = false;
  const queue: string[] = [];

  const speak = (text: string, end: boolean) => {
    if (ending || !text.trim()) return;
    ws.send(JSON.stringify({ type: "text", token: text, last: true }));
    if (end) {
      ending = true;
      queue.length = 0;
      setTimeout(() => { try { ws.send(JSON.stringify({ type: "end" })); ws.close(); } catch {} }, 5000);
    }
  };

  const respond = async (humanText: string | null, userGuidance?: string) => {
    if (ending) return;
    if (busy) { if (humanText) queue.push(humanText); return; }
    busy = true;
    try {
      const reply = await voiceAgentReply(caseId, callId, humanText, userGuidance);
      speak(reply.text, reply.end);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown voice error";
      console.error("[voice]", message);
      speak("I’m sorry, I hit a technical issue. I’ll save the call and have a human follow up.", false);
      if (caseId) audit(caseId, "voice_negotiator", "error", message);
    } finally {
      busy = false;
      if (ending) return;
      const next = queue.splice(0).join(" ");
      if (next) void respond(next);
    }
  };

  const guidanceTimer = setInterval(() => {
    if (busy || !caseId || !callId) return;
    const answered = getCase(caseId)?.calls.find((item) => item.id === callId)?.guidancePrompts?.find((item) => item.status === "answered" && item.answer);
    if (!answered?.answer) return;
    updateCase(caseId, (value) => {
      const prompt = value.calls.find((item) => item.id === callId)?.guidancePrompts?.find((item) => item.id === answered.id);
      if (prompt) prompt.status = "used";
    });
    audit(caseId, "user", "user_guidance_used", "Private patient guidance was returned to the live voice agent.");
    void respond(null, answered.answer);
  }, 500);

  ws.on("message", (raw) => {
    let message: RelayInbound;
    try { message = JSON.parse(raw.toString()) as RelayInbound; } catch { return; }
    if (message.type === "setup") {
      caseId = message.customParameters?.caseId || caseId;
      callId = message.customParameters?.callId || callId;
      updateCase(caseId, (value) => { const call = value.calls.find((item) => item.id === callId); if (call) { call.callSid = message.callSid; call.status = "in_progress"; } });
      audit(caseId, "voice_negotiator", "connected", "ClaimLess connected to the representative.");
      if (params.get("opening") !== "wait") {
        void respond(null);
      }
    } else if (!ending && message.type === "prompt" && message.last !== false && message.voicePrompt.trim()) {
      void respond(message.voicePrompt.trim());
    } else if (message.type === "interrupt") {
      updateCase(caseId, (value) => { const last = value.calls.find((item) => item.id === callId)?.transcript.filter((turn) => turn.role === "agent").pop(); if (last) last.interrupted = true; });
    } else if (message.type === "error") {
      audit(caseId, "voice_negotiator", "relay_error", message.description);
    }
  });

  ws.on("close", () => {
    clearInterval(guidanceTimer);
    const call = getCase(caseId)?.calls.find((item) => item.id === callId);
    if (call?.status === "in_progress") finishDisconnectedCall(caseId, callId);
  });
}
