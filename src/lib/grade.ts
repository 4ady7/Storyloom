import sharp from "sharp";
import { clamp } from "./format";
import type { Grade } from "./types";
import { gradeIsNeutral } from "./plan";

async function grainBuffer(width: number, height: number, amount: number): Promise<Buffer> {
  const sigma = 8 + amount * 20;
  return sharp({
    create: {
      width: 480,
      height: 480,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
      noise: { type: "gaussian", mean: 128, sigma },
    },
  })
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
}

function vignetteSvg(width: number, height: number, amount: number): Buffer {
  const shade = Math.round(clamp(255 - amount * 190, 40, 255));
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="v" cx="50%" cy="46%" r="68%"><stop offset="52%" stop-color="white"/><stop offset="100%" stop-color="rgb(${shade},${shade},${shade})"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#v)"/></svg>`,
  );
}

export async function renderGrade(input: Buffer, grade: Grade, maxEdge?: number): Promise<Buffer> {
  const oriented = await sharp(input).rotate().toBuffer();
  const meta = await sharp(oriented).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const edge = Math.max(width, height);
  const limit = maxEdge && edge > maxEdge ? maxEdge : undefined;

  if (gradeIsNeutral(grade)) {
    let pipeline = sharp(oriented);
    if (limit) pipeline = pipeline.resize(limit, limit, { fit: "inside", withoutEnlargement: true });
    return pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  }

  const shift = clamp(grade.warmth, -1, 1);
  const rScale = 1 + shift * 0.5;
  const bScale = 1 - shift * 0.48;
  const contrast = clamp(grade.contrast, 0.75, 1.45);
  let pipeline = sharp(oriented).flatten({ background: "#ffffff" }).recomb([
    [rScale, 0, 0],
    [0, 1 - Math.abs(shift) * 0.03, 0],
    [0, 0, Math.max(0.2, bScale)],
  ]).modulate({
    brightness: clamp(grade.brightness, 0.7, 1.35),
    saturation: clamp(grade.saturation, 0.35, 1.7),
  }).linear(contrast, Math.round(128 * (1 - contrast)));

  if (grade.fade > 0.02) {
    const fade = clamp(grade.fade, 0, 0.65);
    pipeline = pipeline.linear(1 - fade * 0.14, Math.round(16 * fade));
  }
  if (limit) pipeline = pipeline.resize(limit, limit, { fit: "inside", withoutEnlargement: true });
  if (grade.sharpen > 0.08) {
    pipeline = pipeline.sharpen({ sigma: 0.4 + grade.sharpen * 0.8 });
  }

  let output = await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  const sized = await sharp(output).metadata();
  const outW = sized.width ?? width;
  const outH = sized.height ?? height;
  const layers: sharp.OverlayOptions[] = [];
  if (grade.grain > 0.03) layers.push({ input: await grainBuffer(outW, outH, grade.grain), blend: "soft-light" });
  if (grade.vignette > 0.03) layers.push({ input: vignetteSvg(outW, outH, grade.vignette), blend: "multiply" });
  if (layers.length) {
    output = await sharp(output).composite(layers).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  }
  return output;
}
