// T433 (docs/CINDERLINKS-PORT.md, ghost rounds): a round played in the view from behind the golfer, kept as a file anyone can replay. A round is its inputs
// (live.ts OwnerInput: the club, the aim, the power, the swing, the spin, the conditions it was struck in, the model's version), the session it was played
// in (the course's name and its file's hash, the holes, the seed, the golfer and his kit as the model played him), and the strokes it took. Nothing else is
// kept: replaying the inputs on a fresh round of the same seed (LiveGroup.replay) gives the very same strokes on any machine, so the file stays small.
// Played alongside a new session (Play3p's `ghost`), the ghost is an actor that walks and plays the course as the round did, minute by minute.
// Pure TS, no DOM.
import type { TeeKind } from '../types';
import type { CourseView, Golfer, RoundPlan, Sex } from './types';
import { LiveGroup, MODEL_V, type OwnerInput } from './live';
import { playRound } from './round';
import { teeTimes } from './field';
import type { ShotSkill } from './shot';
import type { Frame3p } from './export3p';
import type { Pt } from './types';
import { actorsMsg } from './actors3p';
import { holesView } from './play3p';
import { fieldShotMsg } from './shot3p';
import type { ShotMsg } from './protocol3p';
import type { Actor } from './protocol3p';

export const GHOST_KIND = 'capitalempire-ghost';
/** a ghost file's version: a file of another version is refused */
export const GHOST_V = 1;
/** the ghost's id among the actors */
export const GHOST_ID = 400000;

/** a round to replay: the course (its name and its file's hash: share3p.ts courseHash), the holes played (the course's indexes) and the seed, the golfer and his
 *  kit as the model played him, the model's version, the inputs in order, and each hole's strokes (to check a replay by, and to show) */
export interface GhostFile {
  v: 1; kind: typeof GHOST_KIND; course: { name: string; hash: string }; holes: number[]; seed: number; model: number;
  golfer: { name: string; sex: Sex; skills: ShotSkill; tees?: TeeKind; look?: number };
  inputs: OwnerInput[]; strokes: number[];
  /** when it was played (free words, absent: not said) */
  when?: string;
  /** T436: the kit it was played with ('level': everyone's the same: fair3p.ts; absent: his own), and his handicap then (player.ts handicapOf; absent: not known) */
  mode?: 'own' | 'level'; hcp?: number;
}

/** a session's round as a ghost file: what the session was made with (Play3pOpts' holes, seed, skills, sex, tees), its inputs and plan (Play3p.inputs, .plan),
 *  and the course */
export function ghostOf(o: { holes: readonly number[]; seed: number; skills: ShotSkill; sex: Sex; tees?: TeeKind; name: string; look?: number; mode?: 'own' | 'level'; hcp?: number },
  course: { name: string; hash: string }, inputs: readonly OwnerInput[], plan: RoundPlan, owner = 0, when?: string): GhostFile {
  return { v: GHOST_V, kind: GHOST_KIND, course: { ...course }, holes: [...o.holes], seed: o.seed | 0, model: MODEL_V, ...(o.mode ? { mode: o.mode } : {}), ...(o.hcp !== undefined ? { hcp: o.hcp } : {}),
    golfer: { name: o.name, sex: o.sex, skills: o.skills, ...(o.tees ? { tees: o.tees } : {}), ...(o.look !== undefined ? { look: o.look } : {}) },
    inputs: inputs.map(i => JSON.parse(JSON.stringify(i)) as OwnerInput), strokes: [...(plan.strokes[owner] ?? [])], ...(when ? { when } : {}) };
}
/** the file's text */
export const ghostText = (g: GhostFile): string => JSON.stringify(g);
/** a ghost read back from a file's text, or why it cannot be used. With the course's hash, a ghost of another course is refused */
export function readGhost(text: string, hash?: string): { ghost: GhostFile } | { why: string } {
  let o: unknown; try { o = JSON.parse(text); } catch { return { why: 'The file is not a ghost round (it does not read as JSON)' }; }
  const g = o as Partial<GhostFile>;
  if (!g || g.kind !== GHOST_KIND) return { why: 'The file is not a ghost round' };
  if (g.v !== GHOST_V) return { why: `The ghost round is of another version (${String(g.v)}; this game reads ${GHOST_V})` };
  if (!Array.isArray(g.inputs) || !Array.isArray(g.holes) || !g.holes.length || !g.golfer || !g.course) return { why: 'The ghost round is missing its inputs, holes or golfer' };
  if ((g.model ?? 0) > MODEL_V) return { why: `The ghost round was played on a newer game (model ${g.model}; this one is ${MODEL_V})` };
  if (hash && g.course.hash !== hash) return { why: `The ghost round was played on another course (${g.course.name})` };
  return { ghost: g as GhostFile };
}

/** a ghost replayed: the round as it was played (its plan on the holes' course), and whether every stroke came out as the file says */
export interface GhostReplay { ghost: GhostFile; plan: RoundPlan; view: CourseView; same: boolean }
/** the ghost's round played again from its inputs on a fresh round of the same holes and seed (as Play3p makes one): the same strokes as when it was played */
export function replayGhost(g: GhostFile, view: CourseView): GhostReplay {
  const hv = holesView(view, g.holes), sk = g.golfer.skills;
  const golfer: Golfer = { id: 0, name: g.golfer.name, sex: g.golfer.sex, pro: false, look: g.golfer.look ?? 0, owner: true,
    skill: typeof sk === 'number' ? sk : (sk.driving + sk.irons + sk.short + sk.putting) / 4, ...(g.golfer.tees ? { tees: g.golfer.tees } : {}), ...(typeof sk === 'number' ? {} : { skills: sk }) };
  const plan = playRound(hv, [golfer], teeTimes([golfer], g.seed), g.seed, { live: 0 }), live = new LiveGroup(plan, hv, 0, g.seed);
  let same = true;
  try { live.replay(g.inputs); } catch { same = false; }
  live.advance();
  const got = plan.strokes[0] ?? [];
  if (g.strokes.some((k, i) => k > 0 && got[i] !== k)) same = false;
  return { ghost: g, plan, view: hv, same };
}

/** the ghost as an actor at game minute m: where the round had him then (round.ts stateAt), drawn see-through, with his name; null once he is done */
export function ghostActor(r: GhostReplay, m: number, frame: Frame3p | Pt): Actor | null {
  const a = actorsMsg({ plan: r.plan, view: r.view, minute: m }, frame).actors.find(x => x.role === 'golfer');
  if (!a) return null;
  const { owner: _o, ...rest } = a; void _o;
  return { ...rest, id: GHOST_ID, name: r.ghost.golfer.name, ghost: true };
}

/** the ghost's strokes struck after minute t0 and by minute t1, as `shot` messages (golfer GHOST_ID): the view plays them back see-through, each when its
 *  minute comes */
export function ghostShots(r: GhostReplay, t0: number, t1: number, frame: Frame3p | Pt): ShotMsg[] {
  const c = 'cx' in frame ? { x: frame.cx, y: frame.cy } : frame;
  return r.plan.shots.filter(s => s.golfer === 0 && s.t > t0 && s.t <= t1).sort((a, b) => a.t - b.t)
    .map(s => ({ ...fieldShotMsg({ ...s, golfer: GHOST_ID }, c, { hole: r.view.holes[s.hole]?.n ?? s.hole + 1, view: r.view }), ghost: true as const }));
}
