// The lot generator's exam (T161, #379; P25 #348 step 6): a fixed set of 50 house lots across sizes, the four map-axis road angles (the game
// generates the lots of the axis roads only: a diagonal road's lots draw the owner's presets) and the three states, rendered after each training
// session as a contact sheet (scripts/lots/exam.mjs, through the lot lab's ?exam hook: dev/lot-exam.ts), so progress shows. Each exam lot draws a
// frozen house preset of its state (the game's generated path: its base and street items from the preset, its yard from the model; an approved
// preset of the owner's would draw itself and say nothing of the model), picked so the set runs from the smallest lots to the largest. The same
// presets file gives the same exam. Pure.
import type { LotPreset, PresetState, PresetUse, Road } from './presets';
import { groupOf, type UseGroup } from './learn';

/** an exam lot: its number, road angle, state, the frozen preset it draws, its size (the preset's own: drawn as laid), and (T169) its use and use
 *  group (the houses' lots have none: res) */
export interface ExamLot { i: number; road: Road; state: PresetState; preset: string; w: number; d: number; use?: PresetUse; group?: UseGroup }
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
  return [...out, ...groupExamLots(presets)];
}
/** T169: the other use groups' lots in the exam, GROUP_N of each (a row each of built, upgraded and decrepit lots), numbered on from the houses'
 *  50: lot k of a group in state k mod 3 on road (k div 3) mod 4, drawing the frozen preset of its group (the open uses taken in turn: car parks,
 *  civic, tour) at the k-th of its state's quantiles by area */
export const GROUP_N = 12, EXAM_GROUPS: readonly UseGroup[] = ['com', 'ind', 'open'];
const OPEN_USES: readonly PresetUse[] = ['park', 'civic', 'tour'];
/** a frozen preset of any use the game generates (T169): not the owner's, not a farm */
export const examGroupPreset = (p: LotPreset) => p.use !== 'farm' && p.use !== 'res' && !p.curated && !p.approved && !p.whole && !p.derived && p.road === undefined;
function groupExamLots(presets: readonly LotPreset[]): ExamLot[] {
  const out: ExamLot[] = [];
  EXAM_GROUPS.forEach((g, gi) => {
    for (let k = 0; k < GROUP_N; k++) {
      const state = EXAM_STATES[k % 3]!, use = g === 'open' ? OPEN_USES[Math.floor(k / 3) % 3]! : (g as PresetUse);
      const list = presets.filter(p => examGroupPreset(p) && p.use === use && groupOf(p.use) === g && p.state === state).sort((a, b) => a.w * a.d - b.w * b.d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      if (!list.length) continue;
      const q = Math.floor(k / 3), p = list[Math.min(list.length - 1, Math.floor(((q + 0.5) / (GROUP_N / 3)) * list.length))]!;
      out.push({ i: EXAM_N + gi * GROUP_N + k, road: EXAM_ROADS[q % 4]!, state, preset: p.id, w: p.w, d: p.d, use, group: g });
    }
  });
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
