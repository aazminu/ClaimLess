import { analyzeBill, createDemoCase } from "@/lib/agents/bill-analysis";
import { listCases, newId, saveUpload } from "@/lib/store";

export async function GET() {
  return Response.json({ cases: listCases() });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    const caseId = newId("case");
    if (contentType.includes("application/json")) {
      const body = await request.json() as { demo?: boolean };
      if (!body.demo) return Response.json({ error: "Upload a bill or request the demo case." }, { status: 400 });
      return Response.json({ case: createDemoCase(caseId) }, { status: 201 });
    }
    const form = await request.formData();
    const file = form.get("bill");
    if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose an itemized bill." }, { status: 400 });
    if (file.size > 12 * 1024 * 1024) return Response.json({ error: "Bill must be under 12 MB." }, { status: 400 });
    const extension = file.name.toLowerCase().split(".").pop();
    if (!extension || !["pdf", "png", "jpg", "jpeg", "txt", "md", "csv"].includes(extension)) return Response.json({ error: "Use PDF, image, TXT, MD, or CSV." }, { status: 400 });
    const filePath = saveUpload(caseId, file.name, Buffer.from(await file.arrayBuffer()));
    const value = await analyzeBill(caseId, filePath, file.name);
    return Response.json({ case: value }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Bill analysis failed" }, { status: 500 });
  }
}
