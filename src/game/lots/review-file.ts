// T385 (#1042; the owner, 2026-11-08: "then I can go into the studio with a quick pick decal and a props and quickly place shit or mark the lot as fucked and
// we can have you look at the fucked ones ... a dropdown for multi select options and I can select which options are valid. check house, check driveway or
// parking lot. check trees, check fence"): the lot review file, scripts/assets/lot-review.json, written by the studio's Lot review (src/game/dev/lot-review.ts,
// through the dev server's POST /__dev/lot-review) and read by the lead (npm run lots:review prints it): one record a lot, with where the lot came from (a
// generated town or T353's estate lots, its seed and theme), its frame and state (enough to compose it again), the owner's four ticks (true: valid; a lot with
// any tick off is bad), the bad mark and its note, what the owner placed on it (its override, in the lot's own frame) and what the machine read on it
// (lot-audit.ts). Like the studio's other review marks (scripts/assets/review-flags.json) it is sorted and one line a lot, so a diff shows what changed.
// Dependency-free: vite.config.ts reads it through dev-save.ts before the game's modules exist, and the tests run it in node.

/** the repo path of the review file */
export const REVIEW_PATH = 'scripts/assets/lot-review.json';
/** the four checks of a house lot's clean base (clean-yards.ts), in the order the owner lists them */
export const CHECKS = ['house', 'drive', 'trees', 'fence'] as const;
export type Check = (typeof CHECKS)[number];
/** each check's words for the checklist */
export const CHECK_WORDS: Readonly<Record<Check, string>> = { house: 'House', drive: 'Driveway or parking', trees: 'Trees', fence: 'Fence' };

/** what the owner placed on a lot, in its own frame (a along the street, b away from it, tiles): sprites (flip, scale: a multiple of the owner size) and flat decals */
export interface ReviewOverride {
  props: { id: string; a: number; b: number; flip?: boolean; scale?: number }[];
  decals: { id: string; a: number; b: number; scale?: number; alpha?: number }[];
}
/** a lot's record */
export interface ReviewRecord {
  /** the review set it came from: a generated town or the estate's lots, the set's seed, the look it was seen in */
  kind: 'town' | 'estate'; seed: number; theme: 'autumn' | 'desert';
  /** the lot's key in its set, its frame (the origin, the way along the street and the way away from it, as world tiles; its width and depth), its state and its road (0..7) */
  key: string; o: [number, number]; u: [number, number]; n: [number, number]; w: number; d: number;
  use: number; level: number; decline: number; tier?: number; lotSeed: number; road: number;
  /** the owner's ticks: true valid, false not; absent, not looked at */
  checks: Partial<Record<Check, boolean>>;
  /** the Mark bad key, and the note that goes with it */
  bad?: boolean; note?: string;
  /** what the owner placed on the lot */
  override?: ReviewOverride;
  /** what the machine read on the lot (lot-audit.ts LotAudit, as plain values) */
  audit?: Record<string, number | string | boolean | null | string[]>;
  /** when it was saved (ISO) */
  at: string;
}
/** the file */
export interface ReviewFile { v: 1; lots: Record<string, ReviewRecord> }

/** a lot's id: its set, the set's seed and its key (the set's own: a town lot's key, an estate lot's number) */
export const reviewId = (kind: 'town' | 'estate', seed: number, key: string): string => `${kind}:${seed}:${key}`;
const ID_RE = /^(town|estate):\d{1,9}:[A-Za-z0-9_.,:|-]{1,80}$/;

