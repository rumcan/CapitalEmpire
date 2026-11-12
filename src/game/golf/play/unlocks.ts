// T443 (docs/CINDERLINKS-PORT.md): what the owner has earned to use in the view from behind the golfer. Until now every golfer could shape and spin any
// shot (turn3p.ts unlocksOf), and only the two card mechanics were earned. Here each extra is earned from what the game already keeps: the skill levels
// on the player card (0..100), the club levels bought in the shop (bag.ts: Garage-sale 0, Club 1, Tour 2, Prototype 3) and the cards in his slots (their
// mechanics, mods.ts MechId). The rules, chosen so a new save has none of them:
//   draw and fade (the curve)     accuracy 60, or any club at Tour level
//   high and low (the flight)     touch 60, or irons 50
//   side spin                     touch 55
//   backspin                      short game 45, or a wedge (pitching, gap, sand, lob) at Club level
//   tour spin (clicks in the air) the Mid-Flight Whisper card (mechanic `airspin`)
//   the power boost               the Power Mash card (mechanic `boost`) and the driver at Tour level: one charge a hole
//   a second boost charge         the driver at Prototype level
// The model stays the judge: the host strips a locked pick from an input before LiveGroup plays it (play3p.ts), and a boost with no charge left.
// Pure TS, no DOM.
import type { Club } from './types';
import type { MechId } from './mods';
import type { BagSave } from './bag';

/** what may be used, each with the words for what unlocks it (shown on a locked option) */
export interface Earned {
  draw: boolean; fade: boolean; high: boolean; low: boolean; side: boolean; back: boolean; tour: boolean; boost: boolean;
  /** boost charges a hole (0 without the boost) */
  charges: number;
  /** for each locked option, what unlocks it */
  why: Partial<Record<'draw' | 'fade' | 'high' | 'low' | 'side' | 'back' | 'tour' | 'boost', string>>;
}

/** what earning reads: the player card's skills (0..100; absent ones as a new save's), the bag as saved, and the mechanics his cards give (absent: none) */
export interface EarnIn { skills: Partial<Record<'driving' | 'irons' | 'short' | 'putting' | 'power' | 'accuracy' | 'touch' | 'nerve', number>>; bag?: BagSave | null; mech?: readonly MechId[] | null }

/** the thresholds (skill points, 0..100) and club levels the rules above use */
export const EARN = { curveAcc: 60, flightTouch: 60, flightIrons: 50, sideTouch: 55, backShort: 45, curveLevel: 2, backLevel: 1, boostLevel: 2, boost2Level: 3 } as const;
const WEDGES: readonly Club[] = ['pw', 'gw', 'sw', 'lw'];

/** what he has earned */
export function earned(e: EarnIn): Earned {
  const s = e.skills, lv = e.bag?.lv ?? {}, level = (c: Club) => lv[c] ?? 0, mech = e.mech ?? [];
  const anyTour = Object.values(lv).some(v => (v ?? 0) >= EARN.curveLevel), driver = level('driver');
  const curve = (s.accuracy ?? 50) >= EARN.curveAcc || anyTour;
  const flight = (s.touch ?? 50) >= EARN.flightTouch || (s.irons ?? 24) >= EARN.flightIrons;
  const side = (s.touch ?? 50) >= EARN.sideTouch;
  const back = (s.short ?? 22) >= EARN.backShort || WEDGES.some(c => level(c) >= EARN.backLevel);
  const tour = mech.includes('airspin');
  const boost = mech.includes('boost') && driver >= EARN.boostLevel;
  const why: Earned['why'] = {};
  if (!curve) why.draw = why.fade = `Accuracy ${EARN.curveAcc}, or any club at Tour level`;
  if (!flight) why.high = why.low = `Touch ${EARN.flightTouch}, or Irons ${EARN.flightIrons}`;
  if (!side) why.side = `Touch ${EARN.sideTouch}`;
  if (!back) why.back = `Short game ${EARN.backShort}, or a wedge at Club level`;
  if (!tour) why.tour = 'The Mid-Flight Whisper card';
  if (!boost) why.boost = mech.includes('boost') ? 'A Tour driver' : driver >= EARN.boostLevel ? 'The Power Mash card' : 'The Power Mash card and a Tour driver';
  return { draw: curve, fade: curve, high: flight, low: flight, side, back, tour, boost, charges: boost ? (driver >= EARN.boost2Level ? 2 : 1) : 0, why };
}

/** everything earned (a host that does not know the profile: as before T443, nothing is taken away) */
export const ALL_EARNED: Readonly<Earned> = { draw: true, fade: true, high: true, low: true, side: true, back: true, tour: true, boost: true, charges: 1, why: {} };
