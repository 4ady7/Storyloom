import { jsonError } from "@/lib/http";
import { resetHistory } from "@/lib/history";
import { assertId } from "@/lib/ids";
import { humanizeError } from "@/lib/humanize";
import { addPhoto, getProject, removePhoto, saveProject, withProjectLock } from "@/lib/store";
import { displayName, validateUpload } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    assertId(id);
    const form = await request.formData();
    const entries = form.getAll("files").filter((entry): entry is File => entry instanceof File);
    if (!entries.length) {
      return Response.json({ error: "Choose at least one photograph." }, { status: 400 });
    }
    const result = await withProjectLock(id, async () => {
      const project = await getProject(id);
      const rejected: { name: string; reason: string }[] = [];
      let added = 0;
      for (const entry of entries) {
        const name = displayName(entry.name);
        const reason = validateUpload({ name: entry.name, type: entry.type, size: entry.size });
        if (reason) {
          rejected.push({ name, reason });
          continue;
        }
        try {
          const bytes = Buffer.from(await entry.arrayBuffer());
          await addPhoto(project, { name, type: entry.type, bytes });
          added += 1;
        } catch (error) {
          rejected.push({ name, reason: humanizeError(error) });
        }
      }
      const next = added ? resetHistory(project, "Photographs") : project;
      await saveProject(next);
      return { project: await getProject(id), rejected };
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    assertId(id);
    const photoId = new URL(request.url).searchParams.get("photoId") ?? "";
    assertId(photoId);
    const project = await withProjectLock(id, async () => {
      const project = await getProject(id);
      await removePhoto(project, photoId);
      const next = resetHistory(project, "Photographs");
      await saveProject(next);
      return getProject(id);
    });
    return Response.json(project);
  } catch (error) {
    return jsonError(error);
  }
}
