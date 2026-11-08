// The map-data course converter (T340 stage 2, #967; docs/OSM-COURSES.md): the stage-1 JSON of a real course (scripts/dev/osm-course.mjs: its tees,
// greens, fairways, bunkers, water, hole lines and pins, metres, x east and y north of the course centre) becomes a course spec for the game: tiles
// of 2 m, x east and y south of the land's north-west corner, the surfaces in paint order with the hole each belongs to, and the holes in order with
// their tee markers, pin, aim points and par. What the map lacks it makes up (and lists): a green where a hole line ends on none, a tee where it
// starts on none, a fairway band on a par 4 or 5 with none, a pin at a green's middle, par from length. Holes closer than the 60 m corridor
// guideline, double greens and the like are warnings, never a refusal. Pure TypeScript, no network, no DOM, deterministic: the same JSON gives the
// same spec.
import { deriveHoles, parFromLength } from '../holes';
import { TILE_M, type AimPoint, type Pin, type TeeKind, type TeeMark } from '../types';
import {
  bandRings, bendDeg, boxOf, boxesMeet, circleRing, distToLine, distToPoly, inPoly, interiorPoint, lineLen, polyArea, sampleLine, sliceLine,
  type Box, type P, type Poly,
} from './geom';
import {
  OSM_CREDIT, OSM_LICENCE, type JFeature, type OsmCourseJson, type OsmCourseSpec, type SpecArea, type SpecHole, type SpecNote, type SpecSurface, type SpecTee, type TPt,
} from './types';

/** a tee polygon within this of a hole line's start belongs to that hole's tee, m */
const TEE_REACH = 25;
/** a tee polygon this near a hole's start is a tee set of the hole (it gets a marker); farther ones up to TEE_FAR are plain tee ground of the hole, m */
const TEE_SETS = 40, TEE_FAR = 80;
/** a green within this of a hole line's end is the hole's green, m */
const GREEN_REACH = 25;
/** a pin within this of the hole's green (or of the line's end when the green is made up) is its pin, m */
const PIN_REACH = 12;
/** bunkers and water belong to the hole line nearest to them within this, m */
const NEAR_HOLE = 90;
/** a vertex of a hole line is an aim point when the line bends by more than this, degrees; aim points are at least AIM_GAP apart and at most AIM_MAX per hole */
const AIM_BEND = 10, AIM_GAP = 25, AIM_MAX = 4;
/** the land is the holes' features and this margin, m */
const MARGIN = 40;
/** a made-up green's area, m2; a made-up tee's length and width, m; a made-up fairway band's half width, m, and what it keeps clear at each end, m */
const GREEN_AREA = 400, TEE_LEN = 14, TEE_WID = 8, BAND_HALF = 14, BAND_TEE_CLEAR = 35, BAND_GREEN_CLEAR = 16;
/** a par 4 or 5 whose line runs over fairway for less than this share has none (the fairway band is made up) */
const FAIRWAY_SHARE = 0.25;
/** how often the lines are sampled for the fairway tests, m */
const SAMPLE = 6;
/** the widest a waterway gets drawn by default, m, by its OSM `waterway` value (a `width` tag wins) */
const STREAM_WIDTH: Record<string, number> = { river: 6, canal: 5, stream: 3, ditch: 2, drain: 2, brook: 3 };

/** what to build */
export interface ConvertOptions {
  /** the id the spec carries (the fixture's name) */ id?: string;
  /** the name the game shows (the JSON's own course name when absent) */ name?: string;
  /** the place line for the card ("Cape Town, South Africa") */ place?: string;
  /** the course to build when the boundary holds several: its golf:course:name / course:name value (default: the one with holes 1..18) */ course?: string;
  /** the land's margin round the holes' features, m (default 40) */ marginM?: number;
}