/** a lot is bad when the owner marked it, or ticked off any of the four checks */
export const isBad = (r: Pick<ReviewRecord, 'bad' | 'checks'>): boolean => r.bad === true || CHECKS.some(c => r.checks[c] === false);
/** a lot's standing: none (no record), touched (something placed or half ticked), ok (all four ticked, not marked), bad */
export type Standing = 'none' | 'touched' | 'ok' | 'bad';
export function standingOf(r: ReviewRecord | undefined | null): Standing {
  if (!r) return 'none';
  if (isBad(r)) return 'bad';
  return CHECKS.every(c => r.checks[c] === true) ? 'ok' : 'touched';
}
/** the counts of a file: the lots by standing, and how many are bad for each check (a lot marked bad with every check ticked counts under none of them) */
export function summaryOf(f: ReviewFile): { lots: number; ok: number; bad: number; touched: number; byCheck: Record<Check, number>; marked: number } {
  const s = { lots: 0, ok: 0, bad: 0, touched: 0, marked: 0, byCheck: { house: 0, drive: 0, trees: 0, fence: 0 } as Record<Check, number> };
  for (const r of Object.values(f.lots)) {
    s.lots++;
    const st = standingOf(r); if (st === 'ok') s.ok++; else if (st === 'bad') s.bad++; else s.touched++;
    if (r.bad) s.marked++;
    for (const c of CHECKS) if (r.checks[c] === false) s.byCheck[c]++;
  }
  return s;
}

const num = (v: unknown, lo = -1e7, hi = 1e7): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const rd = (v: number, k = 1000): number => Math.round(v * k) / k;
/** the most a record holds: its note, its placed sprites and decals */
const NOTE_MAX = 600, PLACED_MAX = 300;

/** a record read from raw data (the file, a request): normalised (numbers rounded, unknown fields dropped), or null when it is not one */
export function readRecord(raw: unknown): ReviewRecord | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!(r.kind === 'town' || r.kind === 'estate') || !num(r.seed, 0, 999999999) || !(r.theme === 'autumn' || r.theme === 'desert') || !text(r.key, 80) || !pair(r.o) || !pair(r.u) || !pair(r.n)) return null;
  if (!num(r.w, 1, 200) || !num(r.d, 1, 200) || !num(r.use, 0, 9) || !num(r.level, 0, 9) || !num(r.decline, 0, 9) || !num(r.lotSeed, 0, 4294967295) || !num(r.road, 0, 7) || !text(r.at, 40)) return null;
  if (r.tier !== undefined && !num(r.tier, 0, 9)) return null;
  const c = r.checks; if (typeof c !== 'object' || c === null || Array.isArray(c)) return null;
  const checks: Partial<Record<Check, boolean>> = {};
  for (const k of CHECKS) { const v = (c as Record<string, unknown>)[k]; if (v === undefined) continue; if (typeof v !== 'boolean') return null; checks[k] = v; }
  if (r.bad !== undefined && typeof r.bad !== 'boolean') return null;
  if (r.note !== undefined && !text(r.note, NOTE_MAX)) return null;
  let override: ReviewOverride | undefined;
  if (r.override !== undefined) {
    const o = r.override as Record<string, unknown> | null;
    if (typeof o !== 'object' || o === null || !Array.isArray(o.props) || !Array.isArray(o.decals) || o.props.length > PLACED_MAX || o.decals.length > PLACED_MAX) return null;
    const props: ReviewOverride['props'] = [], decals: ReviewOverride['decals'] = [];
    for (const p of o.props as Record<string, unknown>[]) {
      if (typeof p !== 'object' || p === null || !text(p.id, 200) || !num(p.a, -50, 300) || !num(p.b, -50, 300) || (p.flip !== undefined && typeof p.flip !== 'boolean') || (p.scale !== undefined && !num(p.scale, 0.05, 10))) return null;
      props.push({ id: p.id, a: rd(p.a), b: rd(p.b), ...(p.flip ? { flip: true } : {}), ...(p.scale !== undefined && p.scale !== 1 ? { scale: rd(p.scale, 100) } : {}) });
    }
    for (const p of o.decals as Record<string, unknown>[]) {
      if (typeof p !== 'object' || p === null || !text(p.id, 200) || !num(p.a, -50, 300) || !num(p.b, -50, 300) || (p.scale !== undefined && !num(p.scale, -10, 10)) || (p.alpha !== undefined && !num(p.alpha, 0, 1))) return null;
      decals.push({ id: p.id, a: rd(p.a), b: rd(p.b), ...(p.scale !== undefined && p.scale !== 1 ? { scale: rd(p.scale, 100) } : {}), ...(p.alpha !== undefined && p.alpha !== 1 ? { alpha: rd(p.alpha, 100) } : {}) });
    }
    if (props.length || decals.length) override = { props, decals };
  }
  let audit: ReviewRecord['audit'];
  if (r.audit !== undefined) {
    const a = r.audit as Record<string, unknown> | null;
    if (typeof a !== 'object' || a === null || Array.isArray(a)) return null;
    audit = {};
    for (const [k, v] of Object.entries(a)) {
      if (k.length > 40) return null;
      if (v === null || typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 200)) audit[k] = v as number | string | boolean | null;
      else if (Array.isArray(v) && v.length <= 60 && v.every(x => typeof x === 'string' && x.length <= 200)) audit[k] = v as string[];
      else return null;
    }
  }
  return {
    kind: r.kind, seed: r.seed, theme: r.theme, key: r.key, o: [rd(r.o[0]), rd(r.o[1])], u: [rd(r.u[0], 100000), rd(r.u[1], 100000)], n: [rd(r.n[0], 100000), rd(r.n[1], 100000)], w: r.w, d: r.d,
    use: r.use, level: r.level, decline: r.decline, ...(r.tier !== undefined ? { tier: r.tier } : {}), lotSeed: r.lotSeed, road: r.road, checks,
    ...(r.bad ? { bad: true } : {}), ...(r.note ? { note: r.note } : {}), ...(override ? { override } : {}), ...(audit ? { audit } : {}), at: r.at,
  };
}

