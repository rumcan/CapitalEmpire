// Being polite to the public map servers (T358, #1003; docs/OSM-COURSES.md "Find a real course"). The game's players reach Nominatim (the name search) and
// Overpass (the course's map data) from their own browsers, and both are free public services with strict usage policies: at most one Nominatim request a
// second, no search-as-you-type, answers kept instead of asked again, one Overpass query for a course, and a stop when a server says it is busy. This
// file holds what every request goes through: the clock and the network as injectable parts (tests make no live request), the one-a-second gate, the
// cooldown after a refusal, and the two errors the card words ("the map servers are busy", "cannot reach the map servers"). Pure of DOM.

/** the network and the clock, as parts a test replaces (the real ones are the browser's) */
export interface Net {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** a signal that aborts after `ms` (and a call that clears its timer), joined with the caller's own `signal` when given */
  deadline: (ms: number, signal?: AbortSignal) => { signal: AbortSignal; clear: () => void };
}

/** the real network: the browser's fetch, Date, setTimeout */
export const realNet: Net = {
  fetch: (url, init) => globalThis.fetch(url, init),
  now: () => Date.now(),
  sleep: ms => new Promise(r => setTimeout(r, ms)),
  deadline: (ms, outer) => {
    const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
    const onOuter = () => c.abort();
    if (outer) { if (outer.aborted) c.abort(); else outer.addEventListener('abort', onOuter, { once: true }); }
    return { signal: c.signal, clear: () => { clearTimeout(t); outer?.removeEventListener('abort', onOuter); } };
  },
};

/** what the card says when a server answers 429 or refuses (the player waits a minute) */
export const BUSY_MESSAGE = 'The map servers are busy: try again in a minute.';
/** what it says when no server could be reached at all */
export const DOWN_MESSAGE = 'Could not reach the map servers: are you online? Try again in a minute.';

/** a server said it is busy or refused (HTTP 429, 403, 503, 504, 509, or an Overpass "runtime error"/"timed out" remark) on every server tried */
export class ServerBusy extends Error {
  constructor(public readonly detail = '', public readonly retryAfterS = 60) { super(BUSY_MESSAGE); this.name = 'ServerBusy'; }
}
/** no server could be reached (offline, DNS, a timeout on every mirror) or one answered nonsense */
export class ServerDown extends Error {
  constructor(public readonly detail = '') { super(DOWN_MESSAGE); this.name = 'ServerDown'; }
}
/** the player cancelled the request */
export class Cancelled extends Error { constructor() { super('Cancelled'); this.name = 'Cancelled'; } }

/** HTTP statuses that mean "too many requests" or "go away for now": the card says the servers are busy */
export const BUSY_STATUS: ReadonlySet<number> = new Set([429, 403, 502, 503, 504, 509]);

/** the one-request-a-second gate (Nominatim's policy): each `slot()` waits until at least `gapMs` after the previous slot's start. Requests are served in
 *  the order they ask */
export class Gate {
  private next = 0;
  constructor(private readonly gapMs: number, private readonly net: Net) {}
  async slot(): Promise<void> {
    const t = this.net.now(), at = Math.max(t, this.next);
    this.next = at + this.gapMs;
    if (at > t) await this.net.sleep(at - t);
  }
}

/** after a refusal a server is left alone for a while: `check()` throws ServerBusy until the time is up (without sending anything) */
export class Cooldown {
  private until = 0;
  constructor(private readonly net: Net) {}
  trip(seconds: number): void { this.until = Math.max(this.until, this.net.now() + Math.max(1, seconds) * 1000); }
  /** seconds left (0: not cooling down) */
  left(): number { return Math.max(0, Math.ceil((this.until - this.net.now()) / 1000)); }
  check(): void { const s = this.left(); if (s > 0) throw new ServerBusy('cooling down after a refusal', s); }
}

/** the Retry-After header in seconds (a number of seconds; a date is not used), clamped to 5 s .. 5 min, else `fallback` */
export function retryAfterOf(res: Pick<Response, 'headers'>, fallback = 60): number {
  const v = parseInt(res.headers.get('retry-after') ?? '', 10);
  return Number.isFinite(v) && v > 0 ? Math.max(5, Math.min(300, v)) : fallback;
}

/** answers kept so the same question is not asked twice (the library's store in the game, a Map in a test) */
export interface AnswerCache {
  get(key: string): Promise<{ at: number; value: unknown } | undefined>;
  put(key: string, value: unknown, at: number): Promise<void>;
}
/** an AnswerCache in memory */
export class MemoryAnswerCache implements AnswerCache {
  private readonly m = new Map<string, { at: number; value: unknown }>();
  async get(key: string) { return this.m.get(key); }
  async put(key: string, value: unknown, at: number) { this.m.set(key, { at, value }); }
}
