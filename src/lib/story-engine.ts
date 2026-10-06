import { clamp } from "./format";
import { createId } from "./ids";
import type {
  Character,
  ImageStats,
  Inconsistency,
  Location,
  Photograph,
  PhotoRole,
  ProgressionStep,
  StoryModel,
  StoryRelationship,
  VisualBible,
} from "./types";

export type GenreId = "thriller" | "romance" | "memory" | "documentary";

type ArcPoint = {
  label: string;
  emotion: string;
  temperature: number;
  saturation: number;
  brightness: number;
  contrast: number;
};

const ARCS: Record<GenreId, ArcPoint[]> = {
  romance: [
    { label: "Morning", emotion: "Curiosity", temperature: -0.22, saturation: -0.02, brightness: 0.08, contrast: 0.94 },
    { label: "Late morning", emotion: "Ease", temperature: -0.06, saturation: 0.02, brightness: 0.04, contrast: 0.97 },
    { label: "Afternoon", emotion: "Warmth", temperature: 0.18, saturation: 0.08, brightness: 0, contrast: 1 },
    { label: "Golden hour", emotion: "Uncertainty", temperature: 0.34, saturation: 0.05, brightness: -0.02, contrast: 1.04 },
    { label: "Blue hour", emotion: "Melancholy", temperature: -0.12, saturation: -0.12, brightness: -0.12, contrast: 1.02 },
  ],
  thriller: [
    { label: "Flat daylight", emotion: "Unease", temperature: -0.08, saturation: -0.08, brightness: 0.02, contrast: 1.08 },
    { label: "Overcast", emotion: "Suspicion", temperature: -0.16, saturation: -0.12, brightness: -0.02, contrast: 1.12 },
    { label: "Hard light", emotion: "Recognition", temperature: -0.1, saturation: -0.1, brightness: 0, contrast: 1.2 },
    { label: "Dusk", emotion: "Tension", temperature: -0.28, saturation: -0.16, brightness: -0.1, contrast: 1.18 },
    { label: "Night", emotion: "Dread", temperature: -0.4, saturation: -0.22, brightness: -0.18, contrast: 1.22 },
  ],
  memory: [
    { label: "Open shade", emotion: "Tenderness", temperature: 0.02, saturation: -0.04, brightness: 0.04, contrast: 0.9 },
    { label: "Daylight", emotion: "Ease", temperature: 0.08, saturation: 0.02, brightness: 0.06, contrast: 0.94 },
    { label: "Warm afternoon", emotion: "Joy", temperature: 0.2, saturation: 0.06, brightness: 0.02, contrast: 0.98 },
    { label: "Late light", emotion: "Nostalgia", temperature: 0.16, saturation: -0.02, brightness: -0.04, contrast: 0.96 },
    { label: "Evening", emotion: "Longing", temperature: -0.02, saturation: -0.1, brightness: -0.1, contrast: 0.95 },
  ],
  documentary: [
    { label: "Available light", emotion: "Attention", temperature: 0, saturation: 0, brightness: 0.02, contrast: 1 },
    { label: "Same hour", emotion: "Observation", temperature: 0.02, saturation: -0.02, brightness: 0, contrast: 1.02 },
    { label: "A shift", emotion: "Involvement", temperature: 0.06, saturation: 0, brightness: -0.02, contrast: 1.04 },
    { label: "Later", emotion: "Weight", temperature: 0.02, saturation: -0.04, brightness: -0.06, contrast: 1.06 },
    { label: "Last light", emotion: "Reflection", temperature: -0.06, saturation: -0.06, brightness: -0.08, contrast: 1.05 },
  ],
};

const ROLE_TITLES: Record<GenreId, string[]> = {
  romance: ["The meeting", "First look", "The walk", "The café", "The conversation", "A pause", "The goodbye"],
  thriller: ["The tail", "A glance", "The street", "Recognition", "The turn", "The wait", "The break"],
  memory: ["Setting out", "The day", "Together", "A quiet hour", "Looking back", "Last light", "Kept"],
  documentary: ["Opening", "The place", "A detail", "The middle", "A turn", "Later", "Closing"],
};

