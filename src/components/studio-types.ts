import type { Locks, Project, VisualBible } from "@/lib/types";

export type Step = "gather" | "tell" | "read" | "sequence" | "language" | "weave" | "direct" | "export";

export type StudioController = {
  project: Project;
  step: Step;
  setStep: (step: Step) => void;
  busy: boolean;
  message: string;
  error: string | null;
  clearError: () => void;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  upload: (files: File[]) => Promise<void>;
  removePhoto: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
  savePrompt: (prompt: string) => Promise<void>;
  analyse: (prompt: string) => Promise<void>;
  saveBible: (bible: VisualBible) => Promise<boolean>;
  saveLocks: (locks: Locks) => Promise<boolean>;
  acceptSequence: () => Promise<void>;
  keepOrder: () => Promise<void>;
  weave: () => Promise<void>;
  direct: (instruction: string) => Promise<void>;
  restory: (prompt: string) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  restoreVersion: (id: string) => Promise<void>;
  rename: (title: string) => Promise<void>;
  recover: () => Promise<void>;
  play: () => void;
};
