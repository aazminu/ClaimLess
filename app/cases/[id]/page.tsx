import CaseWorkspace from "@/components/CaseWorkspace";

export default async function CasePage({ params }: PageProps<"/cases/[id]">) {
  const { id } = await params;
  return <CaseWorkspace caseId={id} />;
}
