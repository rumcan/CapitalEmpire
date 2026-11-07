/** Stable details for a clicked person. Instance identity is independent of appearance, position and animation frame. */
export type PersonRole = 'town' | 'spectator' | 'golfer' | 'staff';

/** A person's persistent identity and actual rendered look; this introduces no skills, movement or economy state. */
export interface PersonIdentity { id: string; lookId: string; role: PersonRole; name: string; job: string; profile: string }

/** A deterministic identity hash; seed is the saved world seed and key is a stable actor/roster key, never a position. */
export function identityHash(seed: number, key: string): number {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  return (h ^ (h >>> 15)) >>> 0;
}

/** The appearance of a population slot, independent of its trips or when it was populated (index, not an animation frame). */
export function personLookIndex(seed: number, slot: number, count: number): number {
  return count > 0 ? identityHash(seed, `look:${slot}`) % count : 0;
}

const FIRST_M = ['Alan', 'Ben', 'Carl', 'David', 'Eddie', 'Frank', 'George', 'Henry', 'Jack', 'Leon', 'Martin', 'Peter', 'Ray', 'Sam', 'Thomas', 'Victor'];
const FIRST_W = ['Alice', 'Beth', 'Carol', 'Diane', 'Elaine', 'Grace', 'Helen', 'Jean', 'June', 'Linda', 'Mary', 'Nora', 'Patricia', 'Rose', 'Susan', 'Wendy'];
const LAST = ['Adams', 'Baker', 'Brown', 'Carter', 'Clark', 'Davis', 'Evans', 'Ford', 'Green', 'Harris', 'Hill', 'Jones', 'Lewis', 'Miller', 'Moore', 'Parker', 'Reed', 'Scott', 'Smith', 'Taylor', 'Turner', 'Walker', 'White', 'Young'];

/** A readable role tied to an existing character archetype; no employment simulation is inferred from a generated portrait. */
export function personJob(lookId: string, role: PersonRole): string {
  if (role === 'spectator') return 'Tournament spectator';
  if (role === 'golfer') return 'Golfer';
  if (role === 'staff') return 'Course staff';
  if (/kid|_k_|teen|student/.test(lookId)) return 'Student';
  if (/mechanic/.test(lookId)) return 'Mechanic';
  if (/postman/.test(lookId)) return 'Postal worker';
  if (/nurse/.test(lookId)) return 'Nurse';
  if (/waitress/.test(lookId)) return 'Restaurant worker';
  if (/business/.test(lookId)) return 'Office worker';
  if (/elder/.test(lookId)) return 'Retired resident';
  if (/jogger/.test(lookId)) return 'Local runner';
  return 'Town resident';
}

/** Details for one actor (world seed + stable instance key). Two actors may share a look without sharing their identity. */
export function personIdentity(seed: number, instance: string, lookId: string, role: PersonRole,
  details: Partial<Pick<PersonIdentity, 'name' | 'job' | 'profile'>> = {}): PersonIdentity {
  const id = `${seed >>> 0}:${instance}`, h = identityHash(seed, instance);
  const first = /(?:_w_|woman|girl)/.test(lookId) ? FIRST_W : FIRST_M;
  const name = `${first[h % first.length]} ${LAST[identityHash(h, 'surname') % LAST.length]}`;
  const profile = role === 'town' ? 'A familiar face around town.' : role === 'spectator' ? 'Here to follow the golf and enjoy the tournament.'
    : role === 'staff' ? 'Part of the team keeping the course running.' : 'Enjoying a day of golf.';
  return { id, lookId, role, name, job: personJob(lookId, role), profile, ...details };
}
