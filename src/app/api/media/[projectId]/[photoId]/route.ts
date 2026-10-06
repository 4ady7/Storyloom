import { jsonError } from "@/lib/http";
import { assertId } from "@/lib/ids";
import { getProject, readMedia } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ projectId: string; photoId: string }> }) {
  try {
    const { projectId, photoId } = await context.params;
    assertId(projectId);
    assertId(photoId);
    const project = await getProject(projectId);
    const sizeParam = new URL(request.url).searchParams.get("size");
    const size = sizeParam === "thumb" || sizeParam === "full" ? sizeParam : "preview";
    const version = new URL(request.url).searchParams.get("version") ?? undefined;
    if (version) assertId(version);
    const file = await readMedia(project, photoId, size, version);
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": file.mime,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
