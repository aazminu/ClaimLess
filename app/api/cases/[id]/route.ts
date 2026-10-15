import { getCase, getEvents } from "@/lib/store";

export async function GET(_request: Request, context: RouteContext<"/api/cases/[id]">) {
  const { id } = await context.params;
  const value = getCase(id);
  if (!value) return Response.json({ error: "Case not found" }, { status: 404 });
  return Response.json({ case: value, events: getEvents(id) });
}
