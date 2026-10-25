// The field (docs/GOLF-PLAY.md decision 2): a tournament's golfers and their tee times, seeded and deterministic. Pure TS, no DOM.
import { FIRST_TEE, LAST_TEE } from '../calendar';
import { rng } from './shot';
import type { Golfer, Group, Sex } from './types';

/** the first names by sex (plain 1985 American names) and the surnames: a golfer is a first name and a surname */
export const GOLFER_NAMES = {
  m: ['Michael', 'David', 'John', 'James', 'Robert', 'Mark', 'William', 'Richard', 'Thomas', 'Gary', 'Steven', 'Kevin', 'Jeff', 'Brian', 'Scott', 'Greg', 'Craig', 'Keith', 'Dennis', 'Terry', 'Larry', 'Ronald', 'Donald', 'Jim', 'Bill', 'Joe', 'Doug', 'Rick', 'Randy', 'Dale', 'Glenn', 'Wayne', 'Kirk', 'Todd', 'Bruce', 'Dean', 'Lee', 'Curtis', 'Roger', 'Dwight'],
  w: ['Susan', 'Linda', 'Karen', 'Debbie', 'Lisa', 'Nancy', 'Patricia', 'Mary', 'Barbara', 'Sharon', 'Cindy', 'Donna', 'Kathy', 'Julie', 'Tammy', 'Carol', 'Diane', 'Janet', 'Pam', 'Jane', 'Anne', 'Beth', 'Judy', 'Kim', 'Laura', 'Lori', 'Peggy', 'Robin', 'Sandy', 'Terri', 'Vicki', 'Wendy', 'Amy', 'Brenda', 'Cheryl', 'Denise', 'Gail', 'Joan', 'Marcia', 'Pat'],
  last: ['Anderson', 'Baker', 'Bennett', 'Brooks', 'Campbell', 'Carter', 'Clark', 'Collins', 'Cooper', 'Cox', 'Davis', 'Dixon', 'Duncan', 'Edwards', 'Ellis', 'Evans', 'Farmer', 'Fisher', 'Fleming', 'Foster', 'Fowler', 'Gibson', 'Gordon', 'Graham', 'Grant', 'Gray', 'Green', 'Griffin', 'Hale', 'Hall', 'Hamilton', 'Hansen', 'Harper', 'Harris', 'Hart', 'Hayes', 'Henderson', 'Hicks', 'Hill', 'Holmes', 'Hughes', 'Hunt', 'Jackson', 'Jenkins', 'Johnson', 'Jones', 'Keller', 'Kelly', 'King', 'Knight', 'Lambert', 'Lawson', 'Lewis', 'Lindsay', 'Long', 'Lowe', 'Marsh', 'Martin', 'Mason', 'Maxwell', 'Miller', 'Mitchell', 'Moore', 'Morgan', 'Murphy', 'Newman', 'Nichols', 'Oliver', 'Owens', 'Parker', 'Patterson', 'Perry', 'Peterson', 'Porter', 'Powell', 'Price', 'Quinn', 'Reed', 'Reynolds', 'Roberts'],
};
/** the field's size by tier (1..5) */
const SIZES = [24, 36, 48, 60, 72];
/** the share of the field that are pros by tier */
const PRO_SHARE = [0.2, 0.4, 0.6, 0.85, 1];
/** the least gap between two tee times (game minutes) */
const GAP = 8;

/** a tier as an integer 1..5 */
const tierOf = (tier: number): number => Math.min(5, Math.max(1, Math.round(tier)));

/** a tournament's field at a tier (1..5): 24 to 72 golfers, all of one sex (men 60% of the time), the pro share by tier, unique names.
 *  The same tier and seed always give the same field */
export function makeField(tier: number, seed: number): Golfer[] {
  const k = tierOf(tier), size = SIZES[k - 1], pros = Math.round(PRO_SHARE[k - 1] * size);
  // its own stream (-1, -1), so no golfer's play shares it
  const sex: Sex = rng(seed, -1, -1)() < 0.6 ? 'm' : 'w';
  // one stream for the rest of the field (hole indices 0..17 are used by the rounds, so these draws never collide with them)
  const r = rng(seed, 1, 18), ids = Array.from({ length: size }, (_, i) => i);
  for (let i = size - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const isPro = new Set(ids.slice(0, pros)), firsts = GOLFER_NAMES[sex], used = new Set<string>(), out: Golfer[] = [];
  for (let id = 0; id < size; id++) {
    const pro = isPro.has(id);
    let name: string;
    do name = `${firsts[Math.floor(r() * firsts.length)]} ${GOLFER_NAMES.last[Math.floor(r() * GOLFER_NAMES.last.length)]}`; while (used.has(name));
    used.add(name);
    // pros are 0.6 to 1.0 in skill, the club amateurs 0.2 to 0.55
    const skill = pro ? 0.6 + 0.4 * r() : 0.2 + 0.35 * r();
    out.push({ id, name, sex, pro, skill, look: Math.floor(r() * 5) });
  }
  return out;
}

/** the tee times of a field: threesomes (a remainder makes the last group 4 or 2), the weakest first and the best last, the owner (if any)
 *  in the first group. Tee times run evenly from FIRST_TEE to LAST_TEE, at least 8 minutes apart (past LAST_TEE if they do not fit).
 *  The seed only breaks ties in skill */
export function teeTimes(golfers: Golfer[], seed: number): Group[] {
  const n = golfers.length, sizes: number[] = Array(Math.floor(n / 3)).fill(3), rem = n % 3;
  if (rem === 2 || (rem === 1 && !sizes.length)) sizes.push(rem);
  else if (rem === 1) sizes[sizes.length - 1] = 4;
  // the tie-break draws from a reserved stream (id -1, no golfer has it), so no golfer's play shares it
  const order = golfers.map(g => ({ g, k: rng(seed, -1, g.id)() })).sort((a, b) => a.g.skill - b.g.skill || a.k - b.k).map(x => x.g);
  const owner = order.findIndex(g => g.owner);
  if (owner > 0) { const [o] = order.splice(owner, 1); order.unshift(o); }
  const step = sizes.length > 1 ? Math.max(GAP, (LAST_TEE - FIRST_TEE) / (sizes.length - 1)) : 0, out: Group[] = [];
  let at = 0;
  sizes.forEach((s, i) => { out.push({ tee: Math.round(FIRST_TEE + i * step), players: order.slice(at, at + s).map(g => g.id) }); at += s; });
  return out;
}
