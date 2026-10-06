import { editWithFallback, generativeEditsEnabled, openAIVision } from "./openai";
import { localImageProvider } from "./local";
import type { Grade, Locks } from "../types";
import type { ImageProvider, StoryVision } from "./types";

export function getStoryVision(): StoryVision | null {
  if (!openAIVision.available()) return null;
  return openAIVision;
}

export function providerKind(locks: Locks): "local" | "generative" {
  return generativeEditsEnabled(locks) ? "generative" : "local";
}

export function getImageProvider(locks: Locks): ImageProvider {
  if (providerKind(locks) !== "generative") return localImageProvider;
  return {
    ...localImageProvider,
    id: "generative",
    editImage(input: Buffer, grade: Grade, options?: { maxEdge?: number }) {
      return editWithFallback(
        input,
        grade,
        locks,
        "Apply the story's visual language while keeping the people recognisable.",
        options?.maxEdge,
      );
    },
  };
}
