"use client";

import { useEffect, useState } from "react";
import { frameNumber, mediaUrl, orderedPhotos, roleFor } from "@/lib/format";
import type { Project } from "@/lib/types";

export function Slideshow({ project, onClose }: { project: Project; onClose: () => void }) {
  const photos = orderedPhotos(project);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const photo = photos[index];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setIndex((current) => Math.min(photos.length - 1, current + 1));
      if (event.key === "ArrowLeft") setIndex((current) => Math.max(0, current - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, photos.length]);

  useEffect(() => {
    if (!playing || photos.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % photos.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, [playing, photos.length]);

  if (!photo) return null;
  const role = roleFor(project, photo.id);

  return (
    <div className="slideshow" role="dialog" aria-modal="true" aria-label="Cinematic slideshow">
      <header>
        <p className="mark">Storyloom</p>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <img
        src={mediaUrl(project.id, photo.id, "preview", project.activeVersionId)}
        alt={role ? `${role.role}. ${role.emotion}.` : photo.originalName}
      />
      <footer>
        <div>
          <p className="kicker">
            {frameNumber(index)} / {frameNumber(photos.length - 1)}
          </p>
          <h2>{role?.role ?? photo.originalName}</h2>
          <p className="quiet">{role ? `${role.location} · ${role.emotion}` : "Original photograph"}</p>
        </div>
        <div className="row">
          <button type="button" onClick={() => setIndex((current) => Math.max(0, current - 1))}>
            Previous
          </button>
          <button type="button" onClick={() => setPlaying((value) => !value)} aria-pressed={playing}>
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" onClick={() => setIndex((current) => Math.min(photos.length - 1, current + 1))}>
            Next
          </button>
        </div>
      </footer>
    </div>
  );
}
