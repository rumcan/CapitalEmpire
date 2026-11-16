// A brush panel's labelled slider (the owner, 2026-11-16, on Ground height's Smaller / Bigger and Gentler / Stronger buttons: "this should be
// sliders?"): one row, the setting's name and value as text on the left ("Size 6 tiles", "Strength 2/5") and a gold-filled slider in the UI's
// own look taking the rest of the row (index.css .brush-slider), so it never makes a panel wider. The keys stay with the tools ([ ] size).
import type { CSSProperties } from 'react';

export function BrushSlider({ label, show, value, min, max, step, onChange, aria, title, testId, disabled }: {
  /** the setting's short name: "Size", "Strength" */
  label: string;
  /** its value as the player reads it: "6 tiles", "2/5" */
  show: string;
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
  /** the slider's accessible name (default: the label) */
  aria?: string;
  title?: string;
  testId?: string;
  disabled?: boolean;
}) {
  const fill = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <div className="brush-slider" data-testid={testId} title={title}>
      <span className="brush-slider-text">{`${label} ${show}`}</span>
      <input type="range" aria-label={aria ?? label} min={min} max={max} step={step} value={value} disabled={disabled} aria-valuetext={show}
        className="brush-range" style={{ '--fill': `${fill.toFixed(1)}%` } as CSSProperties} onChange={e => onChange(+e.target.value)} />
    </div>
  );
}
