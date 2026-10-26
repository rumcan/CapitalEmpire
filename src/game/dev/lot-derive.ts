// The lot lab's auto-size (T155 PR 2): what the derive (lots/derive.ts) needs to know of a master's props, from the library: each prop's
// footprint in the preset frame of its road (as the lot draws it: its view turned, at its drawn scale) and its kind (the main building is the
// house; fences follow the edges; trees, large props and small props are dropped in that order). And the masters report: how many lot presets
// each master covers, towards every combination of type, state, size and road angle.
import { LIBRARY } from '../library';
import { isBuilding } from '../mirror';
import { bucketOf, type LotPreset, type PresetProp, type PresetState, type PresetUse, type Road } from '../lots/presets';
import { facingOf, quarterOfRoad } from '../lots/preset-frame';
import { deriveAll, isMaster, type DeriveInfo, type DeriveKind, type DeriveSize, type Half } from '../lots/derive';
import { mainBuilding } from './lot-select';
import { isFence, isTree } from '../lots/item-kinds';
import { frameHalf, isHouseLike } from './lot-houses';

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** the area (tiles squared) from which a prop counts as large */
const LARGE = 2.25;
/** a lab lot's frame directions for a road angle (as Game.stageLab lays its lot: the street on the road's side) and the quarter its presets
 *  are drawn with: what frameHalf reads */
export function roadFrame(road: Road): { q: 0 | 1 | 2 | 3; u: { x: number; y: number }; n: { x: number; y: number } } {
  const h = Math.SQRT1_2, S = [{ x: 0, y: 1 }, { x: h, y: h }, { x: 1, y: 0 }, { x: h, y: -h }, { x: 0, y: -1 }, { x: -h, y: -h }, { x: -1, y: 0 }, { x: -h, y: h }][road]!;
  const n = { x: -S.x, y: -S.y }, u = { x: -n.y, y: n.x };
  return { q: road % 2 ? quarterOfRoad(road) : facingOf(n), u, n };
}
/** a fence and a tree (lots/item-kinds.ts) */
export { isFence, isTree } from '../lots/item-kinds';
/** what the derive needs of a master's props for its road: footprints and kinds (its main building the house) */
export function deriveInfo(m: LotPreset): DeriveInfo {
  const half = frameHalf(roadFrame(m.road ?? 0)), house = m.use === 'farm' ? -1 : mainBuilding(m, q => isHouseLike(q.id), half);
  const kind = (q: PresetProp, i: number): DeriveKind => {
    if (i === house) return 'house';
    if (isFence(q.id)) return 'fence';
    if (isTree(q.id)) return 'tree';
    const h: Half = half(q), it = LIBRARY[INDEX.get(q.id) ?? -1];
    return (it && isBuilding(it)) || 4 * h.ha * h.hb >= LARGE ? 'large' : 'small';
  };
  return { half, kind };
}
/** a master's derive with the library's footprints and kinds (lots/derive.ts deriveAll) */
export const deriveMaster = (m: LotPreset, sizes: readonly DeriveSize[], all: readonly LotPreset[]) => deriveAll(m, sizes, deriveInfo(m), all);

/** the masters report: for each type and state (farms aside) its sizes; each master (by road) and how many sizes it covers of the sizes it could
 *  (those inside its bucket); the cells (type x state x size x road) with an approved preset, of them all */
export interface MastersReport { masters: { id: string; use: PresetUse; state: PresetState; road: Road; covers: number; of: number }[]; derived: number; cells: number; covered: number }
export function mastersReport(all: readonly LotPreset[], sizesOf: (u: PresetUse, s: PresetState) => DeriveSize[], uses: readonly PresetUse[], states: readonly PresetState[]): MastersReport {
  const out: MastersReport = { masters: [], derived: 0, cells: 0, covered: 0 };
  const lab = all.filter(p => p.road !== undefined);
  out.derived = lab.filter(p => p.derived).length;
  for (const u of uses) for (const s of states) {
    const ss = sizesOf(u, s); if (!ss.length) continue;
    out.cells += ss.length * 8;
    const here = lab.filter(p => p.use === u && p.state === s);
    for (const sz of ss) for (let r = 0; r < 8; r++) if (here.some(p => p.road === r && p.approved && bucketOf(p.w, p.d).w === sz.bw && bucketOf(p.w, p.d).d === sz.bd)) out.covered++;
    for (const m of here) if (isMaster(m, ss)) {
      const mb = bucketOf(m.w, m.d), of = ss.filter(z => z.bw <= mb.w && z.bd <= mb.d && !(z.bw === mb.w && z.bd === mb.d)).length;
      out.masters.push({ id: m.id, use: u, state: s, road: m.road!, covers: here.filter(p => p.derived === m.id).length, of });
    }
  }
  return out;
}
