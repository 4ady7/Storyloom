import { Studio } from "@/components/studio";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Studio projectId={id} />;
}
