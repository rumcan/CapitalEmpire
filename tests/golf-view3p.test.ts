// T416 (docs/CINDERLINKS-PORT.md): the host side of the bridge to the view from behind the golfer (src/game/golf/play/view3p.ts), with a fake window
// and a fake iframe: messages from the wrong source (or origin, or failing the guards) are dropped; `course` is sent once, after `ready`; the view's
// `exit` and the page's Escape close it and tell the view. And the page's course converter (entry3p.ts) gives what the view's own (tools/
// course-import.mjs convert) gives for the Woodhill fixture.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { View3p, seedOf, type View3pEvent, type View3pHost, type View3pKey } from '../src/game/golf/play/view3p';
import type { CourseMsg } from '../src/game/golf/play/protocol3p';
import { courseEntry3p } from '../src/game/golf/play/entry3p';
import woodhillJson from '../src/game/golf/osm/data/woodhill.json';
import type { CourseFile } from '../src/game/golf/play/export3p';
// @ts-expect-error: a plain .mjs tool of the view's package, no types
import { convert } from '../packages/cinderlinks/tools/course-import.mjs';

const ORIGIN = 'http://localhost:5174';
const COURSE: CourseMsg = { v: 1, t: 'course', course: { id: 'ce-test' }, features: { course: 'ce-test', v: 1, features: [] }, biome: 'parkland', type: 'private', seed: 7, scale: 1, hole: 3 };

function fake() {
  const sent: unknown[] = [];
  const win = { postMessage: (m: unknown, o: string) => { assert.equal(o, ORIGIN); sent.push(m); } };
  const frame = { contentWindow: win as typeof win | null, removed: false, src: '', remove() { this.removed = true; this.contentWindow = null; } };
  const msgFns = new Set<(e: View3pEvent) => void>(), keyFns = new Set<(e: View3pKey) => void>();
  const host = {
    addEventListener: (t: string, fn: (e: never) => void) => { (t === 'message' ? msgFns : keyFns).add(fn as never); },
    removeEventListener: (t: string, fn: (e: never) => void) => { (t === 'message' ? msgFns : keyFns).delete(fn as never); },
    mount: (src: string) => { frame.src = src; return frame; },
    origin: ORIGIN,
  } as unknown as View3pHost;
  const post = (data: unknown, source: unknown = win, origin = ORIGIN) => { for (const fn of [...msgFns]) fn({ data, source, origin }); };
  const key = (k: string) => { let stopped = false; for (const fn of [...keyFns]) fn({ key: k, preventDefault() {}, stopImmediatePropagation() { stopped = true; } }); return stopped; };
  let asked = 0;
  const v = new View3p(host, async n => { asked++; return { ...COURSE, hole: n }; }, '/');
  return { v, sent, frame, post, key, msgFns, keyFns, asked: () => asked };
}
const tick = () => new Promise(r => setTimeout(r, 0));

describe('view3p: the bridge to the view from behind the golfer', () => {
  it('mounts the view in host mode and sends the course once, after ready', async () => {
    const f = fake();
    f.v.open(3);
    assert.equal(f.frame.src, '/cinderlinks/index.html?host=1');
    await tick();
    assert.equal(f.sent.length, 0, 'nothing before ready');
    f.post({ v: 1, t: 'ready' }); await tick();
    f.post({ v: 1, t: 'ready' }); await tick();
    const courses = f.sent.filter(m => (m as { t: string }).t === 'course');
    assert.equal(courses.length, 1);
    assert.equal((courses[0] as CourseMsg).hole, 3);
    assert.equal(f.asked(), 1);
  });

  it('drops messages from another window, another origin, or that fail the guards', async () => {
    const f = fake(), heard: string[] = [];
    f.v.onMessage(m => heard.push(m.t));
    f.v.open(1);
    f.post({ v: 1, t: 'ready' }, { postMessage() {} }); // another window
    f.post({ v: 1, t: 'ready' }, f.frame.contentWindow, 'https://elsewhere.example'); // another origin
    f.post({ v: 2, t: 'ready' }); // another version
    f.post({ v: 1, t: 'course' }); // a host message coming back
    f.post('ready');
    f.post({ v: 1, t: 'exit' }, { postMessage() {} }); // an exit from elsewhere does not close it
    await tick();
    assert.deepEqual(heard, []);
    assert.equal(f.sent.length, 0);
    assert.ok(f.v.isOpen);
    f.post({ v: 1, t: 'loaded', holes: 18 });
    assert.deepEqual(heard, ['loaded']);
  });

  it("closes on the view's exit, telling the view and the page", async () => {
    const f = fake(), closed: string[] = [];
    f.v.onClose(w => closed.push(w));
    f.v.open(2);
    f.post({ v: 1, t: 'ready' }); await tick();
    f.post({ v: 1, t: 'exit' });
    assert.ok(!f.v.isOpen);
    assert.ok(f.frame.removed);
    assert.deepEqual(closed, ['exit']);
    assert.equal((f.sent[f.sent.length - 1] as { t: string }).t, 'leave');
    assert.equal(f.msgFns.size + f.keyFns.size, 0, 'stops listening');
  });

  it("closes on the page's Escape and keeps it from the manager game", () => {
    const f = fake(), closed: string[] = [];
    f.v.onClose(w => closed.push(w));
    f.v.open(1);
    assert.equal(f.key('a'), false);
    assert.ok(f.v.isOpen);
    assert.equal(f.key('Escape'), true);
    assert.deepEqual(closed, ['esc']);
    assert.ok(!f.v.isOpen);
  });

  it('drops a course that is still being built when the view closes', async () => {
    const f = fake();
    f.v.open(1);
    f.post({ v: 1, t: 'ready' });
    f.v.close();
    await tick();
    assert.ok(!f.sent.some(m => (m as { t: string }).t === 'course'));
  });

  it('send refuses what is not a host message, and with no view open', () => {
    const f = fake();
    assert.equal(f.v.send(COURSE), false);
    f.v.open(1);
    assert.equal(f.v.send({ v: 1, t: 'nonsense' } as never), false);
    assert.equal(f.v.send({ v: 1, t: 'clock' } as never), true);
  });

  it('seeds from the name, the same every time', () => {
    assert.equal(seedOf('Maple Falls Golf Club'), seedOf('Maple Falls Golf Club'));
    assert.notEqual(seedOf('Maple Falls Golf Club'), seedOf('Oak Hill Golf Club'));
  });
});

describe("entry3p: the page's course converter matches the view's", () => {
  it('Woodhill converts as tools/course-import.mjs converts it', async () => {
    const mine = await courseEntry3p(woodhillJson as unknown as CourseFile), theirs = convert(woodhillJson, 'woodhill.json');
    assert.deepEqual(mine.holes, theirs.holes);
    assert.deepEqual(mine.polys, theirs.polys);
    assert.deepEqual(mine.streams, theirs.streams);
    assert.deepEqual(mine.hg, theirs.hg);
    assert.equal(mine.id, theirs.id);
  });
});
