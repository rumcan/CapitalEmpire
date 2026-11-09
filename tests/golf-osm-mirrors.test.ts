// T378 (#1034), part 1: the Overpass servers in the order of their measured health, and what the card is told. A server whose last answer was good is asked first (the
// fastest first), then the servers not asked yet (as listed), then the ones whose last answer failed (the oldest failure first); a server that hung is left alone for five
// minutes, one that was busy for one; what was learned is kept for half an hour in the library's answers (a reload does not wait on a dead server again) and forgotten
// after; the progress line says which server is asked and, with its note, when the servers are slow today. Every network call is a fake: this file makes no live request.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HEALTH_KEY, HEALTH_MEMORY_MS, OVERPASS_SERVERS, SLOW_MS, runOverpass, type StepInfo } from '../src/game/golf/osm/overpass';
import { MemoryAnswerCache, ServerBusy, type Net } from '../src/game/golf/osm/polite';

interface Call { url: string; at: number }
/** a Net whose fetch answers from `handler` (which may move the clock: a slow answer), whose clock otherwise moves only when the test moves it */
function fakeNet(handler: (url: string, n: number, clock: { t: number }) => Response | Promise<Response>, t0 = 1_800_000_000_000) {
  const clock = { t: t0 }, calls: Call[] = [];
  const net: Net = {
    fetch: async url => { calls.push({ url, at: clock.t }); return handler(url, calls.length, clock); },
    now: () => clock.t, sleep: async ms => { clock.t += ms; },
    deadline: (_ms, outer) => ({ signal: outer ?? new AbortController().signal, clear() {} }),
  };
  return { net, calls, clock };
}
const ok = (): Response => new Response(JSON.stringify({ elements: [{ type: 'node', id: 1 }] }), { status: 200 });
const status = (n: number): Response => new Response('{}', { status: n });
const hang = (): never => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
const [MAIN, MAIL, KUMI] = OVERPASS_SERVERS as unknown as [string, string, string, string];
const host = (u: string) => new URL(u).hostname;
const MIN = 60_000;

describe('the order the servers are asked in (T378)', () => {
  it('asks the listed order while nothing is known, then the server that answered last first, the one that hung left alone', async () => {
    const { net, calls, clock } = fakeNet(url => (url === MAIN ? hang() : ok()));
    const first = await runOverpass('Q', net);
    assert.deepEqual(calls.map(c => c.url), [MAIN, MAIL], 'the main server hangs, the first mirror answers');
    assert.equal(first.server, MAIL);
    calls.length = 0;
    await runOverpass('Q', net);
    assert.deepEqual(calls.map(c => c.url), [MAIL], 'the main server is left alone for five minutes: the mirror that answered is asked, and answers');
    clock.t += 6 * MIN;
    calls.length = 0;
    await runOverpass('Q', net);
    assert.deepEqual(calls.map(c => c.url), [MAIL], 'after the five minutes the main server is back in the list but behind the mirror that answers: it is not asked while that one does');
  });
  it('asks a server that failed last only after the ones not asked yet, and the main server again when every other has failed', async () => {
    let mailBusy = false;
    const { net, calls, clock } = fakeNet(url => { if (url === MAIN) return hang(); if (url === MAIL && mailBusy) return status(503); return ok(); });
    await runOverpass('Q', net); // main hangs, mail answers
    clock.t += 6 * MIN; mailBusy = true; calls.length = 0;
    const a = await runOverpass('Q', net);
    assert.deepEqual(calls.map(c => host(c.url)), [host(MAIL), host(KUMI)], 'mail is busy now: kumi, not asked yet, comes before the main server, which failed last');
    assert.equal(a.server, KUMI);
  });
  it('orders good servers fastest first, then those not asked yet, then those that failed (the oldest failure first), from what a visit kept', async () => {
    const t0 = 1_800_000_000_000, cache = new MemoryAnswerCache();
    const mark = (m: Record<string, number>) => ({ until: 0, ...m });
    await cache.put(HEALTH_KEY, {
      d: mark({ failAt: t0 - 5000 }), a: mark({ ms: 9000, okAt: t0 - 1000 }), e: mark({ failAt: t0 - 9000 }), b: mark({ ms: 3000, okAt: t0 - 2000 }),
    }, t0 - 10_000);
    const { net, calls } = fakeNet(() => status(503));
    await assert.rejects(() => runOverpass('Q', net, { servers: ['d', 'c', 'a', 'e', 'b'], cache }), ServerBusy);
    assert.deepEqual(calls.map(c => c.url), ['b', 'a', 'c', 'e', 'd'], 'b (3 s) and a (9 s) first, c (never asked), then e (failed longest ago) and d');
  });
  it('a server that failed without hanging (an HTTP error) is not left alone, but is asked behind the ones that answered', async () => {
    const { net, calls, clock } = fakeNet(url => (url === 'a' ? status(500) : ok()));
    const first = await runOverpass('Q', net, { servers: ['a', 'b'] });
    assert.equal(first.server, 'b'); assert.equal(calls.length, 2);
    calls.length = 0; clock.t += 1000;
    await runOverpass('Q', net, { servers: ['a', 'b'] });
    assert.deepEqual(calls.map(c => c.url), ['b'], 'b answered last: asked first');
  });
  it('keeps the per-server time limits by the server\'s place in the list, whatever order it is asked in', async () => {
    const deadlines: number[] = [], clock = { t: 1_800_000_000_000 };
    const net: Net = {
      fetch: async url => (url === MAIN ? hang() : ok()),
      now: () => clock.t, sleep: async ms => { clock.t += ms; },
      deadline: (ms, outer) => { deadlines.push(ms); return { signal: outer ?? new AbortController().signal, clear() {} }; },
    };
    await runOverpass('Q', net);
    assert.deepEqual(deadlines, [130000, 60000], 'the main server first: 130 s; it hangs; the first mirror: 60 s');
    deadlines.length = 0; clock.t += 6 * MIN;
    await runOverpass('Q', net);
    assert.deepEqual(deadlines, [60000], 'five minutes on the main server is behind the mirror that answered: only the mirror is asked, with the time limit of the mirror (by its place in the list)');
  });
});

