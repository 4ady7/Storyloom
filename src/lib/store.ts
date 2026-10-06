import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { resetHistory } from "./history";
import { assertId, createId } from "./ids";
import { readImageStats } from "./image-stats";
import { gradeIsNeutral } from "./plan";
import { getImageProvider } from "./providers";
import { DEFAULT_LOCKS, NEUTRAL_GRADE, type Grade, type Photograph, type Project, type ProjectSummary, type Version } from "./types";
import { mimeForExtension } from "./validate";

const chains = new Map<string, Promise<unknown>>();

export class ProjectNotFound extends Error {
  constructor() {
    super("storyloom: That story could not be found.");
    this.name = "ProjectNotFound";
  }
}

export function dataRoot(): string {
  if (process.env.STORYLOOM_DATA_DIR) return path.resolve(process.env.STORYLOOM_DATA_DIR);
  return path.join(process.cwd(), "data", "projects");
}

export function insideRoot(...parts: string[]): string {
  const root = path.resolve(dataRoot());
  const resolved = path.resolve(root, ...parts);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("storyloom: That path is not allowed.");
  }
  return resolved;
}

export function withProjectLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(id) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  chains.set(
    id,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${createId()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, file);
}

function projectPath(id: string) {
  assertId(id);
  return insideRoot(id, "project.json");
}

function photoDir(projectId: string, photoId: string) {
  assertId(projectId);
  assertId(photoId);
  return insideRoot(projectId, "photos", photoId);
}

export async function saveProject(project: Project): Promise<void> {
  const next = { ...project, updatedAt: new Date().toISOString() };
  await writeJson(projectPath(project.id), next);
  project.updatedAt = next.updatedAt;
}

export async function getProject(id: string): Promise<Project> {
  try {
    const raw = await fs.readFile(projectPath(id), "utf8");
    return JSON.parse(raw) as Project;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ProjectNotFound();
    throw new ProjectNotFound();
  }
}

export async function listProjects(): Promise<ProjectSummary[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dataRoot());
  } catch {
    return [];
  }
  const summaries: ProjectSummary[] = [];
  for (const entry of entries) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(entry)) continue;
    try {
      const project = await getProject(entry);
      summaries.push({
        id: project.id,
        title: project.title,
        updatedAt: project.updatedAt,
        photoCount: project.photos.length,
        coverPhotoId: project.sequence[0] ?? project.photos[0]?.id ?? null,
        summary: project.story?.summary ?? (project.prompt ? project.prompt.slice(0, 140) : "No story yet"),
      });
    } catch {
      continue;
    }
  }
  return summaries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function createProject(title?: string): Promise<Project> {
  const now = new Date().toISOString();
  const id = createId();
  const base: Project = {
    id,
    title: title?.trim().slice(0, 120) || "Untitled story",
    createdAt: now,
    updatedAt: now,
    prompt: "",
    photos: [],
    sequence: [],
    userSequence: [],
    sequenceSource: "user",
    story: null,
    bible: null,
    locks: { ...DEFAULT_LOCKS },
    versions: [
      {
        id: "original",
        label: "Original",
        kind: "original",
        createdAt: now,
        note: "Your photographs, unchanged.",
        grades: {},
        touched: {},
      },
    ],
    activeVersionId: "original",
    history: [],
    historyIndex: 0,
    status: "idle",
    statusMessage: "",
    interrupted: false,
    lastDirection: "",
    readingCurrent: true,
  };
  const project = resetHistory(base, "Original");
  await saveProject(project);
  return project;
}

export async function deleteProject(id: string): Promise<void> {
  assertId(id);
  await fs.rm(insideRoot(id), { recursive: true, force: true });
}

async function writeDerivative(original: Buffer, file: string, edge: number, format: "webp" | "jpeg") {
  let pipeline = sharp(original).rotate().resize(edge, edge, { fit: "inside", withoutEnlargement: true });
  pipeline = format === "webp" ? pipeline.webp({ quality: 72 }) : pipeline.jpeg({ quality: 82, mozjpeg: true });
  await fs.mkdir(path.dirname(file), { recursive: true });
  await pipeline.toFile(file);
}

export async function addPhoto(project: Project, file: { name: string; type: string; bytes: Buffer }): Promise<Photograph> {
  if (project.photos.length >= 24) {
    throw new Error("storyloom: This story already has 24 photographs.");
  }
  let meta: sharp.Metadata;
  try {
    meta = await sharp(file.bytes).metadata();
  } catch {
    throw new Error(`storyloom: ${file.name} could not be read. It may be damaged.`);
  }
  if (!meta.width || !meta.height || !meta.format || !["jpeg", "png", "webp"].includes(meta.format)) {
    throw new Error(`storyloom: ${file.name} is not a JPEG, PNG, or WebP photograph.`);
  }
  const id = createId();
  const dir = photoDir(project.id, id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "original"), file.bytes);
  await writeDerivative(file.bytes, path.join(dir, "thumb.webp"), 480, "webp");
  await writeDerivative(file.bytes, path.join(dir, "preview.jpg"), 1600, "jpeg");
  const stats = await readImageStats(file.bytes);
  const photo: Photograph = {
    id,
    originalName: file.name,
    mime: file.type || mimeForExtension(file.name),
    width: stats.width || meta.width,
    height: stats.height || meta.height,
    bytes: file.bytes.length,
    createdAt: new Date().toISOString(),
    stats,
  };
  project.photos.push(photo);
  project.sequence.push(id);
  project.userSequence.push(id);
  project.readingCurrent = false;
  return photo;
}

