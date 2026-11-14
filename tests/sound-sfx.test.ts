// J11 (#1270): the effects. Every recipe is run against a fake audio context that records what it builds: each source is started and stopped inside the sound's
// length (so every node frees itself), reaches the output (no silent recipe), and never asks for a ramp to 0 or a bad number (a RangeError in a real browser).
// The UI hook's choice of sound for a control, the map's spend sounds, the golf view's message routing, the Mute key, and the click that gives way to a louder
// sound that was made meanwhile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOUNDS, TARGET_DB, TRIM, recipeOf, rng, noiseBuffer } from '../src/game/sound/recipes';
import { SoundCore, sound } from '../src/game/sound/core';
import { GOLF_KINDS, SFX_NAMES, clubClass, golfSound, playRangeStrike, playSfx, strengthOf, surfaceOf } from '../src/game/sound/sfx';
import { installMuteKey, installUiSounds, pickUiSound, type UiFacts } from '../src/game/sound/ui-hook';
import { mapSounds, soundOfSpend } from '../src/game/sound/map-sounds';

// ---------------------------------------------------------------- a fake context

class Param { calls: [string, number, number][] = []; value = 0;
  setValueAtTime(v: number, t: number) { this.calls.push(['set', v, t]); return this; }
  exponentialRampToValueAtTime(v: number, t: number) { this.calls.push(['exp', v, t]); return this; }
  linearRampToValueAtTime(v: number, t: number) { this.calls.push(['lin', v, t]); return this; }
  setTargetAtTime(v: number, t: number) { this.calls.push(['target', v, t]); return this; } }
class Node { edges: Node[] = []; connect(n: Node) { this.edges.push(n); return n; } }
class Gain extends Node { gain = new Param(); }
class Source extends Node { started: number | null = null; stopped: number | null = null; frequency = new Param(); type = ''; buffer: unknown = null; loop = false;
  start(t: number) { this.started = t; } stop(t: number) { this.stopped = t; } }
class Filter extends Node { frequency = new Param(); Q = { value: 0 }; type = ''; }
class Panner extends Node { pan = { value: 0 }; }
class Ctx {
  sampleRate = 44100; destination = new Node(); sources: Source[] = []; params: Param[] = []; gains: Param[] = [];
  createOscillator() { const s = new Source(); this.sources.push(s); this.params.push(s.frequency); return s; }
  createBufferSource() { const s = new Source(); this.sources.push(s); return s; }
  createGain() { const g = new Gain(); this.params.push(g.gain); this.gains.push(g.gain); return g; }
  createBiquadFilter() { const f = new Filter(); this.params.push(f.frequency); return f; }
  createStereoPanner() { return new Panner(); }
  createBuffer(_ch: number, len: number, sr: number) { return { length: len, sampleRate: sr, getChannelData: () => new Float32Array(len) }; }
}
const reaches = (from: Node, to: Node, seen = new Set<Node>()): boolean => { if (from === to) return true; if (seen.has(from)) return false; seen.add(from); return from.edges.some(n => reaches(n, to, seen)); };

test('every sound frees its nodes inside its length, reaches the output, and asks for nothing the browser would refuse', () => {
  assert.ok(SOUNDS.length >= 30);
  const ids = new Set<string>();
  rng.next = () => 0.37;
  for (const s of SOUNDS) {
    assert.ok(!ids.has(s.id), `${s.id} is listed twice`); ids.add(s.id);
    for (const v of [0, 0.5, 1]) {
      const ctx = new Ctx(), out = new Node(), t = 2;
      s.recipe(ctx as unknown as BaseAudioContext, out as unknown as AudioNode, t, v);
      assert.ok(ctx.sources.length >= 1, `${s.id} makes no source`);
      for (const src of ctx.sources) {
        assert.ok(src.started !== null && Number.isFinite(src.started) && src.started >= t, `${s.id} starts a source in the past or never`);
        assert.ok(src.stopped !== null && src.stopped > src.started!, `${s.id} leaves a source running (it would never free itself)`);
        assert.ok(src.stopped! <= t + s.maxMs / 1000 + 0.1, `${s.id} runs a node for ${((src.stopped! - t) * 1000).toFixed(0)} ms (its length is ${s.maxMs} ms)`);
        assert.ok(reaches(src, out), `${s.id} has a source that never reaches the output`);
      }
      for (const p of ctx.params) for (const [kind, val, at] of p.calls) {
        assert.ok(Number.isFinite(val) && Number.isFinite(at), `${s.id}: a ${kind} with a bad number`);
        if (kind === 'exp') assert.ok(val > 0, `${s.id}: an exponential ramp to ${val} (a RangeError in a browser)`);
      }
    }
  }
  rng.next = () => Math.random();
});

