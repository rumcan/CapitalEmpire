// The range's gear for your own game (T386 part 3, #1043; the owner: some of the ball room's upgrades feed the golf side): the tree's "Your game" branch. The range has what a golfer
// practises with: a video camera on a tripod, fans and lemonade, weighted clubs, a launch monitor, a radar, a putting trainer. Owning them changes what a practice session gives you:
// a factor on every gain of a kind of session, a factor on single skills' gains (the T334 stats: power, accuracy, driving, irons; golf/play/mods.ts reads the skills they raise)
// and the fatigue of the day's later sessions (golf/player.ts FATIGUE). Pure TS, no DOM. player.ts reads the result (PracticeGear) in practicePreview and practise.
import { FATIGUE, NO_GEAR, type PracticeGear, type PracticeKind } from './player';

/** the Swing video room: every gain of a bucket session; Fans and lemonade: the share of the session before that a later bucket of the day gives; Weighted training clubs: the bucket's power
 *  gain; Launch monitor: its driving and irons gains; Doppler ball tracker: its accuracy gain; Putting stroke trainer: every gain of a putting or chipping session */
export const VIDEO_GAIN = 1.15, FANS_FATIGUE = 0.8, WEIGHTED_POWER = 1.5, LMON_SWING = 1.25, RADAR_ACCURACY = 1.6, PUTTLAB_GAIN = 1.25;

/** the gear each practice session has from the range's upgrades owned (NO_GEAR when none: the sessions give what they always did) */
export function practiceGear(owned: readonly string[]): Record<PracticeKind, PracticeGear> {
  const has = (id: string) => owned.includes(id);
  const skill: PracticeGear['skill'] = { ...(has('weighted') ? { power: WEIGHTED_POWER } : {}), ...(has('lmon') ? { driving: LMON_SWING, irons: LMON_SWING } : {}), ...(has('radar') ? { accuracy: RADAR_ACCURACY } : {}) };
  const bucket: PracticeGear = has('swingcam') || has('fans') || Object.keys(skill).length ? { all: has('swingcam') ? VIDEO_GAIN : 1, skill, fatigue: has('fans') ? FANS_FATIGUE : FATIGUE } : NO_GEAR;
  const lab: PracticeGear = has('puttlab') ? { all: PUTTLAB_GAIN, skill: {}, fatigue: FATIGUE } : NO_GEAR;
  return { bucket, putting: lab, chipping: lab };
}
