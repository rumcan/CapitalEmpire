// J11 (#1270): the radio. Its pure parts (the stored state, next and previous wrapping round) and the player with a fake <audio>: a new player's radio is off and fetches
// nothing; "on" is remembered and starts at the first click, not before; its volume is the music's (the Mute lifts it to nothing; a hidden tab and the tutorial's voice
// pull it down); a track that will not load skips, and when all fail it rests; a play the browser refuses is tried again at the next click. The shipped list is checked
// against the files on disk and the budget (12 MB, 30 files, all audio), and every file against docs/jam/AUDIO-CREDITS.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RADIO_DEFAULT_ON, RADIO_KEY, Radio, STATIONS, TRACKS, nextIndex, parseRadio, serializeRadio, stationOf, tracksOf, type AudioLike, type Track } from '../src/game/sound/radio';
import { SoundCore } from '../src/game/sound/core';

const tr = (id: string): Track => ({ id, title: id.toUpperCase(), artist: 'A', licence: 'CC0 1.0', page: 'https://example.org/' + id, file: `audio/music/${id}.mp3`, seconds: 60, bytes: 1000 });
const LIST = [tr('a'), tr('b'), tr('c')];

class FakeAudio implements AudioLike {
  src = ''; volume = 1; currentTime = 0; paused = true; preload = ''; plays = 0; refuse = false; pauses = 0; fires = true; /* (false: the file never loads, so no 'playing' comes) */
  private ls = new Map<string, (() => void)[]>();
  play() { this.plays++; if (this.refuse) return Promise.reject(new Error('NotAllowedError')); this.paused = false; if (this.fires) this.fire('playing'); return Promise.resolve(); }
  pause() { this.pauses++; this.paused = true; this.fire('pause'); }
  addEventListener(t: string, fn: () => void) { this.ls.set(t, [...(this.ls.get(t) ?? []), fn]); }
  fire(t: string) { for (const f of this.ls.get(t) ?? []) f(); }
}
function memStore(init: Record<string, string> = {}) { const m = new Map(Object.entries(init)); return { m, getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, String(v)); } }; }
function fakeWin() {
  const ls = new Map<string, ((e: unknown) => void)[]>();
  return { ls, addEventListener: (t: string, fn: (e: unknown) => void) => { ls.set(t, [...(ls.get(t) ?? []), fn]); }, removeEventListener: (t: string, fn: (e: unknown) => void) => { ls.set(t, (ls.get(t) ?? []).filter(x => x !== fn)); } };
}
/** a core whose context exists (so a gesture unlocks it) and a radio over fakes */
function rig(opts: { stored?: Record<string, string>; hidden?: () => boolean; refuse?: boolean } = {}) {
  const made: FakeAudio[] = [], store = memStore(opts.stored), win = fakeWin();
  class Ctx { state = 'running'; currentTime = 0; destination = {}; createGain() { return { gain: { value: 1, setTargetAtTime() { /* */ } }, connect: () => ({}) }; } createDynamicsCompressor() { const p = () => ({ value: 0 }); return { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p(), connect: () => ({}) }; } resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } }
  const core = new SoundCore({ AudioContext: Ctx as unknown as new () => AudioContext, store: memStore(), hidden: () => false });
  const radio = new Radio(core, { audio: () => { const a = new FakeAudio(); a.refuse = !!opts.refuse; made.push(a); return a; }, store, tracks: LIST, base: './', hidden: opts.hidden ?? (() => false), win: win as unknown as Window });
  return { core, radio, made, store, win };
}

test('the stored state: off by default, the track forgotten when it is not in the list, bad text gives the defaults', () => {
  assert.equal(RADIO_DEFAULT_ON, false, 'a new player\'s radio is off: nothing downloads until it is turned on');
  assert.deepEqual(parseRadio(null, LIST), { on: false, id: null, station: 'clubhouse' });
  assert.deepEqual(parseRadio(serializeRadio({ on: true, id: 'b', station: 'clubhouse' }), LIST), { on: true, id: 'b', station: 'clubhouse' });
  assert.deepEqual(parseRadio(serializeRadio({ on: true, id: 'zzz', station: 'clubhouse' }), LIST), { on: true, id: null, station: 'clubhouse' });
  for (const bad of ['', 'x', '42', 'null', '{"on":"yes","id":5}', '[]']) assert.deepEqual(parseRadio(bad, LIST), { on: false, id: null, station: 'clubhouse' }, bad);
});

