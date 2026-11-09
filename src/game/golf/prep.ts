// The tournament prep quests: for the tier being prepared (this tier, or the next), the structures the course still needs, in order, and a few
// optional first steps. Pure TS, no DOM: the engine supplies the facts and pays each newly done step's reward once.
import { STRUCTURE } from './tents';
import { tierInfo, type Need } from './tour';

/** where a step sends the player's eye: the gate, the entrance area, the 18th green, any green, or the clubhouse area */
export type PrepTarget = 'gate' | 'green18' | 'green' | 'clubhouse' | 'entry';
/** one quest step: its tier, copy, the structure type to build, the need it meets (required steps), the count of that type (tvTowers: 2),
 *  whether it is optional, its reward ($) and its target */
export interface PrepStep { id: string; tier: number; title: string; body: string; typeId: string; need?: Need; count?: number; optional?: boolean; reward: number; target: PrepTarget }
/** the player's saved progress: steps done (for good) and skipped, and the chapter tier the player hid */
export interface PrepSave { done: string[]; skipped: string[]; hidden?: number /* the chapter tier hidden by the player */ }
/** the course's facts: the tier, the needs it has, the placed structures, the saved progress, and whether a type's art is ready and its tier allows it */
export interface PrepFacts { tier: number; have: ReadonlySet<Need>; placed: readonly { typeId: string }[]; save: PrepSave; available: (typeId: string) => boolean /* art ready and tier allows */ }
/** one step's line: its state, whether it is the current step, its progress ('1 of 2'), and whether no structure of its type is placed yet (the engine suggests a spot) */
export interface PrepLine { step: PrepStep; state: 'todo' | 'done' | 'skipped'; current: boolean; progress?: string /* e.g. '1 of 2' */; first: boolean /* no structure of step.typeId placed yet: the engine suggests a spot */ }
/** the checklist of the chapter shown: its tier and name, its lines, and the steps whose reward is due now */
export interface PrepView { chapter: number; name: string; lines: PrepLine[]; newlyDone: PrepStep[] }

/** the structure types that meet each need (grandstand18 takes the first the player can build); needs not listed here are not prep steps */
export const NEED_TYPES: Partial<Record<Need, readonly string[]>> = {
  gate: ['gate'], foodTent: ['foodTent'], toilets: ['toilets'], grandstand18: ['compactBleacher60', 'standS', 'standM'], leaderboard: ['leaderboard'],
  merchTent: ['merchTent'], range: ['rangeStand'], tvTowers: ['tvTower'], broadcast: ['broadcast'], hospitality: ['chalet'], media: ['media'],
  grandstands: ['standM'], merchPavilion: ['merchPavilion'], hospitalityVillage: ['village'], coachTerminal: ['coach'], interchange: ['interchange'],
};

