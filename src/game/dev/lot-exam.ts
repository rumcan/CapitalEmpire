// The lot generator's exam in the lot lab (T161, #379; P25 #348 step 6): the fixed 50 lots of lots/lot-exam.ts staged a row at a time on the
// lab's street (the lab lot and the lots beside it, each composed as the game composes it: the frozen preset's base and street items, the yard
// from the model), the camera put on each in turn at one zoom (the same for every lot, so their sizes compare), for scripts/lots/exam.mjs to
// shoot and lay out as a contact sheet. ?lotlab&dev&exam installs it as window.__lotExam. Nothing is saved: the learnt model is added in memory.
import type { Game } from '../engine';
import type { ComposeState, LotGeom } from '../lots/compose-core';
import type { PresetState, Road } from '../lots/presets';
import { addLotModel, lotLayout, lotModelVersion, lotPresets, setLotModel } from '../lots/compose';
import { LATEST } from '../lots/lot-models';
import { examLots, examRows, type ExamLot } from '../lots/lot-exam';
import { ITEM_KINDS, learningStats, modelData, type ItemKind } from '../lots/learn';
import { tasteData } from '../lots/taste';
import { learnedModel, learnedSamples, learnedTaste } from './learn-store';
import { worldX, worldY } from '../iso';
import { LU, LV } from '../lots/town';

/** what the exam asks of the lab */
export interface ExamHost {
  game: Game;
  /** stages a row of lots on one street of a road angle: the middle one as the lab lot, the others beside it along the street (a gap between),
   *  each composed with its state; their geometries in row order */
  stage(road: Road, row: readonly { w: number; d: number; st: ComposeState }[], mid: number): LotGeom[];
  /** holds the camera where the exam puts it (the lab's keep-the-lot-in-view off), and the lab's badges hidden */
  hold(on: boolean): void;
  /** the camera at a zoom, a world point (px) at the free area's centre */
  centre(wx: number, wy: number, z: number): void;
  /** the free area between the lab's panels (viewport px) */
  free(): { L: number; T: number; R: number; B: number };
  /** a world point (tiles) on screen (viewport px) */
  screen(x: number, y: number): { x: number; y: number };
}
/** the version the learnt model is added as (in memory: never shipped) */
const LEARNED_V = 900;
/** a lot's shot: the street in front of it (tiles) and the room over it for its tallest art (a share of its height); the largest shot's size
 *  (viewport px: the zoom of every shot); the verge the lot's outline takes in (tiles) */
const STREET = 5, HEAD = 0.35, CELL = { w: 760, h: 600 }, VERGE = 1.5;
const levelOf = (s: PresetState) => (s === 'upgraded' ? { level: LV.UPGRADED, decline: 0 } : { level: LV.BUILT, decline: s === 'declined' ? 2 : 0 });
/** a lot's shot box at zoom 1 (world px): its corners and its street, the room over it */
function shotBox(g: LotGeom): { x0: number; y0: number; x1: number; y1: number } {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const [k, l] of [[0, 0], [g.w, 0], [g.w, g.d], [0, g.d], [0, -STREET], [g.w, -STREET]] as const) {
    const x = g.o.x + g.u.x * k + g.n.x * l, y = g.o.y + g.u.y * k + g.n.y * l, X = worldX(x, y), Y = worldY(x, y);
    b.x0 = Math.min(b.x0, X); b.y0 = Math.min(b.y0, Y); b.x1 = Math.max(b.x1, X); b.y1 = Math.max(b.y1, Y);
  }
  b.y0 -= HEAD * (b.y1 - b.y0);
  return b;
}