test('next and previous wrap round the list; an empty list or a bad index gives 0', () => {
  assert.equal(nextIndex(0, 3), 1); assert.equal(nextIndex(2, 3), 0, 'the last wraps to the first'); assert.equal(nextIndex(0, 3, -1), 2, 'the first wraps back to the last');
  assert.equal(nextIndex(1, 3, -1), 0); assert.equal(nextIndex(5, 3), 0); assert.equal(nextIndex(-4, 3), 0, '-4 is the third of three: its next is the first');
  assert.equal(nextIndex(0, 0), 0); assert.equal(nextIndex(3, -1), 0); assert.equal(nextIndex(NaN, 3), 1); assert.equal(nextIndex(Infinity, 3), 1); assert.equal(nextIndex(0, 1), 0);
});

test('a new radio is off, makes no audio element and fetches nothing, even after the first click', () => {
  const { core, radio, made } = rig();
  assert.equal(radio.get().on, false); assert.equal(radio.get().playing, false);
  assert.equal(made.length, 0, 'no <audio> before it is turned on');
  core.unlock();
  assert.equal(made.length, 0, 'the first click alone starts nothing');
  assert.equal(radio.get().track?.id, 'a'); assert.equal(radio.get().count, 3);
});

test('turning it on plays the first track from the page\'s base, and off pauses it and remembers', () => {
  const { core, radio, made, store } = rig();
  core.unlock(); radio.turnOn();
  assert.equal(made.length, 1); const a = made[0]!;
  assert.equal(a.src, './audio/music/a.mp3'); assert.equal(a.preload, 'none'); assert.equal(a.plays, 1);
  assert.deepEqual([radio.get().on, radio.get().playing], [true, true]);
  assert.deepEqual(JSON.parse(store.m.get(RADIO_KEY)!), { v: 2, on: true, id: 'a', station: 'clubhouse' });
  radio.toggle(); assert.deepEqual([radio.get().on, radio.get().playing, a.paused], [false, false, true]);
  assert.deepEqual(JSON.parse(store.m.get(RADIO_KEY)!), { v: 2, on: false, id: 'a', station: 'clubhouse' });
  radio.toggle(); assert.equal(a.plays, 2, 'on again plays the same element'); assert.equal(made.length, 1);
});

test('before the first click the radio plays nothing: turning it on waits for the click', () => {
  const { core, radio, made } = rig();
  radio.turnOn();
  assert.equal(made.length, 0, 'no click yet: no audio element, no play');
  assert.equal(radio.get().on, true); assert.equal(radio.get().playing, false);
  core.unlock();
  assert.equal(made.length, 1); assert.equal(made[0]!.plays, 1); assert.equal(radio.get().playing, true);
});

test('a remembered "on" and its track start at the first click, never before', () => {
  const { core, radio, made } = rig({ stored: { [RADIO_KEY]: serializeRadio({ on: true, id: 'c', station: 'clubhouse' }) } });
  assert.equal(radio.get().on, true); assert.equal(radio.get().track?.id, 'c');
  assert.equal(made.length, 0, 'not at load');
  core.unlock();
  assert.equal(made.length, 1); assert.equal(made[0]!.src, './audio/music/c.mp3'); assert.equal(made[0]!.plays, 1);
  // turned off before the click: the click starts nothing
  const r2 = rig({ stored: { [RADIO_KEY]: serializeRadio({ on: true, id: 'a', station: 'clubhouse' }) } });
  r2.radio.turnOff(); r2.core.unlock(); assert.equal(r2.made.length, 0);
});

test('next and previous change the track, wrap round, keep it and turn the radio on', () => {
  const { core, radio, made, store } = rig();
  core.unlock();
  radio.next(); assert.equal(radio.get().track?.id, 'b'); assert.equal(radio.get().on, true); assert.equal(made[0]!.src, './audio/music/b.mp3');
  radio.next(); radio.next(); assert.equal(radio.get().track?.id, 'a', 'the last wraps to the first');
  radio.prev(); assert.equal(radio.get().track?.id, 'c', 'and back the other way');
  assert.equal(JSON.parse(store.m.get(RADIO_KEY)!).id, 'c');
  // a second radio over the same store comes back on the same track
  const again = new Radio(core, { audio: () => new FakeAudio(), store, tracks: LIST, base: './', hidden: () => false, win: null });
  assert.equal(again.get().track?.id, 'c');
});

test('when a track ends the next one plays, round to the first after the last', () => {
  const { core, radio, made } = rig();
  core.unlock(); radio.turnOn(); const a = made[0]!;
  a.fire('ended'); assert.equal(radio.get().track?.id, 'b'); a.fire('ended'); assert.equal(radio.get().track?.id, 'c'); a.fire('ended'); assert.equal(radio.get().track?.id, 'a');
  assert.equal(a.plays, 4);
  radio.turnOff(); a.fire('ended'); assert.equal(radio.get().track?.id, 'a', 'an end after it was turned off plays nothing');
});

