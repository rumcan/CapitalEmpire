// The shadow audit's items (T141, dev only): every library sprite that casts a shadow, by category, in each of its views, at the scale and with
// the flip the game places it with. Pure over the library (no DOM): the audit page (shadow-audit.ts) lays them out, the shadow test counts them.
import { GOLFER_BASE, GOLFER_FRAMES, GOLFER_PEOPLE, LIBRARY, SPECTATOR_BASE, SPECTATOR_FRAMES, SPECTATOR_PEOPLE, WALKER_BASE, WALKER_PEOPLE, WALK_DIRS, WALK_FRAMES } from '../library';
import type { LibItem } from '../types';
import { lookOf } from '../newart';
import { BUILDING_IDS, VIEW_ART } from '../views-library';
import { OWNER_SCALE, STUDIO_SCALE } from '../lots/scales';
import { fourViews, turned } from '../lots/preset-art';
import { TREE_MIRROR } from '../tree-sun';
import { PIXEL_LIMIT, PIXEL_SLACK } from '../sizes';
import { DECOR } from '../golf/decor';
import { DRESSING_SPRITE_IDS, MARKER_SCALE, PIN_RED_ID, PIN_YELLOW_ID } from '../golf/dressing';
import { PIECE_PROP_SPRITE } from '../ext/course-pieces';
import { STRUCTURE_SPRITE } from '../golf/structure-art';
import { rangeScene } from '../golf/rangebiz';
import { RANGE_UPGRADES, defaultRangeBiz, HOME_AT, type RangeBizSave } from '../golf/rangesave';

/** the audit's categories, in the order of the sheets */
export const AUDIT_CATS = ['trees', 'poles', 'props', 'golf', 'range', 'vehicles', 'walkers', 'buildings', 'fences'] as const;
export type AuditCat = typeof AUDIT_CATS[number];
/** one sprite to show: its library index, the scale and flip it is placed with, a footprint (tiles, x0 y0 x1 y1 about its anchor) in place of its
 *  boxes' (the range's roofs), and its family (the views of one thing share it, so they sit side by side) */
export interface AuditEntry { item: number; scale: number; flip: boolean; foot?: [number, number, number, number]; family: string; note?: string }

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
const ROUNDISH = /tree|bush|fern|hydrangea|ornamental|mums|plant|flower|hedge|shrub|grass_clump/i;
const POLEISH = /lamp|pole|sign|post|flag|meter|bollard|signal|hydrant|mailbox|payphone/i;
/** the family of a sprite: the NE view of four-view art, the group of a variation set (variation:<group>:<n>), else itself */
export function familyOf(id: string): string {
  const v = fourViews(id); if (v) return v.views[0];
  const m = /^variation:(.+):\d+$/.exec(id); return m ? `variation:${m[1]}` : id;
}
/** is the sprite drawn as itself (not swapped for a stand-in by newart.ts, not hidden) */
function drawnAsItself(i: number): boolean {
  const l = lookOf({ item: i, flip: false, scale: 1, x: 100.5, y: 100.5, x0: 99, y0: 99, x1: 102, y1: 102 });
  return !l.hidden && l.item === i;
}
const isBuildingArt = (it: LibItem) => BUILDING_IDS.has(it.id) || VIEW_ART.has(it.id) || ['house', 'building', 'venue', 'gazebo', 'arcade', 'junglegym'].includes(it.kind)
  || (it.kind === 'business' && (BUILDING_IDS.has(it.id) || it.id.startsWith('view:business:')));
/** the category a library sprite is audited in (golf and range sprites are audited there too, by id) */
export function auditCatOf(it: LibItem): AuditCat | null {
  if (it.kind === 'lot') return null;
  if (it.kind === 'walker') return 'walkers';
  if (it.kind === 'fencex' || it.kind === 'fencey') return 'fences';
  if (it.kind === 'car' || it.cat === 'Vehicles') return 'vehicles';
  if (it.kind === 'tree' || it.kind === 'bush' || it.cat === 'Trees & plants' || it.cat === 'Capital vegetation' || (it.kind === 'decor' && ROUNDISH.test(`${it.id} ${it.name}`))) return 'trees';
  if (isBuildingArt(it)) return 'buildings';
  if (it.kind === 'lamp' || it.cat === 'Road signs' || POLEISH.test(`${it.id} ${it.name}`)) return 'poles';
  return 'props';
}
const placeScale = (id: string) => STUDIO_SCALE[id] ?? OWNER_SCALE[id] ?? 1;
const entry = (i: number, scale: number, o: Partial<AuditEntry> = {}): AuditEntry => {
  const it = LIBRARY[i]!;
  return { item: i, scale, flip: it.kind === 'tree' && TREE_MIRROR.has(it.id), family: familyOf(it.id), ...o };
};
/** every view of a sprite (its four views, or itself) */
function viewsOf(id: string): string[] { const v = fourViews(id); return v ? [...v.views] : [id]; }

