import { createHash } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { interpret } from "@/lib/direction";
import { renderGrade } from "@/lib/grade";
import { undoProject } from "@/lib/history";
import { planTreatment } from "@/lib/plan";
import { analyseProject, directProject, restoryProject, weaveProject } from "@/lib/pipeline";
import { providerKind } from "@/lib/providers";
import { mergeVisionStory, StorySchema, VisualBibleSchema } from "@/lib/schemas";
import { buildStory } from "@/lib/story-engine";
import { addPhoto, createProject, readOriginal } from "@/lib/store";
import { DEFAULT_LOCKS, type ImageStats, type Photograph } from "@/lib/types";
import { validateUpload } from "@/lib/validate";

const root = path.join(os.tmpdir(), `storyloom-${Date.now()}`);

beforeEach(async () => {
  process.env.STORYLOOM_DATA_DIR = root;
  process.env.OPENAI_API_KEY = "";
  process.env.STORYLOOM_GENERATIVE_EDITS = "false";
  await fs.rm(root, { recursive: true, force: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function stats(partial: Partial<ImageStats>): ImageStats {
  return {
    width: 800,
    height: 600,
    brightness: 0.5,
    contrast: 0.4,
    saturation: 0.35,
    temperature: 0.05,
    topBrightness: 0.5,
    bottomBrightness: 0.5,
    dominant: "#888888",
    ...partial,
  };
}

function photo(id: string, partial: Partial<ImageStats>): Photograph {
  return {
    id,
    originalName: `${id}.jpg`,
    mime: "image/jpeg",
    width: 800,
    height: 600,
    bytes: 1000,
    createdAt: new Date().toISOString(),
    stats: stats(partial),
  };
}

async function jpeg(color: { r: number; g: number; b: number }, width = 96, height = 72) {
  return sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer();
}

function hash(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

describe("story understanding", () => {
  const photos = [
    photo("a", { brightness: 0.82, temperature: -0.2, dominant: "#d9e2ea" }),
    photo("b", { brightness: 0.7, temperature: 0.05, dominant: "#e6d7c4" }),
    photo("c", { brightness: 0.55, temperature: 0.2, dominant: "#c9844a" }),
    photo("d", { brightness: 0.38, temperature: 0.28, dominant: "#a85a32" }),
    photo("e", { brightness: 0.18, temperature: -0.25, dominant: "#31465c" }),
  ];
  const order = photos.map((item) => item.id);

  it("keeps the user's order while offering a day-to-night suggestion", () => {
    const told = [photos[4], photos[1], photos[0], photos[3], photos[2]];
    const toldOrder = told.map((item) => item.id);
    const romance = buildStory(
      "Two strangers meet in London, spend the afternoon together, and say goodbye at a train station.",
      told,
      toldOrder,
    );
    expect(romance.story.genre).toBe("romance");
    expect(romance.story.suggestedSequence).not.toEqual(toldOrder);
    expect(romance.story.photoRoles.map((role) => role.photoId)).toEqual(toldOrder);
    expect(StorySchema.safeParse(romance.story).success).toBe(true);
    expect(VisualBibleSchema.safeParse(romance.bible).success).toBe(true);
    expect(romance.story.characters.length).toBeGreaterThanOrEqual(2);
    expect(romance.story.locations.map((location) => location.name)).toEqual(["London", "Train station"]);
    expect(romance.story.photoRoles[0].location).toBe("London");
    expect(romance.story.photoRoles.at(-1)?.location).toBe("Train station");
  });

  it("reads a thriller differently from a romance", () => {
    const romance = buildStory("Two strangers fall in love over one afternoon.", photos, order);
    const thriller = buildStory("Two spies realise they have been following each other.", photos, order);
    expect(thriller.story.genre).toBe("thriller");
    expect(thriller.bible.emotion.tone).not.toBe(romance.bible.emotion.tone);
    const romanceEnd = romance.bible.emotion.progression.at(-1)!;
    const thrillerEnd = thriller.bible.emotion.progression.at(-1)!;
    expect(thrillerEnd.temperature).toBeLessThan(romanceEnd.temperature);
    expect(thriller.bible.texture.grain).toBeGreaterThan(romance.bible.texture.grain);
    const romancePlan = planTreatment(photos, order, romance.bible, DEFAULT_LOCKS);
    const thrillerPlan = planTreatment(photos, order, thriller.bible, DEFAULT_LOCKS, { forceAll: true });
    expect(thrillerPlan.e.grade.warmth).not.toBe(romancePlan.e.grade.warmth);
    expect(thrillerPlan.a.grade.grain).toBeGreaterThan(0);
  });

  it("falls back when the vision payload is malformed", () => {
    const local = buildStory("A quiet documentary of a street.", photos, order);
    const broken = mergeVisionStory(local.story, "not json", local.bible);
    expect(broken.story.summary).toBe(local.story.summary);
    const partial = mergeVisionStory(local.story, { summary: "A careful look at one street.", photoRoles: [{ photoId: "missing" }] }, local.bible);
    expect(partial.story.summary).toBe("A careful look at one street.");
    expect(partial.story.photoRoles).toHaveLength(local.story.photoRoles.length);
    expect(partial.story.suggestedSequence).toEqual(local.story.suggestedSequence);
  });
});

describe("directions", () => {
  const photos = [photo("a", {}), photo("b", {}), photo("c", {}), photo("d", {})];
  const built = buildStory("Two strangers say goodbye.", photos, photos.map((item) => item.id));
  const project = {
    photos,
    sequence: photos.map((item) => item.id),
    story: built.story,
    bible: built.bible,
  } as Parameters<typeof interpret>[1];

  it("understands scope, film, and undo", () => {
    expect(interpret("Undo the last change.", project).kind).toBe("undo");
    const film = interpret("Make the whole sequence feel like 35mm film.", project);
    expect(film.kind).toBe("adjust");
    if (film.kind === "adjust") expect(film.scope).toBe("all");
    const morning = interpret("Make the first photograph feel like early morning.", project);
    expect(morning.kind).toBe("adjust");
    if (morning.kind === "adjust") expect(morning.scope).toEqual([0]);
    const ending = interpret("Make the ending sadder.", project);
    expect(ending.kind).toBe("adjust");
    if (ending.kind === "adjust") expect(ending.scope).toEqual([2, 3]);
    const linked = interpret("Make photograph 2 feel more connected to photograph 3.", project);
    expect(linked.kind).toBe("adjust");
    if (linked.kind === "adjust") {
      expect(linked.harmonize).toBe(true);
      expect(linked.scope).toEqual([1, 2]);
    }
    expect(interpret("please do the thing", project).kind).toBe("unclear");
  });
});

describe("uploads", () => {
  it("rejects unsafe and unsupported files without discarding the reason", () => {
    expect(validateUpload({ name: "../secret.jpg", type: "image/jpeg", size: 100 })).toMatch(/unsafe/i);
    expect(validateUpload({ name: "notes.svg", type: "image/svg+xml", size: 100 })).toMatch(/JPEG/);
    expect(validateUpload({ name: "huge.jpg", type: "image/jpeg", size: 21 * 1024 * 1024 })).toMatch(/20MB/);
    expect(validateUpload({ name: "frame.png", type: "image/png", size: 1200 })).toBeNull();
  });
});

describe("grades and projects", () => {
  it("warms a cool photograph without rewriting the input bytes", async () => {
    const input = await jpeg({ r: 80, g: 110, b: 170 });
    const copy = Buffer.from(input);
    const graded = await renderGrade(input, {
      brightness: 1,
      saturation: 1.05,
      warmth: 0.55,
      contrast: 1,
      grain: 0,
      vignette: 0,
      fade: 0,
      sharpen: 0,
    }, 200);
    expect(input.equals(copy)).toBe(true);
    const before = await sharp(input).raw().toBuffer();
    const after = await sharp(graded).raw().toBuffer();
    const mean = (buffer: Buffer, channel: number) => {
      let total = 0;
      let count = 0;
      for (let index = channel; index < buffer.length; index += 3) {
        total += buffer[index];
        count += 1;
      }
      return total / count;
    };
    expect(mean(after, 0) - mean(after, 2)).toBeGreaterThan(mean(before, 0) - mean(before, 2) + 8);
  });

  it("preserves originals through a romance, a thriller re-story, and undo", async () => {
    const project = await createProject("Afternoon");
    const colors = [
      { r: 214, g: 224, b: 232 },
      { r: 232, g: 210, b: 186 },
      { r: 196, g: 122, b: 64 },
      { r: 150, g: 72, b: 48 },
      { r: 42, g: 58, b: 84 },
    ];
    for (let index = 0; index < colors.length; index += 1) {
      await addPhoto(project, { name: `frame-${index + 1}.jpg`, type: "image/jpeg", bytes: await jpeg(colors[index]) });
    }
    const originals = await Promise.all(project.photos.map(async (photo) => hash(await readOriginal(project.id, photo.id))));
    const romancePrompt = "Two strangers meet in London, spend an unexpected afternoon together, and say goodbye at a train station as evening falls.";
    const read = await analyseProject(project, romancePrompt, () => undefined);
    expect(read.story?.genre).toBe("romance");
    expect(read.sequence).toEqual(project.sequence);
    expect(read.bible?.emotion.progression.length).toBeGreaterThan(2);
    const woven = await weaveProject(read, () => undefined);
    const afterWeave = await Promise.all(woven.photos.map(async (photo) => hash(await readOriginal(woven.id, photo.id))));
    expect(afterWeave).toEqual(originals);
    expect(woven.activeVersionId).not.toBe("original");
    const thriller = await restoryProject(
      woven,
      "Two spies realise they have been following each other. The last frame should feel dangerous.",
      () => undefined,
    );
    expect(thriller.story?.genre).toBe("thriller");
    expect(thriller.sequence).toEqual(project.sequence);
    expect(thriller.bible?.emotion.tone).not.toBe(woven.bible?.emotion.tone);
    const undone = undoProject(thriller);
    expect(undone?.story?.genre).toBe("romance");
    expect(undone?.activeVersionId).toBe(woven.activeVersionId);
    const still = await Promise.all((undone?.photos ?? []).map(async (photo) => hash(await readOriginal(thriller.id, photo.id))));
    expect(still).toEqual(originals);
    const directed = await directProject(undone ?? thriller, "Make the photographs warmer.", () => undefined);
    expect(directed.bible?.colour.temperature).toBeGreaterThan(undone?.bible?.colour.temperature ?? 0);
    const failed = interpret("not a direction", directed);
    expect(failed.kind).toBe("unclear");
    expect(providerKind(directed.locks)).toBe("local");
  });
});
