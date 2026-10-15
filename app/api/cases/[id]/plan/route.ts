import { approvePlan, buildPlan } from "@/lib/agents/advocate";
import type { InterviewAnswers } from "@/lib/types";

export async function POST(request: Request, context: RouteContext<"/api/cases/[id]/plan">) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { action?: "approve"; answers?: InterviewAnswers; selectedIssueIds?: string[] };
    const value = body.action === "approve"
      ? approvePlan(id)
      : buildPlan(id, body.answers || {}, body.selectedIssueIds || []);
    return Response.json({ case: value });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not prepare the plan" }, { status: 400 });
  }
}