/** the file read from its text ('' or one that does not parse: an empty file; a record that is not valid is dropped) */
export function parseReview(fileText: string): ReviewFile {
  const out: ReviewFile = { v: 1, lots: {} };
  let raw: unknown; try { raw = JSON.parse(fileText); } catch { return out; }
  const lots = (raw as { lots?: unknown } | null)?.lots;
  if (typeof lots !== 'object' || lots === null || Array.isArray(lots)) return out;
  for (const [id, v] of Object.entries(lots)) { const r = ID_RE.test(id) ? readRecord(v) : null; if (r) out.lots[id] = r; }
  return out;
}
/** the file's text: sorted by lot id, one line a lot */
export function formatReview(f: ReviewFile): string {
  const ids = Object.keys(f.lots).sort();
  return `{"v":1,"lots":{${ids.length ? '\n' : ''}${ids.map(id => ` ${JSON.stringify(id)}: ${JSON.stringify(f.lots[id])}`).join(',\n')}${ids.length ? '\n' : ''}}}\n`;
}
/** the file merged with a request: each upserted record (by lot id) replaces the lot's, then each removed id is dropped. Refused: an id or a record that is not
 *  valid (the whole request), too many lots. ok: the text to write and the lot count */
export function mergeReview(fileText: string, upsert: unknown, remove: unknown): { ok: true; text: string; count: number } | { ok: false; error: string } {
  const f = parseReview(fileText);
  const up = upsert === undefined ? {} : upsert;
  if (typeof up !== 'object' || up === null || Array.isArray(up)) return { ok: false, error: 'upsert must be an object of lot id to record' };
  if (remove !== undefined && (!Array.isArray(remove) || !remove.every(id => typeof id === 'string'))) return { ok: false, error: 'remove must be a list of lot ids' };
  for (const [id, raw] of Object.entries(up)) {
    if (!ID_RE.test(id)) return { ok: false, error: `not a lot id: ${id}` };
    const r = readRecord(raw); if (!r) return { ok: false, error: `not a lot record: ${id}` };
    f.lots[id] = r;
  }
  for (const id of (remove as string[] | undefined) ?? []) delete f.lots[id];
  const count = Object.keys(f.lots).length;
  if (count > 20000) return { ok: false, error: 'too many lots' };
  return { ok: true, text: formatReview(f), count };
}
