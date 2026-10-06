import { z } from "zod";
import { clamp } from "./format";
import { createId } from "./ids";
import type { Character, StoryModel, VisualBible } from "./types";

const unit = z.number().min(0).max(1);
const signed = z.number().min(-1).max(1);

export const ProgressionStepSchema = z.object({
  label: z.string().min(1).max(80),
  emotion: z.string().min(1).max(80),
  temperature: signed,
  saturation: unit,
  brightness: unit,
  contrast: z.number().min(0.5).max(1.6),
});

export const VisualBibleSchema = z.object({
  summary: z.string().min(1).max(600),
  photography: z.object({
    style: z.string().min(1).max(180),
    lensCharacter: z.string().min(1).max(180),
    depthOfField: z.string().min(1).max(180),
    perspective: z.string().min(1).max(180),
    framing: z.string().min(1).max(180),
    realism: unit,
  }),
  lighting: z.object({
    style: z.string().min(1).max(180),
    direction: z.string().min(1).max(180),
    softness: unit,
    contrast: unit,
    timeOfDay: z.string().min(1).max(120),
    atmosphere: z.string().min(1).max(180),
  }),
  colour: z.object({
    dominant: z.array(z.string().min(4).max(20)).min(1).max(6),
    highlights: z.string().min(1).max(80),
    shadows: z.string().min(1).max(80),
    saturation: unit,
    contrast: unit,
    temperature: signed,
  }),
  texture: z.object({
    grain: unit,
    sharpness: unit,
    imperfections: unit,
  }),
  environment: z.object({
    atmosphere: z.string().min(1).max(180),
    weather: z.string().min(1).max(80),
    season: z.string().min(1).max(80),
    architecture: z.string().min(1).max(120),
  }),
  emotion: z.object({
    tone: z.string().min(1).max(80),
    mood: z.string().min(1).max(240),
    progression: z.array(ProgressionStepSchema).min(2).max(8),
  }),
  continuity: z.array(z.string().min(1).max(240)).min(1).max(8),
});

const CharacterSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  approximateAge: z.string().min(1).max(120),
  visual: z.string().min(1).max(400),
  clothing: z.string().min(1).max(240),
  importance: z.string().min(1).max(240),
  distinguishing: z.string().min(1).max(240),
  confidence: unit,
  source: z.enum(["prompt", "vision", "both"]),
});

export const StorySchema = z.object({
  summary: z.string().min(1).max(400),
  premise: z.string().min(1).max(4000),
  genre: z.string().min(1).max(40),
  acts: z.array(z.object({
    title: z.string().min(1).max(80),
    description: z.string().min(1).max(400),
    emotion: z.string().min(1).max(80),
  })).min(1).max(6),
  emotionalProgression: z.array(z.string().min(1).max(80)).min(1).max(8),
  visualProgression: z.array(z.string().min(1).max(80)).min(1).max(8),
  characters: z.array(CharacterSchema).max(8),
  locations: z.array(z.object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(240),
    confidence: unit,
  })).max(8),
  photoRoles: z.array(z.object({
    photoId: z.string().min(1).max(80),
    role: z.string().min(1).max(80),
    chapter: z.string().min(1).max(80),
    location: z.string().min(1).max(80),
    characterIds: z.array(z.string().max(80)).max(8),
    emotion: z.string().min(1).max(80),
    confidence: unit,
    notes: z.string().min(1).max(500),
  })).max(24),
  relationships: z.array(z.object({
    fromPhotoId: z.string().min(1).max(80),
    toPhotoId: z.string().min(1).max(80),
    relation: z.string().min(1).max(240),
  })).max(24),
  inconsistencies: z.array(z.object({
    photoId: z.string().min(1).max(80),
    kind: z.enum(["colour", "lighting", "contrast", "style", "environment", "character", "time", "narrative", "framing"]),
    detail: z.string().min(1).max(300),
    severity: unit,
  })).max(48),
  suggestedSequence: z.array(z.string().min(1).max(80)).max(24),
  chronologyNote: z.string().min(1).max(400),
  confidence: unit,
  source: z.enum(["local", "vision", "mixed"]),
  readingNote: z.string().min(1).max(500),
});

export const LocksSchema = z.object({
  identity: z.boolean(),
  clothing: z.boolean(),
  environment: z.boolean(),
  lighting: z.boolean(),
});

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function numberIn(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return clamp(value, min, max);
}

function isPermutation(candidate: unknown, ids: string[]): candidate is string[] {
  if (!Array.isArray(candidate) || candidate.length !== ids.length) return false;
  if (!candidate.every((item) => typeof item === "string")) return false;
  const left = [...candidate].sort();
  const right = [...ids].sort();
  return left.every((id, index) => id === right[index]);
}