test('a sound at strength 0 is nearly silent and a trim never clips the recipe it multiplies', () => {
  for (const s of SOUNDS) {
    const ctx = new Ctx(); s.recipe(ctx as unknown as BaseAudioContext, new Node() as unknown as AudioNode, 0, 1);
    let peak = 0; for (const p of ctx.gains) for (const [kind, val] of p.calls) if (kind === 'exp') peak = Math.max(peak, val);
    assert.ok(peak <= 2.5, `${s.id}: a gain of ${peak}`); // (a gain ramp this high before the filters would be a mistake; the level script measures the real peak)
  }
  for (const id of Object.keys(TRIM)) assert.ok(SOUNDS.some(s => s.id === id), `a trim for ${id}, which is no sound`);
  for (const id of Object.keys(TARGET_DB)) { assert.ok(SOUNDS.some(s => s.id === id), `a target for ${id}, which is no sound`); assert.ok(TARGET_DB[id]! >= -18 && TARGET_DB[id]! <= -6, `${id}'s target is outside -18..-6 dBFS`); }
  for (const s of SOUNDS) assert.ok(s.id in TARGET_DB, `${s.id} has no level target`);
  assert.throws(() => recipeOf('nope'), /no sound/);
  assert.equal(typeof recipeOf('click'), 'function');
});

test('the noise is made once per context and the same every time', () => {
  const ctx = new Ctx(), a = noiseBuffer(ctx as unknown as BaseAudioContext), b = noiseBuffer(ctx as unknown as BaseAudioContext);
  assert.equal(a, b); assert.equal((a as unknown as { length: number }).length, 88200);
});

// ---------------------------------------------------------------- the UI's choice

const facts = (o: Partial<UiFacts> = {}): UiFacts => ({ tag: 'button', type: '', role: '', sound: '', label: 'Build', testid: '', checked: false, expanded: null, pressed: null, open: false, disabled: false, ...o });

test('a press on a control picks the sound that fits it', () => {
  assert.equal(pickUiSound(facts()), 'click');
  assert.equal(pickUiSound(facts({ label: '' })), 'click');
  assert.equal(pickUiSound(facts({ tag: 'a' })), 'click');
  assert.equal(pickUiSound(facts({ role: 'tab' })), 'tick');
  assert.equal(pickUiSound(facts({ pressed: true })), 'tick'); assert.equal(pickUiSound(facts({ pressed: false })), 'tick');
  assert.equal(pickUiSound(facts({ tag: 'input', type: 'checkbox', checked: true })), 'on');
  assert.equal(pickUiSound(facts({ tag: 'input', type: 'checkbox', checked: false })), 'off');
  assert.equal(pickUiSound(facts({ tag: 'input', type: 'radio', checked: true })), 'on');
  for (const type of ['range', 'text', 'number', 'file', 'color']) assert.equal(pickUiSound(facts({ tag: 'input', type })), null, `an input ${type} makes no click sound`);
  assert.equal(pickUiSound(facts({ tag: 'select' })), null); assert.equal(pickUiSound(facts({ tag: 'textarea' })), null);
  assert.equal(pickUiSound(facts({ expanded: false })), 'open'); assert.equal(pickUiSound(facts({ expanded: true })), 'close');
  assert.equal(pickUiSound(facts({ tag: 'summary', open: false })), 'open'); assert.equal(pickUiSound(facts({ tag: 'summary', open: true })), 'close');
  for (const label of ['Close', 'Close the statement note', 'Back to the course', '✕', '×', 'Dismiss', 'Skip tutorial']) assert.equal(pickUiSound(facts({ label })), 'close', label);
  assert.equal(pickUiSound(facts({ testid: 'statement-toast-close' })), 'close');
  assert.equal(pickUiSound(facts({ label: 'Closed deals' })), 'click', 'a word that only starts with close is not Close');
  assert.equal(pickUiSound(facts({ disabled: true })), null);
  assert.equal(pickUiSound(facts({ sound: 'none' })), null, 'data-sound="none" opts a control or a region out');
  assert.equal(pickUiSound(facts({ sound: 'tick' })), 'tick'); assert.equal(pickUiSound(facts({ sound: 'OPEN' })), 'open');
  assert.equal(pickUiSound(facts({ sound: 'bogus' })), 'click', 'an unknown name falls back to the plain click');
});

