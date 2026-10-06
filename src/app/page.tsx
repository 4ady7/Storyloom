import { HomeStudio } from "@/components/home-studio";
import { listProjects } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const projects = await listProjects();
  return <HomeStudio projects={projects} />;
}
