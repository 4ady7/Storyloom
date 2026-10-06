"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatWhen, mediaUrl } from "@/lib/format";
import type { ProjectSummary } from "@/lib/types";

export function HomeStudio({ projects: initial }: { projects: ProjectSummary[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled story" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Storyloom could not open a new story.");
      router.push(`/project/${data.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Storyloom could not open a new story.");
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this story? The photographs in it will be removed from Storyloom.")) return;
    const response = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || "Storyloom could not delete that story.");
      return;
    }
    setProjects((current) => current.filter((project) => project.id !== id));
  }

  return (
    <div className="home">
      <header className="home-top">
        <p className="mark">Storyloom</p>
        <p className="quiet">A studio for photographic stories</p>
      </header>
      <div className="home-grid">
        <section id="main">
          <p className="tagline">Weave your photographs into a story.</p>
          <h1>Create a visual story</h1>
          <p className="lede">Upload your photographs and tell Storyloom what story you want them to tell.</p>
          {error ? (
            <p className="alert" role="alert">
              {error}
            </p>
          ) : null}
          <button className="btn" type="button" onClick={begin} disabled={busy}>
            {busy ? "Opening…" : "Begin a story"}
          </button>
        </section>
        <section className="journal" aria-label="Recent stories">
          <p className="kicker">Stories</p>
          {projects.length === 0 ? (
            <div className="empty-frame">A sequence will appear here.</div>
          ) : (
            projects.map((project) => (
              <div className="journal-row" key={project.id}>
                <a href={`/project/${project.id}`} aria-label={project.title}>
                  {project.coverPhotoId ? (
                    <img src={mediaUrl(project.id, project.coverPhotoId, "thumb", "original")} alt="" />
                  ) : (
                    <div className="journal-fallback" aria-hidden="true">
                      {project.title.slice(0, 1)}
                    </div>
                  )}
                </a>
                <a href={`/project/${project.id}`}>
                  <strong>{project.title}</strong>
                  <span>
                    {project.photoCount} photograph{project.photoCount === 1 ? "" : "s"}
                    {project.summary ? ` · ${project.summary}` : ""}
                  </span>
                </a>
                <div>
                  <div className="when quiet">{formatWhen(project.updatedAt)}</div>
                  <button className="btn danger small" type="button" onClick={() => remove(project.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