describe('what a visit keeps of the servers\' health (T378)', () => {
  it('a reload within half an hour starts from it: the dead main server is not waited on again, the mirror is asked first', async () => {
    const cache = new MemoryAnswerCache(), t0 = 1_800_000_000_000;
    const one = fakeNet(url => (url === MAIN ? hang() : ok()), t0);
    await runOverpass('Q', one.net, { cache });
    assert.equal(one.calls.length, 2);
    const reload = fakeNet(() => ok(), t0 + 2 * MIN);
    await runOverpass('Q', reload.net, { cache });
    assert.deepEqual(reload.calls.map(c => c.url), [MAIL], 'a new visit (a new Net): the main server is still left alone (five minutes), the mirror that answered is asked');
    const later = fakeNet(() => ok(), t0 + 6 * MIN);
    const a = await runOverpass('Q', later.net, { cache });
    assert.equal(a.server, MAIL, 'six minutes on the main server is out of its five-minute wait, but the mirror that answered is still the good one and is asked first');
  });
  it('forgets what is older than half an hour: the listed order again', async () => {
    const cache = new MemoryAnswerCache(), t0 = 1_800_000_000_000;
    const one = fakeNet(url => (url === MAIN ? hang() : ok()), t0);
    await runOverpass('Q', one.net, { cache });
    const much = fakeNet(() => ok(), t0 + HEALTH_MEMORY_MS + MIN);
    await runOverpass('Q', much.net, { cache });
    assert.deepEqual(much.calls.map(c => c.url), [MAIN], 'a snapshot of 31 minutes ago is not trusted: the main server is asked first');
  });
  it('is not hurt by a cache that holds nonsense or cannot be read', async () => {
    const bad: MemoryAnswerCache = new MemoryAnswerCache();
    await bad.put(HEALTH_KEY, 'not an object', Date.now());
    await bad.put('x', 1, 1);
    const { net, calls } = fakeNet(() => ok(), Date.now());
    await runOverpass('Q', net, { cache: bad });
    assert.deepEqual(calls.map(c => c.url), [MAIN]);
    const throwing = { get: async () => { throw new Error('IndexedDB is gone'); }, put: async () => { throw new Error('IndexedDB is gone'); } };
    const two = fakeNet(() => ok());
    await runOverpass('Q', two.net, { cache: throwing });
    assert.equal(two.calls.length, 1, 'it asks as if nothing were kept');
  });
  it('saves what it learned (the server\'s speed and when it answered) under one key', async () => {
    const cache = new MemoryAnswerCache(), { net } = fakeNet((url, _n, c) => { c.t += 7000; return url === MAIN ? ok() : status(503); });
    await runOverpass('Q', net, { cache });
    const kept = await cache.get(HEALTH_KEY);
    assert.ok(kept, 'saved');
    const v = kept!.value as Record<string, { ms?: number; okAt?: number; until: number }>;
    assert.equal(v[MAIN]!.ms, 7000); assert.ok(v[MAIN]!.okAt! > 0 && v[MAIN]!.until === 0);
  });
});

