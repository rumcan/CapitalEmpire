// T431 (docs/CINDERLINKS-PORT.md): progress earned on the course, in his own recorded round (not a practice round), from either view: every stroke is a
// little practice for the part of the game it used, and a feat (an ace, holing out from a bunker, a chip-in, a long drive) earns a card pull once a round
// (cards/earning.ts earnFromFeat). The engine asks these after each stroke of the round (yours3p.ts hooks, and the top view's own hit).
// Pure TS, no DOM.
import { TILE_M } from '../types';
import type { Club, Lie, Shot } from './types';

/** a feat: holed in one, holed from a bunker, holed from off the green (not the putter), a drive of LONG_DRIVE_M or more from the tee */
export type FeatId = 'ace' | 'bunker' | 'chipin' | 'longdrive';
export const FEAT_IDS: readonly FeatId[] = ['ace', 'bunker', 'chipin', 'longdrive'];
/** a long drive: the ball's whole way from the tee with the driver, metres */
export const LONG_DRIVE_M = 270;

/** the feat a stroke is (the best one: an ace over a bunker hole-out over a chip-in), or null. `lie`: where it was struck from */
export function featOf(shot: Pick<Shot, 'club' | 'stroke' | 'holed' | 'penalty' | 'from' | 'to'>, lie: Lie): FeatId | null {
  if (shot.holed && shot.stroke === 1) return 'ace';
  if (shot.holed && lie === 'bunker') return 'bunker';
  if (shot.holed && shot.club !== 'putter' && lie !== 'green') return 'chipin';
  if (shot.club === 'driver' && lie === 'tee' && !shot.penalty && Math.hypot(shot.to.x - shot.from.x, shot.to.y - shot.from.y) * TILE_M >= LONG_DRIVE_M) return 'longdrive';
  return null;
}

/** the skill a club's stroke practises (golf/player.ts SKILL_IDS: the parts of the game) */
export function skillOfClub(club: Club): 'driving' | 'irons' | 'short' | 'putting' {
  if (club === 'driver' || club === 'wood3') return 'driving';
  if (club === 'putter') return 'putting';
  if (club === 'gw' || club === 'sw' || club === 'lw') return 'short';
  return 'irons';
}
/** what a stroke in a recorded round is worth as practice (golf/player.ts gainOf's base, before its slowing near the top): about a sixteenth of a range
 *  session's (PRACTICE: a bucket's driving base is 2.0), so a round of some 90 strokes is worth a few sessions spread over the four parts of the game */
export const PLAY_GAIN = 0.12;
