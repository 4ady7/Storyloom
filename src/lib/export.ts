import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";
import sharp from "sharp";
import { frameNumber, orderedPhotos, roleFor, slug } from "./format";
import { gradeIsNeutral } from "./plan";
import { localImageProvider } from "./providers/local";
import { getImageProvider } from "./providers";
import { gradeOn, readOriginal } from "./store";
import type { Project } from "./types";

async function frameJpeg(project: Project, photoId: string, maxEdge: number): Promise<Buffer> {
  const original = await readOriginal(project.id, photoId);
  const version = project.versions.find((item) => item.id === project.activeVersionId);
  const grade = gradeOn(version, photoId);
  if (!version || version.id === "original" || gradeIsNeutral(grade)) {
    return sharp(original).rotate().resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  }
  return getImageProvider(project.locks).editImage(original, grade, { maxEdge });
}

function pdfSafe(value: string): string {
  return value
    .replaceAll("→", " to ")
    .replaceAll("—", " - ")
    .replaceAll("–", "-")
    .replaceAll("“", "\"")
    .replaceAll("”", "\"")
    .replaceAll("’", "'")
    .replace(/[^\u0000-\u00FF]/g, "");
}

function caption(project: Project, photoId: string, index: number): string {
  const role = roleFor(project, photoId);
  const number = frameNumber(index);
  if (!role) return `${number}  ${project.photos.find((photo) => photo.id === photoId)?.originalName ?? "Frame"}`;
  return `${number}  ${role.role}`;
}

export async function exportFrame(project: Project, photoId: string, maxEdge: number): Promise<{ buffer: Buffer; filename: string }> {
  const index = Math.max(0, project.sequence.indexOf(photoId));
  const buffer = await frameJpeg(project, photoId, maxEdge);
  const role = roleFor(project, photoId);
  return { buffer, filename: `${frameNumber(index)}-${slug(role?.role ?? "frame")}.jpg` };
}

export async function exportContact(project: Project): Promise<Buffer> {
  const photos = orderedPhotos(project);
  const frames = [];
  for (let index = 0; index < photos.length; index += 1) {
    frames.push({
      buffer: await frameJpeg(project, photos[index].id, 900),
      caption: caption(project, photos[index].id, index),
    });
  }
  return localImageProvider.createComposite(frames);
}

export async function exportZip(project: Project, maxEdge: number): Promise<Buffer> {
  const zip = new JSZip();
  const folder = zip.folder(`storyloom-${slug(project.title)}`) ?? zip;
  const photos = orderedPhotos(project);
  const lines = [
    project.title,
    "",
    project.story?.summary ?? "",
    project.story?.premise ?? project.prompt,
    "",
    project.bible?.summary ?? "",
    "",
  ];
  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    const role = roleFor(project, photo.id);
    const name = `${frameNumber(index)}-${slug(role?.role ?? photo.originalName)}.jpg`;
    folder.file(name, await frameJpeg(project, photo.id, maxEdge));
    lines.push(`${caption(project, photo.id, index)}${role ? ` — ${role.emotion}, ${role.location}` : ""}`);
  }
  folder.file("story.txt", lines.filter((line) => line !== undefined).join("\n"));
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

export async function exportPdf(project: Project, maxEdge: number): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const ink = rgb(0.11, 0.09, 0.08);
  const muted = rgb(0.38, 0.34, 0.3);
  const photos = orderedPhotos(project);

  const title = pdf.addPage([900, 560]);
  title.drawText("Storyloom", { x: 56, y: 470, size: 14, font: serif, color: muted });
  const heading = project.title.slice(0, 80);
  title.drawText(pdfSafe(heading), { x: 56, y: 420, size: 36, font: serifBold, color: ink });
  const summary = pdfSafe((project.story?.summary ?? "A visual story.").slice(0, 180));
  title.drawText(summary, { x: 56, y: 370, size: 16, font: serif, color: ink });
  const premise = pdfSafe((project.story?.premise ?? project.prompt ?? "").replace(/\s+/g, " ").slice(0, 420));
  drawWrapped(title, premise, 56, 320, 780, 13, serif, muted);
  const arc = pdfSafe(project.story?.emotionalProgression.join("  to  ") ?? "");
  if (arc) title.drawText(arc.slice(0, 140), { x: 56, y: 80, size: 12, font: serif, color: ink });

  for (let index = 0; index < photos.length; index += 1) {
    const page = pdf.addPage([900, 560]);
    const jpeg = await frameJpeg(project, photos[index].id, Math.min(maxEdge, 1800));
    const image = await pdf.embedJpg(jpeg);
    const maxW = 780;
    const maxH = 420;
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x: (900 - width) / 2, y: 110 + (maxH - height) / 2, width, height });
    page.drawText(pdfSafe(caption(project, photos[index].id, index).slice(0, 90)), {
      x: 56,
      y: 64,
      size: 16,
      font: serifBold,
      color: ink,
    });
    const role = roleFor(project, photos[index].id);
    if (role) {
      page.drawText(pdfSafe(`${role.location}  /  ${role.emotion}`.slice(0, 110)), {
        x: 56,
        y: 40,
        size: 12,
        font: serif,
        color: muted,
      });
    }
  }

  return Buffer.from(await pdf.save());
}

function drawWrapped(
  page: { drawText: (text: string, opts: { x: number; y: number; size: number; font: Awaited<ReturnType<PDFDocument["embedFont"]>>; color: ReturnType<typeof rgb> }) => void },
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  color: ReturnType<typeof rgb>,
) {
  const words = text.split(" ");
  let line = "";
  let cursor = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width) {
      if (line) page.drawText(line, { x, y: cursor, size, font, color });
      line = word;
      cursor -= size + 6;
      if (cursor < 100) break;
    } else {
      line = next;
    }
  }
  if (line && cursor >= 100) page.drawText(line, { x, y: cursor, size, font, color });
}
