import type { Grade, ImageStats, Locks } from "../types";

export type CompositeFrame = {
  buffer: Buffer;
  caption: string;
};

export interface ImageProvider {
  id: string;
  analyseImage(input: Buffer): Promise<ImageStats>;
  editImage(input: Buffer, grade: Grade, options?: { maxEdge?: number }): Promise<Buffer>;
  generateVariation(input: Buffer, grade: Grade, options?: { maxEdge?: number }): Promise<Buffer>;
  createComposite(frames: CompositeFrame[]): Promise<Buffer>;
}

export interface StoryVision {
  id: string;
  available(): boolean;
  read(input: {
    prompt: string;
    photos: { id: string; mime: string; base64: string; width: number; height: number }[];
  }): Promise<unknown>;
}