// ---------------------------------------------------------------- the hook, with a fake document

function fakeDoc() {
  const ls = new Map<string, ((e: unknown) => void)[]>();
  return { ls, addEventListener: (t: string, fn: (e: unknown) => void) => { ls.set(t, [...(ls.get(t) ?? []), fn]); }, removeEventListener: (t: string, fn: (e: unknown) => void) => { ls.set(t, (ls.get(t) ?? []).filter(x => x !== fn)); } };
}
/** an element as factsOf reads it: closest() gives the control itself (and no region with data-sound) */
function fakeControl(tag: string, attrs: Record<string, string> = {}, props: Record<string, unknown> = {}) {
  const self: Record<string, unknown> = { tagName: tag.toUpperCase(), textContent: attrs.text ?? '', getAttribute: (k: string) => attrs[k] ?? null, parentElement: null, ...props };
  self.closest = (sel: string) => (sel.includes('data-sound') ? null : self);
  return self as unknown as EventTarget;
}

test('the hook plays the click on a button one turn later, and gives way to a louder sound made meanwhile', () => {
  const core = new SoundCore({ AudioContext: null, store: null }), doc = fakeDoc(), played: string[] = [], later: (() => void)[] = [];
  let clock = 100;
  const c2 = Object.assign(core, { lastPlayedAt: -Infinity });
  const off = installUiSounds(doc as unknown as Document, c2, id => { played.push(id); return true; }, fn => { later.push(fn); });
  const click = doc.ls.get('click')![0]!;
  // a plain click: queued, then played
  const realNow = performance.now.bind(performance); performance.now = () => clock;
  try {
    click({ target: fakeControl('button', { text: 'Build' }) });
    assert.equal(played.length, 0, 'not before the page has run its own handlers'); later.shift()!(); assert.deepEqual(played, ['click']);
    // a click that the page answered with a coin: the click is dropped
    clock = 200; click({ target: fakeControl('button', { text: 'Buy' }) }); c2.lastPlayedAt = 200.5; later.shift()!(); assert.deepEqual(played, ['click'], 'the coin answered it');
    // a click on the map's canvas (no control), on a disabled button and on a region that opted out: nothing
    clock = 300; click({ target: { closest: () => null } }); click({ target: fakeControl('button', { text: 'x' }, { disabled: true }) }); click({ target: null }); assert.equal(later.length, 0);
    // a tick box
    clock = 400; click({ target: fakeControl('input', {}, { type: 'checkbox', checked: true }) }); later.shift()!(); assert.deepEqual(played, ['click', 'on']);
    // a slider lets go: a tick
    const change = doc.ls.get('change')![0]!;
    change({ target: { tagName: 'INPUT', type: 'range', closest: () => null } }); assert.deepEqual(played, ['click', 'on', 'tick']);
    change({ target: { tagName: 'INPUT', type: 'text', closest: () => null } }); assert.equal(played.length, 3, 'a text box is not a slider');
  } finally { performance.now = realNow; }
  off(); assert.equal(doc.ls.get('click')!.length, 0); assert.equal(doc.ls.get('change')!.length, 0);
  assert.doesNotThrow(() => installUiSounds(null)());
});

