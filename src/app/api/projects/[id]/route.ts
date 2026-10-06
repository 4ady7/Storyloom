import { z } from "zod";
import { jsonError } from "@/lib/http";
import { pushHistory } from "@/lib/history";
import { assertId } from "@/lib/ids";
import { LocksSchema, VisualBibleSchema } from "@/lib/schemas";
import { deleteProject, getProject, saveProject, withProjectLock } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PatchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  prompt: z.string().max(4000).optional(),
  bible: VisualBibleSchema.optional(),
  locks: LocksSchema.optional(),
  sequence: z.array(z.string()).max(24).optional(),
  sequenceAction: z.enum(["accept-suggested", "keep-mine"]).optional(),
});

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((id, index) => id === b[index]);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    assertId(id);
    return Response.json(await getProject(id));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    assertId(id);
    await withProjectLock(id, async () => {
      await getProject(id);
      await deleteProject(id);
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    assertId(id);
    const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "That change could not be read." }, { status: 400 });
    const project = await withProjectLock(id, async () => {
      let project = await getProject(id);
      const body = parsed.data;
      if (body.title) project = { ...project, title: body.title.trim() };
      if (typeof body.prompt === "string") {
        project = { ...project, prompt: body.prompt };
        const current = project.history[project.historyIndex];
        if (current) {
          const history = [...project.history];
          history[project.historyIndex] = { ...current, prompt: body.prompt };
          project = { ...project, history };
        }
      }
      if (body.locks) project = pushHistory({ ...project, locks: body.locks }, "Locks");
      if (body.bible) project = pushHistory({ ...project, bible: body.bible }, "Visual language edited");
      if (body.sequence) {
        if (!sameIds(body.sequence, project.photos.map((photo) => photo.id))) {
          throw new Error("storyloom: That sequence doesn’t match the photographs in this story.");
        }
        project = pushHistory(
          { ...project, sequence: body.sequence, userSequence: body.sequence, sequenceSource: "user", readingCurrent: false },
          "Sequence",
        );
      }
      if (body.sequenceAction === "accept-suggested" && project.story) {
        if (!sameIds(project.story.suggestedSequence, project.photos.map((photo) => photo.id))) {
          return Response.json({ error: "The suggested sequence does not match these photographs." }, { status: 400 });
        }
        project = pushHistory(
          { ...project, sequence: project.story.suggestedSequence, sequenceSource: "suggested" },
          "Suggested sequence",
        );
      }
      if (body.sequenceAction === "keep-mine") {
        project = pushHistory({ ...project, sequence: [...project.userSequence], sequenceSource: "user" }, "Your order");
      }
      await saveProject(project);
      return getProject(id);
    });
    if (project instanceof Response) return project;
    return Response.json(project);
  } catch (error) {
    return jsonError(error);
  }
}
