// T271 (#812; the owner, 2026-10-29: "I would like to be able to create my own grass preset. option 9 should be create your own under shape by
// hand"): the grass editor, a card beside the Holes panel (as My looks is): Create your own (swatch 9, key 9) opens it on a new grass, a grass's
// Edit on that one. Its name; what it plays as (the ball's lie and how fast it grows in); its texture, any painted grass family, each shown as
// the puck it would make; its scale and Exposure (the texture made darker or lighter: never a tint, the owner's rule); mowing stripes for a
// fairway-like grass; and its Edges (Border: a first cut band round it, Round off, Shadow). A new grass is made with Create (one undo step) and
// put in hand; an edit of a made one applies as it changes (its cells drawn again). Delete asks first: its cells keep how they play.
import { useState } from 'react';
import type { Game } from '../../game/engine';
import { GRASS_FAMILIES, GRASS_NAME_MAX, GRASS_PLAYS, PLAY_LENGTH, isGrassFamily, stripesOk, type CustomGrass } from '../../game/golf/grasses';
import { MENU_OPTIONS, withOwn } from '../../PaintPanel';
import { TexPuck, TexturePicker, type TextureOption } from '../TexturePicker';
import { addOwnTexture } from '../../game/ext/bunker-look/uploads';
import { paintedUrl } from '../../game/painted-grass-art';
import { resolveFamily } from '../../game/painted-families';
import { tiledFamily } from '../../game/painted-tiles';
import { BORDER_MAX_M } from '../../game/ext/course-grid/patch';
import { exposureOf, toneOfExposure } from '../../game/exposure';
import { ExposureRow } from '../../PaintPanel';
import { borderLabel, courseBorderAt, courseBorderPos, lengthLabel, shadowLabel, smoothLabel, BORDER_STEPS } from './CourseEdges';
import { grassPuckImage, useSwatchPucks } from './swatch-puck';
import { SurfaceMark } from './SurfaceMark';
import { GRASS_KIND } from '../../game/golf/grasses';

/** a puck image, or the surface's marked disc where there is none (plain node, a picture still loading) */
function Puck({ game, g, css }: { game: Game; g: CustomGrass; css: number }) {
  const pk = grassPuckImage(game, g, css);
  return pk ? <img src={pk.url} width={pk.w} height={pk.h} alt="" draggable={false} /> : <SurfaceMark kind={GRASS_KIND[g.plays]} size={Math.round(css * 0.9)} />;
}

/** a painted grass family's picture (its finest painting, a tile set's first near tile), or '' */
function familyPic(id: string): string {
  const fam = resolveFamily({ family: id, version: null, scale: 1 }); if (!fam) return '';
  const tf = fam.tiled ? tiledFamily(id) : undefined;
  return (tf ? paintedUrl(tf.levels.near.tiles[0]?.file ?? '') : paintedUrl(fam.near.file)) ?? '';
}
/** every texture a grass of your own may wear: the painted grasses first, then the texture presets (the owner's new pictures among them),
 *  then the player's uploads */
export function grassTextureOptions(): TextureOption[] {
  return withOwn([...GRASS_FAMILIES.map(f => ({ id: f.id, name: f.name, col: '#4f6b2a', pic: familyPic(f.id) })), ...MENU_OPTIONS]);
}