/** the walkers: each person's standing frame in all eight facings (the townspeople, one spectator, two golfers; every frame shares one rule) */
function walkers(): AuditEntry[] {
  const out: AuditEntry[] = [];
  const add = (base: number, frames: number, people: number[], kind: string) => { for (const p of people) for (let d = 0; d < WALK_DIRS.length; d++) out.push(entry(base + (p * WALK_DIRS.length + d) * frames, 1, { note: `${kind} ${WALK_DIRS[d]}` })); };
  add(WALKER_BASE, WALK_FRAMES, [0, 1].filter(p => p < WALKER_PEOPLE.length), 'townsperson');
  add(SPECTATOR_BASE, SPECTATOR_FRAMES, [0].filter(p => p < SPECTATOR_PEOPLE.length), 'spectator');
  add(GOLFER_BASE, GOLFER_FRAMES, [0, 1].filter(p => p < GOLFER_PEOPLE.length), 'golfer');
  return out;
}
/** the golf sprites: the Props tool's catalogue (golf/decor.ts), the course dressing (pins, the course-map bench, the course trees), the course
 *  pieces' props and the Event tool's structures (T113's course props), each in all its views */
function golf(): AuditEntry[] {
  const out: AuditEntry[] = [], seen = new Set<string>();
  const add = (id: string, scale: number, note: string) => { for (const v of viewsOf(id)) { const i = INDEX.get(v); if (i === undefined || seen.has(`${v}@${scale}`)) continue; seen.add(`${v}@${scale}`); out.push(entry(i, scale, { note })); } };
  for (const d of DECOR) add(d.id, d.scale ?? placeScale(d.id), `props tool: ${d.name}`);
  for (const id of DRESSING_SPRITE_IDS) add(id, id === PIN_RED_ID || id === PIN_YELLOW_ID ? MARKER_SCALE.pin : placeScale(id), 'course dressing');
  for (const p of Object.values(PIECE_PROP_SPRITE)) if (p?.id) add(p.id, placeScale(p.id), 'course piece');
  for (const [k, id] of Object.entries(STRUCTURE_SPRITE)) add(id, placeScale(id), `structure: ${k}`);
  return out;
}
/** the range's pieces (golf/rangebiz.ts rangeScene): every piece of a fully built range at each home stage, in each facing (so every view it
 *  turns to), at the size the engine places it (engine.ts addPiece) and with its own footprint where it has one (the roofs) */
function range(): AuditEntry[] {
  const out: AuditEntry[] = [], seen = new Set<string>();
  const owned = RANGE_UPGRADES.map(u => u.id);
  for (const takings of [0, HOME_AT[0], HOME_AT[1]]) for (const facing of [0, 1, 2, 3] as const) {
    const s: RangeBizSave = { ...defaultRangeBiz(), owned, total: { golfers: 0, buckets: 0, lost: 0, takings, upkeep: 0 } };
    for (const p of rangeScene([0, 0, 70, 150], facing, s).pieces) {
      if (p.lift) continue; // the upper deck casts none (what holds it up casts its own)
      const t = turned(p.id, p.q), i = INDEX.get(t.id); if (i === undefined) continue;
      const it = LIBRARY[i]!, scale = Math.min(PIXEL_LIMIT[i]! * PIXEL_SLACK, STUDIO_SCALE[it.id] ?? (p.fit ? 64 * p.fit / it.w : p.scale ?? OWNER_SCALE[it.id] ?? 1));
      const foot = p.foot ? [p.foot[0] - p.x, p.foot[1] - p.y, p.foot[2] - p.x, p.foot[3] - p.y] as [number, number, number, number] : undefined;
      const key = `${t.id}@${scale.toFixed(3)}@${foot ? foot.map(v => v.toFixed(1)).join(',') : ''}`; if (seen.has(key)) continue; seen.add(key);
      out.push(entry(i, scale, { flip: t.flip, foot, note: `range: ${p.key.replace(/\d+$/, '')}` }));
    }
  }
  return out;
}

const cache = new Map<AuditCat, AuditEntry[]>();
/** the entries of a category, families together, in library order */
export function auditEntries(cat: AuditCat): AuditEntry[] {
  const c = cache.get(cat); if (c) return c;
  let out: AuditEntry[];
  if (cat === 'walkers') out = walkers();
  else if (cat === 'golf') out = golf();
  else if (cat === 'range') out = range();
  else {
    out = [];
    LIBRARY.forEach((it, i) => {
      if (it.kind === 'walker' || auditCatOf(it) !== cat || !drawnAsItself(i)) return;
      if (it.id.startsWith('east:') && !VIEW_ART.has(it.id)) return; // drawn as its front (mirror.ts drawnAs)
      out.push(entry(i, placeScale(it.id)));
    });
    // the views of one thing side by side, in the order of their first appearance
    const first = new Map<string, number>(); out.forEach((e, k) => { if (!first.has(e.family)) first.set(e.family, k); });
    out = out.map((e, k) => ({ e, k })).sort((a, b) => first.get(a.e.family)! - first.get(b.e.family)! || a.k - b.k).map(x => x.e);
  }
  cache.set(cat, out);
  return out;
}
/** the library sprites the audit leaves out because the game never draws them as themselves (old buildings drawn as a new-art stand-in) */
export function swappedItems(): number[] {
  const out: number[] = [];
  LIBRARY.forEach((it, i) => { if (it.kind !== 'walker' && it.kind !== 'lot' && !drawnAsItself(i)) out.push(i); });
  return out;
}
