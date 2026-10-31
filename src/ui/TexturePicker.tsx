// The texture picker (the owner, 2026-10-31: "make texture select a dropdown with a large thumb of the texture" and "put the scale and angle as
// Edit buttons on the texture"): the texture in use as a large thumbnail and its name; a click opens a flyout of every texture as large
// pucks in a scrollable window, as the grass editor's swatches (a grid that scrolls down, never sideways); beside it, Edit buttons (Scale,
// Angle) that open their controls under it.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { PHOTO_TEX } from '../game/grass-art';
import { paintedSwatch } from '../game/painted-surfaces-live';

// the owner's presets' baked pictures, by preset id (Vite fills the glob in when it builds; under plain node there is none)
const PICS: Record<string, string> = (() => { try { return import.meta.glob('../assets/ground/preset-*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>; } catch { return {}; } })();
/** a texture's picture: its painted look's near painting, else an owner's preset, else a Paint photo, or '' for one drawn as a colour */
export function texPic(tex: string): string {
  const p = paintedSwatch(tex); if (p?.img) return p.img;
  if (tex.startsWith('preset:')) return PICS[`../assets/ground/preset-${tex.slice(7)}.webp`] ?? '';
  return PHOTO_TEX.find(t => t.tex === tex)?.src ?? '';
}
export interface TextureOption { id: string; name: string; col: string; pic?: string }
/** one texture's thumbnail, size px square */
export function TexThumb({ t, size }: { t: TextureOption | null; size: number }) {
  const pic = t ? (t.pic ?? texPic(t.id)) : '';
  return <span aria-hidden className="inline-block shrink-0 rounded-md border border-white/15" style={{ width: size, height: size, backgroundColor: t?.col ?? 'transparent', backgroundImage: pic ? `url("${pic}")` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }} />;
}
/** one texture as a puck (the grass editor's swatches: a disc of the texture on a soil base), css px wide */
export function TexPuck({ t, css }: { t: TextureOption | null; css: number }) {
  const id = useId().replace(/:/g, ''), pic = t ? (t.pic ?? texPic(t.id)) : '';
  return (
    <svg viewBox="0 0 120 84" width={css} height={css * 0.7} aria-hidden>
      <defs>
        <clipPath id={`${id}-top`}><ellipse cx="60" cy="38" rx="56" ry="30" /></clipPath>
        {pic && <pattern id={`${id}-pic`} patternUnits="userSpaceOnUse" width="64" height="64" patternTransform="translate(60 38) scale(1 0.536) rotate(45)"><image href={pic} width="64" height="64" preserveAspectRatio="none" /></pattern>}
      </defs>
      <path d="M4 38 V50 A56 30 0 0 0 116 50 V38 Z" fill="#4a3a28" />
      <ellipse cx="60" cy="38" rx="56" ry="30" fill={t?.col ?? '#3a3a3a'} />
      {pic && <rect x="0" y="0" width="120" height="84" fill={`url(#${id}-pic)`} clipPath={`url(#${id}-top)`} />}
      <path d="M4 38 A56 30 0 0 0 116 38" fill="none" stroke="rgba(255,246,214,0.6)" strokeWidth="1.2" />
    </svg>
  );
}
/** an Edit button and the controls it opens */
export interface TextureEdit { id: string; label: string; panel: ReactNode }

export function TexturePicker({ label, value, options, onPick, none, edits = [], note, testId }: {
  label: string; value: string | undefined; options: readonly TextureOption[]; onPick(id: string | undefined): void;
  /** a first entry that picks nothing (the blend's None) */ none?: string;
  edits?: readonly TextureEdit[]; note?: ReactNode; testId?: string;
}) {
  const [open, setOpen] = useState(false), [edit, setEdit] = useState<string | null>(null), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  const cur = options.find(o => o.id === value) ?? null, shown = edits.find(e => e.id === edit);
  return (
    <div className="mt-2" ref={box} data-texture-picker={testId}>
      <div className="text-[12px] text-slate-400">{label}</div>
      <div className="relative mt-1 flex items-center gap-1.5">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/15 bg-slate-900/60 p-1 pr-2 text-left hover:border-white/30"
          aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} data-texture-current>
          <TexPuck t={cur} css={56} />
          <span className="min-w-0 flex-1 truncate text-xs text-slate-100">{cur ? cur.name : none ?? 'Pick a texture'}</span>
          <span aria-hidden className="text-slate-400">▾</span>
        </button>
        {edits.map(e => (
          <button key={e.id} type="button" className={`chip shrink-0 ${edit === e.id ? 'chip-on' : ''}`} aria-pressed={edit === e.id} title={`Edit the ${e.id}`}
            onClick={() => setEdit(edit === e.id ? null : e.id)} data-texture-edit={e.id}>{e.label}</button>
        ))}
      </div>
      {/* the window opens in place under the picker (in the card's flow, so the card's own scroll never clips it) */}
      {open && (
        <div role="listbox" aria-label={label} className="mt-1 max-h-[22rem] overflow-y-auto overflow-x-hidden rounded-lg border border-white/15 bg-slate-950/60 p-2" data-texture-window>
          <div className="swatches">
            {none !== undefined && (
              <button type="button" role="option" aria-selected={!value} className={`swatch ${!value ? 'swatch-on' : ''}`} onClick={() => { onPick(undefined); setOpen(false); }}>
                <span className="swatch-puck"><TexPuck t={null} css={52} /></span><span className="swatch-name">{none}</span>
              </button>
            )}
            {options.map(o => (
              <button key={o.id} type="button" role="option" aria-selected={o.id === value} title={o.name} className={`swatch ${o.id === value ? 'swatch-on' : ''}`}
                onClick={() => { onPick(o.id); setOpen(false); }} data-texture-option={o.id}>
                <span className="swatch-puck"><TexPuck t={o} css={52} /></span><span className="swatch-name">{o.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {note}
      {shown && <div className="mt-1.5 rounded-lg border border-white/10 bg-white/5 p-2" data-texture-edit-panel={shown.id}>{shown.panel}</div>}
    </div>
  );
}
