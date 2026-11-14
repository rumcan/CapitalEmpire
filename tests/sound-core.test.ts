// J11 (#1270): the sound core and its settings, in node (no page: a fake AudioContext records what the core asks of it).
// No sound and no context before the first click or key; volumes clamp and a NaN volume is refused; mutes; the settings round trip through a store;
// a hidden page, a context that is not running and a burst of calls make no sound; nothing throws without Web Audio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOUND_DEFAULTS, SOUND_KEY, clampVolume, effectiveMusic, effectiveSfx, loadSoundPrefs, parseSoundPrefs, saveSoundPrefs, serializeSoundPrefs, volumeGain } from '../src/game/sound/prefs';
import { BURST_MAX, SoundCore, installSound, type Recipe } from '../src/game/sound/core';

/** a store that keeps its text in a map */
function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, String(v)); } };
}
/** a context that does what the core asks of it and counts how many were made */
function fakeContext(opts: { autoRun?: boolean } = {}) {
  const made: FakeCtx[] = [];
  class FakeCtx {
    state = 'suspended'; currentTime = 1.5; destination = { dest: true }; resumed = 0; suspended = 0;
    constructor() { made.push(this); }
    createGain() { return { gain: { value: 1, setTargetAtTime() { /* */ } }, connect: (x: unknown) => x }; }
    createDynamicsCompressor() { const p = () => ({ value: 0 }); return { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p(), connect: (x: unknown) => x }; }
    resume() { this.resumed++; if (opts.autoRun !== false) this.state = 'running'; return Promise.resolve(); }
    suspend() { this.suspended++; this.state = 'suspended'; return Promise.resolve(); }
  }
  return { made, AudioContext: FakeCtx as unknown as new () => AudioContext };
}
const clock = () => { let t = 1000; return { now: () => t, tick: (ms: number) => { t += ms; } }; };
const noop: Recipe = () => { /* */ };

test('volumes clamp to 0..1 and a NaN, an Infinity or a word is refused', () => {
  assert.equal(clampVolume(0.5), 0.5);
  assert.equal(clampVolume(-3), 0);
  assert.equal(clampVolume(7), 1);
  assert.equal(clampVolume('0.25'), 0.25);
  assert.equal(clampVolume(0.123456), 0.12);
  for (const bad of [NaN, Infinity, -Infinity, 'loud', '', '  ', null, undefined, {}, [], true]) assert.equal(clampVolume(bad), null, String(bad));
  assert.equal(volumeGain(1), 1); assert.equal(volumeGain(0), 0); assert.equal(volumeGain(0.5), 0.25); assert.equal(volumeGain(NaN), 0);
});

test('the settings round trip through a store, field by field, and bad text gives the defaults', () => {
  const store = memStore();
  assert.deepEqual(loadSoundPrefs(store), SOUND_DEFAULTS);
  const p = { muted: true, music: 0.3, sfx: 0.65, musicMuted: true, sfxMuted: false };
  saveSoundPrefs(p, store);
  assert.deepEqual(loadSoundPrefs(store), p);
  assert.deepEqual(parseSoundPrefs(serializeSoundPrefs(p)), p);
  assert.deepEqual(parseSoundPrefs('not json'), SOUND_DEFAULTS);
  assert.deepEqual(parseSoundPrefs('42'), SOUND_DEFAULTS);
  assert.deepEqual(parseSoundPrefs(null), SOUND_DEFAULTS);
  // a bad field does not spoil the good ones
  assert.deepEqual(parseSoundPrefs('{"music":"x","sfx":0.4,"muted":"yes","musicMuted":true}'), { ...SOUND_DEFAULTS, sfx: 0.4, musicMuted: true });
  assert.deepEqual(parseSoundPrefs('{"music":99,"sfx":-1}'), { ...SOUND_DEFAULTS, music: 1, sfx: 0 });
  // a store that throws leaves the defaults and does not throw
  const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(loadSoundPrefs(bad), SOUND_DEFAULTS);
  assert.doesNotThrow(() => saveSoundPrefs(p, bad));
  assert.doesNotThrow(() => saveSoundPrefs(p, null));
  // the volume as heard is nothing when muted, all or its own kind
  assert.equal(effectiveSfx({ ...SOUND_DEFAULTS, muted: true }), 0); assert.equal(effectiveSfx({ ...SOUND_DEFAULTS, sfxMuted: true }), 0); assert.equal(effectiveSfx({ ...SOUND_DEFAULTS, musicMuted: true }), SOUND_DEFAULTS.sfx);
  assert.equal(effectiveMusic({ ...SOUND_DEFAULTS, muted: true }), 0); assert.equal(effectiveMusic({ ...SOUND_DEFAULTS, musicMuted: true }), 0); assert.equal(effectiveMusic({ ...SOUND_DEFAULTS, sfxMuted: true }), SOUND_DEFAULTS.music);
});

