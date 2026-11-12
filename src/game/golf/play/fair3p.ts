// T436 (docs/CINDERLINKS-PORT.md, fair play between different golfers): friends bring different skills and bags. Two ways to play a ghost round or a shared
// course: "own kit" (each his own skills, clubs and cards, scored net: his strokes less his handicap's share of the holes played, player.ts handicapOf) and
// "level kit" (everyone the same middling golfer with the standard bag and no cards: scored as played). No stakes: nothing here moves money.
// Pure TS, no DOM.
import type { CourseView, GameSkills, RoundPlan } from './types';
import type { ShotSkill } from './shot';
import { standings } from './round';
import { toParText } from './board';
import { gameSkills, handicapOf, hcpText, PRESSURE, type Skills } from '../player';
import { clubsOf, DEFAULT_BAG } from './bag';
import type { BoardMsg } from './protocol3p';

export type KitMode = 'own' | 'level';
/** the level golfer's profile: every skill at the middle */
export const LEVEL_PROFILE: Readonly<Skills> = { driving: 50, irons: 50, short: 50, putting: 50, power: 50, accuracy: 50, touch: 50, nerve: 50 };
/** the level kit as the model plays it: the level golfer's skills under an everyday round's pressure, the standard bag (no upgrades), no cards and no mechanics */
export function levelSkills(): GameSkills {
  return { ...gameSkills(LEVEL_PROFILE, PRESSURE.everyday), clubs: clubsOf(DEFAULT_BAG), mech: [] };
}
/** the level golfer's handicap (everyone's, in a level round) */
export const levelHcp = (): number => handicapOf(LEVEL_PROFILE);
/** the kit a golfer plays with in this mode: his own, or the level kit */
export const kitFor = (mode: KitMode, own: ShotSkill): ShotSkill => mode === 'level' ? levelSkills() : own;

/** a golfer on the board: his name, his handicap (null: not known: scored as played), whether he is the owner, and his round (the plan, its course, his id) */
export interface FairPlayer { name: string; hcp: number | null; owner: boolean; plan: RoundPlan; view: CourseView; id: number }
/** the strokes a handicap gives over `thru` holes (its share of 18, rounded) */
export const shotsGiven = (hcp: number, thru: number): number => Math.round(hcp * thru / 18);

/** the board for golfers in different rounds (you and a ghost) at game minute m: to par as played, the holes done, the handicap and the net to par; in own kit
 *  ordered by net, in level kit by strokes (everyone's handicap the same: 'level'). Ties share a position ('T1') */
export function fairRows(players: readonly FairPlayer[], m: number, mode: KitMode): BoardMsg['rows'] {
  const rows = players.map(p => {
    const s = standings(p.plan, p.view, m).find(x => x.golfer === p.id), toPar = s?.toPar ?? 0, thru = s?.thru ?? 0;
    const net = mode === 'own' && p.hcp !== null ? toPar - shotsGiven(p.hcp, thru) : toPar;
    return { p, toPar, thru, net };
  }).sort((a, b) => a.net - b.net || a.toPar - b.toPar);
  return rows.map(r => {
    const pos = rows.findIndex(q => q.net === r.net) + 1, tied = rows.filter(q => q.net === r.net).length > 1;
    return { pos: tied ? `T${pos}` : `${pos}`, name: r.p.name, toPar: toParText(r.toPar), thru: `${r.thru}`, owner: r.p.owner,
      hcp: mode === 'level' ? 'level' : r.p.hcp === null ? '-' : hcpText(r.p.hcp), net: toParText(r.net) };
  });
}