/** a polygon of the JSON as the converter works with it */
interface Area { poly: Poly; box: Box; c: P; tags: Record<string, string>; f: JFeature }
/** a hole line of the JSON, whichever course it belongs to */
interface Line { pts: P[]; ref: number | null; par: number | null; handicap: number | null; course: string; sel: number }
/** a hole being built */
interface Work {
  n: number; line: P[]; l: Line; green: Area | null; greenMade: Area | null; teeMade: Area | null; pin: P; tees: { a: Area; d: number }[];
  aims: P[]; markers: { kind: TeeKind; p: P }[]; bandRings: P[][] | null; made: string[];
}

const num = (s: string | undefined): number | null => { const v = s === undefined ? NaN : parseInt(s, 10); return Number.isFinite(v) ? v : null; };
const dist = (a: P, b: P): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cname = (t: Record<string, string> | undefined): string => (t?.['golf:course:name'] ?? t?.['course:name'] ?? '').trim();
/** the tee set a colour or name stands for (the OSM `tee` tag, else `colour`): back = the blue/championship, middle = white, senior = yellow, forward = red */
const KIND_OF: Record<string, TeeKind> = {
  championship: 'back', black: 'back', blue: 'back', back: 'back', tournament: 'back', pro: 'back',
  white: 'middle', middle: 'middle', men: 'middle', mens: 'middle', regular: 'middle',
  yellow: 'senior', gold: 'senior', senior: 'senior', seniors: 'senior',
  red: 'forward', forward: 'forward', ladies: 'forward', women: 'forward', orange: 'forward',
};
const kindOfTags = (t: Record<string, string>): TeeKind | null => KIND_OF[(t.tee ?? t.colour ?? t['tee:colour'] ?? '').toLowerCase()] ?? null;
const TEE_ORDER: TeeKind[] = ['back', 'middle', 'senior', 'forward'];

/** a JSON polygon feature as areas (one per part) */
function areasOf(list: JFeature[] | undefined): Area[] {
  const out: Area[] = [];
  for (const f of list ?? []) for (const p of f.polys ?? []) {
    if (!p.outer || p.outer.length < 3) continue;
    const poly: Poly = { outer: p.outer, inner: (p.inner ?? []).filter(r => r.length >= 3) }, box = boxOf(poly.outer);
    if (box) out.push({ poly, box, c: interiorPoint(poly), tags: f.tags ?? {}, f });
  }
  return out;
}

/** the playing length through a tee marker, aim points and pin, m (golf/holes.ts: metres, whole) */
const playLen = (tee: P, aims: P[], pin: P): number => Math.round(lineLen([tee, ...aims, pin]));

/** converts the JSON of a real course into a course spec; see the file's header. Never throws for a well-formed JSON: a course with no hole lines gives a
 *  spec with no holes and a warning */
