import { createId } from "./ids";
import { buildStory } from "./story-engine";
import { mergeVisionStory } from "./schemas";
import { VisualBibleSchema } from "./schemas";
import { addGrade, gradeIsNeutral, planTreatment } from "./plan";
import { interpret, type Scope } from "./direction";
import { pushHistory, redoProject, undoProject } from "./history";
import { getImageProvider, getStoryVision, providerKind } from "./providers";
import { readOriginal, writeGraded } from "./store";
import { NEUTRAL_GRADE, type Grade, type Project, type Version, type VisualBible } from "./types";
import { userError } from "./humanize";
import sharp from "sharp";

export type Progress = (message: string) => void;

function stamp(project: Project, status: Project["status"], message: string): Project {
  return { ...project, status, statusMessage: message, interrupted: false };
}

async function thumbForVision(projectId: string, photoId: string) {
  const original = await readOriginal(projectId, photoId);
  const buffer = await sharp(original).rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  return buffer.toString("base64");
}

export async function analyseProject(
  project: Project,
  prompt: string,
  onProgress: Progress,
  options?: { record?: boolean },
): Promise<Project> {
  const text = prompt.trim();
  if (!project.photos.length) throw userError("Add photographs before asking Storyloom to read them.");
  if (text.length < 8) throw userError("Tell Storyloom a little more about the story you want these photographs to tell.");
  if (text.length > 4000) throw userError("The story is too long. Keep it under 4000 characters.");

  let next = stamp({ ...project, prompt: text }, "analysing", "Reading photographs…");
  onProgress("Reading photographs…");
  const ordered = next.sequence
    .map((id) => next.photos.find((photo) => photo.id === id))
    .filter((photo): photo is NonNullable<typeof photo> => Boolean(photo));

  for (let index = 0; index < ordered.length; index += 1) {
    onProgress(`Reading photograph ${index + 1} of ${ordered.length}…`);
  }

  onProgress("Finding the story…");
  const built = buildStory(text, next.photos, next.sequence);
  let story = built.story;
  let bible = built.bible;

  onProgress("Identifying characters…");
  const vision = getStoryVision();
  if (vision) {
    onProgress("Looking across the collection…");
    try {
      const photos = [];
      for (const photo of ordered) {
        photos.push({
          id: photo.id,
          mime: "image/jpeg",
          base64: await thumbForVision(next.id, photo.id),
          width: photo.width,
          height: photo.height,
        });
      }
      const raw = await vision.read({ prompt: text, photos });
      const merged = mergeVisionStory(story, raw, bible);
      story = merged.story;
      bible = merged.bible;
    } catch (error) {
      console.error("Storyloom vision fallback", error instanceof Error ? error.name : "error");
      story = {
        ...story,
        readingNote:
          "The vision provider didn’t answer, so this reading uses your words and the light in the photographs. Nothing was changed in the files.",
      };
    }
  }

  onProgress("Building your visual language…");
  const parsedBible = VisualBibleSchema.safeParse(bible);
  if (!parsedBible.success) throw userError("The visual language came back incomplete. Your photographs were not changed.");

  onProgress("Mapping the sequence…");
  next = {
    ...next,
    prompt: text,
    story,
    bible: parsedBible.data,
    readingCurrent: true,
    status: "idle",
    statusMessage: "",
    lastDirection: "",
  };
  if (options?.record !== false) next = pushHistory(next, "Story reading");
  onProgress("Story ready.");
  return next;
}

function versionFrom(
  project: Project,
  label: string,
  kind: Version["kind"],
  note: string,
  grades: Record<string, Grade>,
  touched: Version["touched"],
): Version {
  return {
    id: createId(),
    label,
    kind,
    createdAt: new Date().toISOString(),
    note,
    grades,
    touched,
  };
}

