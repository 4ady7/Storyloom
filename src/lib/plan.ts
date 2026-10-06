import { clamp } from "./format";
import type { Grade, Locks, Photograph, ProgressionStep, VisualBible } from "./types";
import { NEUTRAL_GRADE } from "./types";

export function gradeIsNeutral(grade: Grade): boolean {
  return (
    Math.abs(grade.brightness - 1) < 0.025 &&
    Math.abs(grade.saturation - 1) < 0.03 &&
    Math.abs(grade.warmth) < 0.03 &&
    Math.abs(grade.contrast - 1) < 0.03 &&
    grade.grain < 0.03 &&
    grade.vignette < 0.03 &&
    grade.fade < 0.03 &&
    grade.sharpen < 0.05
  );
}

export function addGrade(base: Grade, delta: Partial<Grade>): Grade {
  return {
    brightness: clamp(base.brightness + (delta.brightness ?? 0), 0.7, 1.35),
    saturation: clamp(base.saturation + (delta.saturation ?? 0), 0.4, 1.65),
    warmth: clamp(base.warmth + (delta.warmth ?? 0), -0.9, 0.9),
    contrast: clamp(base.contrast + (delta.contrast ?? 0), 0.75, 1.45),
    grain: clamp(base.grain + (delta.grain ?? 0), 0, 1),
    vignette: clamp(base.vignette + (delta.vignette ?? 0), 0, 0.85),
    fade: clamp(base.fade + (delta.fade ?? 0), 0, 0.65),
    sharpen: clamp(base.sharpen + (delta.sharpen ?? 0), 0, 1),
  };
}

function stepAt(steps: ProgressionStep[], index: number, count: number): ProgressionStep {
  if (count <= 1) return steps[Math.floor((steps.length - 1) / 2)] ?? steps[0];
  const t = index / (count - 1);
  const pos = t * (steps.length - 1);
  const start = Math.floor(pos);
  const end = Math.min(steps.length - 1, start + 1);
  const f = pos - start;
  const a = steps[start];
  const b = steps[end];
  return {
    label: f < 0.5 ? a.label : b.label,
    emotion: f < 0.5 ? a.emotion : b.emotion,
    temperature: a.temperature + (b.temperature - a.temperature) * f,
    saturation: a.saturation + (b.saturation - a.saturation) * f,
    brightness: a.brightness + (b.brightness - a.brightness) * f,
    contrast: a.contrast + (b.contrast - a.contrast) * f,
  };
}

export type FramePlan = {
  grade: Grade;
  preserved: boolean;
  summary: string;
  label: string;
};

export function planTreatment(
  photos: Photograph[],
  sequence: string[],
  bible: VisualBible,
  locks: Locks,
  options?: { forceIds?: Set<string>; forceAll?: boolean },
): Record<string, FramePlan> {
  const order = sequence.filter((id) => photos.some((photo) => photo.id === id));
  const plans: Record<string, FramePlan> = {};

  order.forEach((id, index) => {
    const photo = photos.find((item) => item.id === id);
    if (!photo) return;
    const step = stepAt(bible.emotion.progression, index, order.length);
    const stats = photo.stats;
    const force = Boolean(options?.forceAll || options?.forceIds?.has(id));
    if (!stats) {
      plans[id] = {
        grade: NEUTRAL_GRADE,
        preserved: true,
        summary: "Storyloom could not measure this frame, so it was left untouched.",
        label: step.label,
      };
      return;
    }

    const targetTemp = clamp(step.temperature + bible.colour.temperature, -1, 1);
    const targetSat = clamp(step.saturation + (bible.colour.saturation - 0.5) * 0.45, 0.05, 0.98);
    const targetBright = clamp(step.brightness + (bible.lighting.softness - 0.5) * 0.04, 0.08, 0.95);
    const targetContrast = clamp(step.contrast + (bible.colour.contrast - 0.5) * 0.25, 0.75, 1.45);

    const tempGap = Math.abs(targetTemp - stats.temperature);
    const satGap = Math.abs(targetSat - stats.saturation);
    const brightGap = Math.abs(targetBright - stats.brightness);
    const contrastGap = Math.abs(targetContrast - stats.contrast);
    const severity = Math.max(tempGap, satGap * 0.85, brightGap, contrastGap * 0.55);
    let strength = severity > 0.055 ? clamp((severity - 0.055) / 0.42, 0.22, 0.86) : 0;
    if (force) strength = Math.max(strength, 0.72);

    const env = locks.environment ? 0.35 : 1;
    const light = locks.lighting ? 0 : 1;
    const warmth = clamp((targetTemp - stats.temperature) * strength * 1.35 * env * light, -0.9, 0.9);
    const brightness = clamp(1 + (targetBright - stats.brightness) * strength * light, 0.72, 1.32);
    const saturation = clamp(1 + (targetSat - stats.saturation) * strength * 1.15, 0.45, 1.6);
    const contrast = clamp(1 + (targetContrast - 1) * strength * 0.65 * light, 0.8, 1.4);

    const textureOn = force || bible.texture.grain >= 0.14 || strength > 0.2;
    const grain = textureOn ? bible.texture.grain : 0;
    const fade = textureOn ? bible.texture.imperfections * 0.42 : 0;
    const vignette = force || strength > 0.35 ? 0.12 + (1 - bible.lighting.softness) * 0.16 : grain > 0.18 ? 0.1 : 0;
    const sharpen = bible.texture.sharpness > 0.72 ? (bible.texture.sharpness - 0.65) * 0.5 : 0;

    const grade: Grade = {
      brightness,
      saturation,
      warmth,
      contrast,
      grain,
      vignette,
      fade,
      sharpen,
    };
    const preserved = !force && gradeIsNeutral(grade);
    plans[id] = {
      grade: preserved ? NEUTRAL_GRADE : grade,
      preserved,
      label: step.label,
      summary: preserved
        ? "Already close to the visual language, so this photograph stays as shot."
        : `Light and colour move toward ${step.label.toLowerCase()}. The people and the place stay as photographed.`,
    };
  });

  return plans;
}

export function stepIndexForPhoto(photoIndex: number, photoCount: number, stepCount: number): number {
  if (stepCount <= 1 || photoCount <= 1) return 0;
  const t = photoIndex / (photoCount - 1);
  return Math.round(t * (stepCount - 1));
}
