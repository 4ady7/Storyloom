import { jsonError, ndjson } from "@/lib/http";
import { assertId } from "@/lib/ids";
import { analyseProject, directProject, restoryProject, restoreVersion, weaveProject } from "@/lib/pipeline";
import { redoProject, undoProject } from "@/lib/history";
import { getProject, saveProject, withProjectLock } from "@/lib/store";
import { userError } from "@/lib/humanize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    assertId(id);
  } catch {
    return jsonError(new Error("storyloom: That story could not be found."));
  }
  const body = await request.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";
  return ndjson(async (send) => {
    await withProjectLock(id, async () => {
      const project = await getProject(id);
      const onProgress = (message: string) => send({ type: "progress", message });
      try {
        let next = project;
        if (action === "analyse") {
          await saveProject({ ...project, status: "analysing", statusMessage: "Reading photographs…", interrupted: false });
          next = await analyseProject(project, String(body?.prompt ?? project.prompt ?? ""), onProgress);
        } else if (action === "weave") {
          await saveProject({ ...project, status: "applying", statusMessage: "Weaving the visual language…", interrupted: false });
          next = await weaveProject(project, onProgress);
        } else if (action === "direct") {
          await saveProject({ ...project, status: "applying", statusMessage: "Applying your direction…", interrupted: false });
          next = await directProject(project, String(body?.instruction ?? ""), onProgress);
        } else if (action === "restory") {
          await saveProject({ ...project, status: "applying", statusMessage: "Reading the new story…", interrupted: false });
          next = await restoryProject(project, String(body?.prompt ?? ""), onProgress);
        } else if (action === "undo") {
          next = undoProject(project) ?? project;
          if (next === project) throw userError("There’s nothing to undo yet.");
        } else if (action === "redo") {
          next = redoProject(project) ?? project;
          if (next === project) throw userError("There’s nothing to redo.");
        } else if (action === "restore") {
          next = await restoreVersion(project, String(body?.versionId ?? ""));
        } else if (action === "recover") {
          next = { ...project, status: "idle", statusMessage: "", interrupted: true };
        } else {
          throw userError("Storyloom doesn’t recognise that action.");
        }
        next = { ...next, status: "idle", statusMessage: "", interrupted: false };
        await saveProject(next);
        send({ type: "done", project: await getProject(id) });
      } catch (error) {
        const current = await getProject(id).catch(() => null);
        if (current && current.status !== "idle") {
          const validation = error instanceof Error && error.message.startsWith("storyloom:");
          await saveProject({ ...current, status: "idle", statusMessage: "", interrupted: !validation });
        }
        throw error;
      }
    });
  });
}