async function renderGrades(
  project: Project,
  version: Version,
  onProgress: Progress,
  instruction: string,
): Promise<{ failed: string[] }> {
  const provider = getImageProvider(project.locks);
  const failed: string[] = [];
  const ids = project.sequence.filter((id) => project.photos.some((photo) => photo.id === id));
  for (let index = 0; index < ids.length; index += 1) {
    const photoId = ids[index];
    const grade = version.grades[photoId] ?? NEUTRAL_GRADE;
    const touch = version.touched[photoId];
    if (gradeIsNeutral(grade)) {
      onProgress(touch?.summary ?? `Leaving frame ${index + 1} as photographed.`);
      continue;
    }
    onProgress(`Grading frame ${index + 1} of ${ids.length}…`);
    try {
      const original = await readOriginal(project.id, photoId);
      const useGenerative = providerKind(project.locks) === "generative";
      const rendered = useGenerative
        ? await provider.editImage(original, grade, { maxEdge: 2560 })
        : await provider.editImage(original, grade, { maxEdge: 2560 });
      await writeGraded(project.id, photoId, version.id, rendered);
      if (instruction) {
        void instruction;
      }
    } catch (error) {
      console.error("Storyloom grade failed", error instanceof Error ? error.name : "error");
      failed.push(photoId);
      version.grades[photoId] = NEUTRAL_GRADE;
      version.touched[photoId] = {
        preserved: true,
        summary: "Storyloom couldn’t finish this image. Your original is safe.",
      };
    }
  }
  return { failed };
}

export async function weaveProject(
  project: Project,
  onProgress: Progress,
  meta?: { kind?: Version["kind"]; label?: string; notePrefix?: string },
): Promise<Project> {
  if (!project.bible || !project.story) throw userError("Read the story before weaving a visual language.");
  if (!project.photos.length) throw userError("Add photographs before weaving.");
  onProgress("Checking the collection against the visual language…");
  const plans = planTreatment(project.photos, project.sequence, project.bible, project.locks, {
    forceAll: project.bible.texture.grain >= 0.14,
  });
  const grades: Record<string, Grade> = {};
  const touched: Version["touched"] = {};
  for (const [id, plan] of Object.entries(plans)) {
    grades[id] = plan.grade;
    touched[id] = { preserved: plan.preserved, summary: plan.summary };
    const index = project.sequence.indexOf(id);
    onProgress(
      plan.preserved
        ? `Frame ${index + 1} already belongs. Leaving it as photographed.`
        : `Frame ${index + 1} needs to move toward ${plan.label.toLowerCase()}.`,
    );
  }
  const changed = Object.values(touched).filter((item) => !item.preserved).length;
  const note =
    changed === 0
      ? "Every frame already sat inside the visual language, so Storyloom kept the photographs as shot."
      : `${changed} frame${changed === 1 ? "" : "s"} adjusted. The others stayed as photographed.`;
  const version = versionFrom(
    project,
    meta?.label ?? "Visual language",
    meta?.kind ?? "treatment",
    meta?.notePrefix ? `${meta.notePrefix} ${note}` : note,
    grades,
    touched,
  );
  const { failed } = await renderGrades(project, version, onProgress, project.bible.summary);
  if (failed.length === project.sequence.length) {
    throw userError("Storyloom couldn’t finish this weave. Your originals are safe. Try again.");
  }
  if (failed.length) {
    version.note = `${note} ${failed.length} frame${failed.length === 1 ? "" : "s"} could not be finished and stayed original.`;
  }
  let next: Project = {
    ...project,
    versions: [...project.versions, version],
    activeVersionId: version.id,
    status: "idle",
    statusMessage: "",
    lastDirection: note,
  };
  next = pushHistory(next, meta?.label ?? "Visual language");
  onProgress("Weave complete.");
  return next;
}

function scopeIds(project: Project, scope: Scope): string[] {
  if (scope === "all") return [...project.sequence];
  return scope.map((index) => project.sequence[index]).filter((id): id is string => Boolean(id));
}

function harmonizedGrades(project: Project, ids: string[], base: Record<string, Grade>): Record<string, Grade> {
  const temps: number[] = [];
  const brights: number[] = [];
  for (const id of ids) {
    const photo = project.photos.find((item) => item.id === id);
    if (!photo?.stats) continue;
    temps.push(photo.stats.temperature);
    brights.push(photo.stats.brightness);
  }
  if (!temps.length) return base;
  const avgTemp = temps.reduce((sum, value) => sum + value, 0) / temps.length;
  const avgBright = brights.reduce((sum, value) => sum + value, 0) / brights.length;
  const grades = { ...base };
  for (const id of ids) {
    const photo = project.photos.find((item) => item.id === id);
    if (!photo?.stats) continue;
    const current = grades[id] ?? NEUTRAL_GRADE;
    grades[id] = addGrade(current, {
      warmth: (avgTemp - photo.stats.temperature) * 0.9,
      brightness: (avgBright - photo.stats.brightness) * 0.65,
    });
  }
  return grades;
}