/** the copy and target of each required step, by need */
const REQUIRED: Partial<Record<Need, { title: string; body: string; target: PrepTarget; count?: number }>> = {
  gate: { title: 'Build an entrance gate', body: 'Fans pay at the gate: 600 an hour a lane. Put it between the car park and the course.', target: 'gate' },
  foodTent: { title: 'Open a food tent', body: 'Hungry fans spend most at the food tent. Place it on the route from the entrance.', target: 'entry' },
  toilets: { title: 'Add a toilet block', body: 'A crowd will not stay all day without toilets. Place the block near the entrance.', target: 'entry' },
  grandstand18: { title: 'Seat fans by the 18th green', body: 'Fans want somewhere to watch the finish. A grandstand close to the final pin does it.', target: 'green18' },
  leaderboard: { title: 'Hang a main leaderboard', body: 'Scores keep the crowd on the course. Put the board where the 18th green can see it.', target: 'green18' },
  merchTent: { title: 'Open a merchandise tent', body: 'Fans buy caps and shirts on the way out. The tent sells them by the clubhouse.', target: 'clubhouse' },
  range: { title: 'Build a range grandstand', body: 'Fans like to watch the players warm up. A grandstand on the practice range seats them.', target: 'clubhouse' },
  tvTowers: { title: 'Put up two TV camera towers', body: 'Broadcasters need cameras on the holes. Two towers see enough of the course to start.', target: 'green', count: 2 },
  broadcast: { title: 'Build a broadcast compound', body: 'TV trucks need a compound by the clubhouse. It brings in the TV money.', target: 'clubhouse' },
  hospitality: { title: 'Build a hospitality chalet', body: 'Sponsors buy the chalet in advance. It needs a clear spot by the clubhouse.', target: 'clubhouse' },
  media: { title: 'Build a media centre', body: 'Reporters need a working centre near the clubhouse. It raises the media satisfaction.', target: 'clubhouse' },
  grandstands: { title: 'Seat 2,000 spectators', body: 'Seats in all must reach 2,000. Two Grandstand M blocks do it.', target: 'green18' },
  merchPavilion: { title: 'Build a merchandise pavilion', body: 'The biggest shop on the course. Most of the merchandise money comes through it.', target: 'clubhouse' },
  hospitalityVillage: { title: 'Build a hospitality village', body: 'The big sponsor packages need a village for 500 guests. It takes a large site.', target: 'clubhouse' },
  coachTerminal: { title: 'Build a coach terminal', body: 'Coaches bring fans in from the towns. The terminal has 20 bays.', target: 'clubhouse' },
  interchange: { title: 'Build a highway interchange', body: 'Slip roads take the traffic off the town road. It goes on the parcel edge nearest the road.', target: 'clubhouse' },
};

/** the optional first steps, offered from their tier's chapter on, and only when their type is available */
const OPTIONAL: { id: string; tier: number; typeId: string; title: string; body: string; target: PrepTarget }[] = [
  { id: 'prep-first-stand', tier: 1, typeId: 'compactBleacher60', title: 'Seat your first spectators', body: 'A small bleacher by a green gives the first fans somewhere to sit.', target: 'green18' },
  { id: 'prep-hole-board', tier: 1, typeId: 'holeBoard', title: 'Hang a hole scoreboard', body: 'A board at a green shows the score to the fans around it.', target: 'green' },
  { id: 'prep-first-aid', tier: 2, typeId: 'firstAid', title: 'Add a first aid tent', body: 'Heat and crowds bring the odd faint. A first aid tent near the entrance deals with them.', target: 'entry' },
  { id: 'prep-info', tier: 2, typeId: 'info', title: 'Open an info booth', body: 'Fans want tickets and directions. A small booth by the gates sells will-call tickets.', target: 'entry' },
  { id: 'prep-first-camera', tier: 3, typeId: 'tvTower', title: 'Try TV coverage', body: 'One camera tower on a hole shows the TV crew what it can film.', target: 'green' },
];

/** the lowest tier (1..5) whose needs include the need: the tier that asks for it first */
const tierOf = (need: Need): number => { for (let t = 1; t <= 5; t++) if (tierInfo(t).needs.includes(need)) return t; return 5; };
/** a structure type's reward ($): a quarter of its rent (5% of buy when rent is 0), to the nearest 50, at least 250 */
const rewardOf = (typeId: string): number => { const d = STRUCTURE[typeId]; if (!d) return 250; return Math.max(250, Math.round((d.rent > 0 ? d.rent * 0.25 : d.buy * 0.05) / 50) * 50); };

