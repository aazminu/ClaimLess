import { audit, nowIso, updateCase } from "@/lib/store";

export async function POST(request: Request, context: RouteContext<"/api/cases/[id]/calls/[callId]/guidance">) {
  try {
    const { id, callId } = await context.params;
    const body = await request.json() as { promptId?: string; answer?: string };
    const answer = body.answer?.trim();
    if (!body.promptId || !answer) return Response.json({ error: "A response is required" }, { status: 400 });
    const value = updateCase(id, (current) => {
      const call = current.calls.find((item) => item.id === callId);
      const prompt = call?.guidancePrompts?.find((item) => item.id === body.promptId);
      if (!call || !prompt || prompt.status !== "waiting") throw new Error("This guidance request is no longer waiting");
      prompt.answer = answer;
      prompt.answeredAt = nowIso();
      prompt.status = "answered";
    });
    audit(id, "user", "user_guidance_answered", "The patient privately answered Avery during the live call.");
    return Response.json({ case: value });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not send guidance" }, { status: 400 });
  }
}
