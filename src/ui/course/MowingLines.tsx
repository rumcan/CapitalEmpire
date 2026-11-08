// T359 (#1006, part 3; the owner, 2026-11-08: "I see no way to edit the mowing lines over the fairway. they used to be editable."): the Mowing
// lines section of a surface's panel (SurfaceFocus): the fairway's light and dark bands, the green's fine stripes, and the tee's and the rough's
// where you turn them on. On or off; the pattern (along the hole, today's look; straight at an angle; a checkerboard; a diamond); the band's width;
// how light the light bands and how dark the dark ones are (the texture made lighter or darker: never a colour wash, the owner's rule); the angle.
// It edits the look in hand, so it follows This hole / Course default above it, Apply to all holes copies it, and every change is an undo step
// (a slider's drag one). A look that sets none lays the course finish's own lines (course-finish.ts), exactly as before.
import type { Game } from '../../game/engine';
import type { BrushKind } from '../../game/paint';
import { finishOf, mowShown } from '../../game/course-finish';
import { paintedSurfaces } from '../../game/painted-surfaces-live';
import { MOW_KINDS, MOW_PATTERNS, MOW_RANGES, type MowKind, type MowOpts } from '../../game/mow-lines';

/** whether a surface has mowing lines to edit */
export const hasMowing = (kind: BrushKind): kind is MowKind => (MOW_KINDS as readonly string[]).includes(kind);

/** a slider row: its label, the slider, its value in words */
function Row({ label, title, children, value, testId }: { label: string; title: string; children: React.ReactNode; value: string; testId: string }) {
  return (
    <div className="mt-1 flex items-center gap-2 text-[12px] text-slate-400" title={title}>
      <span className="w-[4.5rem] shrink-0">{label}</span>
      {children}
      <span className="w-14 text-right text-xs text-slate-200" data-testid={testId}>{value}</span>
    </div>
  );
}

export function MowingLines({ game, kind }: { game: Game; kind: MowKind }) {
  const p = game.paint, o = p.style.mow, v = mowShown(kind, o, finishOf(paintedSurfaces())), name = kind === 'green' ? 'stripes' : 'bands', turned = v.pattern !== 'along';
  // (the look in hand takes the change: this hole's, or the Course default's: p.setStyle)
  const set = (c: Partial<MowOpts>) => p.setStyle({ mow: { ...o, ...c } });
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <div className="mt-3" role="group" aria-label="Mowing lines" data-mowing={kind} data-mow-on={v.on ? 'on' : 'off'} data-mow-pattern={v.pattern}>
      <div className="flex flex-wrap items-center gap-1.5">
        <h4 className="sub-head mr-auto">Mowing lines</h4>
        <button className={`chip ${v.on ? 'chip-on' : ''}`} aria-pressed={v.on} title={`The ${kind === 'green' ? 'fine stripes' : 'light and dark bands'} the ${kind} is mown in`} onClick={() => { if (!v.on) set({ on: true }); }} data-mow="on">On</button>
        <button className={`chip ${!v.on ? 'chip-on' : ''}`} aria-pressed={!v.on} title={`Mown plain: no lines over the ${kind}`} onClick={() => { if (v.on) set({ on: false }); }} data-mow="off">Off</button>
      </div>
      {v.on ? (<>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Mowing pattern">
          {MOW_PATTERNS.map(q => <button key={q.id} className={`chip ${v.pattern === q.id ? 'chip-on' : ''}`} aria-pressed={v.pattern === q.id} title={q.note} onClick={() => set({ pattern: q.id })} data-mow-pattern-chip={q.id}>{q.name}</button>)}
        </div>
        <Row label="Band width" title={`How wide one ${kind === 'green' ? 'stripe' : 'band'} is: ${MOW_RANGES.width[0] * 2} to ${MOW_RANGES.width[1] * 2} m`} value={`${Math.round(v.width * 20) / 10} m`} testId="mow-width">
          <input type="range" aria-label="Mowing band width" min={MOW_RANGES.width[0] * 2} max={MOW_RANGES.width[1] * 2} step={0.5} value={Math.round(v.width * 4) / 2} onChange={e => set({ width: +e.target.value / 2 })} className="min-w-0 flex-1" />
        </Row>
        <div className="mt-1 text-[12px] text-slate-400" title={`Contrast: the texture made lighter in the light ${name} and darker in the dark ones, keeping its detail and colour: never a flat wash`}>Contrast</div>
        <Row label="Light" title={`How much lighter the light ${name} are: none, up to the full lift`} value={pct(v.light)} testId="mow-light">
          <input type="range" aria-label="Light bands" min={0} max={100} step={1} value={Math.round(v.light * 100)} onChange={e => set({ light: +e.target.value / 100 })} className="min-w-0 flex-1" />
        </Row>
        <Row label="Dark" title={`How much darker the dark ${name} are: none, up to the full multiply`} value={pct(v.dark)} testId="mow-dark">
          <input type="range" aria-label="Dark bands" min={0} max={100} step={1} value={Math.round(v.dark * 100)} onChange={e => set({ dark: +e.target.value / 100 })} className="min-w-0 flex-1" />
        </Row>
        <Row label="Angle" title={v.pattern === 'straight' ? 'The way the lines run, in degrees on the ground (like a texture\'s angle)' : turned ? 'How far the squares are turned from the hole\'s line of play' : 'Along the hole the lines follow its line of play: pick Straight, Checkerboard or Diamond to set an angle'} value={turned ? `${v.angle}°` : 'follows'} testId="mow-angle">
          <input type="range" aria-label="Mowing angle" disabled={!turned} min={MOW_RANGES.angle[0]} max={MOW_RANGES.angle[1]} step={5} value={v.angle} onChange={e => set({ angle: +e.target.value })} className="min-w-0 flex-1" />
        </Row>
        {o && <button className="chip mt-1.5" title="Back to the course finish's own lines (the Studio's Course finish)" onClick={() => p.setStyle({ mow: undefined })} data-mow="reset">Reset the mowing lines</button>}
      </>) : <div className="sub-line mt-1">{`The ${kind} is mown plain.`}</div>}
    </div>
  );
}