/** a chapter's steps: its required steps in the tier's need order, then the optional ones it offers */
function stepsOf(chapter: number, f: PrepFacts): PrepStep[] {
  const out: PrepStep[] = [];
  for (const need of tierInfo(chapter).needs) {
    const copy = REQUIRED[need], list = NEED_TYPES[need];
    if (!copy || !list) continue;
    const typeId = need === 'grandstand18' ? list.find(id => f.available(id)) : list[0];
    if (!typeId) continue;
    out.push({ id: `prep-${need}`, tier: tierOf(need), title: copy.title, body: copy.body, typeId, need, ...(copy.count ? { count: copy.count } : {}), reward: rewardOf(typeId), target: copy.target });
  }
  const hasStand = out.some(s => s.need === 'grandstand18');
  for (const o of OPTIONAL) {
    if (o.tier > chapter || !f.available(o.typeId) || (o.id === 'prep-first-stand' && hasStand)) continue;
    out.push({ id: o.id, tier: o.tier, title: o.title, body: o.body, typeId: o.typeId, optional: true, reward: rewardOf(o.typeId), target: o.target });
  }
  return out;
}

/** the chapters in play: this tier and the next (clamped to 1..5), each with its steps */
const chaptersOf = (f: PrepFacts) => { const lo = Math.min(5, Math.max(1, f.tier)), hi = Math.min(5, lo + 1); return (hi > lo ? [lo, hi] : [lo]).map(t => ({ t, steps: stepsOf(t, f) })); };
/** whether a step's build is there now: its need met (required) or a structure of its type placed (optional) */
const holdsFor = (f: PrepFacts) => (s: PrepStep) => s.need ? f.have.has(s.need) : f.placed.some(p => p.typeId === s.typeId);
/** the steps of both chapters whose build is there but whose reward is not yet paid (a step shared by both counts once); due whether the card shows or not */
export function prepDue(f: PrepFacts): PrepStep[] {
  const done = new Set(f.save.done), holds = holdsFor(f), out: PrepStep[] = [], seen = new Set<string>();
  for (const c of chaptersOf(f)) for (const s of c.steps) if (holds(s) && !done.has(s.id) && !seen.has(s.id)) { seen.add(s.id); out.push(s); }
  return out;
}

/** the quest checklist to show, or null: the lowest of this tier and the next with a todo step (not when the player hid that chapter) */
export function prepView(f: PrepFacts): PrepView | null {
  const done = new Set(f.save.done), skipped = new Set(f.save.skipped), holds = holdsFor(f);
  const stateOf = (s: PrepStep): PrepLine['state'] => holds(s) || done.has(s.id) ? 'done' : skipped.has(s.id) ? 'skipped' : 'todo';
  const built = chaptersOf(f), newlyDone = prepDue(f);
  const pick = built.find(c => c.steps.some(s => stateOf(s) === 'todo'));
  if (!pick || f.save.hidden === pick.t) return null;
  const lines: PrepLine[] = pick.steps.map(step => {
    const count = step.count ? f.placed.filter(p => p.typeId === step.typeId).length : 0;
    return { step, state: stateOf(step), current: false, ...(step.count ? { progress: `${count} of ${step.count}` } : {}), first: !f.placed.some(p => p.typeId === step.typeId) };
  });
  const cur = lines.find(l => l.state === 'todo'); if (cur) cur.current = true;
  return { chapter: pick.t, name: tierInfo(pick.t).name, lines, newlyDone };
}

/** the nearest integer tile to target (square rings of radius 0..maxR, each from its top-left round) where ok holds; null when none */
export function suggestSpot(target: { x: number; y: number }, ok: (x: number, y: number) => boolean, maxR = 60): { x: number; y: number } | null {
  const cx = Math.round(target.x), cy = Math.round(target.y);
  if (ok(cx, cy)) return { x: cx, y: cy };
  for (let r = 1; r <= maxR; r++) {
    for (let x = cx - r; x <= cx + r; x++) if (ok(x, cy - r)) return { x, y: cy - r };
    for (let y = cy - r + 1; y <= cy + r; y++) if (ok(cx + r, y)) return { x: cx + r, y };
    for (let x = cx + r - 1; x >= cx - r; x--) if (ok(x, cy + r)) return { x, y: cy + r };
    for (let y = cy + r - 1; y > cy - r; y--) if (ok(cx - r, y)) return { x: cx - r, y };
  }
  return null;
}
