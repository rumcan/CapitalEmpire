// T171 (#400; P25): items know their place. Per library item, where it stands relative to the lot's features, learnt from the samples as the sectors
// are (lots/learn.ts): an ANCHOR (the main building's front, back or sides; the kerb; a fence line, left, right or back; a drive's or car park's
// edge; else a free spot) and, along it, a position (along: 0..1 of the feature's length) and an offset from it (tiles); and ROWS: items of a kind
// the samples set in a run along one line (a hedge along the fence, planters along a front), with their run's length and spacing. The generator
// (lot-gen.ts) lays an item it knows at one of its anchors at one of the places seen there (a little jitter), and a row as a row; an item seen
// fewer than PLACE_MIN times keeps its kind's sectors (as before). Pure, with no runtime imports but learn.ts (vite.config.ts loads it).
import type { Box, ItemKind, Sample } from './learn';

/** an item's anchor (see the file head) */
export type Anchor = 'front' | 'back' | 'left' | 'right' | 'kerb' | 'fence-l' | 'fence-r' | 'fence-b' | 'paved-f' | 'paved-b' | 'paved-l' | 'paved-r' | 'free';
export const ANCHORS: readonly Anchor[] = ['front', 'back', 'left', 'right', 'kerb', 'fence-l', 'fence-r', 'fence-b', 'paved-f', 'paved-b', 'paved-l', 'paved-r', 'free'];
/** the line anchors (a row runs along them) */
const LINE: ReadonlySet<Anchor> = new Set(ANCHORS.filter(a => a !== 'free'));
/** a lot as its anchors read it: its size (tiles), its main building's box (null: none) and its drives' and car parks' boxes (lot frame) */
export interface PlaceLot { w: number; d: number; house: Box | null; paved: readonly Box[] }
/** how near (tiles) a point must be to count as at the kerb, a fence, the main building's face, a paved edge */
export const KERB = 1.6, FENCE = 1.3, FACE = 3.5, PAVE = 1.6;
/** the least times an item is seen to be laid by its anchors; the most places kept for an item at an anchor */
export const PLACE_MIN = 5, PLACE_KEEP = 16;
/** a point's anchor: the nearest feature within its band (the kerb, a fence, the main building's faces, a paved edge), else free; its position
 *  along it and its offset from it (free: the point over the lot's size); paved: the index of its paved box */
export function anchorOf(l: PlaceLot, x: number, y: number): { a: Anchor; along: number; off: number; p?: number } {
  let best: { a: Anchor; along: number; off: number; p?: number } | null = null, bd = Infinity;
  const take = (a: Anchor, d: number, along: number, off: number, p?: number) => { if (d < bd - 1e-9) { bd = d; best = { a, along, off, ...(p !== undefined ? { p } : {}) }; } };
  if (y < KERB) take('kerb', Math.max(0, y), x / l.w, y);
  if (x < FENCE) take('fence-l', x, y / l.d, x);
  if (l.w - x < FENCE) take('fence-r', l.w - x, y / l.d, l.w - x);
  if (l.d - y < FENCE) take('fence-b', l.d - y, x / l.w, l.d - y);
  const H = l.house;
  if (H) {
    const bw = Math.max(0.5, H[2] - H[0]), bh = Math.max(0.5, H[3] - H[1]), inX = x >= H[0] - 1 && x <= H[2] + 1, inY = y >= H[1] - 1 && y <= H[3] + 1;
    if (inX && y <= H[1] && H[1] - y < FACE) take('front', H[1] - y, (x - H[0]) / bw, H[1] - y);
    if (inX && y >= H[3] && y - H[3] < FACE) take('back', y - H[3], (x - H[0]) / bw, y - H[3]);
    if (inY && x <= H[0] && H[0] - x < FACE) take('left', H[0] - x, (y - H[1]) / bh, H[0] - x);
    if (inY && x >= H[2] && x - H[2] < FACE) take('right', x - H[2], (y - H[1]) / bh, x - H[2]);
  }
  l.paved.forEach((P, i) => {
    const pw = Math.max(0.5, P[2] - P[0]), ph = Math.max(0.5, P[3] - P[1]), inX = x >= P[0] - 1 && x <= P[2] + 1, inY = y >= P[1] - 1 && y <= P[3] + 1;
    if (inX && y <= P[1] && P[1] - y < PAVE) take('paved-f', P[1] - y, (x - P[0]) / pw, P[1] - y, i);
    if (inX && y >= P[3] && y - P[3] < PAVE) take('paved-b', y - P[3], (x - P[0]) / pw, y - P[3], i);
    if (inY && x <= P[0] && P[0] - x < PAVE) take('paved-l', P[0] - x, (y - P[1]) / ph, P[0] - x, i);
    if (inY && x >= P[2] && x - P[2] < PAVE) take('paved-r', x - P[2], (y - P[1]) / ph, x - P[2], i);
  });
  return best ?? { a: 'free', along: x / l.w, off: y / l.d };
}
/** the point (lot frame) of a place at an anchor on a lot (paved: which paved box); null when the lot lacks the feature */
export function pointAt(l: PlaceLot, a: Anchor, along: number, off: number, p = 0): { x: number; y: number } | null {
  const H = l.house, P = l.paved.length ? l.paved[Math.min(l.paved.length - 1, Math.max(0, p))]! : null;
  switch (a) {
    case 'kerb': return { x: along * l.w, y: off };
    case 'fence-l': return { x: off, y: along * l.d };
    case 'fence-r': return { x: l.w - off, y: along * l.d };
    case 'fence-b': return { x: along * l.w, y: l.d - off };
    case 'front': return H ? { x: H[0] + along * (H[2] - H[0]), y: H[1] - off } : null;
    case 'back': return H ? { x: H[0] + along * (H[2] - H[0]), y: H[3] + off } : null;
    case 'left': return H ? { x: H[0] - off, y: H[1] + along * (H[3] - H[1]) } : null;
    case 'right': return H ? { x: H[2] + off, y: H[1] + along * (H[3] - H[1]) } : null;
    case 'paved-f': return P ? { x: P[0] + along * (P[2] - P[0]), y: P[1] - off } : null;
    case 'paved-b': return P ? { x: P[0] + along * (P[2] - P[0]), y: P[3] + off } : null;
    case 'paved-l': return P ? { x: P[0] - off, y: P[1] + along * (P[3] - P[1]) } : null;
    case 'paved-r': return P ? { x: P[2] + off, y: P[1] + along * (P[3] - P[1]) } : null;
    case 'free': return { x: along * l.w, y: off * l.d };
  }
}
/** an anchor's line length on a lot (tiles: the run a row's spacing is read over) */
export function lineLen(l: PlaceLot, a: Anchor, p = 0): number {
  const H = l.house, P = l.paved[p];
  switch (a) {
    case 'kerb': case 'fence-b': return l.w;
    case 'fence-l': case 'fence-r': return l.d;
    case 'front': case 'back': return H ? H[2] - H[0] : 0;
    case 'left': case 'right': return H ? H[3] - H[1] : 0;
    case 'paved-f': case 'paved-b': return P ? P[2] - P[0] : 0;
    case 'paved-l': case 'paved-r': return P ? P[3] - P[1] : 0;
    case 'free': return 0;
  }
}

