import path from "path";

export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PHOTOS = 24;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export type UploadCheck = {
  name: string;
  type: string;
  size: number;
};

export function displayName(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/"));
  return base.slice(0, 180) || "photograph";
}

export function validateUpload(file: UploadCheck): string | null {
  const raw = file.name.trim();
  if (!raw) return "A file arrived without a name.";
  if (raw.includes("..") || raw.includes("/") || raw.includes("\\") || raw.includes("\0")) {
    return `"${displayName(raw)}" has an unsafe file name.`;
  }
  const safe = displayName(raw);
  const ext = path.extname(safe).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return `${safe} is not a JPEG, PNG, or WebP photograph.`;
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return `${safe} is not a JPEG, PNG, or WebP photograph.`;
  }
  if (!file.size) return `${safe} is empty.`;
  if (file.size > MAX_BYTES) return `${safe} is larger than 20MB.`;
  return null;
}

export function mimeForExtension(name: string): string {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}
