"use client";

import { useEffect, useState } from "react";
import { Filmstrip } from "@/components/filmstrip";
import { readNdjson } from "@/components/ndjson";
import { Slideshow } from "@/components/slideshow";
import {
  DirectStage,
  ExportStage,
  GatherStage,
  LanguageStage,
  ReadStage,
  SequenceStage,
  TellStage,
  WeaveStage,
} from "@/components/stages";
import type { Step } from "@/components/studio-types";
import type { Locks, Project, VisualBible } from "@/lib/types";

const STEPS: [Step, string][] = [
  ["gather", "Photographs"],
  ["tell", "Story"],
  ["read", "Reading"],
  ["sequence", "Sequence"],
  ["language", "Language"],
  ["weave", "Weave"],
  ["direct", "Direct"],
  ["export", "Export"],
];

async function parseError(response: Response): Promise<string> {
  const data = await response.json().catch(() => ({}));
  return typeof data.error === "string" ? data.error : "Storyloom could not finish that. Your originals are safe.";
}

export function Studio({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [missing, setMissing] = useState(false);
  const [step, setStep] = useState<Step>("gather");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [playing, setPlaying] = useState(false);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/projects/${projectId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("missing");
        return response.json() as Promise<Project>;
      })
      .then((next) => {
        if (cancel) return;
        setProject(next);
        setDraft(next.prompt);
        setSelectedId(next.sequence[0] ?? null);
        document.title = `${next.title} · Storyloom`;
      })
      .catch(() => {
        if (!cancel) setMissing(true);
      });
    return () => {
      cancel = true;
    };
  }, [projectId]);

  useEffect(() => {
    const current = document.querySelector('.rail button[aria-current="step"]');
    current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [step]);

  useEffect(() => {
    if (!project || project.status === "idle" || busy) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok || stopped) return;
      const next = (await response.json()) as Project;
      if (stopped) return;
      setProject(next);
      if (next.status === "idle") window.clearInterval(timer);
    }, 1600);
    const giveUp = window.setTimeout(() => {
      stopped = true;
      window.clearInterval(timer);
      setStuck(true);
    }, 20000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.clearTimeout(giveUp);
    };
  }, [project?.status, busy, projectId]);

  async function job(body: Record<string, unknown>, nextStep?: Step) {
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("ndjson")) {
        throw new Error(await parseError(response));
      }
      const result: { project: Project | null } = { project: null };
      let failure = "";
      await readNdjson(response, (event) => {
        if (event.type === "progress" && typeof event.message === "string") setMessage(event.message);
        if (event.type === "error" && typeof event.message === "string") failure = event.message;
        if (event.type === "done") result.project = event.project as Project;
      });
      if (failure) throw new Error(failure);
      if (!result.project) throw new Error("Storyloom lost the result. Your originals are safe.");
      setProject(result.project);
      setDraft(result.project.prompt);
      if (nextStep) setStep(nextStep);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Storyloom could not finish that.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(body: Record<string, unknown>) {
    setError(null);
    const response = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(typeof data.error === "string" ? data.error : "That change could not be saved.");
      return false;
    }
    setProject(data as Project);
    return true;
  }

  if (missing) {
    return (
      <main className="missing" id="main">
        <div>
          <h1>This story is not on this machine.</h1>
          <a className="btn" href="/">
            Back to Storyloom
          </a>
        </div>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="loading-page" id="main">
        <p>Opening the story…</p>
      </main>
    );
  }

  const api = {
    project,
    step,
    setStep,
    busy,
    message,
    error,
    clearError: () => setError(null),
    selectedId,
    setSelectedId,
    upload: async (files: File[]) => {
      setBusy(true);
      setMessage("Adding your photographs…");
      setError(null);
      try {
        const form = new FormData();
        for (const file of files) form.append("files", file);
        const response = await fetch(`/api/projects/${projectId}/photos`, { method: "POST", body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Those photographs could not be added.");
        setProject(data.project as Project);
        const rejected = (data.rejected ?? []) as { name: string; reason: string }[];
        if (rejected.length) setError(rejected.map((item) => `${item.name}: ${item.reason}`).join(" "));
        if (!selectedId && data.project.sequence?.[0]) setSelectedId(data.project.sequence[0]);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Those photographs could not be added.");
      } finally {
        setBusy(false);
        setMessage("");
      }
    },
    removePhoto: async (id: string) => {
      if (!window.confirm("Remove this photograph from the story? The original file in the story will be deleted.")) return;
      setBusy(true);
      try {
        const response = await fetch(`/api/projects/${projectId}/photos?photoId=${id}`, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "That photograph could not be removed.");
        setProject(data as Project);
        if (selectedId === id) setSelectedId((data as Project).sequence[0] ?? null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "That photograph could not be removed.");
      } finally {
        setBusy(false);
      }
    },
    reorder: async (ids: string[]) => {
      const previous = project;
      setProject({ ...project, sequence: ids, userSequence: ids, sequenceSource: "user" });
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequence: ids }),
      });
      const data = await response.json();
      if (!response.ok) {
        setProject(previous);
        setError(typeof data.error === "string" ? data.error : "The order could not be saved.");
        return;
      }
      setProject(data as Project);
    },
    savePrompt: async (prompt: string) => {
      await patch({ prompt });
    },
    analyse: (prompt: string) => job({ action: "analyse", prompt }, "read"),
    saveBible: (bible: VisualBible) => patch({ bible }),
    saveLocks: (locks: Locks) => patch({ locks }),
    acceptSequence: async () => {
      await patch({ sequenceAction: "accept-suggested" });
    },
    keepOrder: async () => {
      await patch({ sequenceAction: "keep-mine" });
    },
    weave: () => job({ action: "weave" }),
    direct: (instruction: string) => job({ action: "direct", instruction }),
    restory: (prompt: string) => job({ action: "restory", prompt }, "read"),
    undo: () => job({ action: "undo" }),
    redo: () => job({ action: "redo" }),
    restoreVersion: (versionId: string) => job({ action: "restore", versionId }),
    rename: async (title: string) => {
      await patch({ title });
    },
    recover: () => job({ action: "recover" }),
    play: () => setPlaying(true),
  };

  return (
    <div className="studio">
      <header className="topbar">
        <a className="mark" href="/">
          Storyloom
        </a>
        <input
          className="title-input"
          aria-label="Story title"
          value={project.title}
          maxLength={120}
          onChange={(event) => setProject({ ...project, title: event.target.value })}
          onBlur={(event) => void api.rename(event.target.value.trim() || "Untitled story")}
        />
        <span className="quiet">
          {project.photos.length} photograph{project.photos.length === 1 ? "" : "s"}
        </span>
      </header>
      <nav className="rail" aria-label="Story steps">
        {STEPS.map(([id, label]) => (
          <button key={id} type="button" aria-current={step === id ? "step" : undefined} onClick={() => setStep(id)}>
            {label}
          </button>
        ))}
      </nav>
      <main className="stage" id="main">
        {error ? (
          <p className="alert" role="alert">
            {error}
          </p>
        ) : null}
        {project.interrupted ? (
          <p className="note">
            The last reading was interrupted. Your photographs were not replaced.
            <button className="btn small ghost" type="button" onClick={() => api.recover()}>
              Clear this note
            </button>
          </p>
        ) : null}
        {stuck && project.status !== "idle" ? (
          <p className="note">
            Storyloom is still marked as working. If nothing is moving, your originals are safe.
            <button className="btn small ghost" type="button" onClick={() => api.recover()}>
              Continue with what was saved
            </button>
          </p>
        ) : null}
        <p className="status-line" role="status" aria-live="polite">
          {message}
        </p>
        {step === "gather" ? <GatherStage api={api} /> : null}
        {step === "tell" ? <TellStage api={api} draft={draft} setDraft={setDraft} /> : null}
        {step === "read" ? <ReadStage api={api} /> : null}
        {step === "sequence" ? <SequenceStage api={api} /> : null}
        {step === "language" ? <LanguageStage key={`${project.updatedAt}-${project.historyIndex}`} api={api} /> : null}
        {step === "weave" ? <WeaveStage api={api} /> : null}
        {step === "direct" ? <DirectStage api={api} /> : null}
        {step === "export" ? <ExportStage api={api} /> : null}
      </main>
      <Filmstrip project={project} selectedId={selectedId} onSelect={setSelectedId} />
      {playing ? <Slideshow project={project} onClose={() => setPlaying(false)} /> : null}
    </div>
  );
}