/** an item's places: the times it was seen, and per anchor the places seen (along, off pairs; the first PLACE_KEEP) and how many */
export interface ItemPlaces { n: number; at: Partial<Record<Anchor, { n: number; pts: number[] }>> }
/** a kind's rows at an anchor: its items there, those in a row (a run of ROW_MIN or more, each within ROW_GAP of the last along the line and
 *  ROW_OFF across), the runs, their items in all and the sum of their gaps (tiles) */
export interface RowCount { items: number; inRows: number; runs: number; len: number; gaps: number }
export const ROW_MIN = 3, ROW_GAP = 2.6, ROW_OFF = 0.6;
/** the places learnt: per item id, and per kind|anchor its rows; the lots counted and their area (tiles squared, in all); inventory: the group's
 *  lots are composed (each carries its set: a shop's bench, bin, dumpster and hvac), so the generator lays each known item by its own count per
 *  lot (n / lots, at the lot's size) rather than drawing its kind's items at random */
export interface Places { items: Map<string, ItemPlaces>; rows: Map<string, RowCount>; lots: number; area: number; inventory?: boolean }
export const emptyPlaces = (): Places => ({ items: new Map(), rows: new Map(), lots: 0, area: 0 });
const r2 = (v: number) => Math.round(v * 100) / 100;
/** a lot's kept items counted into the places (each its anchor and place; each anchor's line read for runs) */
export function learnPlaces(t: Places, l: PlaceLot, items: readonly { id: string; kind: ItemKind; x: number; y: number; kept: boolean }[]): Places {
  t.lots++; t.area += l.w * l.d;
  const lines = new Map<string, { kind: ItemKind; pos: number; off: number }[]>();
  for (const it of items) {
    if (!it.kept || it.kind === 'decal' || it.kind === 'car') continue;
    const a = anchorOf(l, it.x, it.y), ip = t.items.get(it.id) ?? { n: 0, at: {} }, c = ip.at[a.a] ?? { n: 0, pts: [] };
    ip.n++; c.n++; if (c.pts.length < 2 * PLACE_KEEP) c.pts.push(r2(a.along), r2(a.off)); ip.at[a.a] = c; t.items.set(it.id, ip);
    if (!LINE.has(a.a)) continue;
    const key = `${it.kind}|${a.a}|${a.p ?? 0}`, L = lineLen(l, a.a, a.p);
    let line = lines.get(key); if (!line) lines.set(key, line = []);
    line.push({ kind: it.kind, pos: a.along * L, off: a.off });
  }
  for (const [key, line] of lines) {
    const [kind, a] = key.split('|') as [ItemKind, Anchor], rk = `${kind}|${a}`, rc = t.rows.get(rk) ?? { items: 0, inRows: 0, runs: 0, len: 0, gaps: 0 };
    line.sort((p, q) => p.pos - q.pos); rc.items += line.length;
    for (let i = 0; i < line.length;) {
      let j = i + 1, gaps = 0;
      while (j < line.length && line[j]!.pos - line[j - 1]!.pos <= ROW_GAP && Math.abs(line[j]!.off - line[j - 1]!.off) <= ROW_OFF) { gaps += line[j]!.pos - line[j - 1]!.pos; j++; }
      if (j - i >= ROW_MIN) { rc.inRows += j - i; rc.runs++; rc.len += j - i; rc.gaps += gaps; }
      i = j;
    }
    t.rows.set(rk, rc);
  }
  return t;
}
/** the places of a list of samples: those that carry their lot's features (lots/learn.ts SampleCtx hb, paved: older ones count for the sectors
 *  only), a gallery lot judged Bad left out */