const ACTS: Record<GenreId, StoryModel["acts"]> = {
  romance: [
    {
      title: "The meeting",
      description: "The sequence opens on unfamiliar ground. Attention is still cautious.",
      emotion: "Curiosity",
    },
    {
      title: "The connection",
      description: "The frames move closer. The place starts to feel shared.",
      emotion: "Warmth",
    },
    {
      title: "The parting",
      description: "The light changes and the sequence loosens. Something is ending.",
      emotion: "Melancholy",
    },
  ],
  thriller: [
    {
      title: "The tail",
      description: "Ordinary streets, watched a little too carefully.",
      emotion: "Unease",
    },
    {
      title: "The recognition",
      description: "The same movement appears twice. Coincidence starts to fail.",
      emotion: "Suspicion",
    },
    {
      title: "The break",
      description: "The last frames drop the pretence. The afternoon is no longer neutral.",
      emotion: "Dread",
    },
  ],
  memory: [
    {
      title: "Setting out",
      description: "The day is still ahead of the person remembering it.",
      emotion: "Tenderness",
    },
    {
      title: "The day itself",
      description: "The middle frames hold the part that felt ordinary at the time.",
      emotion: "Joy",
    },
    {
      title: "Looking back",
      description: "The light cools. The sequence knows it cannot stay.",
      emotion: "Longing",
    },
  ],
  documentary: [
    {
      title: "Arrival",
      description: "The first frames establish where we are, without insisting on a plot.",
      emotion: "Attention",
    },
    {
      title: "Observation",
      description: "The middle stays with what the photographs actually contain.",
      emotion: "Involvement",
    },
    {
      title: "Last look",
      description: "The sequence closes on a quieter frame, not a manufactured ending.",
      emotion: "Reflection",
    },
  ],
};

const PLACES: [RegExp, string][] = [
  [/\btrain stations?\b/i, "Train station"],
  [/\bstations?\b/i, "Station"],
  [/\bplatforms?\b/i, "Platform"],
  [/\bcaf[eé]s?\b/i, "Café"],
  [/\bcoffee shops?\b/i, "Café"],
  [/\blondon\b/i, "London"],
  [/\bparis\b/i, "Paris"],
  [/\bnew york\b/i, "New York"],
  [/\bbeaches?\b/i, "Beach"],
  [/\bstreets?\b/i, "Street"],
  [/\bparks?\b/i, "Park"],
  [/\bbridges?\b/i, "Bridge"],
  [/\brivers?\b/i, "River"],
  [/\bapartments?\b/i, "Apartment"],
  [/\bhotels?\b/i, "Hotel"],
  [/\bkitchens?\b/i, "Kitchen"],
  [/\brestaurants?\b/i, "Restaurant"],
  [/\bairports?\b/i, "Airport"],
  [/\bcit(?:y|ies)\b/i, "City"],
  [/\bhome\b/i, "Home"],
  [/\bsea\b|\bocean\b/i, "Sea"],
  [/\bforests?\b|\bwoods\b/i, "Forest"],
  [/\bmountains?\b/i, "Mountain"],
];

export function detectGenre(prompt: string): GenreId {
  const text = prompt.toLowerCase();
  if (
    /\b(spy|spies|thriller|suspect|danger|chase|betray|weapon|assassin|surveillance)\b/.test(text) ||
    /following each other|been followed|being followed/.test(text)
  ) {
    return "thriller";
  }
  if (/\b(love|romantic|stranger|strangers|goodbye|kiss|intimate|affair|date)\b/.test(text)) {
    return "romance";
  }
  if (/\b(memory|remember|holiday|vacation|childhood|wedding|birthday|nostalg)/.test(text)) {
    return "memory";
  }
  if (/\b(documentary|photo essay|essay)\b/.test(text)) return "documentary";
  return "documentary";
}