export async function directProject(project: Project, instruction: string, onProgress: Progress): Promise<Project> {
  const reading = interpret(instruction, project);
  if (reading.kind === "unclear") throw userError(reading.message);
  if (reading.kind === "undo") {
    const undone = undoProject(project);
    if (!undone) throw userError("There’s nothing to undo yet.");
    onProgress("Undone.");
    return { ...undone, lastDirection: "Undone." };
  }
  if (reading.kind === "redo") {
    const redone = redoProject(project);
    if (!redone) throw userError("There’s nothing to redo.");
    onProgress("Redone.");
    return { ...redone, lastDirection: "Redone." };
  }
  if (!project.bible) throw userError("Read the story before directing it.");

  onProgress("Deciding what should change…");
  const bible = reading.patch(project.bible, project, reading.scope);
  const parsed = VisualBibleSchema.safeParse(bible);
  if (!parsed.success) throw userError("That direction didn’t fit the visual language. Nothing was changed.");
  const ids = scopeIds(project, reading.scope);
  const currentVersion = project.versions.find((version) => version.id === project.activeVersionId);
  const grades: Record<string, Grade> = {};
  for (const photo of project.photos) {
    grades[photo.id] = currentVersion?.grades[photo.id] ?? NEUTRAL_GRADE;
  }
  const plans = planTreatment(project.photos, project.sequence, parsed.data, project.locks, {
    forceIds: new Set(ids),
    forceAll: reading.scope === "all",
  });
  const touched: Version["touched"] = { ...(currentVersion?.touched ?? {}) };
  for (const id of project.sequence) {
    if (!ids.includes(id)) {
      touched[id] = touched[id] ?? { preserved: true, summary: "Unchanged by this direction." };
      continue;
    }
    let grade = plans[id]?.grade ?? grades[id] ?? NEUTRAL_GRADE;
    if (reading.afterDelta) grade = addGrade(grade, reading.afterDelta);
    grades[id] = grade;
    touched[id] = {
      preserved: gradeIsNeutral(grade),
      summary: gradeIsNeutral(grade) ? "This frame needed no further change." : reading.rationale,
    };
  }
  const harmonized = reading.harmonize ? harmonizedGrades(project, ids, grades) : grades;
  for (const id of ids) {
    if (harmonized[id] && !gradeIsNeutral(harmonized[id])) {
      touched[id] = { preserved: false, summary: reading.rationale };
    }
  }
  const version = versionFrom(project, reading.label, "edit", reading.rationale, harmonized, touched);
  onProgress("Applying the direction…");
  const { failed } = await renderGrades(project, version, onProgress, reading.rationale);
  if (failed.length === ids.length && ids.length > 0 && ids.every((id) => failed.includes(id))) {
    throw userError("Storyloom couldn’t finish that direction. Your originals are safe.");
  }
  let next: Project = {
    ...project,
    bible: parsed.data,
    versions: [...project.versions, version],
    activeVersionId: version.id,
    status: "idle",
    statusMessage: "",
    lastDirection: reading.rationale,
  };
  next = pushHistory(next, reading.label);
  onProgress("Direction applied.");
  return next;
}

export async function restoryProject(project: Project, prompt: string, onProgress: Progress): Promise<Project> {
  onProgress("Reading the new story…");
  const analysed = await analyseProject(project, prompt, onProgress, { record: false });
  onProgress("Rebuilding the visual language…");
  const label = `Re-story: ${prompt.trim().slice(0, 42)}`;
  const woven = await weaveProject(analysed, onProgress, {
    kind: "restory",
    label,
    notePrefix: "Same photographs, read as a different story.",
  });
  onProgress("Re-story ready.");
  return { ...woven, lastDirection: woven.versions.find((item) => item.id === woven.activeVersionId)?.note ?? "Re-story complete." };
}

export async function restoreVersion(project: Project, versionId: string): Promise<Project> {
  const version = project.versions.find((item) => item.id === versionId);
  if (!version) throw userError("That version is not in this story.");
  const next = pushHistory(
    { ...project, activeVersionId: version.id, lastDirection: `Showing ${version.label}.` },
    `Restore ${version.label}`,
  );
  return next;
}
