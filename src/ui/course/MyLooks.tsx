import type { Game } from '../../game/engine';
import { BRUSH_PRESETS } from '../../game/paint';
import { PHOTO_TEX } from '../../game/grass-art';
import { SURFACE_TINT } from '../../game/ext/course-cursor';
import { StyleEditor } from '../../PaintPanel';
import { SurfaceMark } from './SurfaceMark';
import { lookName } from './CoursePanel';

// the owner's presets' baked pictures, by preset id (Vite fills the glob in when it builds; under plain node there is none: the disc then
// shows the surface's colour)
const PICS: Record<string, string> = (() => { try { return import.meta.glob('../../assets/ground/preset-*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>; } catch { return {}; } })();

/** a texture's picture (an owner's preset, else a Paint photo), or '' for one drawn as a colour */
function picOf(tex: string): string {
  if (tex.startsWith('preset:')) return PICS[`../../assets/ground/preset-${tex.slice(7)}.webp`] ?? '';
  return PHOTO_TEX.find(t => t.tex === tex)?.src ?? '';
}

/** the look's preview disc (P23 decision 3: "with the disc as its preview"): the surface's puck, as the cursor's chip draws it, its top face
 *  wearing the look's picture at the look's scale and angle, with its tone, and the surface's mark over it */
function LookDisc({ kind, tex, scale, angle, tone, toneAmt, tint }: { kind: string; tex: string; scale: number; angle: number; tone: number; toneAmt: number; tint: string }) {
  const pic = picOf(tex), id = `look-${kind}`, tile = Math.max(8, 48 * scale);
  return (
    <svg viewBox="0 0 120 84" width={120} height={84} role="img" aria-label={`${kind} look preview`} className="shrink-0">
      <defs>
        <clipPath id={`${id}-top`}><ellipse cx="60" cy="38" rx="56" ry="30" /></clipPath>
        {pic && <pattern id={`${id}-pic`} patternUnits="userSpaceOnUse" width={tile} height={tile} patternTransform={`translate(60 38) scale(1 0.536) rotate(${45 + angle})`}><image href={pic} width={tile} height={tile} preserveAspectRatio="none" /></pattern>}
      </defs>
      <path d="M4 38 V50 A56 30 0 0 0 116 50 V38 Z" fill="#4a3a28" />
      <ellipse cx="60" cy="38" rx="56" ry="30" fill={SURFACE_TINT[kind] ?? '#5d7a2e'} />
      {pic && <rect x="0" y="0" width="120" height="84" fill={`url(#${id}-pic)`} clipPath={`url(#${id}-top)`} />}
      {tone > 0 && <ellipse cx="60" cy="38" rx="56" ry="30" fill={tint} opacity={Math.min(0.8, toneAmt * 0.7)} style={{ mixBlendMode: tone === 1 ? 'multiply' : 'screen' }} />}
      <path d="M4 38 A56 30 0 0 0 116 38" fill="none" stroke="rgba(255,246,214,0.6)" strokeWidth="1.2" />
    </svg>
  );
}

/** Holes > More options > My looks (plan P23 4.3, owner decision 3): the current surface's look, previewed on its disc, and the style
 *  editor that was under Show every tool now > Fine tuning. On a golf course's grid every cell of that surface wears the look's texture, size
 *  and angle at once (and the disc at the pointer shows it); a classic game's painted areas keep the whole editor. A card beside the Holes
 *  panel; Esc or × closes it */
export function MyLooksCard({ game, onClose }: { game: Game; onClose: () => void }) {
  const p = game.paint, kind = p.brushKind, name = BRUSH_PRESETS.find(b => b.kind === kind)?.name ?? kind, s = p.style;
  /** a golf course's 1 m grid wears a look's texture, size and angle only (its collars are automatic) */
  const grid = game.golfMode && !!game.courseGrid;
  return (
    <section className="glass tp w-[330px] max-h-[calc(100vh-var(--hud-top,5.75rem)-8.25rem)] overflow-y-auto p-3" data-card="looks" aria-label={`My looks: ${name}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold">{`My looks · ${name}`}</h2>
        <button className="round-btn" aria-label="Close My looks" title="Close (Esc)" onClick={onClose}>×</button>
      </div>
      <div className="flex items-center gap-3">
        <LookDisc kind={kind} tex={s.tex} scale={s.scale} angle={s.angle} tone={grid ? 0 : s.tone} toneAmt={s.toneAmt} tint={s.tint} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-semibold"><SurfaceMark kind={kind} size={20} />{lookName(s.tex)}</div>
          <div className="sub-line mt-0.5 leading-snug">{`${grid ? `Every ${name.toLowerCase()} on your course` : `Every ${name.toLowerCase()} you paint`} wears it; the disc at the pointer shows it. Pick another surface for its look.`}</div>
        </div>
      </div>
      <StyleEditor game={game} grid={grid} />
    </section>
  );
}