test('the music\'s volume is the sound settings\': muted is nothing, a NaN volume is refused, a hidden tab and the voice pull it down', () => {
  let hidden = false;
  const { core, radio, made } = rig({ hidden: () => hidden });
  core.unlock(); radio.turnOn(); const a = made[0]!;
  assert.equal(a.volume, core.musicLevel()); assert.ok(a.volume > 0);
  core.setVolume('music', 0.5); assert.equal(a.volume, 0.25);
  core.setVolume('music', NaN); assert.equal(a.volume, 0.25, 'a NaN volume changes nothing');
  core.setMuted('music', true); assert.equal(a.volume, 0); core.setMuted('music', false); assert.equal(a.volume, 0.25);
  core.setMuted('all', true); assert.equal(a.volume, 0); core.setMuted('all', false);
  core.setMuted('sfx', true); assert.equal(a.volume, 0.25, 'the effects\' mute does not touch the music');
  radio.duck(true); assert.ok(Math.abs(a.volume - 0.25 * 0.3) < 1e-9, 'the voice ducks it'); radio.duck(true); radio.duck(false); assert.ok(a.volume < 0.25); radio.duck(false); assert.equal(a.volume, 0.25);
  radio.duck(false); assert.equal(a.volume, 0.25, 'too many ends do not push it above its level');
  hidden = true; radio.sync(); assert.equal(a.volume, 0, 'a hidden tab is silent'); hidden = false; radio.sync(); assert.equal(a.volume, 0.25, 'and comes back');
});

test('a track that will not load skips to the next; when every track fails it rests, and turning it on tries again', () => {
  const { core, radio, made } = rig();
  core.unlock(); radio.turnOn(); const a = made[0]!; a.fires = false; // (nothing loads)
  a.fire('error'); assert.equal(radio.get().track?.id, 'b'); assert.equal(radio.get().error, false);
  a.fire('error'); assert.equal(radio.get().track?.id, 'c');
  a.fire('error'); assert.equal(radio.get().error, true, 'three in a row: it rests'); const plays = a.plays;
  a.fire('error'); assert.equal(a.plays, plays, 'and does not loop on a dead connection');
  a.fires = true; radio.turnOff(); radio.turnOn(); assert.equal(radio.get().error, false); assert.equal(a.plays, plays + 1);
  assert.equal(radio.get().playing, true);
});

test('a play the browser refuses waits for the next click and then plays', async () => {
  const { core, radio, made, win } = rig({ refuse: true });
  core.unlock(); radio.turnOn();
  await new Promise(r => setTimeout(r, 5));
  assert.equal(radio.get().playing, false); assert.equal(made[0]!.plays, 1);
  assert.equal(win.ls.get('pointerdown')?.length, 1, 'it listens for the next click');
  made[0]!.refuse = false; for (const f of [...win.ls.get('pointerdown')!]) f({});
  assert.equal(made[0]!.plays, 2); assert.equal(radio.get().playing, true);
  assert.equal(win.ls.get('pointerdown')!.length, 0, 'and stops listening');
});

test('the radio tells its listeners only when something changed', () => {
  const { core, radio } = rig(); let n = 0; const off = radio.subscribe(() => { n++; });
  const v0 = radio.get(); core.unlock(); assert.equal(radio.get(), v0, 'the same object while nothing changed'); assert.equal(n, 0);
  radio.turnOn(); assert.ok(n >= 1); assert.notEqual(radio.get(), v0);
  const v1 = radio.get(), m = n; radio.turnOn(); assert.equal(radio.get(), v1); assert.equal(n, m, 'on again changes nothing');
  off(); radio.next(); assert.equal(n, m, 'unsubscribed');
});

test('without an <audio> element (node, an old browser) or without storage nothing throws', () => {
  const core = new SoundCore({ AudioContext: null, store: null });
  const r = new Radio(core, { audio: null, store: null, tracks: LIST, base: './', hidden: () => false, win: null });
  core.unlock(); assert.doesNotThrow(() => { r.turnOn(); r.next(); r.prev(); r.duck(true); r.turnOff(); });
  const empty = new Radio(core, { audio: null, store: null, tracks: [], base: './', hidden: () => false, win: null });
  assert.doesNotThrow(() => { empty.turnOn(); empty.next(); }); assert.equal(empty.get().track, null);
});

// ---------------------------------------------------------------- the shipped music

const ROOT = process.cwd(); // (the tests run from the repo's root, as the other tests that read files do)

