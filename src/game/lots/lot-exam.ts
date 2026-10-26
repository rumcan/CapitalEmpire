// The lot generator's exam (T161, #379; P25 #348 step 6): a fixed set of 50 house lots across sizes, the four map-axis road angles (the game
// generates the lots of the axis roads only: a diagonal road's lots draw the owner's presets) and the three states, rendered after each training
// session as a contact sheet (scripts/lots/exam.mjs, through the lot lab's ?exam hook: dev/lot-exam.ts), so progress shows. Each exam lot draws a
// frozen house preset of its state (the game's generated path: its base and street items from the preset, its yard from the model; an approved
// preset of the owner's would draw itself and say nothing of the model), picked so the set runs from the smallest lots to the largest. The same
// presets file gives the same exam. Pure.
import type { LotPreset, PresetState, Road } from './presets';

/** an exam lot: its number, road angle, state, the frozen preset it draws and its size (the preset's own: drawn as laid) */
export interface ExamLot { i: number; road: Road; state: PresetState; preset: string; w: number; d: number }
export const EXAM_N = 50;
/** the road angles (the map axes) and states the exam runs through */
export const EXAM_ROADS: readonly Road[] = [0, 2, 4, 6];
export const EXAM_STATES: readonly PresetState[] = ['built', 'upgraded', 'declined'];
/** a preset the game generates a yard for: a frozen house preset (not the owner's: curated, approved, whole or derived) */
export const examPreset = (p: LotPreset) => p.use === 'res' && !p.curated && !p.approved && !p.whole && !p.derived && p.road === undefined;

/** the exam: lot i in state i mod 3 and road angle (i div 3) mod 4 (every state on every road within 12 lots); the k-th lot of a state draws the
 *  preset at the k-th of its state's quantiles by area (ties by id), so each state runs from small lots to large */
export function examLots(presets: readonly LotPreset[]): ExamLot[] {
  const byState = new Map(EXAM_STATES.map(s => [s, presets.filter(p => examPreset(p) && p.state === s).sort((a, b) => a.w * a.d - b.w * b.d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))] as const));
  const per = new Map(EXAM_STATES.map((s, j) => [s, Math.floor(EXAM_N / 3) + (j < EXAM_N % 3 ? 1 : 0)] as const)), seen = new Map<PresetState, number>(), out: ExamLot[] = [];
  for (let i = 0; i < EXAM_N; i++) {
    const state = EXAM_STATES[i % 3]!, list = byState.get(state)!, k = seen.get(state) ?? 0;
    seen.set(state, k + 1);
    if (!list.length) continue;
    const p = list[Math.min(list.length - 1, Math.floor(((k + 0.5) / per.get(state)!) * list.length))]!;
    out.push({ i, road: EXAM_ROADS[Math.floor(i / 3) % 4]!, state, preset: p.id, w: p.w, d: p.d });
  }
  return out;
}
/** the exam's stagings: its lots by road angle, in order, cut into rows along one street of at most span tiles (each lot w + gap) and max lots */
export function examRows(lots: readonly ExamLot[], span = 150, gap = 3, max = 7): ExamLot[][] {
  const rows: ExamLot[][] = [];
  for (const road of EXAM_ROADS) {
    let row: ExamLot[] = [], len = 0;
    for (const l of lots.filter(q => q.road === road)) {
      if (row.length && (row.length >= max || len + l.w + gap > span)) { rows.push(row); row = []; len = 0; }
      row.push(l); len += l.w + gap;
    }
    if (row.length) rows.push(row);
  }
  return rows;
}
