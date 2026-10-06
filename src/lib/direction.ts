import { clamp } from "./format";
import { stepIndexForPhoto } from "./plan";
import type { Grade, Project, VisualBible } from "./types";

export type Scope = number[] | "all";

export type Interpretation =
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "unclear"; message: string }
  | {
      kind: "adjust";
      label: string;
      rationale: string;
      scope: Scope;
      force: boolean;
      harmonize: boolean;
      afterDelta?: Partial<Grade>;
      patch: (bible: VisualBible, project: Project, scope: Scope) => VisualBible;
    };

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

export function parseScope(text: string, count: number): Scope | null {
  const lower = text.toLowerCase();
  const indexes = new Set<number>();
  const numbered = /\b(?:photographs|photograph|photos|photo|images|image|frames|frame|pictures|picture)\s+(\d+)\b/g;
  let match: RegExpExecArray | null;
  while ((match = numbered.exec(lower))) {
    const n = Number(match[1]);
    if (n >= 1 && n <= count) indexes.add(n - 1);
  }
  const pair = lower.match(/\b(\d+)\s+and\s+(\d+)\b/);
  if (pair) {
    for (const raw of [pair[1], pair[2]]) {
      const n = Number(raw);
      if (n >= 1 && n <= count) indexes.add(n - 1);
    }
  }
  ORDINALS.forEach((word, index) => {
    if (index < count && new RegExp(`\\b${word}\\b`).test(lower)) indexes.add(index);
  });
  if (/\b(last|final)\b/.test(lower) && count > 0) indexes.add(count - 1);
  if (indexes.size > 0) return [...indexes].sort((a, b) => a - b);
  if (/\b(all|every|whole|entire|sequence)\b/.test(lower)) return "all";
  if (/\b(photographs|images|frames|pictures)\b/.test(lower)) return "all";
  if (/\bending\b/.test(lower) && count > 0) {
    return count >= 4 ? [count - 2, count - 1] : [count - 1];
  }
  if (/\bopening\b/.test(lower) && count > 0) return [0];
  return null;
}

function scopeOr(text: string, count: number, fallback: Scope): Scope {
  return parseScope(text, count) ?? fallback;
}

function nudge(bible: VisualBible, project: Project, scope: Scope, delta: Partial<{ emotion: string; temperature: number; saturation: number; brightness: number; contrast: number; label: string }>): VisualBible {
  const count = Math.max(project.sequence.length, 1);
  const steps = bible.emotion.progression.map((step, stepIndex) => {
    const applies =
      scope === "all" ||
      scope.some((photoIndex) => stepIndexForPhoto(photoIndex, count, bible.emotion.progression.length) === stepIndex);
    if (!applies) return step;
    return {
      ...step,
      label: delta.label ?? step.label,
      emotion: delta.emotion ?? step.emotion,
      temperature: clamp(step.temperature + (delta.temperature ?? 0), -1, 1),
      saturation: clamp(step.saturation + (delta.saturation ?? 0), 0, 1),
      brightness: clamp(step.brightness + (delta.brightness ?? 0), 0.05, 0.95),
      contrast: clamp(step.contrast + (delta.contrast ?? 0), 0.5, 1.6),
    };
  });
  return { ...bible, emotion: { ...bible.emotion, progression: steps } };
}

function placesIn(text: string, project: Project): number[] {
  const lower = text.toLowerCase();
  const indexes: number[] = [];
  project.sequence.forEach((id, index) => {
    const role = project.story?.photoRoles.find((item) => item.photoId === id);
    if (!role) return;
    const location = role.location.toLowerCase();
    if (!location || location === "unspecified") return;
    if (lower.includes(location)) indexes.push(index);
    if (location === "café" && /\bcafe\b/.test(lower)) indexes.push(index);
  });
  return [...new Set(indexes)];
}