test('every shipped track is a file on disk, the audio is inside the budget, and every file is in the credits', () => {
  const dir = join(ROOT, 'public', 'audio');
  if (!existsSync(dir)) { assert.equal(TRACKS.length, 0, 'tracks listed but no public/audio'); return; }
  const files: { path: string; size: number }[] = [];
  const walk = (d: string): void => { for (const n of readdirSync(d)) { const p = join(d, n), st = statSync(p); if (st.isDirectory()) walk(p); else files.push({ path: p, size: st.size }); } };
  walk(dir);
  assert.ok(files.length <= 30, `${files.length} audio files (at most 30)`);
  assert.ok(files.reduce((a, f) => a + f.size, 0) <= 12 * 1024 * 1024, 'all audio is at most 12 MB');
  // (4 to 6 at first; the owner added five chiptunes on 2026-11-14: up to 12, still inside the 12 MB budget above)
  assert.ok(TRACKS.length >= 4 && TRACKS.length <= 12, `${TRACKS.length} tracks (4 to 12)`);
  const ids = new Set<string>();
  for (const t of TRACKS) {
    assert.ok(!ids.has(t.id), `${t.id} twice`); ids.add(t.id);
    const f = join(ROOT, 'public', t.file); assert.ok(existsSync(f), `${t.file} is missing`);
    assert.equal(statSync(f).size, t.bytes, `${t.id}'s size is not the manifest's`);
    assert.equal(t.licence, 'CC0 1.0', `${t.id} is not CC0`); assert.match(t.page, /^https:\/\/opengameart\.org\/content\//);
    assert.ok(t.seconds >= 40 && t.seconds <= 300, `${t.id} is ${t.seconds} s`);   // (the chiptune loops are 45 to 82 s)
  }
  const credits = readFileSync(join(ROOT, 'docs', 'jam', 'AUDIO-CREDITS.md'), 'utf8');
  for (const f of files) assert.ok(credits.includes(f.path.slice(ROOT.length + 1).split('\\').join('/')), `${f.path} is not in docs/jam/AUDIO-CREDITS.md`);
  for (const t of TRACKS) assert.ok(credits.includes(t.page) && credits.includes(t.title), `${t.title} is not credited with its page`);
});

// The owner, 2026-11-14: "make chip tunes station"
test('stations: each plays its own tracks; the dial turns to the next from its first track; next and previous stay inside the station; the station is remembered', () => {
  const two: Track[] = [...LIST, { ...LIST[0]!, id: 'x', file: 'audio/music/x.mp3', station: 'chiptunes' }, { ...LIST[0]!, id: 'y', file: 'audio/music/y.mp3', station: 'chiptunes' }];
  assert.deepEqual(STATIONS.map(s => s.id), ['clubhouse', 'chiptunes']);
  assert.deepEqual(tracksOf('clubhouse', two).map(t => t.id), ['a', 'b', 'c']); assert.deepEqual(tracksOf('chiptunes', two).map(t => t.id), ['x', 'y']);
  assert.equal(stationOf({ ...LIST[0]!, station: 'no-such' }), 'clubhouse', 'an unknown station is the first');
  // a state saved before there were stations takes its track's own station; a track of another station is forgotten
  assert.deepEqual(parseRadio(JSON.stringify({ v: 1, on: true, id: 'y' }), two), { on: true, id: 'y', station: 'chiptunes' });
  assert.deepEqual(parseRadio(JSON.stringify({ v: 2, on: true, id: 'y', station: 'clubhouse' }), two), { on: true, id: null, station: 'clubhouse' });
  const made: FakeAudio[] = [], store = memStore();
  class Ctx { state = 'running'; currentTime = 0; destination = {}; createGain() { return { gain: { value: 1, setTargetAtTime() { /* */ } }, connect: () => ({}) }; } createDynamicsCompressor() { const p = () => ({ value: 0 }); return { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p(), connect: () => ({}) }; } resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } }
  const core = new SoundCore({ AudioContext: Ctx as unknown as new () => AudioContext, store: memStore(), hidden: () => false });
  const radio = new Radio(core, { audio: () => { const a = new FakeAudio(); made.push(a); return a; }, store, tracks: two, base: './', hidden: () => false, win: fakeWin() as unknown as Window });
  core.unlock();
  assert.equal(radio.get().station.id, 'clubhouse'); assert.equal(radio.get().count, 3); assert.equal(radio.get().stations, 2);
  radio.nextStation();
  assert.equal(radio.get().station.id, 'chiptunes'); assert.equal(radio.get().track?.id, 'x'); assert.equal(radio.get().count, 2); assert.equal(radio.get().on, true, 'turning the dial turns the radio on');
  assert.equal(made[0]!.src, './audio/music/x.mp3');
  radio.next(); assert.equal(radio.get().track?.id, 'y'); radio.next(); assert.equal(radio.get().track?.id, 'x', 'next wraps inside the station');
  assert.deepEqual(JSON.parse(store.m.get(RADIO_KEY)!), { v: 2, on: true, id: 'x', station: 'chiptunes' });
  radio.nextStation(); assert.equal(radio.get().station.id, 'clubhouse'); assert.equal(radio.get().track?.id, 'a');
  // the shipped list: both stations have music
  for (const st of STATIONS) assert.ok(tracksOf(st.id).length >= 4, `${st.name} has ${tracksOf(st.id).length} tracks`);
});