export function averageStats(stats: ImageStats[]): ImageStats {
  if (!stats.length) {
    return {
      width: 0,
      height: 0,
      brightness: 0.5,
      contrast: 0.45,
      saturation: 0.35,
      temperature: 0,
      topBrightness: 0.5,
      bottomBrightness: 0.5,
      dominant: "#8a8175",
    };
  }
  const mean = (pick: (item: ImageStats) => number) =>
    stats.reduce((sum, item) => sum + pick(item), 0) / stats.length;
  return {
    width: stats[0].width,
    height: stats[0].height,
    brightness: mean((item) => item.brightness),
    contrast: mean((item) => item.contrast),
    saturation: mean((item) => item.saturation),
    temperature: mean((item) => item.temperature),
    topBrightness: mean((item) => item.topBrightness),
    bottomBrightness: mean((item) => item.bottomBrightness),
    dominant: stats[0].dominant,
  };
}

function charactersFromPrompt(prompt: string): Character[] {
  const text = prompt.toLowerCase();
  const mentionsPeople =
    /\b(people|person|strangers|stranger|man|woman|men|women|boy|girl|child|children|friend|friends|spy|spies|lover|lovers|couple|family|mother|father|husband|wife)\b/.test(
      text,
    );
  if (!mentionsPeople) return [];

  const spy = /\b(spy|spies|agent)\b/.test(text);
  const couple = /man and (a )?woman|woman and (a )?man|\bcouple\b|\blovers\b/.test(text);
  const strangers = /\bstrangers?\b/.test(text);
  let count = 0;
  const word = text.match(/\b(two|three|four|five|2|3|4|5)\b/);
  const map: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, "2": 2, "3": 3, "4": 4, "5": 5 };
  if (word && map[word[1]]) count = map[word[1]];
  if (couple || strangers) count = Math.max(count, 2);
  if (!count) count = 1;
  count = Math.min(count, 4);

  const role = spy ? "Operative" : strangers ? "Stranger" : couple ? "Companion" : "Person";
  return Array.from({ length: count }, (_, index) => ({
    id: createId(),
    name: count === 1 ? role : `${role} ${index + 1}`,
    approximateAge: "Not read from the photograph",
    visual: "Described in the story, not identified as a face in the files.",
    clothing: "Not identified.",
    importance: index === 0 ? "Central to the story you described." : "Part of the story you described.",
    distinguishing: "No facial reference is stored while the faces are unread.",
    confidence: 0.34,
    source: "prompt",
  }));
}

function locationsFromPrompt(prompt: string): Location[] {
  const hits: { index: number; length: number; name: string }[] = [];
  for (const [pattern, name] of PLACES) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const expression = new RegExp(pattern.source, flags);
    for (const match of prompt.matchAll(expression)) {
      if (match.index === undefined) continue;
      hits.push({ index: match.index, length: match[0].length, name });
    }
  }
  hits.sort((a, b) => a.index - b.index || b.length - a.length);
  const accepted: { index: number; length: number; name: string }[] = [];
  for (const hit of hits) {
    const overlaps = accepted.some(
      (item) => hit.index < item.index + item.length && item.index < hit.index + hit.length,
    );
    if (overlaps || accepted.some((item) => item.name === hit.name)) continue;
    accepted.push(hit);
  }
  return accepted.slice(0, 6).map((hit) => ({
    id: createId(),
    name: hit.name,
    description: "Named in the story you wrote.",
    confidence: 0.62,
  }));
}

function pickPhrase(prompt: string, pairs: [RegExp, string][], fallback: string): string {
  for (const [pattern, name] of pairs) {
    if (pattern.test(prompt)) return name;
  }
  return fallback;
}