/** the grass editor's card (Esc or × closes it; a new grass not made is dropped) */
export function GrassCard({ game, onClose }: { game: Game; onClose: () => void }) {
  const p = game.paint, d = p.grassDraft;
  const [ask, setAsk] = useState(false);
  useSwatchPucks();
  if (!d) return null;
  const made = d.k > 0, set = (q: Partial<Omit<CustomGrass, 'k'>>) => p.editGrass(q), x = exposureOf(d.tone, d.toneAmt), play = GRASS_PLAYS.find(q => q.play === d.plays)!;
  const plain = d.plays === 'firstCut' ? 'rough' : play.name.toLowerCase();
  return (
    <section className="glass tp w-[330px] max-h-[calc(var(--vh-ui,100vh)-var(--hud-top,5.75rem)-8.25rem)] overflow-y-auto overflow-x-hidden p-3" data-card="grass" aria-label={made ? `Your grass: ${d.name}` : 'Create your own grass'}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold">{made ? `Your grass · ${d.name}` : 'Create your own'}</h2>
        <button className="round-btn" aria-label="Close the grass editor" title="Close (Esc)" onClick={onClose}>×</button>
      </div>
      <div className="flex items-center gap-3" data-testid="grass-preview">
        <span className="grid h-[64px] w-[84px] shrink-0 place-items-center">{isGrassFamily(d.family) ? <Puck game={game} g={d} css={72} /> : <TexPuck t={grassTextureOptions().find(o => o.id === d.family) ?? null} css={72} />}</span>
        <div className="min-w-0">
          <label className="block text-[12px] text-slate-400" htmlFor="grass-name">Name</label>
          <input id="grass-name" className="mt-0.5 w-full rounded-md border border-white/15 bg-black/30 px-2 py-1 text-[13px] text-slate-100" maxLength={GRASS_NAME_MAX} value={d.name} onChange={e => set({ name: e.target.value })} data-testid="grass-name" />
          <div className="sub-line mt-1 leading-snug">{made ? `Every cell of ${d.name} on the course wears it at once.` : 'Create puts it in hand: paint it like any surface.'}</div>
        </div>
      </div>

      <h4 className="sub-head mt-3">Plays as</h4>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Plays as" data-plays={d.plays}>
        {GRASS_PLAYS.map(q => <button key={q.play} className={`chip ${d.plays === q.play ? 'chip-on' : ''}`} aria-pressed={d.plays === q.play} title={q.note} onClick={() => set({ plays: q.play, ...(stripesOk(q.play) ? {} : { stripes: false }) })}>{q.name}</button>)}
      </div>
      <div className="sub-line mt-1">{`The ball lies as on the ${play.name.toLowerCase()}: ${play.note}.`}</div>

      {/* Main texture first, then the Border (the owner, 2026-10-31: "Main first and then Border") */}
      <h4 className="sub-head mt-3">Main texture</h4>
      <TexturePicker label="Texture" testId="grass" value={d.family} options={grassTextureOptions()} onUpload={addOwnTexture} onPick={id => id && set({ family: id })}
        edits={[{ id: 'scale', label: `Scale ${Math.round(d.scale * 100)}%`, panel: (
            <div className="flex items-center gap-1">
              <button className="btn" onClick={() => set({ scale: d.scale / 1.25 })}>−</button>
              <span className="w-12 text-center text-xs text-slate-200" data-testid="grass-scale">{`${Math.round(d.scale * 100)}%`}</span>
              <button className="btn" onClick={() => set({ scale: d.scale * 1.25 })}>+</button>
              <button className="btn" onClick={() => set({ scale: 1 })}>Reset</button>
            </div>) },
          // a painted grass is never turned (its light stays at the upper right); any other texture turns
          ...(!isGrassFamily(d.family) ? [{ id: 'angle', label: `Angle ${Math.round(d.angle ?? 0)}°`, panel: (
            <div className="flex items-center gap-2">
              <input type="range" aria-label="Angle" min={-90} max={90} step={5} value={d.angle ?? 0} onChange={e => set({ angle: +e.target.value })} className="flex-1" />
              <span className="w-10 text-right text-xs text-slate-200">{`${Math.round(d.angle ?? 0)}°`}</span>
            </div>) }] : [])]} />
      <ExposureRow label="Exposure" f={x} set={f => set(toneOfExposure(f))} title="The texture itself made darker or lighter, keeping its detail and colour: the middle is none, the ends one stop darker or lighter (double-click: none)" />
      <label className={`mt-2 flex items-center gap-2 text-[12px] ${stripesOk(d.plays) ? 'text-slate-300' : 'text-slate-600'}`} title={stripesOk(d.plays) ? 'Mowing stripes along each hole\'s line, as the fairway has' : 'Only a fairway or a first cut is mown in stripes'}>
        <input type="checkbox" aria-label="Mowing stripes" disabled={!stripesOk(d.plays)} checked={d.stripes && stripesOk(d.plays)} onChange={e => set({ stripes: e.target.checked })} data-testid="grass-stripes" />
        <span>{stripesOk(d.plays) ? 'Mowing stripes' : 'Mowing stripes (fairway and first cut only)'}</span>
      </label>

      <div className="mt-2 flex items-center gap-2 text-[12px] text-slate-400" title="How long it is cut, 1 (a green) to 5 (fescue): a longer grass beside it shades it from the right, a shorter one it shades">
        <span className="w-12 shrink-0">Length</span>
        <input type="range" aria-label="Length" min={1} max={5} step={1} value={d.length ?? PLAY_LENGTH[d.plays]} onChange={e => set({ length: +e.target.value })} className="min-w-0 flex-1" />
        <span className="w-16 text-right text-xs text-slate-200" data-length={d.length ?? PLAY_LENGTH[d.plays]}>{lengthLabel(d.length ?? PLAY_LENGTH[d.plays])}</span>
      </div>
      <h4 className="sub-head mt-3">Border</h4>
      <div className="flex items-center gap-2 text-[12px] text-slate-400" title={`A first cut band round it: none, a hairline, up to ${BORDER_MAX_M} m`}>
        <span className="w-12 shrink-0">Border</span>
        <input type="range" aria-label="Border: a first cut band round it" min={0} max={BORDER_STEPS} step={1} value={courseBorderPos(d.border)} onChange={e => set({ border: courseBorderAt(+e.target.value) })} className="min-w-0 flex-1" />
        <span className="w-16 text-right text-xs text-slate-200" data-border={d.border > 0 ? 'on' : 'none'}>{d.border > 0 ? borderLabel(d.border) : 'none'}</span>
      </div>
      {/* the band's own texture, scale, angle and exposure (the owner, 2026-10-31: "you cant set a border in the create your own section");
          None: the course's first cut */}
      {d.border > 0 && (<>
        <TexturePicker label="Border texture" testId="grass-border" value={d.btex} none="The course's first cut" options={grassTextureOptions()} onUpload={addOwnTexture}
          onPick={id => set(id ? { btex: id } : { btex: undefined, bscale: undefined, bangle: undefined, btone: undefined, btoneAmt: undefined })}
          edits={d.btex ? [{ id: 'scale', label: `Scale ${Math.round((d.bscale ?? 1) * 100)}%`, panel: (
              <div className="flex items-center gap-1">
                <button className="btn" onClick={() => set({ bscale: (d.bscale ?? 1) / 1.25 })}>−</button>
                <span className="w-12 text-center text-xs text-slate-200">{`${Math.round((d.bscale ?? 1) * 100)}%`}</span>
                <button className="btn" onClick={() => set({ bscale: (d.bscale ?? 1) * 1.25 })}>+</button>
                <button className="btn" onClick={() => set({ bscale: 1 })}>Reset</button>
              </div>) },
            ...(!isGrassFamily(d.btex) ? [{ id: 'angle', label: `Angle ${Math.round(d.bangle ?? 0)}°`, panel: (
              <div className="flex items-center gap-2">
                <input type="range" aria-label="Border angle" min={-90} max={90} step={5} value={d.bangle ?? 0} onChange={e => set({ bangle: +e.target.value })} className="flex-1" />
                <span className="w-10 text-right text-xs text-slate-200">{`${Math.round(d.bangle ?? 0)}°`}</span>
              </div>) }] : [])] : []} />
        {d.btex && <ExposureRow label="Border exposure" f={exposureOf(d.btone ?? 0, d.btoneAmt ?? 0.35)} set={f => { const t = toneOfExposure(f); set({ btone: t.tone, btoneAmt: t.toneAmt }); }} title="The border's texture itself made darker or lighter: the middle is none, the ends one stop darker or lighter (double-click: none)" />}
      </>)}
      <label className="mt-1 flex items-center gap-2 text-[12px] text-slate-300" data-round={d.round ? 'on' : 'off'} title="Round off: its stepped 1 m outline becomes a smooth curve, its corners rounded">
        <input type="checkbox" aria-label="Round off" checked={d.round} onChange={e => set({ round: e.target.checked })} />
        <span>Round off</span>
      </label>
      <div className={`mt-1 flex items-center gap-2 text-[12px] ${d.round ? 'text-slate-400' : 'text-slate-600'}`} title="Smoothness: how far the outline is smoothed">
        <span className="w-[4.5rem] shrink-0">Smoothness</span>
        <input type="range" aria-label="Smoothness" min={0} max={100} step={1} disabled={!d.round} value={Math.round(d.smooth * 100)} onChange={e => set({ smooth: +e.target.value / 100 })} className="min-w-0 flex-1" />
        <span className="w-20 whitespace-nowrap text-right text-xs text-slate-200">{d.round ? smoothLabel(d.smooth) : 'off'}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[12px] text-slate-400" title="The shadow of its edge where it stands above the grass round it: none, a hairline, up to strong">
        <span className="w-12 shrink-0">Shadow</span>
        <input type="range" aria-label="Shadow" min={0} max={100} step={1} value={Math.round(d.shadow * 100)} onChange={e => set({ shadow: +e.target.value / 100 })} className="min-w-0 flex-1" />
        <span className="w-16 text-right text-xs text-slate-200">{shadowLabel(d.shadow)}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {made ? (<>
          <button className="chip chip-on" onClick={onClose} data-testid="grass-done">Done</button>
          {ask ? (<>
            <span className="text-[12px] text-rose-300">{`Delete ${d.name}? Its cells become plain ${plain}.`}</span>
            <button className="chip" data-testid="grass-delete-yes" onClick={() => { p.deleteGrass(d.k); setAsk(false); onClose(); }}>Delete</button>
            <button className="chip" onClick={() => setAsk(false)}>Keep</button>
          </>) : <button className="chip" data-testid="grass-delete" title={`Delete ${d.name}: its cells keep how they play, in the ${plain}'s own look (Undo brings it back)`} onClick={() => setAsk(true)}>Delete</button>}
        </>) : (<>
          <button className="pill-gold px-3 py-1" data-testid="grass-create" onClick={() => p.createGrass()}>Create and paint</button>
          <button className="chip" onClick={onClose}>Cancel</button>
        </>)}
      </div>
    </section>
  );
}
