import type { Photograph, Project, Version } from "./types";

export function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function confidenceLabel(n: number): string {
  if (n >= 0.75) return "Clear";
  if (n >= 0.5) return "Fairly sure";
  if (n >= 0.3) return "A reading";
  return "A hypothesis";
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function orderedPhotos(project: Project): Photograph[] {
  const map = new Map(project.photos.map((photo) => [photo.id, photo]));
  const ids = project.sequence.length ? project.sequence : project.photos.map((photo) => photo.id);
  return ids.map((id) => map.get(id)).filter((photo): photo is Photograph => Boolean(photo));
}

export function roleFor(project: Project, photoId: string) {
  return project.story?.photoRoles.find((role) => role.photoId === photoId) ?? null;
}

export function activeVersion(project: Project): Version | undefined {
  return project.versions.find((version) => version.id === project.activeVersionId) ?? project.versions[0];
}

export function mediaUrl(
  projectId: string,
  photoId: string,
  size: "thumb" | "preview" | "full",
  versionId?: string,
): string {
  const query = new URLSearchParams({ size });
  if (versionId) query.set("version", versionId);
  return `/api/media/${projectId}/${photoId}?${query.toString()}`;
}

export function slug(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return cleaned || "frame";
}

export function frameNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

export function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return map[char] ?? char;
  });
}