function locationForIndex(locations: Location[], index: number, count: number): string {
  if (!locations.length) return "Unspecified";
  if (locations.length === 1 || count <= 1) return locations[0].name;
  const span = Math.max(1, Math.ceil(count / locations.length));
  let slot = Math.min(locations.length - 1, Math.floor(index / span));
  if (index === count - 1) slot = locations.length - 1;
  return locations[slot].name;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function framingOf(stats: ImageStats): "portrait" | "landscape" | "square" {
  const aspect = stats.width / Math.max(1, stats.height);
  if (aspect < 0.9) return "portrait";
  if (aspect > 1.15) return "landscape";
  return "square";
}

function inconsistenciesFor(photos: Photograph[]): Inconsistency[] {
  const withStats = photos.filter((photo) => photo.stats);
  if (withStats.length < 2) return [];
  const temp = median(withStats.map((photo) => photo.stats!.temperature));
  const bright = median(withStats.map((photo) => photo.stats!.brightness));
  const contrast = median(withStats.map((photo) => photo.stats!.contrast));
  const frames = withStats.map((photo) => framingOf(photo.stats!));
  const majority = frames.sort().reduce(
    (best, frame) => {
      const count = frames.filter((item) => item === frame).length;
      return count > best.count ? { frame, count } : best;
    },
    { frame: frames[0], count: 0 },
  );

  const found: Inconsistency[] = [];
  for (const photo of withStats) {
    const stats = photo.stats!;
    const tempGap = Math.abs(stats.temperature - temp);
    const lightGap = Math.abs(stats.brightness - bright);
    const contrastGap = Math.abs(stats.contrast - contrast);
    if (tempGap > 0.18) {
      found.push({
        photoId: photo.id,
        kind: "colour",
        detail:
          stats.temperature > temp
            ? "This frame is warmer than the rest of the collection."
            : "This frame is cooler than the rest of the collection.",
        severity: clamp(tempGap, 0, 1),
      });
    }
    if (lightGap > 0.16) {
      found.push({
        photoId: photo.id,
        kind: "lighting",
        detail:
          stats.brightness > bright
            ? "This frame is noticeably brighter than the others."
            : "This frame is noticeably darker than the others.",
        severity: clamp(lightGap, 0, 1),
      });
    }
    if (contrastGap > 0.16) {
      found.push({
        photoId: photo.id,
        kind: "contrast",
        detail: "The contrast in this frame sits apart from the collection.",
        severity: clamp(contrastGap, 0, 1),
      });
    }
    const frame = framingOf(stats);
    if (majority.count >= Math.ceil(withStats.length * 0.6) && frame !== majority.frame) {
      found.push({
        photoId: photo.id,
        kind: "framing",
        detail: `The framing shifts to a ${frame} photograph among mostly ${majority.frame} frames.`,
        severity: 0.4,
      });
    }
  }
  return found;
}

function suggestOrder(photos: Photograph[], sequence: string[], genre: GenreId) {
  const ordered = sequence
    .map((id) => photos.find((photo) => photo.id === id))
    .filter((photo): photo is Photograph => Boolean(photo));
  const brightness = ordered.map((photo) => photo.stats?.brightness ?? 0.5);
  const spread = Math.max(...brightness) - Math.min(...brightness);
  if (genre === "documentary" || spread < 0.07 || ordered.length < 2) {
    return {
      ids: [...sequence],
      note: "The exposures sit close together, so the suggested order is the order you gave.",
      confidence: 0.36,
    };
  }
  const ranked = [...ordered].sort(
    (a, b) => (b.stats?.brightness ?? 0.5) - (a.stats?.brightness ?? 0.5),
  );
  return {
    ids: ranked.map((photo) => photo.id),
    note: "Brighter frames are suggested earlier and darker frames later, as a day-to-night hypothesis. Your order stays until you accept it.",
    confidence: clamp(0.35 + spread, 0.4, 0.82),
  };
}

function genreCopy(genre: GenreId, count: number) {
  if (genre === "thriller") {
    return {
      summary: `An ordinary sequence tightening into threat across ${count} frames.`,
      tone: "Watchful",
      mood: "The day looks harmless and is not.",
      style: "Observational photography with harder contrast",
      lens: "A normal lens, kept at a slight distance.",
      depth: "Deeper focus, so the place stays legible.",
      light: "Available light, a little unforgiving",
      direction: "Side light where the frame allows it",
      atmosphere: "Clear, with the softness taken out",
      grain: 0.22,
      imperfections: 0.28,
      sharpness: 0.62,
      softness: 0.28,
    };
  }
  if (genre === "romance") {
    return {
      summary: `A meeting that warms, then thins into parting across ${count} frames.`,
      tone: "Tender",
      mood: "Curiosity giving way to warmth, then to leaving.",
      style: "Naturalistic photography with a romantic bias",
      lens: "A normal lens, close enough to feel present.",
      depth: "Moderately shallow where the frame is about a person.",
      light: "Soft daylight moving toward evening",
      direction: "Open, slightly from the side",
      atmosphere: "Clear air, warming as the day goes on",
      grain: 0.1,
      imperfections: 0.18,
      sharpness: 0.55,
      softness: 0.72,
    };
  }
  if (genre === "memory") {
    return {
      summary: `A day remembered in ${count} frames, brighter in the middle than at the edges.`,
      tone: "Nostalgic",
      mood: "Affection, then the knowledge that the day is over.",
      style: "Gentle documentary photography",
      lens: "A normal lens, unobtrusive.",
      depth: "Moderate, so places and people share the frame.",
      light: "Soft, slightly faded daylight",
      direction: "Wraparound, low contrast",
      atmosphere: "Remembered rather than staged",
      grain: 0.16,
      imperfections: 0.32,
      sharpness: 0.48,
      softness: 0.64,
    };
  }
  return {
    summary: `A straight reading of ${count} photographs, held together by available light.`,
    tone: "Observant",
    mood: "Attention without a forced plot.",
    style: "Natural documentary photography",
    lens: "A normal lens.",
    depth: "Enough depth to keep the place honest.",
    light: "The light already in the photographs",
    direction: "As found",
    atmosphere: "Unstyled weather",
    grain: 0.06,
    imperfections: 0.08,
    sharpness: 0.7,
    softness: 0.5,
  };
}

export function buildStory(prompt: string, photos: Photograph[], sequence: string[]): {
  story: StoryModel;
  bible: VisualBible;
} {
  const premise = prompt.trim().replace(/\s+/g, " ");
  const genre = detectGenre(premise);
  const ordered = sequence
    .map((id) => photos.find((photo) => photo.id === id))
    .filter((photo): photo is Photograph => Boolean(photo));
  const count = Math.max(ordered.length, 1);
  const mean = averageStats(ordered.map((photo) => photo.stats).filter((stats): stats is ImageStats => Boolean(stats)));
  const copy = genreCopy(genre, ordered.length || photos.length);
  const arc = ARCS[genre];
  const progression: ProgressionStep[] = arc.map((point) => ({
    label: point.label,
    emotion: point.emotion,
    temperature: clamp(mean.temperature + point.temperature, -1, 1),
    saturation: clamp(mean.saturation + point.saturation, 0.05, 0.95),
    brightness: clamp(mean.brightness + point.brightness, 0.08, 0.92),
    contrast: point.contrast,
  }));
  const characters = charactersFromPrompt(premise);
  const locations = locationsFromPrompt(premise);
  const acts = ACTS[genre];
  const titles = ROLE_TITLES[genre];
  const suggestion = suggestOrder(photos, sequence, genre);
  const inconsistencies = inconsistenciesFor(ordered);

  const photoRoles: PhotoRole[] = ordered.map((photo, index) => {
    const t = count <= 1 ? 0 : index / (count - 1);
    const act = acts[Math.min(acts.length - 1, index === ordered.length - 1 ? acts.length - 1 : Math.floor(t * acts.length))];
    const title = titles[Math.min(titles.length - 1, Math.round(t * (titles.length - 1)))];
    const step = progression[Math.min(progression.length - 1, Math.round(t * (progression.length - 1)))];
    return {
      photoId: photo.id,
      role: title,
      chapter: act.title,
      location: locationForIndex(locations, index, ordered.length),
      characterIds: [],
      emotion: step.emotion,
      confidence: photo.stats ? 0.48 : 0.28,
      notes: `Placed in “${act.title}” from the order of the story you described, not from a claim about what the file secretly contains.`,
    };
  });

  const relationships: StoryRelationship[] = [];
  for (let index = 0; index < photoRoles.length - 1; index += 1) {
    const current = photoRoles[index];
    const next = photoRoles[index + 1];
    relationships.push({
      fromPhotoId: current.photoId,
      toPhotoId: next.photoId,
      relation:
        current.chapter === next.chapter
          ? "Continues the same movement."
          : `Turns the story toward ${next.chapter.toLowerCase()}.`,
    });
  }

  const dominant = Array.from(new Set(ordered.map((photo) => photo.stats?.dominant).filter((value): value is string => Boolean(value)))).slice(0, 4);
  const weather = pickPhrase(
    premise,
    [
      [/\brain|storm|wet\b/i, "Rain"],
      [/\bsnow\b/i, "Snow"],
      [/\bfog|mist\b/i, "Fog"],
      [/\bsun|sunny|clear\b/i, "Clear"],
    ],
    "Not specified",
  );
  const season = pickPhrase(
    premise,
    [
      [/\bspring\b/i, "Spring"],
      [/\bsummer\b/i, "Summer"],
      [/\bautumn|fall\b/i, "Autumn"],
      [/\bwinter\b/i, "Winter"],
    ],
    "Not specified",
  );
  const timeOfDay = `${progression[0].label} → ${progression[progression.length - 1].label}`;
  const continuity = [
    "Keep people recognisable. Change light and colour, not identity.",
    "Let the sequence move. Do not make every frame the same grade.",
    "Do not invent places, objects, or events that are not in the photographs or the story.",
    characters.length
      ? `${characters.map((character) => character.name).join(" and ")} stay consistent if they recur.`
      : "If the same person recurs, keep their face and clothing stable.",
  ];

  const bible: VisualBible = {
    summary: `${copy.style}. The light runs ${timeOfDay.toLowerCase()}, and the feeling moves from ${progression[0].emotion.toLowerCase()} to ${progression[progression.length - 1].emotion.toLowerCase()}.`,
    photography: {
      style: copy.style,
      lensCharacter: copy.lens,
      depthOfField: copy.depth,
      perspective: "Eye level, as the photographs already are.",
      framing: "Keep the original crop. Do not restage the frame.",
      realism: 0.9,
    },
    lighting: {
      style: copy.light,
      direction: copy.direction,
      softness: copy.softness,
      contrast: clamp(progression.reduce((sum, step) => sum + step.contrast, 0) / progression.length / 1.3, 0, 1),
      timeOfDay,
      atmosphere: copy.atmosphere,
    },
    colour: {
      dominant: dominant.length ? dominant : ["#8d8478"],
      highlights: mean.brightness > 0.55 ? "Open highlights" : "Held highlights",
      shadows: mean.contrast > 0.55 ? "Deeper shadows" : "Open shadows",
      saturation: 0.5,
      contrast: 0.5,
      temperature: 0,
    },
    texture: {
      grain: copy.grain,
      sharpness: copy.sharpness,
      imperfections: copy.imperfections,
    },
    environment: {
      atmosphere: copy.atmosphere,
      weather,
      season,
      architecture: locations[0]?.name ?? "As photographed",
    },
    emotion: {
      tone: copy.tone,
      mood: copy.mood,
      progression,
    },
    continuity,
  };

  const story: StoryModel = {
    summary: copy.summary,
    premise,
    genre,
    acts,
    emotionalProgression: progression.map((step) => step.emotion),
    visualProgression: progression.map((step) => step.label),
    characters,
    locations,
    photoRoles,
    relationships,
    inconsistencies,
    suggestedSequence: suggestion.ids,
    chronologyNote: suggestion.note,
    confidence: premise.length > 40 ? 0.56 : 0.4,
    source: "local",
    readingNote:
      "This reading comes from your words and from the light, colour, and framing in the files. Faces are not identified unless a vision provider is connected.",
  };

  return { story, bible };
}
