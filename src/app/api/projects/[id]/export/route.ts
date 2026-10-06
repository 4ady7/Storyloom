import { jsonError } from "@/lib/http";
import { assertId } from "@/lib/ids";
import { exportContact, exportFrame, exportPdf, exportZip } from "@/lib/export";
import { slug } from "@/lib/format";
import { getProject } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function edgeFrom(value: string | null): number {
  if (value === "full") return 4500;
  if (value === "screen") return 1600;
  const number = Number(value);
  if (number === 2560 || number === 1600 || number === 4500) return number;
  return 2560;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    assertId(id);
    const project = await getProject(id);
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") ?? "frame";
    const maxEdge = edgeFrom(url.searchParams.get("size"));
    if (kind === "frame") {
      const photoId = url.searchParams.get("photoId") ?? project.sequence[0];
      if (!photoId) return Response.json({ error: "There is no photograph to export." }, { status: 400 });
      assertId(photoId);
      const file = await exportFrame(project, photoId, maxEdge);
      return new Response(new Uint8Array(file.buffer), {
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Disposition": `attachment; filename="${file.filename}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (kind === "contact") {
      const buffer = await exportContact(project);
      return fileResponse(buffer, "image/jpeg", `${slug(project.title)}-storyboard.jpg`);
    }
    if (kind === "pdf") {
      const buffer = await exportPdf(project, maxEdge);
      return fileResponse(buffer, "application/pdf", `${slug(project.title)}.pdf`);
    }
    if (kind === "zip") {
      const buffer = await exportZip(project, maxEdge);
      return fileResponse(buffer, "application/zip", `${slug(project.title)}.zip`);
    }
    return Response.json({ error: "Choose a frame, a storyboard, a PDF, or the whole story." }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}

function fileResponse(buffer: Buffer, mime: string, filename: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