export function buildPlaces(samples: readonly Sample[]): Places {
  const t = emptyPlaces();
  for (const s of samples) { const c = s.ctx; if (s.verdict === 'down' || c.paved === undefined) continue; learnPlaces(t, { w: c.w, d: c.d, house: c.hb ?? null, paved: c.paved }, s.items); }
  return t;
}
/** a kind's row habit at an anchor: the share of its items there that stand in a row, a run's mean length and spacing (tiles); null: none */
export function rowOf(t: Places, kind: ItemKind, a: Anchor): { share: number; len: number; gap: number } | null {
  const c = t.rows.get(`${kind}|${a}`);
  if (!c || !c.runs || c.items < PLACE_MIN) return null;
  return { share: c.inRows / c.items, len: c.len / c.runs, gap: c.gaps / Math.max(1, c.len - c.runs) };
}
/** an item's anchors as the generator draws them: each anchor seen with its share (a prior of half a sighting each, over those seen) and its
 *  places; null for an item seen fewer than PLACE_MIN times (its kind's sectors lay it) */
export function placesOf(t: Places, id: string): { a: Anchor; w: number; pts: readonly number[] }[] | null {
  const ip = t.items.get(id);
  if (!ip || ip.n < PLACE_MIN) return null;
  const at = Object.entries(ip.at) as [Anchor, { n: number; pts: number[] }][], tot = ip.n + 0.5 * at.length;
  return at.filter(([, c]) => c.pts.length >= 2).sort(([x], [y]) => ANCHORS.indexOf(x) - ANCHORS.indexOf(y)).map(([a, c]) => ({ a, w: (c.n + 0.5) / tot, pts: c.pts }));
}

/** the places as data (a model's places: items seen PLACE_MIN times or more, keys sorted) */
export interface PlacesData { items: Record<string, { n: number; at: Partial<Record<Anchor, [number, ...number[]]>> }>; rows: Record<string, [number, number, number, number, number]>; lots: number; area: number; inventory?: boolean }
export function placesData(t: Places): PlacesData {
  const items: PlacesData['items'] = {}, rows: PlacesData['rows'] = {};
  for (const [id, ip] of [...t.items].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (ip.n < PLACE_MIN) continue;
    const at: PlacesData['items'][string]['at'] = {};
    for (const a of ANCHORS) { const c = ip.at[a]; if (c) at[a] = [c.n, ...c.pts]; }
    items[id] = { n: ip.n, at };
  }
  for (const [k, c] of [...t.rows].sort(([a], [b]) => (a < b ? -1 : 1))) if (c.runs) rows[k] = [c.items, c.inRows, c.runs, c.len, r2(c.gaps)];
  return { items, rows, lots: t.lots, area: r2(t.area), ...(t.inventory ? { inventory: true } : {}) };
}
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** places read back from data (bad entries dropped) */
export function placesFrom(d: unknown): Places {
  const t = emptyPlaces();
  if (!obj(d)) return t;
  if (obj(d.items)) for (const [id, v] of Object.entries(d.items)) {
    if (!obj(v) || !fin(v.n) || !obj(v.at)) continue;
    const at: ItemPlaces['at'] = {};
    for (const a of ANCHORS) { const c = v.at[a]; if (Array.isArray(c) && c.length >= 1 && c.length % 2 === 1 && c.every(fin)) at[a] = { n: c[0]!, pts: (c as number[]).slice(1) }; }
    t.items.set(id, { n: v.n, at });
  }
  if (obj(d.rows)) for (const [k, v] of Object.entries(d.rows)) if (/^[a-z]+\|[a-z-]+$/.test(k) && Array.isArray(v) && v.length === 5 && v.every(fin)) t.rows.set(k, { items: v[0]!, inRows: v[1]!, runs: v[2]!, len: v[3]!, gaps: v[4]! });
  if (fin(d.lots) && d.lots >= 0) t.lots = d.lots;
  if (fin(d.area) && d.area >= 0) t.area = d.area;
  if (d.inventory === true) t.inventory = true;
  return t;
}
