"use client";

import { frameNumber, mediaUrl, orderedPhotos, roleFor } from "@/lib/format";
import type { Project } from "@/lib/types";

export function Filmstrip({
  project,
  selectedId,
  onSelect,
}: {
  project: Project;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const photos = orderedPhotos(project);
  if (!photos.length) return null;
  return (
    <div className="film" role="list" aria-label="Photographs in this story">
      {photos.map((photo, index) => {
        const role = roleFor(project, photo.id);
        return (
          <button
            key={photo.id}
            type="button"
            role="listitem"
            aria-current={photo.id === selectedId}
            onClick={() => onSelect(photo.id)}
          >
            <img
              src={mediaUrl(project.id, photo.id, "thumb", project.activeVersionId)}
              alt={role?.role ?? photo.originalName}
            />
            <span>
              {frameNumber(index)} {role?.role ?? ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}
