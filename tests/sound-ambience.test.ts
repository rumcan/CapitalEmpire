// J11 (#1270): the range's ambience: how much of it the camera earns, the breeze built once and taken down (its nodes freed) a few seconds after the camera leaves, a strike
// no more often than every 220 ms, a bird now and then, and nothing at all while the sound core would not be heard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AMBIENCE_FROM, AMBIENCE_FULL, RangeAmbience, ambienceLevel } from '../src/game/sound/range-ambience';
import { SoundCore, sound } from '../src/game/sound/core';

test('the camera earns the ambience from the close zooms only, smoothly, and not when the range is off the screen', () => {
  assert.equal(ambienceLevel(0.3, true), 1); assert.equal(ambienceLevel(AMBIENCE_FULL, true), 1);
  assert.equal(ambienceLevel(AMBIENCE_FROM, true), 0); assert.equal(ambienceLevel(0.02, true), 0); assert.equal(ambienceLevel(0.0125, true), 0);
  const mid = ambienceLevel((AMBIENCE_FROM + AMBIENCE_FULL) / 2, true); assert.ok(mid > 0.45 && mid < 0.55, `${mid}`);
  assert.ok(ambienceLevel(0.12, true) < ambienceLevel(0.16, true));
  assert.equal(ambienceLevel(0.3, false), 0, 'the range is not in view'); assert.equal(ambienceLevel(NaN, true), 0); assert.equal(ambienceLevel(Infinity, true), 0);
});

class P { calls: [string, number, number][] = []; value = 0; setTargetAtTime(v: number, t: number) { this.calls.push(['target', v, t]); } }
class N { edges: N[] = []; connect(n: N) { this.edges.push(n); return n; } disconnect() { this.edges = []; } }
class Src extends N { buffer: unknown = null; loop = false; started = 0; stopped = 0; start() { this.started++; } stop() { this.stopped++; } }
class Filt extends N { type = ''; frequency = { value: 0 }; Q = { value: 0 }; }
class Gn extends N { gain = new P(); }
class Ctx { sampleRate = 44100; currentTime = 3; made: Src[] = []; gains: Gn[] = []; destination = new N();
  createBufferSource() { const s = new Src(); this.made.push(s); return s; } createBiquadFilter() { return new Filt(); } createGain() { const g = new Gn(); this.gains.push(g); return g; }
  createBuffer(_c: number, len: number, sr: number) { return { length: len, sampleRate: sr, getChannelData: () => new Float32Array(len) }; } }

function rig() {
  const ctx = new Ctx(), out = new N(); let on = true, t = 1000;
  const core = { audio: () => (on ? { ctx: ctx as unknown as AudioContext, out: out as unknown as AudioNode } : null) } as unknown as SoundCore;
  const amb = new RangeAmbience(core, () => t, () => 0.5);
  return { ctx, out, amb, mute: (v: boolean) => { on = !v; }, tick: (ms: number) => { t += ms; } };
}

test('the breeze is built once when the camera comes close, follows the level, and is taken down a few seconds after it leaves', () => {
  const { ctx, amb, tick, out } = rig();
  amb.update(0); assert.equal(amb.active, false, 'nothing at a far zoom');
  amb.update(0.01); assert.equal(amb.active, false, 'a level too small to hear builds nothing');
  amb.update(0.6); assert.equal(amb.active, true); assert.equal(ctx.made.length, 1); assert.equal(ctx.made[0]!.started, 1); assert.equal(ctx.made[0]!.loop, true);
  assert.equal(ctx.gains.length, 1); assert.ok(ctx.gains[0]!.edges.includes(out as unknown as N), 'its gain reaches the master bus');
  tick(170); amb.update(1); assert.equal(ctx.made.length, 1, 'built once, not on every update');
  const g = ctx.gains[0]!.gain.calls.at(-1)!; assert.ok(g[1] > 0 && g[1] < 0.2, `the breeze is quiet: ${g[1]}`);
  tick(170); amb.update(0); tick(1000); amb.update(0); assert.equal(amb.active, true, 'it fades before it goes: the nodes live a few seconds');
  tick(4000); amb.update(0); assert.equal(amb.active, false, 'then it is taken down'); assert.equal(ctx.made[0]!.stopped, 1, 'its source is stopped (the nodes are freed)');
  tick(100); amb.update(0.8); assert.equal(amb.active, true); assert.equal(ctx.made.length, 2, 'and built again when the camera comes back');
  amb.teardown(); assert.equal(amb.active, false); amb.teardown();
});

test('nothing is built while the core would not be heard (before a click, muted, hidden)', () => {
  const { ctx, amb, mute, tick } = rig();
  mute(true); amb.update(1); assert.equal(amb.active, false); assert.equal(ctx.made.length, 0);
  mute(false); tick(100); amb.update(1); assert.equal(amb.active, true);
  assert.doesNotThrow(() => new RangeAmbience(new SoundCore({ AudioContext: null, store: null })).update(1));
});

test('a strike is played no more often than every 220 ms, and a faint one is not played', () => {
  const calls: string[] = [], orig = sound.play.bind(sound);
  sound.play = ((id: string) => { calls.push(id); return true; }) as typeof sound.play;
  try {
    const { amb, tick } = rig();
    assert.equal(amb.strike(0.2, 1), true); tick(100); assert.equal(amb.strike(0.2, 1), false, 'too soon'); tick(130); assert.equal(amb.strike(-0.5, 0.6), true);
    tick(500); assert.equal(amb.strike(0, 0.01), false, 'too far off to hear'); assert.equal(amb.strike(0, 0), false);
    assert.deepEqual(calls, ['rangeStrike', 'rangeStrike']);
  } finally { sound.play = orig; }
});

test('a bird now and then while the camera is close, and none when it is far', () => {
  const calls: string[] = [], orig = sound.play.bind(sound);
  sound.play = ((id: string) => { calls.push(id); return true; }) as typeof sound.play;
  try {
    const { amb, tick } = rig();
    amb.update(0.2); tick(20000); amb.update(0.2); assert.deepEqual(calls, [], 'not at a middling level');
    amb.update(1); assert.deepEqual(calls, [], 'the first update only sets the clock: no bird the moment the camera arrives');
    tick(5000); amb.update(1); assert.deepEqual(calls, [], 'about 6 to 16 s apart'); tick(12000); amb.update(1); assert.deepEqual(calls, ['bird']);
    tick(30000); amb.update(0.1); assert.deepEqual(calls, ['bird'], 'none when it has gone far');
  } finally { sound.play = orig; }
});