test('the Mute key mutes everything and lifts every mute; other keys, a held key and chords do nothing', () => {
  const store = new Map<string, string>(), core = new SoundCore({ AudioContext: null, store: { getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } } });
  const ls = new Map<string, ((e: unknown) => void)[]>();
  const win = { addEventListener: (t: string, fn: (e: unknown) => void) => { ls.set(t, [...(ls.get(t) ?? []), fn]); }, removeEventListener: (t: string, fn: (e: unknown) => void) => { ls.set(t, (ls.get(t) ?? []).filter(x => x !== fn)); } };
  const off = installMuteKey(win as unknown as Window, core), key = ls.get('keydown')![0]!;
  let prevented = 0; const press = (o: object) => key({ key: 'F8', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, preventDefault: () => { prevented++; }, ...o });
  press({}); assert.equal(core.get().muted, true); assert.equal(prevented, 1);
  press({ repeat: true }); press({ ctrlKey: true }); press({ shiftKey: true }); press({ key: 'm' }); assert.equal(core.get().muted, true, 'a held key, a chord and another key do nothing');
  core.setMuted('music', true); press({}); assert.deepEqual([core.get().muted, core.get().musicMuted, core.get().sfxMuted], [false, false, false]);
  off(); assert.equal(ls.get('keydown')!.length, 0); assert.doesNotThrow(() => installMuteKey(null)());
});

// ---------------------------------------------------------------- the map and the golf view

test('what a spend sounds like: a thump for a map build, a scrape for the bulldozer, a coin for a purchase, nothing for upkeep', () => {
  assert.equal(soundOfSpend('construction', 1200, true), 'place');
  assert.equal(soundOfSpend('construction', 1200, false), 'cash');
  assert.equal(soundOfSpend('construction', -600, true), 'bulldoze');
  assert.equal(soundOfSpend('construction', -1000, false), null, 'a guide reward or an undo is no sound of its own');
  assert.equal(soundOfSpend('lots', 5000, false), 'cash'); assert.equal(soundOfSpend('lots', -5000, false), null);
  for (const k of ['upkeep', 'business', 'balls', 'bank', 'compensation']) assert.equal(soundOfSpend(k, 100, false), null, k);
  assert.equal(soundOfSpend('construction', 0, true), null); assert.equal(soundOfSpend('construction', NaN, true), null);
});

function spy() {
  const calls: { id: string; v: number; gap: number }[] = [], orig = sound.play.bind(sound);
  sound.play = ((id: string, _r: unknown, v = 1, gap = 30) => { calls.push({ id, v, gap }); return true; }) as typeof sound.play;
  return { calls, restore: () => { sound.play = orig; } };
}

