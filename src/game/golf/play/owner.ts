// The owner's play in the day (docs/GOLF-PLAY.md decision 7, P4b): the golfer he is, the clubs he may take from a lie, the power a club starts at, and
// his live group started from a fresh plan (a replay of his saved inputs, then the caddie if he handed over). Pure TS, no DOM.
import { carryM } from './shot';
import { LiveGroup, POWER } from './live';
import type { OwnerInput, OwnerTurn } from './live';
import type { Club, CourseView, Golfer, Lie, RoundPlan, Sex } from './types';

/** the owner's address: his shot opens this many game minutes before his strike, where the game pauses (docs/GOLF-PLAY.md decision 7); the playback
 *  has him at the ball by then */
export const OWNER_ADDRESS = 0.3;
/** the owner's skill: an amateur invite (docs/GOLF-PLAY.md decision 7) */
export const OWNER_SKILL = 0.4;
/** the owner's art by sex (the ids in GOLFER_PEOPLE): golf_am_m3 for a man, golf_am_w1 for a woman */
export const OWNER_ART: Record<Sex, string> = { m: 'golfer:golf_am_m3', w: 'golfer:golf_am_w1' };

/** the owner's golfer with id `id` (the next after the field's): "You", an amateur of his sex, the first group by teeTimes */
export function ownerGolfer(id: number, sex: Sex): Golfer { return { id, name: 'You', sex, pro: false, skill: OWNER_SKILL, look: 0, owner: true }; }

/** the clubs the owner may take from a lie: the driver only from the tee (teeShot), the putter only on the green, the others any time. Longest first */
export function allowedClubs(lie: Lie, teeShot: boolean): Club[] {
  const out: Club[] = [];
  if (teeShot) out.push('driver');
  out.push('wood3', 'iron4', 'iron6', 'iron8', 'pw', 'sw');
  if (lie === 'green') out.push('putter');
  return out;
}

/** the power a club starts at for the distance to the aim (metres): the share of its full carry that reaches it, at most 1 and at least the slider's
 *  floor (POWER[0]); the putter starts at 1 (the putt's full length to the pin) */
export function powerFor(club: Club, distM: number, skill: number): number {
  if (club === 'putter') return 1;
  return Math.min(POWER[1]!, Math.max(POWER[0]!, distM / carryM(club, skill)));
}

/** the owner's live group on a fresh plan of the same seed (playRound with { live: groupIdx }): his saved inputs replayed in order, then the caddie
 *  when he handed over (caddie not null: the rest is played by the model). Returns the group and his next turn (null once his group is done). Throws
 *  when the saved inputs no longer fit the course */
export function startOwner(plan: RoundPlan, view: CourseView, groupIdx: number, seed: number, inputs: OwnerInput[], caddie: number | null): { live: LiveGroup; turn: OwnerTurn | null } {
  const live = new LiveGroup(plan, view, groupIdx, seed);
  live.replay(inputs);
  if (caddie !== null) live.caddie();
  return { live, turn: live.advance() };
}
