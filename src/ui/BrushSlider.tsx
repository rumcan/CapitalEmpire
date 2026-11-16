// A brush panel's labelled slider (the owner, 2026-11-16, on Ground height's Smaller / Bigger and Gentler / Stronger buttons: "this should be
// sliders?"): one row, the setting's name and value as text on the left ("Size 6 tiles", "Strength 2/5") and a gold-filled slider in the UI's
// own look taking the rest of the row (index.css .brush-slider), so it never makes a panel wider. The keys stay with the tools ([ ] size).
import type { CSSProperties, InputHTMLAttributes } from 'react';

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
        className="brush-range" style={{ '--fill': `${fill.toFixed(1)}%` } as CSSProperties} onChange={e => onChange(+e.target.value)}
        // a mouse drag lets go of the focus, so the tools' keys ([ ] size, 1-9 surfaces) work straight after (a focused input keeps them);
        // a keyboard player who tabbed in keeps it and steps with the arrows
        onPointerUp={e => e.currentTarget.blur()} />
    </div>
  );
}

/** every other slider in the UI (the coordinator, 2026-11-16: no default blue browser sliders): a plain `<input type="range">` in the brush
 *  sliders' gold look (index.css .range-gold: the dark track filled gold up to the value, the gold handle). Its props pass through untouched
 *  (the same ranges, values and calls); only the class and the fill (--fill) are added. A mouse drag lets go of the focus, as BrushSlider's */
export function RangeInput({ className, style, onPointerUp, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const v = +(rest.value ?? rest.defaultValue ?? 0), lo = +(rest.min ?? 0), hi = +(rest.max ?? 100);
  const fill = hi > lo && Number.isFinite(v) ? Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)) : 0;
  return <input type="range" {...rest} className={`range-gold${className ? ` ${className}` : ''}`} style={{ ...style, '--fill': `${fill.toFixed(1)}%` } as CSSProperties}
    onPointerUp={e => { e.currentTarget.blur(); onPointerUp?.(e); }} />;
}
