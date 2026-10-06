import sharp from "sharp";
import { xmlEscape } from "../format";
import { renderGrade } from "../grade";
import { readImageStats } from "../image-stats";
import type { Grade } from "../types";
import type { CompositeFrame, ImageProvider } from "./types";

async function contactSheet(frames: CompositeFrame[]): Promise<Buffer> {
  if (!frames.length) {
    return sharp({
      create: { width: 800, height: 400, channels: 3, background: "#f3eee6" },
    })
      .jpeg()
      .toBuffer();
  }
  const cols = frames.length <= 2 ? frames.length : frames.length <= 4 ? 2 : 3;
  const cellW = 640;
  const cellH = 760;
  const gap = 28;
  const margin = 48;
  const rows = Math.ceil(frames.length / cols);
  const width = margin * 2 + cols * cellW + (cols - 1) * gap;
  const height = margin * 2 + rows * cellH + (rows - 1) * gap;
  const layers: sharp.OverlayOptions[] = [];

  for (let index = 0; index < frames.length; index += 1) {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const left = margin + col * (cellW + gap);
    const top = margin + row * (cellH + gap);
    const image = await sharp(frames[index].buffer)
      .rotate()
      .resize(cellW, 560, { fit: "cover", position: "attention" })
      .jpeg({ quality: 86 })
      .toBuffer();
    layers.push({ input: image, left, top });
    const caption = xmlEscape(frames[index].caption).slice(0, 80);
    const label = Buffer.from(
      `<svg width="${cellW}" height="72" xmlns="http://www.w3.org/2000/svg"><text x="0" y="36" font-family="Georgia, serif" font-size="22" fill="#1a1714">${caption}</text></svg>`,
    );
    layers.push({ input: label, left, top: top + 580 });
  }

  return sharp({
    create: { width, height, channels: 3, background: "#f3eee6" },
  })
    .composite(layers)
    .jpeg({ quality: 90 })
    .toBuffer();
}

export const localImageProvider: ImageProvider = {
  id: "local",
  analyseImage: readImageStats,
  editImage(input: Buffer, grade: Grade, options?: { maxEdge?: number }) {
    return renderGrade(input, grade, options?.maxEdge);
  },
  generateVariation(input: Buffer, grade: Grade, options?: { maxEdge?: number }) {
    return renderGrade(input, grade, options?.maxEdge);
  },
  createComposite: contactSheet,
};

export { contactSheet };
