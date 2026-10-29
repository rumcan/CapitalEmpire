// T214 (#559, plan P26 5.1): the Clubhouse card's Members block in words (ClubhouseCard.tsx draws it): the headline, the dues stepper's steps and
// limits, the fair band as a bar with the price's marker, where the price stands, the money a month, and "What sells memberships" (the appeal's
// terms and the price's effect, worst first, then the town's pool). Pure TypeScript, no DOM.
import type { MembersView } from '../../game/golf/club';

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const count = (n: number) => Math.round(n).toLocaleString('en-US');
/** a factor as "× 0.84" */
export const factor = (f: number) => `× ${f.toFixed(2)}`;

/** the headline: "86 members · +3 this month (joined 4, left 1) · pool 120" */
export function membersHeadline(v: MembersView): { members: string; month: string; pool: string; net: number } {
  const net = v.joined - v.left;
  return {
    members: `${count(v.members)} ${v.members === 1 ? 'member' : 'members'}`,
    month: `${net > 0 ? '+' : net < 0 ? '−' : '±'}${Math.abs(net)} this month (joined ${v.joined}, left ${v.left})`,
    pool: `pool ${count(v.pool)}`, net,
  };
}

/** the dues stepper: the price a step down and a step up, null at the limits */
export function priceSteps(v: Pick<MembersView, 'price' | 'min' | 'max' | 'step'>): { down: number | null; up: number | null } {
  return { down: v.price - v.step >= v.min ? v.price - v.step : null, up: v.price + v.step <= v.max ? v.price + v.step : null };
}

/** the band bar spans this share of the fair price (half to one and a half) */
export const BAR_SPAN: readonly [number, number] = [0.5, 1.5];
/** the band bar: the band's start and end and the price's marker, each a share of the bar's width (0..1; the marker held at the ends) */
export function bandBar(v: Pick<MembersView, 'price' | 'fair' | 'band'>): { lo: number; hi: number; at: number } {
  const a = BAR_SPAN[0] * v.fair, w = (BAR_SPAN[1] - BAR_SPAN[0]) * v.fair, at = (x: number) => Math.min(1, Math.max(0, (x - a) / Math.max(1e-9, w)));
  return { lo: at(v.band[0]), hi: at(v.band[1]), at: at(v.price) };
}
/** the words under the bar: "Fair for your club: $47-64" (whole dollars) */
export const fairWords = (v: Pick<MembersView, 'band'>) => `Fair for your club: ${money(v.band[0])}-${Math.round(v.band[1])}`;
/** where the price stands, in a word and a line */
export const STAND: Readonly<Record<MembersView['stand'], { word: string; line: string }>> = {
  cheap: { word: 'Cheap', line: 'Cheap: more join, the tee sheet fills' },
  fair: { word: 'Fair', line: 'In the fair band: members join and stay at the usual rate' },
  dear: { word: 'Dear', line: 'Dear: fewer join, more leave' },
};

/** the money a month: the dues, the members' upkeep and the green fees the members no longer pay as visitors */
export function moneyLine(v: Pick<MembersView, 'dues' | 'upkeep' | 'lost'>): { dues: string; upkeep: string; lost: string } {
  return { dues: `+${money(v.dues)}`, upkeep: `−${money(v.upkeep)}`, lost: money(v.lost) };
}

/** "What sells memberships": a line per term with its factor, worst first (the course's quality, the reputation, the clubhouse, the holes, the pace,
 *  the price), then the town (the pool it makes, no factor) */
export interface WhyLine { id: 'quality' | 'rep' | 'clubhouse' | 'holes' | 'pace' | 'price' | 'town'; text: string; factor: number | null }
export function whyLines(v: MembersView): WhyLine[] {
  const a = v.appeal, waits = Math.round(v.waitAvg);
  const terms: WhyLine[] = [
    { id: 'quality', text: `Course quality: ${Math.round(v.quality)} of 100`, factor: a.quality },
    { id: 'rep', text: `Reputation: ${Math.round(v.rep)} of 100`, factor: a.rep },
    { id: 'clubhouse', text: `The clubhouse: level ${v.level}`, factor: a.clubhouse },
    { id: 'holes', text: `The course: ${v.holes} ${v.holes === 1 ? 'hole' : 'holes'}${v.holes < 18 ? ' (18 sell best)' : ''}`, factor: a.holes },
    { id: 'pace', text: `Pace: groups wait ${waits} min a round`, factor: a.pace },
    { id: 'price', text: `The price: ${money(v.price)} against a fair ${money(v.fair)}`, factor: v.priceEffect },
  ];
  terms.sort((x, y) => x.factor! - y.factor!);
  terms.push({ id: 'town', text: `The town: ${count(v.residents)} residents and ${count(v.visitors)} visitors a day make a pool of ${count(v.pool)}`, factor: null });
  return terms;
}
