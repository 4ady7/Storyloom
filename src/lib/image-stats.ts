import sharp from "sharp";
import { clamp } from "./format";
import type { ImageStats } from "./types";

function hex(r: number, g: number, b: number): string {
  const part = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

async function sample(input: Buffer, region?: { left: number; top: number; width: number; height: number }) {
  let pipeline = sharp(input).rotate();
  if (region && region.width > 2 && region.height > 2) pipeline = pipeline.extract(region);
  const { data, info } = await pipeline.removeAlpha().resize(32, 24, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let r = 0;
  let g = 0;
  let b = 0;
  let sat = 0;
  const lums: number[] = [];
  const pixels = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    const pr = data[i];
    const pg = data[i + 1];
    const pb = data[i + 2];
    r += pr;
    g += pg;
    b += pb;
    const max = Math.max(pr, pg, pb);
    const min = Math.min(pr, pg, pb);
    sat += max === 0 ? 0 : (max - min) / max;
    lums.push((0.2126 * pr + 0.7152 * pg + 0.0722 * pb) / 255);
  }
  const mean = lums.reduce((sum, value) => sum + value, 0) / pixels;
  const variance = lums.reduce((sum, value) => sum + (value - mean) ** 2, 0) / pixels;
  return {
    r: r / pixels,
    g: g / pixels,
    b: b / pixels,
    brightness: mean,
    contrast: clamp(Math.sqrt(variance) / 0.22, 0, 1),
    saturation: sat / pixels,
  };
}

export async function readImageStats(input: Buffer): Promise<ImageStats> {
  const meta = await sharp(input).rotate().metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const whole = await sample(input);
  const top = await sample(input, { left: 0, top: 0, width, height: Math.max(2, Math.floor(height / 3)) });
  const bottom = await sample(input, {
    left: 0,
    top: Math.max(0, height - Math.max(2, Math.floor(height / 3))),
    width,
    height: Math.max(2, Math.floor(height / 3)),
  });
  return {
    width,
    height,
    brightness: whole.brightness,
    contrast: whole.contrast,
    saturation: whole.saturation,
    temperature: clamp((whole.r - whole.b) / 100, -1, 1),
    topBrightness: top.brightness,
    bottomBrightness: bottom.brightness,
    dominant: hex(whole.r, whole.g, whole.b),
  };
}
