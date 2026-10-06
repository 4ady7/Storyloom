"use client";

import { useState } from "react";

export function Compare({
  before,
  after,
  alt,
  width,
  height,
}: {
  before: string;
  after: string;
  alt: string;
  width: number;
  height: number;
}) {
  const [pos, setPos] = useState(56);
  const [mode, setMode] = useState<"slider" | "side" | "toggle">("slider");
  const [showOriginal, setShowOriginal] = useState(false);
  const aspect = `${Math.max(width, 1)} / ${Math.max(height, 1)}`;

  return (
    <div className="compare-wrap">
      <div className="row" role="group" aria-label="Comparison mode">
        <button className="btn small ghost" type="button" aria-pressed={mode === "slider"} onClick={() => setMode("slider")}>
          Slider
        </button>
        <button className="btn small ghost" type="button" aria-pressed={mode === "side"} onClick={() => setMode("side")}>
          Side by side
        </button>
        <button className="btn small ghost" type="button" aria-pressed={mode === "toggle"} onClick={() => setMode("toggle")}>
          Toggle
        </button>
      </div>
      {mode === "side" ? (
        <div className="side">
          <figure>
            <img src={before} alt={`${alt}, original`} />
            <figcaption>Original</figcaption>
          </figure>
          <figure>
            <img src={after} alt={`${alt}, treatment`} />
            <figcaption>Treatment</figcaption>
          </figure>
        </div>
      ) : mode === "toggle" ? (
        <div>
          <div className="compare" style={{ aspectRatio: aspect }}>
            <img src={showOriginal ? before : after} alt={showOriginal ? `${alt}, original` : `${alt}, treatment`} />
          </div>
          <label className="row" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={showOriginal} onChange={(event) => setShowOriginal(event.target.checked)} />
            Show original
          </label>
        </div>
      ) : (
        <div>
          <div className="compare" style={{ aspectRatio: aspect }}>
            <img src={after} alt="" />
            <img src={before} alt={alt} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
            <span className="compare-bar" style={{ left: `${pos}%` }} />
            <span className="compare-tag" style={{ left: 12 }}>
              Original
            </span>
            <span className="compare-tag" style={{ right: 12 }}>
              Treatment
            </span>
          </div>
          <label>
            <span className="visually-hidden">Drag to compare the original photograph with the treatment</span>
            <input
              type="range"
              min={0}
              max={100}
              value={pos}
              aria-valuetext={`${pos} percent original`}
              onChange={(event) => setPos(Number(event.target.value))}
            />
          </label>
        </div>
      )}
    </div>
  );
}
