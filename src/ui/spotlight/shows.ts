// J10 (#1269): what each Show me lights. Every Show me button (the tutorial's, the guide's, the tips', the hint bar's, a hole check's) still does what it did (the
// engine opens the card or the menu, frames the map, arms the tool) and then puts the one spotlight (Spotlight.tsx) on its target: a control by its data-guide
// anchor, the control the engine pulsed, or a place on the map. The requests are built here from the steps' own data (tourShowOf, a step's target.ui, a tip's
// show) so tests/spotlight.test.ts can check that every step and tip with a Show me names a target that resolves. Pure TS, no DOM.
import { tourShowOf } from '../../game/ext/progressive-ui/tour';
import { RANGE_GUIDE, type GuideStep } from '../../game/ext/progressive-ui/guide';
import { JAM } from '../../game/features';
import { JAM_TIPS, type Tip, type TipShow } from '../jam/tips';
import { firstLine, spotShow, tilesAround, type SpotRequest, type SpotTarget, type TileRect } from './spot';

/** the map facts a request needs (Engine has them: spotRangeBox, spotBallsBox, spotRingsBox) */
export interface SpotHost {
  /** the range's front (its shop, car park and tee box), null without a range */
  spotRangeBox(): TileRect | null;
  /** a box round the middle of the balls lying out on the range, null when none lie out */
  spotBallsBox(): TileRect | null;
  /** a box round the rings the Show me just put on the map (the town's first houses, the walking path's ends), null when there are none */
  spotRingsBox(): TileRect | null;
}
/** what showMe needs of the engine on top: the pulse it sets, and the camera framing a map target in the free map */
export interface SpotGame extends SpotHost {
  guideAnchor: { id: string; until: number } | null;
  spotFrame(r: TileRect): void;
}

/** a tutorial step's Show me: the Bank's panel, the range for sale and the card's Buy, the town's first houses, or the control its target names */
export function tourSpot(st: GuideStep, host: SpotHost, jam: boolean = JAM): SpotRequest | null {
  const targets: SpotTarget[] = [];
  for (const a of tourShowOf(st, jam)) {
    if (a.k === 'bank') targets.push({ ui: 'bank-panel' });
    else if (a.k === 'range') { const b = host.spotRangeBox(); if (b) targets.push({ tiles: b }); targets.push({ ui: 'range-sale' }); }
    else if (a.k === 'town') { const b = host.spotRingsBox(); if (b) targets.push({ tiles: b }); }
    else targets.push({ ui: a.ui });
  }
  return targets.length ? { title: st.title, line: firstLine(st.body), targets } : null;
}

/** a guided-build step's Show me: the control the engine pulses (else the step's own), and the walking path's ends for the walking path step */
export function guideSpot(st: GuideStep, host: SpotHost): SpotRequest | null {
  const targets: SpotTarget[] = [];
  if (st.target.map === 'walkway') { const b = host.spotRingsBox(); if (b) targets.push({ tiles: b }); }
  targets.push({ pulse: st.target.ui ?? null });
  return { title: st.title, line: firstLine(st.body), targets };
}

/** a jam tip's Show me: the Build menu, the Bank's panel, or the balls out on the range with the Walk control (before any ball is out: the range card's ball room) */
export function tipSpot(tip: Tip, host: SpotHost): SpotRequest | null {
  if (!tip.show) return null;
  const targets: SpotTarget[] = [];
  if (tip.show === 'build') targets.push({ ui: 'build-menu' });
  else if (tip.show === 'bank') targets.push({ ui: 'bank-panel' });
  else { const b = host.spotBallsBox(); if (b) targets.push({ tiles: b }, { pulse: 'rail-walk' }); else targets.push({ ui: 'range-balls' }); }
  return { title: tip.title, line: firstLine(tip.body), targets };
}

/** a hint bar's Show me (the normal game's ramp hints): the control the engine pulses */
export function hintSpot(h: { title: string; body: string }): SpotRequest { return { title: h.title, line: firstLine(h.body), targets: [{ pulse: null }] }; }

/** a New hole check's Show me: the places it means on the map (tiles), its words as the caption */
export function checkSpot(c: { kind: string; text: string }, pts: readonly { x: number; y: number }[]): SpotRequest | null {
  const b = tilesAround(pts, 10);
  return b ? { title: c.kind === 'block' ? 'This blocks Build' : 'Worth a look', line: firstLine(c.text), targets: [{ tiles: b }] } : null;
}

/** runs a Show me's own act (the engine's: it opens, frames and pulses as it always did), then puts the spotlight on what request() names; a map target is framed
 *  in the free map first (the spotlight follows it as the camera eases there) */
export function showMe(game: Pick<SpotGame, 'guideAnchor' | 'spotFrame'>, act: () => void, request: () => SpotRequest | null): void {
  const base = game.guideAnchor; // (a pulse the act sets is the spotlight's: one older than this is not)
  act();
  const r = request(); if (!r) return;
  for (const t of r.targets) if ('tiles' in t) { game.spotFrame(t.tiles); break; }
  spotShow(r, base);
}

export function showTour(game: SpotGame & { tourShowMe(id: string): void; tourView(): { lines: { step: GuideStep }[] } | null }, id: string, jam: boolean = JAM): void {
  const st = game.tourView()?.lines.find(l => l.step.id === id)?.step;
  showMe(game, () => game.tourShowMe(id), () => (st ? tourSpot(st, game, jam) : null));
}
export function showGuide(game: SpotGame & { guideShowMe(id: string): void }, id: string): void {
  const st = RANGE_GUIDE.find(s => s.id === id);
  showMe(game, () => game.guideShowMe(id), () => (st ? guideSpot(st, game) : null));
}
/** a tip's Show me: act is what the tip did already (acts.ts runTipShow); the spotlight follows it */
export function showTip(game: SpotGame, show: TipShow, act: () => void): void {
  const tip = JAM_TIPS.find(t => t.show === show);
  showMe(game, act, () => (tip ? tipSpot(tip, game) : null));
}
export function showHint(game: SpotGame & { showHint(id: string): void }, h: { id: string; title: string; body: string }): void {
  showMe(game, () => game.showHint(h.id), () => hintSpot(h));
}
export function showCheck(game: SpotGame, act: () => void, c: { kind: string; text: string }, pts: readonly { x: number; y: number }[]): void {
  showMe(game, act, () => checkSpot(c, pts));
}
