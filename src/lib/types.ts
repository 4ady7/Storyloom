export type ImageStats = {
  width: number;
  height: number;
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  topBrightness: number;
  bottomBrightness: number;
  dominant: string;
};

export type Character = {
  id: string;
  name: string;
  approximateAge: string;
  visual: string;
  clothing: string;
  importance: string;
  distinguishing: string;
  confidence: number;
  source: "prompt" | "vision" | "both";
};

export type Location = {
  id: string;
  name: string;
  description: string;
  confidence: number;
};

export type PhotoRole = {
  photoId: string;
  role: string;
  chapter: string;
  location: string;
  characterIds: string[];
  emotion: string;
  confidence: number;
  notes: string;
};

export type InconsistencyKind =
  | "colour"
  | "lighting"
  | "contrast"
  | "style"
  | "environment"
  | "character"
  | "time"
  | "narrative"
  | "framing";

export type Inconsistency = {
  photoId: string;
  kind: InconsistencyKind;
  detail: string;
  severity: number;
};

export type StoryRelationship = {
  fromPhotoId: string;
  toPhotoId: string;
  relation: string;
};

export type ProgressionStep = {
  label: string;
  emotion: string;
  temperature: number;
  saturation: number;
  brightness: number;
  contrast: number;
};

export type VisualBible = {
  summary: string;
  photography: {
    style: string;
    lensCharacter: string;
    depthOfField: string;
    perspective: string;
    framing: string;
    realism: number;
  };
  lighting: {
    style: string;
    direction: string;
    softness: number;
    contrast: number;
    timeOfDay: string;
    atmosphere: string;
  };
  colour: {
    dominant: string[];
    highlights: string;
    shadows: string;
    saturation: number;
    contrast: number;
    temperature: number;
  };
  texture: {
    grain: number;
    sharpness: number;
    imperfections: number;
  };
  environment: {
    atmosphere: string;
    weather: string;
    season: string;
    architecture: string;
  };
  emotion: {
    tone: string;
    mood: string;
    progression: ProgressionStep[];
  };
  continuity: string[];
};

export type StoryModel = {
  summary: string;
  premise: string;
  genre: string;
  acts: { title: string; description: string; emotion: string }[];
  emotionalProgression: string[];
  visualProgression: string[];
  characters: Character[];
  locations: Location[];
  photoRoles: PhotoRole[];
  relationships: StoryRelationship[];
  inconsistencies: Inconsistency[];
  suggestedSequence: string[];
  chronologyNote: string;
  confidence: number;
  source: "local" | "vision" | "mixed";
  readingNote: string;
};

export type Grade = {
  brightness: number;
  saturation: number;
  warmth: number;
  contrast: number;
  grain: number;
  vignette: number;
  fade: number;
  sharpen: number;
};

export type FrameTouch = {
  preserved: boolean;
  summary: string;
};

export type Version = {
  id: string;
  label: string;
  kind: "original" | "treatment" | "edit" | "restory";
  createdAt: string;
  note: string;
  grades: Record<string, Grade>;
  touched: Record<string, FrameTouch>;
};

export type Locks = {
  identity: boolean;
  clothing: boolean;
  environment: boolean;
  lighting: boolean;
};

export type Photograph = {
  id: string;
  originalName: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
  stats: ImageStats | null;
};

export type Snapshot = {
  id: string;
  label: string;
  at: string;
  prompt: string;
  story: StoryModel | null;
  bible: VisualBible | null;
  sequence: string[];
  userSequence: string[];
  sequenceSource: "user" | "suggested";
  activeVersionId: string;
  locks: Locks;
  versions: Version[];
  readingCurrent: boolean;
  lastDirection: string;
};

export type Project = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  prompt: string;
  photos: Photograph[];
  sequence: string[];
  userSequence: string[];
  sequenceSource: "user" | "suggested";
  story: StoryModel | null;
  bible: VisualBible | null;
  locks: Locks;
  versions: Version[];
  activeVersionId: string;
  history: Snapshot[];
  historyIndex: number;
  status: "idle" | "analysing" | "applying";
  statusMessage: string;
  interrupted: boolean;
  lastDirection: string;
  readingCurrent: boolean;
};

export type ProjectSummary = {
  id: string;
  title: string;
  updatedAt: string;
  photoCount: number;
  coverPhotoId: string | null;
  summary: string;
};

export const DEFAULT_LOCKS: Locks = {
  identity: true,
  clothing: true,
  environment: false,
  lighting: false,
};

export const NEUTRAL_GRADE: Grade = {
  brightness: 1,
  saturation: 1,
  warmth: 0,
  contrast: 1,
  grain: 0,
  vignette: 0,
  fade: 0,
  sharpen: 0,
};
