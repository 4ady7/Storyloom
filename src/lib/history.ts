import { createId } from "./ids";
import type { Project, Snapshot } from "./types";

export function snapshotOf(project: Project, label: string): Snapshot {
  return {
    id: createId(),
    label,
    at: new Date().toISOString(),
    prompt: project.prompt,
    story: structuredClone(project.story),
    bible: structuredClone(project.bible),
    sequence: [...project.sequence],
    userSequence: [...project.userSequence],
    sequenceSource: project.sequenceSource,
    activeVersionId: project.activeVersionId,
    locks: structuredClone(project.locks),
    versions: structuredClone(project.versions),
    readingCurrent: project.readingCurrent,
    lastDirection: project.lastDirection,
  };
}

export function applySnapshot(project: Project, snap: Snapshot, historyIndex: number): Project {
  const live = new Set(project.photos.map((photo) => photo.id));
  const keep = (ids: string[]) => ids.filter((id) => live.has(id));
  return {
    ...project,
    prompt: snap.prompt,
    story: snap.story,
    bible: snap.bible,
    sequence: keep(snap.sequence),
    userSequence: keep(snap.userSequence),
    sequenceSource: snap.sequenceSource,
    activeVersionId: snap.versions.some((version) => version.id === snap.activeVersionId)
      ? snap.activeVersionId
      : "original",
    locks: { ...snap.locks },
    versions: snap.versions,
    readingCurrent: snap.readingCurrent,
    lastDirection: snap.lastDirection,
    historyIndex,
    status: "idle",
    statusMessage: "",
    updatedAt: new Date().toISOString(),
  };
}

export function pushHistory(project: Project, label: string): Project {
  const snap = snapshotOf(project, label);
  const history = [...project.history.slice(0, project.historyIndex + 1), snap];
  return { ...project, history, historyIndex: history.length - 1 };
}

export function resetHistory(project: Project, label: string): Project {
  const snap = snapshotOf(project, label);
  return { ...project, history: [snap], historyIndex: 0 };
}

export function undoProject(project: Project): Project | null {
  if (project.historyIndex <= 0) return null;
  const historyIndex = project.historyIndex - 1;
  return applySnapshot(project, project.history[historyIndex], historyIndex);
}

export function redoProject(project: Project): Project | null {
  if (project.historyIndex >= project.history.length - 1) return null;
  const historyIndex = project.historyIndex + 1;
  return applySnapshot(project, project.history[historyIndex], historyIndex);
}
