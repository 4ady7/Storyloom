import { jsonError } from "@/lib/http";
import { createProject, listProjects } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await listProjects());
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title : undefined;
    return Response.json(await createProject(title), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