describe('what the card is told as the servers are asked (T378)', () => {
  const run = async (net: Net, cache?: MemoryAnswerCache) => {
    const steps: { text: string; info?: StepInfo }[] = [];
    try { await runOverpass('Q', net, { cache, onStep: (text, info) => steps.push({ text, info }) }); } catch { /* the steps are what is looked at */ }
    return steps;
  };
  it('names the server being asked, which one of how many, and says nothing of slowness while all is well', async () => {
    const steps = await run(fakeNet(() => ok()).net);
    assert.equal(steps.length, 1);
    assert.match(steps[0]!.text, /Asking overpass-api\.de for the map data/);
    assert.deepEqual({ host: steps[0]!.info!.host, n: steps[0]!.info!.n, of: steps[0]!.info!.of, slow: steps[0]!.info!.slow, note: steps[0]!.info!.note }, { host: 'overpass-api.de', n: 1, of: 4, slow: false, note: '' });
  });
  it('says the map servers are slow today as soon as one did not answer, and which one it asks next', async () => {
    const steps = await run(fakeNet(url => (url === MAIN ? hang() : ok())).net);
    assert.equal(steps.length, 2);
    assert.match(steps[1]!.text, /overpass-api\.de did not answer in 130 s: asking maps\.mail\.ru/);
    assert.equal(steps[1]!.info!.slow, true);
    assert.match(steps[1]!.info!.note, /The map servers are slow today: overpass-api\.de is being left alone for 5 min\./);
    assert.equal(steps[1]!.info!.n, 2);
  });
  it('says it at the start of the next question too, while the server is being left alone, and the time the good one took when that was slow', async () => {
    const t0 = 1_800_000_000_000, cache = new MemoryAnswerCache();
    const a = fakeNet((url, _n, c) => { if (url === MAIN) return hang(); c.t += 26_000; return ok(); }, t0);
    await run(a.net, cache);
    const next = await run(fakeNet(() => ok(), t0 + MIN).net, cache);
    assert.equal(next.length, 1);
    assert.equal(next[0]!.info!.slow, true);
    assert.match(next[0]!.info!.note, /overpass-api\.de is being left alone for 4 min; maps\.mail\.ru took 26 s last time/);
    assert.match(next[0]!.text, /Asking maps\.mail\.ru/, 'and the card says which server it asks');
    assert.ok(26_000 >= SLOW_MS);
  });
  it('a good but slow answer (20 s or more) makes the servers slow today even with nothing left alone', async () => {
    const t0 = 1_800_000_000_000, cache = new MemoryAnswerCache();
    await run(fakeNet((_u, _n, c) => { c.t += 22_000; return ok(); }, t0).net, cache);
    const next = await run(fakeNet(() => ok(), t0 + 2 * MIN).net, cache);
    assert.equal(next[0]!.info!.slow, true);
    assert.match(next[0]!.info!.note, /overpass-api\.de took 22 s last time/);
    const fast = await run(fakeNet((_u, _n, c) => { c.t += 3000; return ok(); }, t0 + 40 * MIN).net, cache);
    assert.equal(fast[0]!.info!.slow, false, 'half an hour on, what was kept is forgotten');
  });
  it('does not call a quick answer slow', async () => {
    const t0 = 1_800_000_000_000, cache = new MemoryAnswerCache();
    await run(fakeNet((_u, _n, c) => { c.t += 4000; return ok(); }, t0).net, cache);
    const next = await run(fakeNet(() => ok(), t0 + MIN).net, cache);
    assert.equal(next[0]!.info!.slow, false); assert.equal(next[0]!.info!.note, '');
  });
});