export function mergeVisionStory(local: StoryModel, raw: unknown, bible: VisualBible): {
  story: StoryModel;
  bible: VisualBible;
} {
  const record = asRecord(raw);
  if (!record) return { story: local, bible };

  try {
    const summary = text(record.summary, 400);
    const charactersIn = Array.isArray(record.characters) ? record.characters : [];
    const characters: Character[] = [];
    for (const item of charactersIn) {
      const row = asRecord(item);
      if (!row) continue;
      const name = text(row.name, 80);
      const visual = text(row.visual, 400) ?? text(row.appearance, 400);
      if (!name || !visual) continue;
      characters.push({
        id: createId(),
        name,
        approximateAge: text(row.approximateAge, 120) ?? text(row.age, 120) ?? "Unspecified",
        visual,
        clothing: text(row.clothing, 240) ?? "Not clearly described.",
        importance: text(row.importance, 240) ?? "Seen in the collection.",
        distinguishing: text(row.distinguishing, 240) ?? visual,
        confidence: numberIn(row.confidence, 0, 1) ?? 0.62,
        source: "vision",
      });
      if (characters.length === 6) break;
    }

    const nameToId = new Map(characters.map((character) => [character.name.toLowerCase(), character.id]));
    const knownIds = new Set(local.photoRoles.map((role) => role.photoId));
    const visionRoles = new Map<string, { role?: string; location?: string; emotion?: string; notes?: string; names: string[]; confidence?: number }>();

    if (Array.isArray(record.photoRoles)) {
      for (const item of record.photoRoles) {
        const row = asRecord(item);
        if (!row) continue;
        const photoId = text(row.photoId, 80);
        if (!photoId || !knownIds.has(photoId)) continue;
        const names = Array.isArray(row.characterNames)
          ? row.characterNames.map((name) => text(name, 80)).filter((name): name is string => Boolean(name))
          : [];
        visionRoles.set(photoId, {
          role: text(row.role, 80) ?? undefined,
          location: text(row.location, 80) ?? undefined,
          emotion: text(row.emotion, 80) ?? undefined,
          notes: text(row.notes, 500) ?? undefined,
          names,
          confidence: numberIn(row.confidence, 0, 1) ?? undefined,
        });
      }
    }

    const locationsIn = Array.isArray(record.locations) ? record.locations : [];
    const locations = locationsIn
      .map((item) => {
        const row = asRecord(item);
        if (!row) return null;
        const name = text(row.name, 80);
        if (!name) return null;
        return {
          id: createId(),
          name,
          description: text(row.description, 240) ?? "Seen across the collection.",
          confidence: numberIn(row.confidence, 0, 1) ?? 0.6,
        };
      })
      .filter((item): item is StoryModel["locations"][number] => Boolean(item))
      .slice(0, 6);

    const photoRoles = local.photoRoles.map((role) => {
      const vision = visionRoles.get(role.photoId);
      if (!vision) return role;
      const characterIds = vision.names
        .map((name) => nameToId.get(name.toLowerCase()))
        .filter((id): id is string => Boolean(id));
      return {
        ...role,
        role: vision.role ?? role.role,
        location: vision.location ?? role.location,
        emotion: vision.emotion ?? role.emotion,
        notes: vision.notes ?? role.notes,
        characterIds: characterIds.length ? characterIds : role.characterIds,
        confidence: vision.confidence ?? Math.max(role.confidence, 0.66),
      };
    });

    const suggested = isPermutation(record.suggestedSequence, local.suggestedSequence)
      ? record.suggestedSequence
      : local.suggestedSequence;

    const nextStory: StoryModel = {
      ...local,
      summary: summary ?? local.summary,
      premise: text(record.premise, 4000) ?? local.premise,
      genre: text(record.genre, 40) ?? local.genre,
      characters: characters.length ? characters : local.characters,
      locations: locations.length ? locations : local.locations,
      photoRoles,
      suggestedSequence: suggested,
      confidence: Math.max(local.confidence, summary || characters.length ? 0.74 : local.confidence),
      source: summary || characters.length || visionRoles.size ? "mixed" : local.source,
      readingNote: "Storyloom looked at the photographs and kept the colour measurements from the files.",
    };

    const visionBible = asRecord(record.visualBible);
    let nextBible = bible;
    if (visionBible) {
      const photography = asRecord(visionBible.photography);
      const lighting = asRecord(visionBible.lighting);
      const environment = asRecord(visionBible.environment);
      const emotion = asRecord(visionBible.emotion);
      nextBible = {
        ...bible,
        summary: text(visionBible.summary, 600) ?? bible.summary,
        photography: {
          ...bible.photography,
          style: text(photography?.style, 180) ?? bible.photography.style,
          lensCharacter: text(photography?.lensCharacter, 180) ?? bible.photography.lensCharacter,
          depthOfField: text(photography?.depthOfField, 180) ?? bible.photography.depthOfField,
        },
        lighting: {
          ...bible.lighting,
          style: text(lighting?.style, 180) ?? bible.lighting.style,
          timeOfDay: text(lighting?.timeOfDay, 120) ?? bible.lighting.timeOfDay,
          atmosphere: text(lighting?.atmosphere, 180) ?? bible.lighting.atmosphere,
        },
        environment: {
          ...bible.environment,
          atmosphere: text(environment?.atmosphere, 180) ?? bible.environment.atmosphere,
          weather: text(environment?.weather, 80) ?? bible.environment.weather,
          season: text(environment?.season, 80) ?? bible.environment.season,
          architecture: text(environment?.architecture, 120) ?? bible.environment.architecture,
        },
        emotion: {
          ...bible.emotion,
          tone: text(emotion?.tone, 80) ?? bible.emotion.tone,
          mood: text(emotion?.mood, 240) ?? bible.emotion.mood,
        },
      };
    }

    const parsedStory = StorySchema.safeParse(nextStory);
    const parsedBible = VisualBibleSchema.safeParse(nextBible);
    if (!parsedStory.success || !parsedBible.success) return { story: local, bible };
    return { story: parsedStory.data, bible: parsedBible.data };
  } catch {
    return { story: local, bible };
  }
}

export function parseModelJson(textValue: string): unknown {
  const trimmed = textValue.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("storyloom: The analysis came back in an unreadable shape.");
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}
