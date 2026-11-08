// How well a real course is mapped, and so what the game can build from it (T358, #1003): the quality grade the preview shows before the player imports.
//   Full         9 or 18 numbered hole lines (one course of the boundary): the holes are the map's own.
//   Partial      the holes are worked out from the fairways, greens and tees (no hole lines: Wingate Park's case), or only some of the holes are numbered: a
//                playable course with fewer or guessed holes.
//   Outline only nothing to build holes from (a boundary, a stream: Bloemfontein's case): the game cannot build it, and says so.
// The grade is read off the course JSON and the spec the converter made of it (convert.ts), so it can never disagree with what "Build this course" builds.
// Pure TypeScript, no DOM.
import { osmFits } from './start';
import type { JFeature, OsmCourseJson, OsmCourseSpec } from './types';

export type Grade = 'full' | 'partial' | 'outline';

export interface CourseReport {
  grade: Grade;
  /** the grade's name for the card */ label: string;
  /** one plain sentence for the card: what the grade means for this course */ summary: string;
  /** the holes the game would build, and their par as the game works it out, as mapped, and the playing length, m */ holes: number; par: number; mappedPar: number; lengthM: number;
  /** what the map holds: hole lines (all courses), numbered hole lines of the course built, greens, bunkers, pins, tees, fairways, water areas and waterways */
  counts: { holeLines: number; numbered: number; greens: number; bunkers: number; pins: number; tees: number; fairways: number; water: number };
  /** the extent of the course's holes, features and boundary, m, at true size */ landM: [number, number];
  /** the percent the course is scaled to fit the 2 km map (100: true size; 0 with no holes), and whether it can be built on the map (not under MIN_SCALE) */ scalePct: number; fits: boolean;
  /** what the converter made up (greens, tees, fairways, pins, par), as sentences and as the one line for the card ("3 pins at their greens' middles, 3 pars worked out from the lengths"), and its warnings */
  madeUp: string[]; madeUpLine: string; warnings: string[];
}

/** a course that would have to shrink below this to fit the 2 km map is not built (its holes would be under a third of their real length) */
export const MIN_SCALE = 0.3;
const GRADE_LABEL: Record<Grade, string> = { full: 'Full', partial: 'Partial', outline: 'Outline only' };
/** the number of hole lines of the course built that carry a hole number 1..18 (distinct numbers) */
function numberedLines(json: OsmCourseJson, course: string | null): { all: number; numbered: number } {
  const lines = (json.features.hole ?? []).filter((f: JFeature) => f.line && f.line.length >= 2);
  const nameOf = (f: JFeature): string => (f.tags?.['golf:course:name'] ?? f.tags?.['course:name'] ?? '').trim();
  const mine = lines.filter(f => nameOf(f) === (course ?? ''));
  const refs = new Set<number>();
  for (const f of mine) { const r = f.ref ?? (f.tags?.ref && /^\s*\d+\s*$/.test(f.tags.ref) ? parseInt(f.tags.ref, 10) : null); if (r !== null && r !== undefined && r >= 1 && r <= 18) refs.add(r); }
  return { all: lines.length, numbered: refs.size };
}

/** what the converter made up, counted by what it is, in one line for the card ("" when it made up nothing) */
export function madeUpLine(fills: readonly { code: string }[]): string {
  const n: Record<string, number> = {};
  for (const f of fills) n[f.code] = (n[f.code] ?? 0) + 1;
  const parts: string[] = [], add = (code: string, one: string, many: string) => { const c = n[code]; if (c) parts.push(`${c} ${c === 1 ? one : many}`); };
  add('green', 'green', 'greens'); add('tee', 'tee', 'tees'); add('fairway', 'fairway band', 'fairway bands');
  add('pin', "pin at its green's middle", "pins at their greens' middles"); add('pin-moved', 'pin moved onto its green', 'pins moved onto their greens');
  add('par', 'par worked out from the length', 'pars worked out from the lengths'); add('tee-dropped', 'tee set left as plain ground', 'tee sets left as plain ground');
  add('stream-hidden', 'underground stream not drawn', 'underground streams not drawn');
  return parts.join(', ');
}

/** the extent of the holes' features and the boundary of the JSON, m (width, height; 0 x 0 with none) */
export function extentOf(json: OsmCourseJson): [number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const see = (p: readonly [number, number]) => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; };
  const feat = (f: JFeature) => { if (f.pos) see(f.pos); for (const p of f.line ?? []) see(p); for (const q of f.polys ?? []) for (const p of q.outer) see(p); };
  if (json.boundary) feat(json.boundary);
  for (const k of ['tee', 'fairway', 'green', 'bunker', 'water_hazard', 'lateral_water_hazard', 'hole', 'pin']) for (const f of json.features[k] ?? []) feat(f);
  return x0 <= x1 ? [Math.round(x1 - x0), Math.round(y1 - y0)] : [0, 0];
}

/** the quality report of a course: its JSON and the spec the converter (via `specOf`: at true size, or scaled to fit the map) built from it */
export function reportOf(json: OsmCourseJson, spec: OsmCourseSpec): CourseReport {
  const F = json.features, n = spec.holes.length, { all, numbered } = numberedLines(json, spec.course);
  const grade: Grade = n === 0 ? 'outline' : !spec.derived && numbered === n && (n === 9 || n === 18) ? 'full' : 'partial';
  const c = { holeLines: all, numbered, greens: F.green?.length ?? 0, bunkers: F.bunker?.length ?? 0, pins: F.pin?.length ?? 0, tees: F.tee?.length ?? 0, fairways: F.fairway?.length ?? 0,
    water: (F.water?.length ?? 0) + (F.water_hazard?.length ?? 0) + (F.lateral_water_hazard?.length ?? 0) + (F.waterway?.length ?? 0) };
  let summary: string;
  if (grade === 'full') summary = `${n} numbered hole lines are mapped: the holes, their tees, greens and pins come from the map.`;
  else if (grade === 'outline') {
    const has = [c.tees && `${c.tees} tees`, c.greens && `${c.greens} greens`, c.fairways && `${c.fairways} fairways`, c.bunkers && `${c.bunkers} bunkers`].filter(Boolean).join(', ');
    summary = `This course is only an outline on the map${has ? ` (${has}, but no holes to build)` : ': no hole lines, fairways, greens or tees'}. The game cannot build it.`;
  } else if (spec.derived) summary = `The map has no hole lines. ${n} hole${n === 1 ? '' : 's'} could be worked out from its fairways, greens and tees: a guess, and ${n === 1 ? 'only one hole' : `only ${n} holes`}.`;
  else summary = `Only ${numbered} of the course's holes are numbered on the map: ${n} hole${n === 1 ? '' : 's'} built, a shorter course than the real one.`;
  const fits = n > 0 && osmFits(spec) && spec.scale >= MIN_SCALE;
  return {
    grade, label: GRADE_LABEL[grade], summary, holes: n, par: spec.gameParTotal, mappedPar: spec.parTotal, lengthM: spec.lengthM, counts: c,
    landM: extentOf(json), scalePct: n > 0 ? Math.round(spec.scale * 100) : 0, fits,
    madeUp: spec.fills.map(f => f.text), madeUpLine: madeUpLine(spec.fills), warnings: spec.warnings.map(w => w.text),
  };
}