test('no sound and no AudioContext before the first gesture; the first one makes the context once', () => {
  const f = fakeContext(), c = clock(), store = memStore(), ran: number[] = [];
  const core = new SoundCore({ AudioContext: f.AudioContext, store, hidden: () => false, now: c.now });
  const rec: Recipe = (_ctx, _out, t) => { ran.push(t); };
  assert.equal(core.unlocked, false);
  assert.equal(core.ready(), false);
  assert.equal(core.play('click', rec), false, 'no sound before the first click');
  assert.equal(f.made.length, 0, 'the context is not even made before the first click');
  assert.equal(core.audio(), null);
  assert.equal(core.unlock(), true);
  assert.equal(core.unlocked, true);
  assert.equal(f.made.length, 1);
  assert.equal(core.unlock(), true); assert.equal(f.made.length, 1, 'a second gesture does not make a second context');
  assert.equal(core.ready(), true);
  assert.equal(core.play('click', rec), true);
  assert.equal(ran.length, 1);
  assert.ok(ran[0]! > 1.5, 'it starts just after the context clock, never in the past');
});

test('the first pointer or key press unlocks, once; a bare modifier key does not', () => {
  const f = fakeContext(), store = memStore(), core = new SoundCore({ AudioContext: f.AudioContext, store, hidden: () => false });
  const ls = new Map<string, ((e: unknown) => void)[]>();
  const win = {
    addEventListener: (t: string, fn: (e: unknown) => void) => { ls.set(t, [...(ls.get(t) ?? []), fn]); },
    removeEventListener: (t: string, fn: (e: unknown) => void) => { ls.set(t, (ls.get(t) ?? []).filter(x => x !== fn)); },
  };
  installSound(win as unknown as Window, core);
  assert.equal(ls.get('pointerdown')!.length, 1); assert.equal(ls.get('keydown')!.length, 1);
  for (const fn of ls.get('keydown')!) fn({ key: 'Shift' });
  assert.equal(core.unlocked, false, 'Shift alone is no gesture');
  assert.equal(f.made.length, 0);
  for (const fn of [...ls.get('pointerdown')!]) fn({ type: 'pointerdown' });
  assert.equal(core.unlocked, true); assert.equal(f.made.length, 1);
  assert.equal(ls.get('pointerdown')!.length, 0); assert.equal(ls.get('keydown')!.length, 0, 'the listeners go after the first');
});

test('onGesture tells the radio at the first gesture, and at once when it has come', () => {
  const f = fakeContext(), core = new SoundCore({ AudioContext: f.AudioContext, store: memStore(), hidden: () => false });
  let n = 0; core.onGesture(() => { n++; });
  assert.equal(n, 0); core.unlock(); assert.equal(n, 1); core.unlock(); assert.equal(n, 1);
  core.onGesture(() => { n += 10; }); assert.equal(n, 11);
});

test('muted effects, a hidden page and a context that is not running make no sound', () => {
  const f = fakeContext(), c = clock(), store = memStore(); let hidden = false;
  const core = new SoundCore({ AudioContext: f.AudioContext, store, hidden: () => hidden, now: c.now });
  let n = 0; const rec: Recipe = () => { n++; };
  core.unlock();
  assert.equal(core.play('a', rec), true); c.tick(100);
  core.setMuted('sfx', true); assert.equal(core.play('a', rec), false); core.setMuted('sfx', false);
  core.setMuted('all', true); assert.equal(core.play('a', rec), false); core.setMuted('all', false);
  core.setVolume('sfx', 0); assert.equal(core.play('a', rec), false); core.setVolume('sfx', 0.8);
  assert.equal(core.play('a', rec), true); c.tick(100);
  hidden = true; assert.equal(core.play('a', rec), false, 'a hidden page is silent'); hidden = false;
  f.made[0]!.state = 'suspended';
  assert.equal(core.play('a', rec), false, 'a context that is not running plays nothing (its sounds would all come out at once)');
  assert.ok(f.made[0]!.resumed >= 2, 'but it is asked to start again');
  assert.equal(n, 2);
});