export function osmCourseToSpec(json: OsmCourseJson, opt: ConvertOptions = {}): OsmCourseSpec {
  const F = json.features ?? {};
  const warnings: SpecNote[] = [], fills: SpecNote[] = [];
  const warn = (code: string, hole: number, text: string) => warnings.push({ code, hole, text });
  const fill = (code: string, hole: number, text: string) => fills.push({ code, hole, text });

  // ---- the hole lines, grouped by course ----
  const lines: Line[] = [];
  for (const f of F.hole ?? []) {
    if (!f.line || f.line.length < 2) continue;
    lines.push({ pts: f.line, ref: f.ref ?? num(f.tags?.ref), par: f.par ?? num(f.tags?.par), handicap: num(f.tags?.handicap), course: cname(f.tags), sel: -1 });
  }
  const groups = new Map<string, Line[]>();
  for (const l of lines) { const g = groups.get(l.course); if (g) g.push(l); else groups.set(l.course, [l]); }
  /** the group's holes numbered 1..18 present */
  const fullness = (g: Line[]) => new Set(g.filter(l => l.ref !== null && l.ref >= 1 && l.ref <= 18).map(l => l.ref)).size;
  let chosen = '';
  if (opt.course !== undefined) {
    const want = opt.course.trim().toLowerCase();
    const hit = [...groups.keys()].find(k => k.toLowerCase() === want);
    if (hit !== undefined) chosen = hit; else warn('course-missing', 0, `No hole lines for "${opt.course}"`);
  }
  if (opt.course === undefined || !groups.has(chosen)) {
    let best = -1;
    for (const [k, g] of groups) { const s = fullness(g) * 1000 + g.length; if (s > best) { best = s; chosen = k; } }
  }
  const otherCourses = [...groups.entries()].filter(([k]) => k !== chosen).map(([k, g]) => ({ name: k || 'unnamed', holes: g.length }));
  if (otherCourses.length) warn('other-courses', 0, `The boundary holds other courses, not built: ${otherCourses.map(o => `${o.name} (${o.holes} holes)`).join(', ')}`);

  // the chosen group's lines in order of ref: one line per number, 1..18
  const group = (groups.get(chosen) ?? []).slice().sort((a, b) => (a.ref ?? 1e9) - (b.ref ?? 1e9));
  const picked: Line[] = [];
  for (const l of group) {
    if (l.ref === null) { warn('hole-no-ref', 0, 'A hole line has no number: left out'); continue; }
    if (picked.some(p => p.ref === l.ref)) { warn('hole-doubled', l.ref, `Hole ${l.ref} is mapped twice: the first is kept`); continue; }
    if (picked.length >= 18) { warn('hole-over-18', l.ref, `Hole ${l.ref}: the game has 18 holes at most; left out`); continue; }
    picked.push(l);
  }
  picked.forEach((l, i) => { l.sel = i; });
  if (picked.some((l, i) => l.ref !== i + 1)) warn('renumbered', 0, `The hole numbers (${picked.map(l => l.ref).join(', ')}) are not 1..${picked.length}: numbered in order`);

  // ---- the map's areas ----
  const tees = areasOf(F.tee), greens = areasOf(F.green), fairways = areasOf(F.fairway), bunkers = areasOf(F.bunker);
  const waters = [...areasOf(F.water_hazard), ...areasOf(F.lateral_water_hazard), ...areasOf(F.water)], roughs = areasOf(F.rough);
  const pins = (F.pin ?? []).filter(f => f.pos).map(f => ({ p: f.pos as P, f }));
  const nearTee = (p: P) => Math.min(Infinity, ...tees.map(t => distToPoly(t.poly, p[0], p[1])));
  const nearGreen = (p: P) => Math.min(Infinity, ...greens.map(g => distToPoly(g.poly, p[0], p[1])));

  // a line drawn green to tee is turned round (none of the 99 stage-1 lines was)
  for (const l of lines) {
    const a = l.pts[0]!, b = l.pts[l.pts.length - 1]!;
    if (nearGreen(a) < 6 && nearTee(b) < 6 && !(nearTee(a) < 6 && nearGreen(b) < 6)) { l.pts = l.pts.slice().reverse(); if (l.sel >= 0) warn('reversed', l.sel + 1, `Hole ${l.sel + 1} was drawn green to tee: turned round`); }
  }

  const aimsOf = (pts: P[]): P[] => {
    const out: P[] = [];
    for (let i = 1; i + 1 < pts.length; i++) {
      if (bendDeg(pts[i - 1]!, pts[i]!, pts[i + 1]!) <= AIM_BEND) continue;
      const last = out[out.length - 1] ?? pts[0]!;
      if (dist(pts[i]!, last) < AIM_GAP || dist(pts[i]!, pts[pts.length - 1]!) < AIM_GAP) continue;
      if (out.length < AIM_MAX) out.push(pts[i]!);
    }
    return out;
  };

  // ---- each hole: its green, pin, tees, aim points ----
  const works: Work[] = picked.map((l, i): Work => ({
    n: i + 1, line: l.pts, l, green: null, greenMade: null, teeMade: null, pin: l.pts[l.pts.length - 1]!, tees: [],
    aims: aimsOf(l.pts), markers: [], bandRings: null, made: [],
  }));
  const ownerOf = (p: P, max: number): { l: Line; d: number } | null => {
    let best: { l: Line; d: number } | null = null;
    for (const l of lines) { const d = distToLine(l.pts, p[0], p[1]); if (d <= max && (!best || d < best.d)) best = { l, d }; }
    return best;
  };

  // greens: the area the line ends on (or is near, GREEN_REACH)
  const used = new Map<Area, number[]>();
  for (const w of works) {
    const end = w.line[w.line.length - 1]!;
    let best: Area | null = null, bd = GREEN_REACH + 1;
    for (const g of greens) { const d = distToPoly(g.poly, end[0], end[1]); if (d < bd || (d === bd && best && polyArea(g.poly) < polyArea(best.poly))) { bd = d; best = g; } }
    if (best && bd <= GREEN_REACH) { w.green = best; const u = used.get(best); if (u) u.push(w.n); else used.set(best, [w.n]); }
    else {
      const r = Math.sqrt(GREEN_AREA / Math.PI), poly: Poly = { outer: circleRing(end, r, 20), inner: [] };
      w.greenMade = { poly, box: boxOf(poly.outer)!, c: end, tags: {}, f: {} };
      w.made.push('green'); fill('green', w.n, `Hole ${w.n}: the line ends on no green; one of about ${GREEN_AREA} m2 made there`);
    }
  }
  for (const [g, hs] of used) if (hs.length > 1) warn('double-green', hs[0]!, `Holes ${hs.join(' and ')} share one green (a double green): it belongs to hole ${hs[0]}`);

  // pins
  const takenPins = new Set<unknown>();
  for (const w of works) {
    const end = w.line[w.line.length - 1]!, g = w.green ?? w.greenMade!;
    let best: { p: P; f: JFeature } | null = null, bd = Infinity;
    for (const q of pins) {
      if (takenPins.has(q)) continue;
      const d = w.green ? distToPoly(g.poly, q.p[0], q.p[1]) : dist(q.p, end);
      const ref = num(q.f.tags?.ref), pref = ref !== null && ref === w.l.ref ? -0.5 : 0; // (a pin that carries the hole's number wins a tie)
      if (d <= PIN_REACH && d + pref < bd) { bd = d + pref; best = q; }
    }
    if (best) {
      takenPins.add(best);
      if (inPoly(g.poly, best.p[0], best.p[1])) w.pin = best.p;
      else { w.pin = interiorPoint(g.poly); fill('pin-moved', w.n, `Hole ${w.n}: the mapped pin lies off its green: put at the green's middle`); }
    } else {
      w.pin = interiorPoint(g.poly); w.made.push('pin');
      if (w.green || pins.length) fill('pin', w.n, `Hole ${w.n}: no pin mapped: put at the green's middle`);
    }
  }

  // tees: every tee polygon goes to the hole line whose start is nearest to it (within TEE_FAR), selected holes' or another course's
  const teeOwner = new Map<Area, { l: Line; d: number }>();
  for (const t of tees) {
    let best: { l: Line; d: number } | null = null;
    for (const l of lines) { const d = distToPoly(t.poly, l.pts[0]![0], l.pts[0]![1]); if (d <= TEE_FAR && (!best || d < best.d)) best = { l, d }; }
    if (best) teeOwner.set(t, best);
  }
  for (const w of works) {
    w.tees = [...teeOwner].filter(([, o]) => o.l === w.l).map(([a, o]) => ({ a, d: o.d })).sort((x, y) => x.d - y.d);
    const own = w.tees.filter(t => t.d <= TEE_REACH);
    if (!own.length) {
      // the line starts on no tee: one made, TEE_LEN x TEE_WID along the line
      const s = w.line[0]!, nx = w.line[1]![0] - s[0], ny = w.line[1]![1] - s[1], L = Math.hypot(nx, ny) || 1, ux = nx / L, uy = ny / L, vx = -uy, vy = ux;
      const hl = TEE_LEN / 2, hw = TEE_WID / 2, c: P = [s[0] + ux * 2, s[1] + uy * 2];
      const poly: Poly = { outer: [[c[0] - ux * hl - vx * hw, c[1] - uy * hl - vy * hw], [c[0] + ux * hl - vx * hw, c[1] + uy * hl - vy * hw], [c[0] + ux * hl + vx * hw, c[1] + uy * hl + vy * hw], [c[0] - ux * hl + vx * hw, c[1] - uy * hl + vy * hw]], inner: [] };
      w.teeMade = { poly, box: boxOf(poly.outer)!, c, tags: {}, f: {} };
      w.tees.unshift({ a: w.teeMade, d: 0 }); w.made.push('tee'); fill('tee', w.n, `Hole ${w.n}: the line starts on no tee: one of ${TEE_LEN} x ${TEE_WID} m made there`);
    }
  }

  // ---- tee markers: the line's start tee is the white (middle) set; one farther from the pin is the back set, nearer ones the senior and forward sets;
  //      tee polygons tagged with colours keep them. The tags' par holds: a marker that would make the game work out another par is moved within its
  //      tee, or dropped ----
  for (const w of works) {
    const near = w.tees.filter(t => t.d <= TEE_SETS).slice(0, 4);
    const start = near[0] ?? w.tees[0]!;
    const kinds = near.map(t => kindOfTags(t.a.tags));
    const tagged = near.length >= 2 && kinds.every(k => k !== null) && new Set(kinds).size === near.length;
    const marks: { kind: TeeKind; a: Area }[] = [];
    if (tagged) near.forEach((t, i) => marks.push({ kind: kinds[i]!, a: t.a }));
    else {
      marks.push({ kind: 'middle', a: start.a });
      const dStart = dist(start.a.c, w.pin), rest = near.filter(t => t !== start);
      const farther = rest.filter(t => dist(t.a.c, w.pin) > dStart + 6).sort((x, y) => dist(y.a.c, w.pin) - dist(x.a.c, w.pin));
      const nearer = rest.filter(t => dist(t.a.c, w.pin) < dStart - 6).sort((x, y) => dist(y.a.c, w.pin) - dist(x.a.c, w.pin));
      if (farther[0]) marks.push({ kind: 'back', a: farther[0].a });
      if (nearer[0]) marks.push({ kind: 'senior', a: nearer[0].a });
      if (nearer[1]) marks.push({ kind: 'forward', a: nearer[1].a });
    }
    marks.sort((a, b) => TEE_ORDER.indexOf(a.kind) - TEE_ORDER.indexOf(b.kind));
    const par = w.l.par;
    const place = (a: Area): P | null => {
      if (par === null) return a.c;
      if (parFromLength(playLen(a.c, w.aims, w.pin)) === par) return a.c;
      // a spot of the tee on a 2 m lattice, nearest to the middle, that gives the tagged par
      let best: P | null = null, bd = Infinity;
      const b = a.box;
      for (let y = Math.ceil(b[1] / 2) * 2; y <= b[3]; y += 2) for (let x = Math.ceil(b[0] / 2) * 2; x <= b[2]; x += 2) {
        if (!inPoly(a.poly, x, y)) continue;
        const d = Math.hypot(x - a.c[0], y - a.c[1]);
        if (d < bd && parFromLength(playLen([x, y], w.aims, w.pin)) === par) { bd = d; best = [x, y]; }
      }
      return best;
    };
    // only the furthest-back marker decides the game's par (golf/holes.ts), so only it is checked, and dropped when no spot of its tee keeps the par
    while (marks.length) {
      const m = marks[0]!, p = place(m.a);
      if (p) { w.markers.push({ kind: m.kind, p }); break; }
      if (marks.length === 1) { w.markers.push({ kind: m.kind, p: m.a.c }); break; }
      marks.shift(); fill('tee-dropped', w.n, `Hole ${w.n}: a tee set that would change the par was left as plain tee ground`);
    }
    for (const m of marks.slice(1)) if (!w.markers.some(k => k.kind === m.kind)) w.markers.push({ kind: m.kind, p: m.a.c });
  }

  // ---- fairways: each to the hole line it runs along (the most samples inside it), else the nearest within NEAR_HOLE ----
  const samples = lines.map(l => sampleLine(l.pts, SAMPLE));
  const fairOwner = new Map<Area, Line>();
  for (const f of fairways) {
    let best: Line | null = null, bn = 0;
    for (let k = 0; k < lines.length; k++) {
      let n = 0;
      for (const s of samples[k]!) if (s[0] >= f.box[0] && s[0] <= f.box[2] && s[1] >= f.box[1] && s[1] <= f.box[3] && inPoly(f.poly, s[0], s[1])) n++;
      if (n > bn) { bn = n; best = lines[k]!; }
    }
    if (!best) { const o = ownerOf(f.c, NEAR_HOLE); if (o) best = o.l; }
    if (best) fairOwner.set(f, best);
  }
  const holeOfLine = (l: Line | undefined | null): number => (l && l.sel >= 0 ? l.sel + 1 : 0);
  /** whether a feature belongs to another course's hole (and is left out) */
  const foreign = (l: Line | undefined | null): boolean => !!l && l.sel < 0;

  // a par 4 or 5 whose line runs over (almost) no fairway gets a band along it
  for (const w of works) {
    const par = w.l.par ?? parFromLength(playLen(w.markers[0]?.p ?? w.line[0]!, w.aims, w.pin));
    const mine = [...fairOwner].filter(([, l]) => l === w.l).map(([a]) => a);
    const L = lineLen(w.line), body = sampleLine(sliceLine(w.line, L * 0.1, L * 0.9), SAMPLE);
    const share = body.length ? body.filter(s => mine.some(f => inPoly(f.poly, s[0], s[1]))).length / body.length : 1;
    if (par >= 4 && share < FAIRWAY_SHARE && L > BAND_TEE_CLEAR + BAND_GREEN_CLEAR + 20) {
      const mid = sliceLine(w.line, BAND_TEE_CLEAR, L - BAND_GREEN_CLEAR);
      const rings = bandRings(mid, BAND_HALF);
      if (rings.length) {
        w.bandRings = rings; // (a quad per segment and a round joint: painted one by one)
        w.made.push('fairway'); fill('fairway', w.n, `Hole ${w.n}: par ${par} with no fairway mapped: a band ${BAND_HALF * 2} m wide made along the line`);
      }
    }
  }

  // ---- the land: the holes' lines and features, their margin ----
  const pts: P[] = [];
  for (const w of works) {
    pts.push(...w.line);
    for (const t of w.tees) pts.push(...t.a.poly.outer);
    pts.push(...(w.green ?? w.greenMade!).poly.outer);
  }
  for (const [f, l] of fairOwner) if (!foreign(l)) pts.push(...f.poly.outer);
  const bunkerOwner = new Map<Area, Line | null>(), waterOwner = new Map<Area, Line | null>();
  for (const b of bunkers) bunkerOwner.set(b, ownerOf(b.c, NEAR_HOLE)?.l ?? null);
  for (const b of waters) waterOwner.set(b, ownerOf(b.c, NEAR_HOLE)?.l ?? null);
  for (const [b, l] of bunkerOwner) if (!foreign(l) && l) pts.push(...b.poly.outer);
  const boundaryAreas = areasOf(json.boundary ? [json.boundary] : []);
  const margin = opt.marginM ?? MARGIN;
  let land = boxOf(pts);
  if (!land) {
    // no holes mapped: the boundary alone (or nothing)
    land = boxOf(boundaryAreas.flatMap(a => a.poly.outer)) ?? [-50, -50, 50, 50];
    warn('no-holes', 0, 'No holes are mapped for this course: only its land is built (nothing is made up)');
  } else land = [land[0] - margin, land[1] - margin, land[2] + margin, land[3] + margin];
  const ox = Math.floor(land[0] / TILE_M) * TILE_M, oy = Math.ceil(land[3] / TILE_M) * TILE_M;
  const W = Math.max(1, Math.ceil((land[2] - ox) / TILE_M)), H = Math.max(1, Math.ceil((oy - land[1]) / TILE_M));
  const lbox: Box = [ox, oy - H * TILE_M, ox + W * TILE_M, oy];
  const T = (p: P): TPt => ({ x: (p[0] - ox) / TILE_M, y: (oy - p[1]) / TILE_M });
  const flat = (ring: readonly P[]): number[] => { const o: number[] = []; for (const p of ring) { const q = T(p); o.push(q.x, q.y); } return o; };
  const ringsOf = (poly: Poly): number[][] => [flat(poly.outer), ...poly.inner.map(flat)];

  // ---- the areas, in paint order ----
  const areas: SpecArea[] = [], counts: Record<string, number> = {};
  const count = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  const add = (surf: SpecSurface, a: Area | { poly: Poly; box: Box }, hole: number, extra: Partial<SpecArea> = {}, kind?: string) => {
    if (!boxesMeet(a.box, lbox)) return;
    areas.push({ surf, hole, rings: ringsOf(a.poly), ...extra }); if (kind) count(kind);
  };
  for (const b of boundaryAreas) add('rough', b, 0, {}, 'boundary');
  for (const r of roughs) add('rough', r, 0, {}, 'rough');
  for (const [f, l] of fairOwner) if (!foreign(l)) add('fairway', f, holeOfLine(l), {}, 'fairway');
  for (const w of works) if (w.bandRings) for (const r of w.bandRings) areas.push({ surf: 'fairway', hole: w.n, rings: [flat(r)], made: true, clip: true });
  for (const [b, l] of bunkerOwner) if (!foreign(l)) add('bunker', b, holeOfLine(l), {}, 'bunker');
  // water: the mapped hazards and lakes, then the waterways as bands (not a stream that runs inside a mapped water area)
  for (const [b, l] of waterOwner) add('water', b, holeOfLine(l), {}, 'water');
  for (const f of F.waterway ?? []) {
    if (!f.line || f.line.length < 2) continue;
    if (f.tags?.tunnel || f.tags?.culvert) { fill('stream-hidden', 0, `${f.tags.name ?? 'A waterway'} runs underground there: not drawn`); continue; }
    const s = sampleLine(f.line, 8), inside = s.filter(p => waters.some(w => inPoly(w.poly, p[0], p[1]))).length;
    if (s.length && inside / s.length > 0.8) continue;
    const bx = boxOf(f.line);
    if (!bx || !boxesMeet(bx, lbox)) continue;
    const wid = Math.max(1, Math.min(12, Number.parseFloat(f.tags?.width ?? '') || STREAM_WIDTH[f.tags?.waterway ?? ''] || 3));
    const mid = f.line[Math.floor(f.line.length / 2)]!, own = ownerOf(mid, NEAR_HOLE);
    for (const r of bandRings(f.line, wid / 2)) areas.push({ surf: 'water', hole: holeOfLine(own?.l), rings: [flat(r)] });
    count('stream');
  }
  for (const w of works) for (const t of w.tees) add('tee', t.a, w.n, t.a === w.teeMade ? { made: true } : {}, t.a === w.teeMade ? 'tee-made' : 'tee');
  for (const t of tees) if (!teeOwner.has(t)) add('tee', t, 0, {}, 'tee-plain');
  for (const w of works) {
    const g = w.green ?? w.greenMade!;
    if (w.green && used.get(w.green)![0] !== w.n) continue; // (a double green is painted once, by its first hole)
    add('green', g, w.n, w.greenMade ? { made: true } : {}, w.greenMade ? 'green-made' : 'green');
  }
  for (const g of greens) {
    if (used.has(g)) continue;
    // a green no selected hole ends on: another course's (left out) or a practice green (kept, no hole)
    const near = ownerOf(g.c, GREEN_REACH + 20);
    if (near && foreign(near.l)) continue;
    add('green', g, 0, {}, 'green-plain');
  }

  // ---- the holes ----
  const teeMarks: TeeMark[] = [], pinList: Pin[] = [], aimList: AimPoint[] = [];
  const holes: SpecHole[] = works.map((w): SpecHole => {
    const tm: SpecTee[] = w.markers.map(m => ({ kind: m.kind, ...T(m.p) }));
    for (const m of tm) teeMarks.push({ hole: w.n, kind: m.kind, x: m.x, y: m.y });
    const pin = T(w.pin); pinList.push({ hole: w.n, x: pin.x, y: pin.y });
    const aims = w.aims.map(T); aims.forEach((a, k) => aimList.push({ hole: w.n, x: a.x, y: a.y, order: k + 1 }));
    return {
      n: w.n, ref: w.l.ref, par: 4, tagPar: w.l.par, gamePar: 4, lengthM: 0, handicap: w.l.handicap, tees: tm, pin, aims,
      line: w.line.flatMap(p => { const q = T(p); return [q.x, q.y]; }), made: w.made,
    };
  });
  // the game's own working out (golf/holes.ts deriveHoles): lengths, par from the back tee, the corridor and walk warnings. No areas: the surface
  // checks it also makes (pin on a green, tee on a tee) are the grid's, tested with the grid
  const derived = deriveHoles([], teeMarks, pinList, aimList);
  for (const d of derived) {
    const h = holes.find(q => q.n === d.n);
    if (!h) continue;
    h.gamePar = d.par; h.lengthM = d.lengthM;
    h.par = (h.tagPar === 3 || h.tagPar === 4 || h.tagPar === 5 ? h.tagPar : d.par) as 3 | 4 | 5;
    if (h.tagPar === null) { h.made.push('par'); fill('par', h.n, `Hole ${h.n}: no par mapped: par ${d.par} from its length (${d.lengthM} m)`); }
    else if (h.tagPar !== d.par) warn('par-differs', h.n, `Hole ${h.n}: mapped par ${h.tagPar}, but the game works par ${d.par} out from its length (${d.lengthM} m)`);
    for (const t of d.warnings) {
      if (t.startsWith('Too close to hole')) { const other = Number(t.replace(/\D+/g, '')); if (d.n < other) warn('hole-close', d.n, `Holes ${d.n} and ${other} run closer than the 60 m corridor guideline`); }
      else if (t.startsWith('Long walk')) warn('long-walk', d.n, `Hole ${d.n}: a long walk (over 150 m) to the next tee`);
    }
  }
  for (const h of holes) if (!h.tees.length) warn('no-tee-marker', h.n, `Hole ${h.n} has no tee marker`);

  const place = opt.place ?? json.meta?.place ?? '';
  return {
    id: opt.id ?? json.meta?.id ?? 'course', name: opt.name ?? json.meta?.course?.name ?? 'Course', credit: OSM_CREDIT, licence: OSM_LICENCE,
    source: json.meta?.course?.osm ?? '', place, w: W, h: H, holes, areas, warnings, fills, otherCourses, course: chosen || null,
    parTotal: holes.reduce((s, h) => s + h.par, 0), gameParTotal: holes.reduce((s, h) => s + h.gamePar, 0), lengthM: holes.reduce((s, h) => s + h.lengthM, 0),
    counts,
  };
}
