// What the player did in a golf game (T033): the counters the progressive tool unlocks read (T032). Pure TypeScript, no DOM.
// index.ts re-exports this file, so the imports from './index' are type-only or read inside function bodies (no import-cycle surprises).
import { STAGE_3_TIME_SEC, type PlayerProgressFacts } from './index';

/** what the player did in this golf game (saved in GolfSave.progress): course pieces placed, road builds, car parks, event structures, real play seconds, the hints dismissed and the Advanced toggle */
export interface GolfProgress { pieces: number; roads: number; parks: number; structures: number; playS: number; dismissed: string[]; advanced: boolean }

/** a new game's progress: nothing done yet */
export function emptyProgress(): GolfProgress { return { pieces: 0, roads: 0, parks: 0, structures: 0, playS: 0, dismissed: [], advanced: false }; }

/** a non-negative finite number, else 0 (a bad saved value counts as nothing done) */
function count(x: unknown): number { return typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0; }

/** a loaded save's progress: missing (a game saved before T033) counts as an experienced player (playS = STAGE_3_TIME_SEC, so every tool shows); bad numbers become 0; dismissed keeps only strings */
export function normalizeProgress(p: Partial<GolfProgress> | null | undefined): GolfProgress {
  if (!p) return { ...emptyProgress(), playS: STAGE_3_TIME_SEC };
  return {
    pieces: Math.floor(count(p.pieces)),
    roads: Math.floor(count(p.roads)),
    parks: Math.floor(count(p.parks)),
    structures: Math.floor(count(p.structures)),
    playS: count(p.playS),
    dismissed: Array.isArray(p.dismissed) ? p.dismissed.filter((s): s is string => typeof s === 'string') : [],
    advanced: p.advanced === true,
  };
}

/** the facts T032 reads: a playable hole for every 3 pieces placed (tee, fairway, green), capped at 18; year = tournaments run + 1 */
export function progressFacts(p: GolfProgress, runs: number): PlayerProgressFacts {
  return { advancedMode: p.advanced, year: runs + 1, elapsedSeconds: p.playS, playableHoles: Math.min(18, Math.floor(p.pieces / 3)), roadsBuilt: p.roads, carParksBuilt: p.parks, eventStructuresPlaced: p.structures, dismissedHints: p.dismissed };
}
