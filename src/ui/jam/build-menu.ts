// J7 (#1225; the owner, 2026-11-13: "make a better build menu with pictures and let the player decide. dont push them to build the practice green
// and chipping area"): the jam build's Build menu as data. Every thing the player can build, in four groups (Range, Course, Club, Practice), each a
// card with its picture (the game's own art: the scenes and the menu tiles), its name and line, its price, its upkeep a month, the one-line payback
// (golf/payback.ts) and, when it cannot be built yet, why. No order, no steps: the player picks. A card's act is what a click starts: the same
// placement the rail and the range card start. Pure TS, no DOM (BuildMenu.tsx draws it; App.tsx fills the source from the engine and runs the acts).
import type { RangeCardView } from '../../game/golf/rangehost';
import type { RangeUpgradeId } from '../../game/golf/rangesave';
import { holeExtra, greenFeesMonth, payback, practiceExtra, rangeMonth, rangeUpgradeExtra, type CourseNow, type Payback } from '../../game/golf/payback';
import type { ToolTile } from '../tool-tiles';

export type BuildGroupId = 'range' | 'course' | 'club' | 'practice';
export const BUILD_GROUPS: readonly { id: BuildGroupId; label: string }[] = [
  { id: 'range', label: 'Range' }, { id: 'course', label: 'Course' }, { id: 'club', label: 'Club' }, { id: 'practice', label: 'Practice' },
];
/** a card's picture: a scene (src/assets/scenes; pos: the part of it to show, a CSS object-position) or a menu tile (src/assets/ui/tiles) */
export type BuildPic = { scene: string; pos?: string } | { tile: ToolTile };
/** what a card's click starts */
export type BuildAct =
  | { k: 'place'; id: 'range' | 'carpark' | 'practice' } | { k: 'upgrade'; id: RangeUpgradeId } | { k: 'rangeCard' }
  | { k: 'newHole' } | { k: 'paths' } | { k: 'clubhouse' } | { k: 'green'; id: 'putting' | 'chipping' };
export interface BuildCard {
  id: string; group: BuildGroupId; name: string; line: string; pic: BuildPic;
  /** the price ($; null: priced as it is laid, costNote says how) */ cost: number | null; costNote?: string;
  /** the upkeep a month ($; null: none known, upkeepNote says why) */ upkeep: number | null; upkeepNote?: string;
  /** the payback (null: none to show) and a note under it */ payback: Payback | null; note?: string;
  /** why it cannot be built yet (null: it can); done: it is built ("Built"), the card then only opens what it is */
  why: string | null; done: string | null;
  act: BuildAct | null;
}

/** a typical jam hole (docs/JAM.md "Balance": the New hole wizard's defaults cost $18k to $37k, about $23k; $12k to $17k bare) and a typical hole's
 *  turf upkeep a month (a par-4's green, tee, fairway and first cut at golf/costs.ts' rates: about $600) */
export const HOLE_FROM = 12_000, HOLE_TYPICAL = 23_000, HOLE_UPKEEP = 600;
/** the ids of the range upgrades the jam's menu offers (RangeCard's JAM_HIDDEN_UPGRADES and the ball room's tree stay off; the car park's gravel and
 *  paving are the Car park card's) */
export const MENU_UPGRADES: readonly RangeUpgradeId[] = ['greens', 'targets', 'teeturf', 'grass', 'bays8', 'bays12', 'covered', 'dispenser'];
/** the car park's enlargements, in order */
export const LOT_STEPS: readonly RangeUpgradeId[] = ['gravel', 'pave'];
const UPGRADE_PIC: Readonly<Record<string, BuildPic>> = {
  greens: { scene: 'range-road-upgraded.webp', pos: '85% 40%' }, targets: { tile: 'green' }, teeturf: { scene: 'hitting-bays-upgraded.webp' },
  grass: { scene: 'range-road-upgraded.webp', pos: '100% 30%' }, bays8: { scene: 'hitting-bays-rundown.webp' }, bays12: { scene: 'hitting-bays-upgraded.webp', pos: '30% 50%' },
  covered: { scene: 'range-road-upgraded.webp', pos: '55% 40%' }, dispenser: { tile: 'range-bays' },
};