test('volumes: set, clamp, persist, and refuse NaN; mutes persist and the Mute key lifts every mute', () => {
  const store = memStore(), core = new SoundCore({ store, AudioContext: null });
  let told = 0; const off = core.subscribe(() => { told++; });
  assert.equal(core.setVolume('music', 0.3), true); assert.equal(core.get().music, 0.3);
  assert.equal(core.setVolume('sfx', 5), true); assert.equal(core.get().sfx, 1);
  assert.equal(core.setVolume('music', NaN), false); assert.equal(core.get().music, 0.3, 'a NaN volume is refused and the volume stays');
  assert.equal(core.setVolume('sfx', 'x'), false); assert.equal(core.get().sfx, 1);
  const before = told; core.setVolume('music', 0.3); assert.equal(told, before, 'the same volume tells no one');
  assert.ok(told >= 2);
  assert.deepEqual(JSON.parse(store.m.get(SOUND_KEY)!), { v: 1, muted: false, music: 0.3, sfx: 1, musicMuted: false, sfxMuted: false });
  core.setMuted('music', true);
  assert.equal(core.toggleMute(), true, 'with sound on, the key mutes all'); assert.equal(core.get().muted, true); assert.equal(core.allMuted, true);
  assert.equal(core.toggleMute(), false, 'and again lifts every mute'); assert.deepEqual([core.get().muted, core.get().musicMuted, core.get().sfxMuted], [false, false, false]);
  // a second core over the same store hears what the first set
  const again = new SoundCore({ store, AudioContext: null });
  assert.equal(again.get().music, 0.3); assert.equal(again.get().sfx, 1);
  assert.equal(core.musicLevel(), volumeGain(0.3)); core.setMuted('music', true); assert.equal(core.musicLevel(), 0);
  off(); const t2 = told; core.setVolume('sfx', 0.2); assert.equal(told, t2, 'unsubscribed');
});

test('each sound has its own shortest gap and a burst is thinned', () => {
  const f = fakeContext(), c = clock(), core = new SoundCore({ AudioContext: f.AudioContext, store: memStore(), hidden: () => false, now: c.now });
  core.unlock(); let n = 0; const rec: Recipe = () => { n++; };
  assert.equal(core.play('click', rec, 1, 50), true);
  c.tick(20); assert.equal(core.play('click', rec, 1, 50), false, 'inside its gap');
  assert.equal(core.play('tick', rec, 1, 50), true, 'another sound is not held by it');
  c.tick(40); assert.equal(core.play('click', rec, 1, 50), true, 'after its gap');
  c.tick(1000);
  // a loop that plays a different sound every millisecond: only BURST_MAX get through inside the window
  let made = 0; for (let k = 0; k < 60; k++) { c.tick(1); if (core.play('s' + k, rec, 1, 0)) made++; }
  assert.equal(made, BURST_MAX);
  c.tick(500); assert.equal(core.play('later', rec, 1, 0), true, 'and the window passes');
});

test('a recipe that throws is swallowed; strength is held to 0..1', () => {
  const f = fakeContext(), c = clock(), core = new SoundCore({ AudioContext: f.AudioContext, store: memStore(), hidden: () => false, now: c.now });
  core.unlock();
  assert.equal(core.play('bad', () => { throw new Error('boom'); }), false);
  const seen: number[] = []; const rec: Recipe = (_c, _o, _t, v) => { seen.push(v); };
  c.tick(100); core.play('v1', rec, 5); c.tick(100); core.play('v2', rec, -2); c.tick(100); core.play('v3', rec, NaN);
  assert.deepEqual(seen, [1, 0, 1]);
});

test('without Web Audio (node, an old browser) or without storage nothing throws and nothing plays', () => {
  const core = new SoundCore({ AudioContext: null, store: null, hidden: () => false });
  assert.equal(core.unlock(), false); assert.equal(core.unlocked, true);
  assert.equal(core.ready(), false); assert.equal(core.play('x', noop), false); assert.equal(core.audio(), null); assert.equal(core.clock(), 0);
  const broken = new SoundCore({ AudioContext: class { constructor() { throw new Error('no audio device'); } } as unknown as new () => AudioContext, store: null });
  assert.equal(broken.unlock(), false); assert.equal(broken.ready(), false);
  const dflt = new SoundCore(); // under node: no AudioContext, no localStorage, no document
  assert.equal(dflt.unlock(), false); assert.equal(dflt.play('x', noop), false);
});
