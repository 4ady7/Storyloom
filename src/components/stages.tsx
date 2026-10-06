"use client";

import { useMemo, useState } from "react";
import { Compare } from "@/components/compare";
import type { StudioController } from "@/components/studio-types";
import { DIRECTION_EXAMPLES, STORY_EXAMPLES } from "@/lib/examples";
import { confidenceLabel, frameNumber, mediaUrl, orderedPhotos, roleFor } from "@/lib/format";
import type { Locks, VisualBible } from "@/lib/types";

const MAX_BYTES = 20 * 1024 * 1024;

function clientReason(file: File): string | null {
  if (!/\.(jpe?g|png|webp)$/i.test(file.name) || (file.type && !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
    return `${file.name} is not a JPEG, PNG, or WebP photograph.`;
  }
  if (!file.size) return `${file.name} is empty.`;
  if (file.size > MAX_BYTES) return `${file.name} is larger than 20MB.`;
  return null;
}

export function GatherStage({ api }: { api: StudioController }) {
  const photos = orderedPhotos(api.project);
  const [over, setOver] = useState(false);
  const [localErrors, setLocalErrors] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);

  async function take(list: File[]) {
    const rejected: string[] = [];
    const accepted: File[] = [];
    for (const file of list) {
      const reason = clientReason(file);
      if (reason) rejected.push(reason);
      else accepted.push(file);
    }
    setLocalErrors(rejected);
    if (accepted.length) await api.upload(accepted);
  }

  function move(id: string, direction: -1 | 1) {
    const ids = photos.map((photo) => photo.id);
    const index = ids.indexOf(id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    const copy = [...ids];
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    void api.reorder(copy);
  }

  return (
    <div>
      <p className="kicker">Photographs</p>
      <h1>Create a visual story</h1>
      <p className="lede">Upload your photographs and tell Storyloom what story you want them to tell.</p>
      <div
        className={over ? "drop over" : "drop"}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          void take(Array.from(event.dataTransfer.files));
        }}
      >
        <div>
          <strong>Drop photographs</strong>
          <p className="quiet">JPEG, PNG, or WebP · up to 20MB each</p>
          <label className="btn" htmlFor="photos">
            Choose photographs
          </label>
          <input
            id="photos"
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            multiple
            onChange={(event) => {
              void take(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
        </div>
      </div>
      {localErrors.length ? (
        <div className="alert" role="alert">
          {localErrors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}
      <div className="photo-grid">
        {photos.map((photo, index) => (
          <article
            className={`tile${dragId === photo.id ? " dragging" : ""}`}
            key={photo.id}
            draggable
            onDragStart={() => setDragId(photo.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (!dragId || dragId === photo.id) return;
              const ids = photos.map((item) => item.id);
              const from = ids.indexOf(dragId);
              const to = ids.indexOf(photo.id);
              const [item] = ids.splice(from, 1);
              ids.splice(to, 0, item);
              setDragId(null);
              void api.reorder(ids);
            }}
          >
            <figure>
              <img src={mediaUrl(api.project.id, photo.id, "preview", "original")} alt={photo.originalName} />
            </figure>
            <header>
              <strong>
                {frameNumber(index)} {photo.originalName}
              </strong>
              <button className="btn danger small" type="button" onClick={() => api.removePhoto(photo.id)}>
                Remove
              </button>
            </header>
            <p className="meta">
              <span>
                {photo.width} × {photo.height}
              </span>
              <span>{Math.round(photo.bytes / 1024)} KB</span>
            </p>
            <div className="row">
              <button className="btn small ghost" type="button" onClick={() => move(photo.id, -1)} disabled={index === 0}>
                Move earlier
              </button>
              <button className="btn small ghost" type="button" onClick={() => move(photo.id, 1)} disabled={index === photos.length - 1}>
                Move later
              </button>
            </div>
          </article>
        ))}
      </div>
      {photos.length ? (
        <div className="row" style={{ marginTop: 22 }}>
          <button className="btn" type="button" onClick={() => api.setStep("tell")}>
            Tell the story
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function TellStage({ api, draft, setDraft }: { api: StudioController; draft: string; setDraft: (value: string) => void }) {
  return (
    <div className="stage-narrow">
      <p className="kicker">Story</p>
      <h1>What should these photographs say?</h1>
      <p className="lede">Write it the way you would tell a friend. Storyloom will find the structure.</p>
      <label className="visually-hidden" htmlFor="prompt">
        Story
      </label>
      <textarea
        id="prompt"
        className="area"
        value={draft}
        maxLength={4000}
        placeholder="I want this to feel like two strangers meeting in London…"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void api.savePrompt(draft)}
      />
      <div className="examples">
        {STORY_EXAMPLES.map((example) => (
          <button key={example.title} type="button" onClick={() => setDraft(example.prompt)}>
            {example.title}
          </button>
        ))}
      </div>
      <button className="btn" type="button" disabled={api.busy || api.project.photos.length === 0 || draft.trim().length < 8} onClick={() => api.analyse(draft)}>
        {api.busy ? "Reading…" : "Analyse story"}
      </button>
    </div>
  );
}

export function ReadStage({ api }: { api: StudioController }) {
  const story = api.project.story;
  const bible = api.project.bible;
  if (!story || !bible) {
    return (
      <div className="stage-narrow">
        <h1>The story has not been read yet.</h1>
        <button className="btn" type="button" onClick={() => api.setStep("tell")}>
          Write the story
        </button>
      </div>
    );
  }
  return (
    <div>
      <p className="kicker">
        {story.source === "mixed" ? "Vision reading" : "On-device reading"} · {confidenceLabel(story.confidence)}
      </p>
      <h1 className="measure">{story.summary}</h1>
      <p className="lede">{story.premise}</p>
      <p className="quiet measure">{story.readingNote}</p>
      {!api.project.readingCurrent ? <p className="note">The collection changed after this reading. Analyse again before you trust the roles.</p> : null}
      <div className="split">
        <div>
          <p className="kicker">Emotional progression</p>
          <ol className="timeline">
            {story.emotionalProgression.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
        <div>
          <p className="kicker">Visual progression</p>
          <ol className="timeline">
            {story.visualProgression.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      </div>
      <div className="acts">
        {story.acts.map((act, index) => (
          <article key={act.title}>
            <p className="kicker">{frameNumber(index)}</p>
            <h3>{act.title}</h3>
            <p>{act.description}</p>
            <p className="quiet">{act.emotion}</p>
          </article>
        ))}
      </div>
      <div className="split">
        <section>
          <h2>Characters</h2>
          {story.characters.length === 0 ? <p className="quiet">No people were named in the story.</p> : null}
          {story.characters.map((character) => (
            <div className="person" key={character.id}>
              <dt>
                {character.name} · {confidenceLabel(character.confidence)}
              </dt>
              <dd>{character.visual}</dd>
              <dd>{character.clothing}</dd>
              <dd>{character.importance}</dd>
            </div>
          ))}
        </section>
        <section>
          <h2>Locations</h2>
          {story.locations.length === 0 ? <p className="quiet">No place was named. Storyloom will not invent one.</p> : null}
          {story.locations.map((location) => (
            <div className="person" key={location.id}>
              <dt>{location.name}</dt>
              <dd>{location.description}</dd>
            </div>
          ))}
        </section>
      </div>
      {story.inconsistencies.length ? (
        <section>
          <h2>What does not yet agree</h2>
          <ul>
            {story.inconsistencies.map((item, index) => (
              <li key={`${item.photoId}-${item.kind}-${index}`}>{item.detail}</li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="quiet">The light and colour already sit reasonably close together.</p>
      )}
      <p className="quiet">{story.chronologyNote}</p>
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn" type="button" onClick={() => api.setStep("sequence")}>
          Review the sequence
        </button>
      </div>
    </div>
  );
}

export function SequenceStage({ api }: { api: StudioController }) {
  const photos = orderedPhotos(api.project);
  const [dragId, setDragId] = useState<string | null>(null);
  const suggested = api.project.story?.suggestedSequence ?? [];
  const differs = suggested.length > 0 && suggested.join() !== api.project.sequence.join();

  function commit(ids: string[]) {
    void api.reorder(ids);
  }

  return (
    <div>
      <p className="kicker">Sequence</p>
      <h1>The order of the story</h1>
      <p className="lede">Storyloom can suggest an order. Your order stays until you accept it.</p>
      {differs ? (
        <div className="note">
          <p>{api.project.story?.chronologyNote}</p>
          <div className="row">
            <button className="btn" type="button" onClick={() => api.acceptSequence()}>
              Accept suggested sequence
            </button>
            <button className="btn ghost" type="button" onClick={() => api.keepOrder()}>
              Keep my order
            </button>
          </div>
        </div>
      ) : (
        <p className="quiet">The suggested order matches the order you are using.</p>
      )}
      <div className="board">
        {photos.map((photo, index) => {
          const role = roleFor(api.project, photo.id);
          const names =
            role?.characterIds
              .map((id) => api.project.story?.characters.find((character) => character.id === id)?.name)
              .filter(Boolean)
              .join(", ") || "No face pinned to this frame";
          return (
            <article
              key={photo.id}
              className={`frame-card${dragId === photo.id ? " dragging" : ""}`}
              draggable
              onDragStart={() => setDragId(photo.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (!dragId || dragId === photo.id) return;
                const ids = photos.map((item) => item.id);
                const from = ids.indexOf(dragId);
                const to = ids.indexOf(photo.id);
                const [item] = ids.splice(from, 1);
                ids.splice(to, 0, item);
                setDragId(null);
                commit(ids);
              }}
            >
              <img src={mediaUrl(api.project.id, photo.id, "preview", api.project.activeVersionId)} alt={role?.role ?? photo.originalName} />
              <p className="num">{frameNumber(index)}</p>
              <h3>{role?.role ?? "Untitled frame"}</h3>
              <p className="quiet">{role?.chapter}</p>
              <p>{role?.location ?? "Unspecified"}</p>
              <p>{names}</p>
              <p className="quiet">
                {role?.emotion} · {role ? confidenceLabel(role.confidence) : ""}
              </p>
              <div className="row">
                <button className="btn small ghost" type="button" onClick={() => {
                  const ids = photos.map((item) => item.id);
                  if (index === 0) return;
                  const [item] = ids.splice(index, 1);
                  ids.splice(index - 1, 0, item);
                  commit(ids);
                }}>
                  Move earlier
                </button>
                <button className="btn small ghost" type="button" onClick={() => {
                  const ids = photos.map((item) => item.id);
                  if (index >= ids.length - 1) return;
                  const [item] = ids.splice(index, 1);
                  ids.splice(index + 1, 0, item);
                  commit(ids);
                }}>
                  Move later
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn" type="button" onClick={() => api.setStep("language")}>
          Open the visual language
        </button>
      </div>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>
        {label} <span className="quiet">{value.toFixed(2)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export function LanguageStage({ api }: { api: StudioController }) {
  const source = api.project.bible;
  const [bible, setBible] = useState<VisualBible | null>(source);
  const [locks, setLocks] = useState<Locks>(api.project.locks);
  const view = bible;
  const progression = useMemo(() => view?.emotion.progression ?? [], [view]);
  if (!view || !source) {
    return (
      <div className="stage-narrow">
        <h1>Read the story first.</h1>
        <p>The visual language is built from the collection, not from a preset filter.</p>
      </div>
    );
  }

  function patch(next: VisualBible) {
    setBible(next);
  }

  return (
    <div className="stage-narrow">
      <p className="kicker">Visual language</p>
      <h1>How the photographs belong together</h1>
      <p className="lede">{view.summary}</p>
      <p className="quiet">Weave uses this language on every frame. A frame that already agrees is left as photographed. The arc still moves from opening to ending.</p>
      <label>
        Style
        <input className="field" value={view.photography.style} maxLength={180} onChange={(event) => patch({ ...view, photography: { ...view.photography, style: event.target.value } })} />
      </label>
      <label>
        Time of day
        <input className="field" value={view.lighting.timeOfDay} maxLength={120} onChange={(event) => patch({ ...view, lighting: { ...view.lighting, timeOfDay: event.target.value } })} />
      </label>
      <label>
        Atmosphere
        <input className="field" value={view.environment.atmosphere} maxLength={180} onChange={(event) => patch({ ...view, environment: { ...view.environment, atmosphere: event.target.value } })} />
      </label>
      <div className="sliders">
        <Slider label="Warmth" min={-1} max={1} step={0.01} value={view.colour.temperature} onChange={(temperature) => patch({ ...view, colour: { ...view.colour, temperature } })} />
        <Slider label="Saturation" min={0} max={1} step={0.01} value={view.colour.saturation} onChange={(saturation) => patch({ ...view, colour: { ...view.colour, saturation } })} />
        <Slider label="Contrast" min={0} max={1} step={0.01} value={view.colour.contrast} onChange={(contrast) => patch({ ...view, colour: { ...view.colour, contrast } })} />
        <Slider label="Grain" min={0} max={1} step={0.01} value={view.texture.grain} onChange={(grain) => patch({ ...view, texture: { ...view.texture, grain } })} />
      </div>
      <h2>Progression</h2>
      <ol>
        {progression.map((step, index) => (
          <li key={`${step.label}-${index}`} style={{ marginBottom: 10 }}>
            <strong>{step.label}</strong>
            <span className="quiet"> {step.emotion}</span>
            <div className="quiet">
              Light {step.brightness.toFixed(2)} · colour {step.temperature.toFixed(2)}
            </div>
          </li>
        ))}
      </ol>
      <h2>Locks</h2>
      <div className="locks">
        {(
          [
            ["identity", "Identity"],
            ["clothing", "Clothing"],
            ["environment", "Environment"],
            ["lighting", "Lighting"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={locks[key]}
              onChange={(event) => setLocks({ ...locks, [key]: event.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
      <p className="quiet">
        {locks.identity
          ? "Identity is locked, so people stay as photographed. Storyloom changes light and colour, not a face."
          : "Identity is unlocked. Storyloom still will not redraw faces unless a generative provider is explicitly enabled on the server."}
      </p>
      <div className="row">
        <button
          className="btn"
          type="button"
          disabled={api.busy}
          onClick={async () => {
            api.setStep("weave");
            const savedLocks = await api.saveLocks(locks);
            const savedBible = await api.saveBible(view);
            if (savedLocks && savedBible) await api.weave();
          }}
        >
          Save and weave
        </button>
      </div>
      <ul>
        {view.continuity.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function WeaveStage({ api }: { api: StudioController }) {
  const photos = orderedPhotos(api.project);
  const selected = photos.find((photo) => photo.id === api.selectedId) ?? photos[0];
  const version = api.project.versions.find((item) => item.id === api.project.activeVersionId);
  if (!selected) return <p>Add photographs to weave a story.</p>;
  const touch = version?.touched[selected.id];
  return (
    <div>
      <p className="kicker">Weave</p>
      <h1>Apply the visual language</h1>
      <p className="lede">Frames that already fit are kept. The sequence is allowed to change temperature, light, and mood as the story moves.</p>
      <div className="row">
        <button className="btn" type="button" disabled={api.busy || !api.project.bible} onClick={() => api.weave()}>
          {api.busy ? "Weaving…" : version && version.id !== "original" ? "Weave again" : "Apply visual language"}
        </button>
        <button className="btn ghost" type="button" onClick={api.play} disabled={!photos.length}>
          Play sequence
        </button>
      </div>
      <div className="versions" role="list" aria-label="Versions">
        {api.project.versions.map((item) => (
          <button key={item.id} type="button" className="btn small ghost" aria-pressed={item.id === api.project.activeVersionId} onClick={() => api.restoreVersion(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {version ? <p className="quiet">{version.note}</p> : null}
      <Compare
        before={mediaUrl(api.project.id, selected.id, "preview", "original")}
        after={mediaUrl(api.project.id, selected.id, "preview", api.project.activeVersionId)}
        alt={roleFor(api.project, selected.id)?.role ?? selected.originalName}
        width={selected.width}
        height={selected.height}
      />
      <p>{touch?.summary ?? "This is the original photograph."}</p>
      <div className="result-grid" style={{ marginTop: 22 }}>
        {photos.map((photo, index) => {
          const role = roleFor(api.project, photo.id);
          const note = version?.touched[photo.id];
          return (
            <button key={photo.id} className="tile" type="button" onClick={() => api.setSelectedId(photo.id)} style={{ textAlign: "left", border: 0, background: "transparent", padding: 0 }}>
              <img src={mediaUrl(api.project.id, photo.id, "preview", api.project.activeVersionId)} alt="" />
              <p>
                <strong>
                  {frameNumber(index)} {role?.role ?? photo.originalName}
                </strong>
              </p>
              <p className="quiet">{note?.preserved === false ? "Adjusted" : "As photographed"} · {role?.emotion}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DirectStage({ api }: { api: StudioController }) {
  const [text, setText] = useState("");
  const [restory, setRestory] = useState("");
  const history = api.project.history;
  return (
    <div className="stage-narrow">
      <p className="kicker">Direct</p>
      <h1>Tell Storyloom what to change</h1>
      <p className="lede">Name a feeling, a photograph, or the whole sequence. Identity stays locked unless you unlock it.</p>
      <div className="row">
        <button className="btn ghost" type="button" onClick={() => api.undo()} disabled={api.busy || api.project.historyIndex <= 0}>
          Undo
        </button>
        <button className="btn ghost" type="button" onClick={() => api.redo()} disabled={api.busy || api.project.historyIndex >= history.length - 1}>
          Redo
        </button>
      </div>
      <label className="visually-hidden" htmlFor="direction">
        Direction
      </label>
      <textarea id="direction" className="area" value={text} onChange={(event) => setText(event.target.value)} placeholder="Make the ending sadder." />
      <div className="examples">
        {DIRECTION_EXAMPLES.map((example) => (
          <button key={example} type="button" onClick={() => setText(example)}>
            {example}
          </button>
        ))}
      </div>
      <button className="btn" type="button" disabled={api.busy || !text.trim()} onClick={() => api.direct(text)}>
        Apply direction
      </button>
      {api.project.lastDirection ? <p className="note">{api.project.lastDirection}</p> : null}
      <ol className="log">
        {history.map((item, index) => (
          <li key={item.id} aria-current={index === api.project.historyIndex}>
            {item.label}
          </li>
        ))}
      </ol>
      <section className="restory">
        <p className="kicker">Re-story</p>
        <h2>Same photographs. A different story.</h2>
        <p>Storyloom will reread the sequence, rebuild the visual language, and make a new version. The files you uploaded stay untouched.</p>
        <textarea className="area" value={restory} onChange={(event) => setRestory(event.target.value)} placeholder="Two spies realise they have been following each other." />
        <div className="examples">
          <button type="button" onClick={() => setRestory(STORY_EXAMPLES[1].prompt)}>
            Tell it as a thriller
          </button>
          <button type="button" onClick={() => setRestory(STORY_EXAMPLES[0].prompt)}>
            Tell it as a romance
          </button>
        </div>
        <button className="btn" type="button" disabled={api.busy || restory.trim().length < 8} onClick={() => api.restory(restory)}>
          Re-story
        </button>
      </section>
    </div>
  );
}

export function ExportStage({ api }: { api: StudioController }) {
  const [size, setSize] = useState("2560");
  const selected = api.selectedId ?? api.project.sequence[0];
  const base = `/api/projects/${api.project.id}/export?size=${size === "full" ? "full" : size}`;
  return (
    <div className="stage-narrow">
      <p className="kicker">Export</p>
      <h1>Take the story with you</h1>
      <p className="lede">Exports are the photographs only. The studio stays behind.</p>
      <label>
        Resolution
        <select className="field" value={size} onChange={(event) => setSize(event.target.value)}>
          <option value="1600">Screen, 1600px</option>
          <option value="2560">Print, 2560px</option>
          <option value="full">Full, up to 4500px</option>
        </select>
      </label>
      <div className="row" style={{ marginTop: 16 }}>
        {selected ? (
          <a className="btn" href={`${base}&kind=frame&photoId=${selected}`}>
            This frame
          </a>
        ) : null}
        <a className="btn ghost" href={`${base}&kind=zip`}>
          Whole story
        </a>
        <a className="btn ghost" href={`${base}&kind=contact`}>
          Storyboard
        </a>
        <a className="btn ghost" href={`${base}&kind=pdf`}>
          PDF photo story
        </a>
        <button className="btn ghost" type="button" onClick={api.play}>
          Play slideshow
        </button>
      </div>
    </div>
  );
}