/** what the menu reads from the game */
export interface BuildSource {
  /** the range's placements (Engine.rangePlaces: the range, its car park, the practice area) */
  places: readonly { id: 'range' | 'carpark' | 'practice'; name: string; cost: number; done: boolean; why: string }[];
  /** the range's view (RangeHost.view; null: no range in this game) */
  range: RangeCardView | null;
  /** the range's business upkeep a month ($) */
  rangeUpkeep: number;
  /** the tools' locks (null: open): New hole, the Buildings tool (the clubhouse), the cart paths, the practice greens */
  locks: { newHole: string | null; buildings: string | null; path: string | null; practice: string | null };
  /** the clubhouse: built, its price and its upkeep a month */
  clubhouse: { built: boolean; cost: number; upkeep: number };
  /** the course now and whether the clubhouse stands (Engine.paybackCourse; null: no course) */
  course: { course: CourseNow; clubhouse: boolean } | null;
  /** the cash on hand */
  money: number;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
/** the reason a price the cash cannot cover gives */
export const shortWhy = (cost: number, money: number): string | null =>
  cost > money ? `Not enough cash: ${usd(cost - Math.max(0, money))} short (the Bank lends, or save up)` : null;

/** a range upgrade's reason (rangesave.ts upgradeWhy: '' when it can be built), the cash's in the menu's words */
const upWhy = (why: string, cost: number, money: number): string | null =>
  !why || why === 'Built' ? null : why.startsWith('Not enough money') ? shortWhy(cost, money) ?? why : why;

/** the menu's cards, in their groups' order */
export function buildCards(s: BuildSource): BuildCard[] {
  const out: BuildCard[] = [], v = s.range, place = (id: 'range' | 'carpark' | 'practice') => s.places.find(p => p.id === id);
  const rangeP = place('range'), rangeBuilt = !rangeP || rangeP.done, noRange = rangeBuilt ? null : 'Place your driving range first';
  // ---- Range
  if (rangeP) {
    const extra = v ? rangeMonth(v.biz, v.demand, v.dayLen).takings : 0;
    out.push({
      id: 'range', group: 'range', name: 'Driving range', pic: { scene: rangeBuilt ? 'range-road-upgraded.webp' : 'range-road-rundown.webp' },
      line: 'Golfers off the county road buy buckets: your first income. Comes with a dirt car park.',
      cost: rangeP.cost, upkeep: s.rangeUpkeep, payback: rangeBuilt ? null : payback(rangeP.cost, s.rangeUpkeep, extra),
      note: rangeBuilt ? 'Open the range card: prices, upgrades and takings.' : undefined,
      why: rangeBuilt ? null : rangeP.why || shortWhy(rangeP.cost, s.money), done: rangeBuilt ? 'Built' : null,
      act: rangeBuilt ? { k: 'rangeCard' } : { k: 'place', id: 'range' },
    });
  }
  if (v) {
    // the car park: placed with the range (J7); its card enlarges it (gravel, then paving: room for more cars), or places it when there is none
    const lotP = place('carpark'), lot = !lotP || lotP.done, next = LOT_STEPS.find(id => !v.biz.owned.includes(id)), u = next ? v.upgrades.find(q => q.id === next) : undefined;
    if (!lot && lotP) out.push({ id: 'carpark', group: 'range', name: 'Car park', pic: { scene: 'range-road-rundown.webp', pos: '0% 60%' }, line: 'A packed-dirt lot beside the road, near the shack: golfers drive on without one.',
      cost: lotP.cost, upkeep: 0, payback: null, why: lotP.why || shortWhy(lotP.cost, s.money), done: null, act: { k: 'place', id: 'carpark' } });
    else out.push({
      id: 'carpark', group: 'range', name: u ? `Car park: ${u.name.replace(/ the car park$/, '').toLowerCase()} it` : 'Car park', pic: { scene: next === 'gravel' || !next ? 'range-road-upgraded.webp' : 'range-road-rundown.webp', pos: '0% 60%' },
      line: u ? `Enlarge your car park. ${u.effect}` : 'Paved, with every bay of the lot in use.',
      cost: u ? u.cost : null, upkeep: u ? u.upkeep : null, payback: u ? payback(u.cost, u.upkeep, rangeUpgradeExtra(v.biz, v.demand, v.dayLen, u.id)) : null,
      why: !u ? null : noRange ?? upWhy(u.why, u.cost, s.money), done: u ? null : 'Built', act: u ? { k: 'upgrade', id: u.id } : { k: 'rangeCard' },
    });
    for (const id of MENU_UPGRADES) {
      const q = v.upgrades.find(x => x.id === id); if (!q) continue;
      out.push({
        id, group: 'range', name: q.name, line: q.effect, pic: UPGRADE_PIC[id] ?? { tile: 'range-bays' }, cost: q.cost, upkeep: q.upkeep,
        payback: q.owned ? null : payback(q.cost, q.upkeep, rangeUpgradeExtra(v.biz, v.demand, v.dayLen, id)),
        why: q.owned ? null : noRange ?? upWhy(q.why, q.cost, s.money),
        done: q.owned ? 'Built' : null, act: q.owned ? { k: 'rangeCard' } : { k: 'upgrade', id },
      });
    }
  }
  // ---- Course
  const pc = s.course;
  out.push({
    id: 'hole', group: 'course', name: 'New hole', pic: { tile: 'golf-hole' }, line: 'Click a tee, then a green: the hole is planned for you, priced before you build.',
    cost: HOLE_FROM, costNote: `From ${usd(HOLE_FROM)}, about ${usd(HOLE_TYPICAL)} a typical hole`, upkeep: HOLE_UPKEEP, upkeepNote: 'a typical hole',
    payback: pc ? payback(HOLE_TYPICAL, HOLE_UPKEEP, holeExtra(pc.course, pc.clubhouse)) : null,
    note: pc && !pc.clubhouse ? 'Green fees start once your clubhouse stands.' : undefined,
    why: s.locks.newHole ?? shortWhy(HOLE_FROM, s.money), done: null, act: { k: 'newHole' },
  });
  out.push({
    id: 'paths', group: 'course', name: 'Cart paths', pic: { tile: 'cart-path' }, line: 'Paths for carts and walkers between the range, the car park and your holes.',
    cost: null, costNote: 'Priced by its length as you lay it', upkeep: null, payback: null, why: s.locks.path, done: null, act: { k: 'paths' },
  });
  // ---- Club
  out.push({
    id: 'clubhouse', group: 'club', name: 'Clubhouse', pic: { scene: 'scene-business-golf-clubhouse-343e3275-outside-upgraded-v1.png' },
    line: "The course's front door: golfers pay their green fees here.", cost: s.clubhouse.cost, upkeep: s.clubhouse.upkeep,
    payback: s.clubhouse.built || !pc ? null : payback(s.clubhouse.cost, s.clubhouse.upkeep, greenFeesMonth(pc.course)),
    note: s.clubhouse.built ? 'There is one clubhouse.' : pc && pc.course.holes < 1 ? 'No playable holes yet: green fees start when your first hole plays.' : undefined,
    why: s.clubhouse.built ? null : s.locks.buildings ?? shortWhy(s.clubhouse.cost, s.money), done: s.clubhouse.built ? 'Built' : null, act: s.clubhouse.built ? null : { k: 'clubhouse' },
  });
  // ---- Practice (offered like everything else, never pushed)
  const prP = place('practice');
  if (prP) {
    const areaDone = prP.done;
    out.push({
      id: 'practice', group: 'practice', name: 'Practice area', pic: { scene: 'practice-green-rundown.webp' }, line: 'A plot beside the car park for a putting green and a chipping green.',
      cost: prP.cost, upkeep: 0, payback: areaDone ? null : payback(prP.cost, 0, 0), note: areaDone ? undefined : 'Its greens earn: a share of the range golfers walk over.',
      why: areaDone ? null : noRange ?? (prP.why || shortWhy(prP.cost, s.money)), done: areaDone ? 'Placed' : null, act: areaDone ? null : { k: 'place', id: 'practice' },
    });
    for (const f of v?.practice ?? []) {
      const open = f.state === 'open', extra = v ? practiceExtra(v.biz, v.demand, v.dayLen, f.id) : 0;
      out.push({
        id: f.id, group: 'practice', name: f.name, pic: f.id === 'putting' ? { scene: 'practice-green-upgraded.webp' } : { tile: 'chipping-green' },
        line: f.id === 'putting' ? 'A putting green in the practice area: golfers pay a fee to use it, and you can practise your putting.' : 'A chipping green and bunker in the practice area: a fee a golfer, and your short game.',
        cost: null, costNote: 'Priced by its size as you lay it', upkeep: null, payback: null,
        note: open ? undefined : extra >= 0.5 ? `About +${usd(extra)} a month in takings (estimate)` : undefined,
        why: open ? null : !areaDone ? 'Place the practice area first' : s.locks.practice, done: open ? 'Open' : null, act: open ? null : { k: 'green', id: f.id },
      });
    }
  }
  return out;
}