/** the exam (see the file head) */
export function makeExam(host: ExamHost) {
  const lots = examLots(lotPresets()), rows = examRows(lots), geos = new Map<number, LotGeom>(), was = lotModelVersion();
  const st = (l: ExamLot): ComposeState => ({ use: LU.RES, ...levelOf(l.state), seed: 1, preset: l.preset });
  // one zoom for every lot: the largest shot fits the cell; the cell's size at that zoom
  const unit = (l: ExamLot) => shotBox({ o: { x: 0, y: 0 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: l.w, d: l.d });
  const big = lots.map(unit).reduce((a, b) => ({ w: Math.max(a.w, b.x1 - b.x0), h: Math.max(a.h, b.y1 - b.y0) }), { w: 0, h: 0 });
  let z = Math.min(CELL.w / big.w, CELL.h / big.h), label = `v${was}`, street: LotGeom[] = [];
  const clip = () => ({ w: Math.ceil(big.w * z), h: Math.ceil(big.h * z) });
  return {
    /** the lots and the rows they are staged in (lot numbers) */
    lots: () => lots,
    rows: () => rows.map(r => r.map(l => l.i)),
    /** the model the lots compose with: 'learned' (the lab's samples now: the model Ship model would ship), 'shipped' (the latest) or a version
     *  number; its label */
    model(which: string): string {
      if (which === 'learned') {
        addLotModel(LEARNED_V, { ...modelData(learnedModel()), ...tasteData(learnedTaste()) });
        setLotModel(LEARNED_V); label = `learned now (${learnedSamples().length} samples)`;
      } else { setLotModel(which === 'shipped' ? LATEST : Number(which)); label = `v${lotModelVersion()}`; }
      return label;
    },
    /** the measures for the sheet's head (P25): the samples by source, the wizard's keep share (its first and last ten lots), the gallery's share
     *  judged up; the model's label */
    stats() { const s = learningStats(learnedSamples()); return { model: label, latest: LATEST, total: s.total, bySrc: s.bySrc, first: s.first, last: s.last, wizardLots: s.shares.length, judged: s.judged, up: s.up }; },
    /** stages row k (the camera held from now on) */
    stage(k: number): number[] {
      const row = rows[k]; if (!row) return [];
      const gs = host.stage(row[0]!.road, row.map(l => ({ w: l.w, d: l.d, st: st(l) })), Math.floor((row.length - 1) / 2));
      row.forEach((l, j) => geos.set(l.i, gs[j]!));
      host.hold(true);
      return row.map(l => l.i);
    },
    /** the camera on lot i (staged), at the exam's zoom; its shot (viewport px: the lot's own box, so a small lot takes a small shot), the lot's
     *  outline in the shot (its corners and its verge, px from the shot's corner) and the room over it (px: its art stands up into it); null when
     *  it is not staged */
    focus(i: number): { x: number; y: number; w: number; h: number; poly: [number, number][]; up: number } | null {
      const g = geos.get(i); if (!g) return null;
      const b = shotBox(g), a = host.free(), c = clip();
      // a free area smaller than the largest shot: the zoom comes down to fit it
      const fit = Math.min(1, (a.R - a.L - 8) / c.w, (a.B - a.T - 8) / c.h); if (fit < 1) z *= fit;
      host.centre((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, z);
      const w = Math.ceil((b.x1 - b.x0) * z), h = Math.ceil((b.y1 - b.y0) * z), x = Math.round((a.L + a.R) / 2 - w / 2), y = Math.round((a.T + a.B) / 2 - h / 2);
      const poly = ([[0, -VERGE], [g.w, -VERGE], [g.w, g.d], [0, g.d]] as const).map(([k, l]): [number, number] => { const p = host.screen(g.o.x + g.u.x * k + g.n.x * l, g.o.y + g.u.y * k + g.n.y * l); return [Math.round(p.x - x), Math.round(p.y - y)]; });
      return { x, y, w, h, poly, up: Math.round(h * HEAD / (1 + HEAD)) };
    },
    /** what the generator lays on lot i (staged): its items by kind and the partners among them */
    counts(i: number): { kinds: Record<ItemKind, number>; pairs: number; items: number } | null {
      const g = geos.get(i), l = lots.find(q => q.i === i); if (!g || !l) return null;
      const L = lotLayout(g, st(l)) ?? [], kinds = Object.fromEntries(ITEM_KINDS.map(k => [k, 0])) as Record<ItemKind, number>;
      for (const it of L) kinds[it.kind]++;
      return { kinds, pairs: L.filter(it => it.with !== undefined).length, items: L.length };
    },
    /** a row of any lots on a road (dev shots, T154 Phase 2: a street at 45 degrees), staged as the exam's rows are (each lot's st forces its
     *  preset); their geometries, kept for fitStreet */
    street(road: Road, row: readonly { w: number; d: number; st: ComposeState }[]): LotGeom[] {
      street = host.stage(road, row, Math.floor((row.length - 1) / 2)); host.hold(true);
      return street;
    },
    /** the camera over the row street staged (the zoom that fits it in the free area); the row's rectangle on screen (viewport px) */
    fitStreet(): { x: number; y: number; w: number; h: number } | null {
      if (!street.length) return null;
      const b = street.map(shotBox).reduce((p, q) => ({ x0: Math.min(p.x0, q.x0), y0: Math.min(p.y0, q.y0), x1: Math.max(p.x1, q.x1), y1: Math.max(p.y1, q.y1) })), a = host.free();
      const k = Math.min((a.R - a.L - 24) / (b.x1 - b.x0), (a.B - a.T - 24) / (b.y1 - b.y0)), w = Math.ceil((b.x1 - b.x0) * k) + 16, h = Math.ceil((b.y1 - b.y0) * k) + 16;
      host.centre((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, k);
      return { x: Math.round((a.L + a.R - w) / 2), y: Math.round((a.T + a.B - h) / 2), w, h };
    },
    /** the exam done: the camera let go, the model the lab had */
    done(): void { host.hold(false); setLotModel(was); },
  };
}