export function interpret(instruction: string, project: Project): Interpretation {
  const text = instruction.trim();
  const lower = text.toLowerCase();
  if (!text) {
    return {
      kind: "unclear",
      message: "Write what you want changed. You can name a feeling, a photograph, or the whole sequence.",
    };
  }
  if (/^\s*undo\b|\bundo the last\b/.test(lower)) return { kind: "undo" };
  if (/^\s*redo\b|\bredo the last\b/.test(lower)) return { kind: "redo" };
  if (!project.bible || !project.story) {
    return { kind: "unclear", message: "Read the story before directing it." };
  }

  const count = project.sequence.length;
  if (!count) return { kind: "unclear", message: "Add photographs before directing the story." };

  const film = /35\s?mm|\bfilm\b|filmic/.test(lower);
  const warmer = /warmer|warmth|golden/.test(lower);
  const cooler = /cooler|colder|bluer|cooler light/.test(lower);
  const sad = /sadder|sad\b|melanchol|lonely|lonel/.test(lower);
  const happy = /happier|happy|joyful|brighter mood/.test(lower);
  const morning = /early morning|morning/.test(lower);
  const intimate = /intimate|closer|tender/.test(lower);
  const cinematic = /cinematic/.test(lower);
  const endOfFilm = /end of a film|like an ending|final image/.test(lower);
  const connect = /connected|belong|same city|harmon/.test(lower);

  if (connect) {
    const mentioned = placesIn(lower, project);
    const parsed = parseScope(lower, count);
    const scope = parsed && parsed !== "all" ? parsed : mentioned.length >= 2 ? mentioned : "all";
    const vague = scope === "all";
    return {
      kind: "adjust",
      label: "Bring frames together",
      rationale: vague
        ? "The named places were not separated in the reading, so Storyloom draws the whole sequence toward one light."
        : "These frames are pulled toward the same light and colour so they feel like one place. Nothing new is added to them.",
      scope,
      force: true,
      harmonize: true,
      patch: (bible) => bible,
    };
  }

  if (film) {
    return {
      kind: "adjust",
      label: "35mm film",
      rationale: "The sequence takes on 35mm grain, a little fade, and softer sharpness. Faces and places stay as photographed.",
      scope: scopeOr(lower, count, "all"),
      force: true,
      harmonize: false,
      afterDelta: { fade: 0.06, vignette: 0.08 },
      patch: (bible) => ({
        ...bible,
        summary: "35mm film. Grain and a slight fade hold the sequence together while the emotional arc still moves.",
        photography: { ...bible.photography, style: "35mm film photography" },
        texture: { grain: 0.52, imperfections: 0.5, sharpness: 0.4 },
        colour: { ...bible.colour, saturation: clamp(bible.colour.saturation - 0.08, 0, 1) },
      }),
    };
  }

  if (morning) {
    const scope = scopeOr(lower, count, [0]);
    return {
      kind: "adjust",
      label: "Early morning",
      rationale: "The chosen frame is cooler and a little more open, like early morning. The rest of the sequence is left as it was.",
      scope,
      force: true,
      harmonize: false,
      afterDelta: { warmth: -0.16, brightness: 0.06, saturation: -0.04 },
      patch: (bible, current, chosen) =>
        nudge(bible, current, chosen, {
          label: "Early morning",
          emotion: "Quiet",
          temperature: -0.2,
          brightness: 0.08,
          saturation: -0.04,
        }),
    };
  }

  if (endOfFilm || (sad && /\b(ending|final|last)\b/.test(lower))) {
    const scope = scopeOr(lower, count, count >= 4 ? [count - 2, count - 1] : [count - 1]);
    return {
      kind: "adjust",
      label: endOfFilm ? "End of a film" : "A sadder ending",
      rationale: endOfFilm
        ? "The last frame falls off: darker edges, a little fade, and cooler light, like a film ending. Identity stays locked."
        : "The ending cools and loses a little colour. Earlier frames keep their place in the arc.",
      scope,
      force: true,
      harmonize: false,
      afterDelta: endOfFilm
        ? { vignette: 0.22, fade: 0.12, brightness: -0.05, warmth: -0.08 }
        : { warmth: -0.12, brightness: -0.06, saturation: -0.08, fade: 0.06 },
      patch: (bible, current, chosen) => {
        const next = nudge(bible, current, chosen, {
          emotion: "Melancholy",
          temperature: -0.16,
          brightness: -0.08,
          saturation: -0.08,
        });
        return { ...next, emotion: { ...next.emotion, mood: "The ending carries more weight than the opening." } };
      },
    };
  }

  if (sad) {
    return {
      kind: "adjust",
      label: "Sadder",
      rationale: "Colour cools and the frames sit a little lower. People stay as they are.",
      scope: scopeOr(lower, count, "all"),
      force: true,
      harmonize: false,
      afterDelta: { warmth: -0.1, saturation: -0.06, brightness: -0.04 },
      patch: (bible, current, chosen) =>
        nudge(bible, current, chosen, { emotion: "Melancholy", temperature: -0.12, saturation: -0.06, brightness: -0.05 }),
    };
  }

  if (happy) {
    const scope = scopeOr(lower, count, "all");
    return {
      kind: "adjust",
      label: "A lighter mood",
      rationale:
        "The light is warmer and more open. Identity stays locked, so this is a change of mood in the photograph, not a change to a face.",
      scope,
      force: true,
      harmonize: false,
      afterDelta: { warmth: 0.1, brightness: 0.05, saturation: 0.06 },
      patch: (bible, current, chosen) =>
        nudge(bible, current, chosen, { emotion: "Warmth", temperature: 0.1, brightness: 0.05, saturation: 0.04 }),
    };
  }

  if (intimate) {
    return {
      kind: "adjust",
      label: "More intimate",
      rationale: "A closer falloff at the edges and warmer mids. The crop and the people stay as photographed.",
      scope: scopeOr(lower, count, "all"),
      force: true,
      harmonize: false,
      afterDelta: { vignette: 0.2, warmth: 0.08, contrast: -0.05 },
      patch: (bible, current, chosen) => nudge(bible, current, chosen, { emotion: "Intimacy", temperature: 0.08 }),
    };
  }

  if (cinematic) {
    return {
      kind: "adjust",
      label: "Cinematic light",
      rationale: "Contrast, a gentle vignette, and a little grain. People and clothes stay as photographed.",
      scope: scopeOr(lower, count, "all"),
      force: true,
      harmonize: false,
      afterDelta: { contrast: 0.1, vignette: 0.18, grain: 0.1, fade: 0.05 },
      patch: (bible) => ({
        ...bible,
        photography: { ...bible.photography, style: "Cinematic naturalistic photography" },
        lighting: { ...bible.lighting, style: "Directed natural light", contrast: clamp(bible.lighting.contrast + 0.1, 0, 1) },
        texture: { ...bible.texture, grain: Math.max(bible.texture.grain, 0.18) },
      }),
    };
  }

  if (warmer || cooler) {
    const amount = warmer ? 0.22 : -0.22;
    return {
      kind: "adjust",
      label: warmer ? "Warmer" : "Cooler",
      rationale: warmer
        ? "The visual language shifts warmer. Frames that were already there move less than frames that were far from it."
        : "The visual language shifts cooler, without restaging the photographs.",
      scope: scopeOr(lower, count, "all"),
      force: true,
      harmonize: false,
      afterDelta: { warmth: amount > 0 ? 0.12 : -0.12 },
      patch: (bible, current, chosen) => {
        const next = nudge(bible, current, chosen, { temperature: amount > 0 ? 0.12 : -0.14 });
        const bias = chosen === "all" ? clamp(next.colour.temperature + amount, -1, 1) : next.colour.temperature;
        return {
          ...next,
          colour: { ...next.colour, temperature: bias },
        };
      },
    };
  }

  return {
    kind: "unclear",
    message:
      "Storyloom couldn’t tell which part of the story that changes. Try a feeling, a photograph number, or the whole sequence.",
  };
}