test('the golf view\'s messages play the club and the surface they name, and anything else is ignored', () => {
  const s = spy();
  try {
    assert.equal(golfSound({ k: 'strike', club: 'driver', p: 1 }), true);
    assert.equal(golfSound({ k: 'strike', club: 'wood3', p: 0.5 }), true);
    assert.equal(golfSound({ k: 'strike', club: 'iron7', p: 0.5 }), true);
    assert.equal(golfSound({ k: 'strike', club: 'sw', p: 0.5 }), true);
    assert.equal(golfSound({ k: 'strike', club: 'putter', p: 0.5 }), true);
    assert.equal(golfSound({ k: 'swish', club: 'hybrid', p: 0.4 }), true);
    assert.equal(golfSound({ k: 'land', mat: 'sand', p: 1 }), true);
    assert.equal(golfSound({ k: 'land', mat: 'lava' }), true);
    assert.equal(golfSound({ k: 'cup' }), true); assert.equal(golfSound({ k: 'cup', drop: false }), true);
    assert.equal(golfSound({ k: 'tap' }), true);
    for (const k of ['heart', 'breath', 'applause', 'groan']) assert.equal(golfSound({ k }), true, k);
    assert.deepEqual(s.calls.map(c => c.id), ['strike-driver', 'strike-driver', 'strike-iron', 'strike-wedge', 'strike-putter', 'swish-iron', 'land-sand', 'land-fairway', 'cup-drop', 'cup-lip', 'strike-putter', 'heart', 'breath', 'applause', 'groan']);
    assert.equal(sound.get().muted, false); assert.equal(golfSound({ k: 'mute' }), true); assert.equal(sound.get().muted, true, 'F8 in the view mutes the page'); assert.equal(golfSound({ k: 'mute' }), true); assert.equal(sound.get().muted, false, 'and again lifts it');
    for (const bad of [{}, { k: 'boom' }, { k: 42 }, { k: null }, { k: '__proto__' }, { k: 'constructor' }]) assert.equal(golfSound(bad as never), false, JSON.stringify(bad));
    // a strength is held to 0..1 and a missing one gets a default
    s.calls.length = 0; golfSound({ k: 'strike', club: 'iron5', p: 9 }); golfSound({ k: 'strike', club: 'iron5', p: -3 }); golfSound({ k: 'strike', club: 'iron5', p: NaN }); golfSound({ k: 'strike', club: 'iron5' });
    assert.deepEqual(s.calls.map(c => c.v), [1, 0, 0.7, 0.7]);
  } finally { s.restore(); }
  assert.ok(GOLF_KINDS.length >= 9);
});

test('club and surface names: the model\'s ids map to the four clubs and the six surfaces', () => {
  const want: Record<string, string> = { driver: 'driver', wood3: 'driver', wood5: 'driver', hybrid: 'iron', iron4: 'iron', iron9: 'iron', pw: 'wedge', gw: 'wedge', sw: 'wedge', lw: 'wedge', putter: 'putter', wedge: 'wedge', '': 'iron', zzz: 'iron' };
  for (const [id, c] of Object.entries(want)) assert.equal(clubClass(id), c, id);
  assert.equal(clubClass(undefined), 'iron'); assert.equal(clubClass(7), 'iron'); assert.equal(clubClass({}), 'iron');
  for (const m of ['fairway', 'green', 'sand', 'water', 'rough', 'rock']) assert.equal(surfaceOf(m), m);
  assert.equal(surfaceOf('lava'), 'fairway'); assert.equal(surfaceOf(null), 'fairway');
  assert.equal(strengthOf(0.3), 0.3); assert.equal(strengthOf('x'), 0.7); assert.equal(strengthOf(Infinity), 0.7); assert.equal(strengthOf(2), 1);
});

test('the named effects, the range strike and the map\'s toast sound go through the one core (nothing plays before the first click)', () => {
  assert.ok(SFX_NAMES.includes('cash') && SFX_NAMES.includes('refuse') && SFX_NAMES.includes('chime') && SFX_NAMES.includes('ding'));
  // under node there is no AudioContext: the real core makes no sound and nothing throws
  assert.equal(playSfx('click'), false); assert.equal(playRangeStrike(0.5, 1), false); assert.equal(playRangeStrike(NaN, 1), false);
  assert.doesNotThrow(() => { mapSounds.spent('construction', 100, true); mapSounds.toast('warn'); mapSounds.toast('info'); });
  const s = spy();
  try {
    mapSounds.spent('construction', 100, true); mapSounds.spent('construction', 100, false); mapSounds.spent('construction', -50, true); mapSounds.toast('warn'); mapSounds.toast('good');
    assert.deepEqual(s.calls.map(c => c.id), ['place', 'cash', 'bulldoze', 'refuse']);
    s.calls.length = 0; playRangeStrike(2, 0.5); playRangeStrike(-0.04, 1);
    assert.deepEqual(s.calls.map(c => c.id), ['rangeStrike', 'rangeStrike']);
  } finally { s.restore(); }
});