export async function removePhoto(project: Project, photoId: string): Promise<void> {
  assertId(photoId);
  if (!project.photos.some((photo) => photo.id === photoId)) {
    throw new Error("storyloom: That photograph is not in this story.");
  }
  project.photos = project.photos.filter((photo) => photo.id !== photoId);
  project.sequence = project.sequence.filter((id) => id !== photoId);
  project.userSequence = project.userSequence.filter((id) => id !== photoId);
  if (project.story) {
    project.story = {
      ...project.story,
      photoRoles: project.story.photoRoles.filter((role) => role.photoId !== photoId),
      inconsistencies: project.story.inconsistencies.filter((item) => item.photoId !== photoId),
      relationships: project.story.relationships.filter(
        (item) => item.fromPhotoId !== photoId && item.toPhotoId !== photoId,
      ),
      suggestedSequence: project.story.suggestedSequence.filter((id) => id !== photoId),
    };
  }
  for (const version of project.versions) {
    delete version.grades[photoId];
    delete version.touched[photoId];
  }
  project.readingCurrent = false;
  await fs.rm(photoDir(project.id, photoId), { recursive: true, force: true });
}

export async function readOriginal(projectId: string, photoId: string): Promise<Buffer> {
  return fs.readFile(path.join(photoDir(projectId, photoId), "original"));
}

function cacheName(size: "thumb" | "preview" | "full", versionId?: string) {
  if (!versionId || versionId === "original") {
    if (size === "thumb") return "thumb.webp";
    if (size === "preview") return "preview.jpg";
    return "original";
  }
  assertId(versionId);
  if (size === "thumb") return path.join("versions", `${versionId}-thumb.webp`);
  if (size === "preview") return path.join("versions", `${versionId}-preview.jpg`);
  return path.join("versions", `${versionId}.jpg`);
}

export async function writeGraded(projectId: string, photoId: string, versionId: string, buffer: Buffer) {
  assertId(versionId);
  const file = path.join(photoDir(projectId, photoId), "versions", `${versionId}.jpg`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buffer);
  await writeDerivative(buffer, path.join(photoDir(projectId, photoId), "versions", `${versionId}-preview.jpg`), 1600, "jpeg");
  await writeDerivative(buffer, path.join(photoDir(projectId, photoId), "versions", `${versionId}-thumb.webp`), 480, "webp");
}

export function gradeOn(version: Version | undefined, photoId: string): Grade {
  return version?.grades[photoId] ?? NEUTRAL_GRADE;
}

export async function readMedia(
  project: Project,
  photoId: string,
  size: "thumb" | "preview" | "full",
  versionId?: string,
): Promise<{ buffer: Buffer; mime: string }> {
  const photo = project.photos.find((item) => item.id === photoId);
  if (!photo) throw new ProjectNotFound();
  const version = project.versions.find((item) => item.id === (versionId || project.activeVersionId)) ?? project.versions[0];
  const grade = gradeOn(version, photoId);
  const useOriginal = !version || version.id === "original" || gradeIsNeutral(grade);
  const dir = photoDir(project.id, photoId);

  if (useOriginal && size === "full") {
    return { buffer: await fs.readFile(path.join(dir, "original")), mime: photo.mime || "image/jpeg" };
  }
  if (useOriginal && size === "thumb") {
    return { buffer: await fs.readFile(path.join(dir, "thumb.webp")), mime: "image/webp" };
  }
  if (useOriginal && size === "preview") {
    return { buffer: await fs.readFile(path.join(dir, "preview.jpg")), mime: "image/jpeg" };
  }

  const cached = path.join(dir, cacheName(size, version.id));
  try {
    const buffer = await fs.readFile(cached);
    return { buffer, mime: size === "thumb" ? "image/webp" : "image/jpeg" };
  } catch {
    const original = await fs.readFile(path.join(dir, "original"));
    const provider = getImageProvider(project.locks);
    const rendered = await provider.editImage(original, grade, { maxEdge: 2560 });
    await writeGraded(project.id, photoId, version.id, rendered);
    const buffer = await fs.readFile(cached);
    return { buffer, mime: size === "thumb" ? "image/webp" : "image/jpeg" };
  }
}
