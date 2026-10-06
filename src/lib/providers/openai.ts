import sharp from "sharp";
import { ProviderError } from "../humanize";
import { parseModelJson } from "../schemas";
import type { Grade, Locks } from "../types";
import type { StoryVision } from "./types";
import { localImageProvider } from "./local";

const SYSTEM = `You are the story reader for Storyloom, a tool that treats a collection of photographs as one story.
Return a single JSON object. Do not wrap it in markdown.
Rules:
- Do not invent people, objects, places, or events that are not visible or not stated in the user's story.
- Do not claim a photograph contains text, brands, or landmarks unless you can actually see them.
- Recurring people must keep one stable name across frames. Note clothing changes as continuity, not a new person.
- Prefer the user's story when it interprets mood. Prefer the pixels when they contradict a factual claim.
- Use only the photograph ids you are given.
JSON shape:
{
  "summary": "one sentence",
  "premise": "the story in a sentence",
  "genre": "romance|thriller|memory|documentary",
  "characters": [{"name":"","approximateAge":"","visual":"","clothing":"","importance":"","distinguishing":"","confidence":0.5}],
  "locations": [{"name":"","description":"","confidence":0.5}],
  "photoRoles": [{"photoId":"","role":"","location":"","emotion":"","characterNames":[],"confidence":0.5,"notes":""}],
  "suggestedSequence": ["photoId"],
  "visualBible": {
    "summary": "",
    "photography": {"style":"","lensCharacter":"","depthOfField":""},
    "lighting": {"style":"","timeOfDay":"","atmosphere":""},
    "environment": {"atmosphere":"","weather":"","season":"","architecture":""},
    "emotion": {"tone":"","mood":""}
  }
}`;

function apiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key || null;
}

export const openAIVision: StoryVision = {
  id: "openai",
  available: () => Boolean(apiKey()),
  async read(input) {
    const key = apiKey();
    if (!key) throw new ProviderError(401);
    const content: Record<string, unknown>[] = [
      {
        type: "text",
        text: `Story the user wants:\n${input.prompt}\n\nPhotograph ids in their current order: ${input.photos.map((photo) => photo.id).join(", ")}`,
      },
    ];
    for (const photo of input.photos) {
      content.push({ type: "text", text: `Photograph id: ${photo.id} (${photo.width}×${photo.height})` });
      content.push({
        type: "image_url",
        image_url: { url: `data:${photo.mime};base64,${photo.base64}`, detail: "low" },
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(50000),
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || "gpt-4o",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Storyloom vision provider failed", response.status, detail.slice(0, 400).replace(key, "[redacted]"));
      throw new ProviderError(response.status);
    }
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = payload.choices?.[0]?.message?.content;
    if (!text) throw new ProviderError(502);
    return parseModelJson(text);
  },
};

export function generativeEditsEnabled(locks: Locks): boolean {
  return process.env.STORYLOOM_GENERATIVE_EDITS === "true" && !locks.identity && Boolean(apiKey());
}

export async function maybeGenerativeEdit(input: Buffer, grade: Grade, locks: Locks, instruction: string): Promise<Buffer | null> {
  if (!generativeEditsEnabled(locks)) return null;
  const key = apiKey();
  if (!key) return null;
  try {
    const prepared = await sharp(input).rotate().resize(1536, 1536, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    const form = new FormData();
    form.append("model", process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1");
    form.append(
      "prompt",
      `Photographic grade only. Preserve identity, face, body, clothing, and objects. Do not add people or change the place. ${instruction} Grade warmth ${grade.warmth.toFixed(2)}, brightness ${grade.brightness.toFixed(2)}, saturation ${grade.saturation.toFixed(2)}.`,
    );
    form.append("image", new Blob([new Uint8Array(prepared)]), "frame.jpg");
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      console.error("Storyloom image edit provider failed", response.status);
      return null;
    }
    const payload = (await response.json()) as { data?: { b64_json?: string; url?: string }[] };
    const first = payload.data?.[0];
    if (first?.b64_json) return Buffer.from(first.b64_json, "base64");
    if (first?.url) {
      const image = await fetch(first.url, { signal: AbortSignal.timeout(30000) });
      if (!image.ok) return null;
      return Buffer.from(await image.arrayBuffer());
    }
    return null;
  } catch (error) {
    console.error("Storyloom image edit provider failed", error instanceof Error ? error.name : "error");
    return null;
  }
}

export async function editWithFallback(input: Buffer, grade: Grade, locks: Locks, instruction: string, maxEdge?: number): Promise<Buffer> {
  const generated = await maybeGenerativeEdit(input, grade, locks, instruction);
  if (generated) return renderLimited(generated, maxEdge);
  return localImageProvider.editImage(input, grade, { maxEdge });
}

async function renderLimited(input: Buffer, maxEdge?: number): Promise<Buffer> {
  let pipeline = sharp(input).rotate();
  if (maxEdge) pipeline = pipeline.resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true });
  return pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}
