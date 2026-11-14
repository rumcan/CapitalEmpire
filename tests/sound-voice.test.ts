// J11 (#1270): the tutorial's voice-over. The words the voice says (numbers and symbols written out, for the voice only), the key of a step's file (its id and a hash of the
// exact text shown, so a step whose words changed has no voice), and the player: nothing before the first click, one voice at a time, the switch and the effects' volume,
// the music dipping under it, a step with no file stays silent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hash8, numberToWords, spokenStep, spokenText, voiceKey, voiceSteps } from '../src/game/sound/voice-steps';
import { Voice, VOICES, type VoiceAudio, type VoiceFile } from '../src/game/sound/voice';
import { SoundCore } from '../src/game/sound/core';
import { JAM_TOUR } from '../src/game/ext/progressive-ui/tour';
import { RANGE_GUIDE } from '../src/game/ext/progressive-ui/guide';

test('numbers in words', () => {
  const want: [number, string][] = [[0, 'zero'], [7, 'seven'], [13, 'thirteen'], [20, 'twenty'], [21, 'twenty-one'], [99, 'ninety-nine'], [100, 'one hundred'], [101, 'one hundred one'],
    [110, 'one hundred ten'], [999, 'nine hundred ninety-nine'], [1000, 'one thousand'], [1500, 'one thousand five hundred'], [75000, 'seventy-five thousand'], [2500750, 'two million five hundred thousand seven hundred fifty'],
    [1000000, 'one million'], [-5, 'minus five']];
  for (const [n, w] of want) assert.equal(numberToWords(n), w, String(n));
  assert.equal(numberToWords(NaN), 'NaN'); assert.equal(numberToWords(1.5), '1.5');
});

test('the words a voice says: amounts, percents, years, ranges, menu arrows and symbols; the commas of the sentence stay', () => {
  assert.equal(spokenText('You have $75,000, a plot'), 'You have seventy-five thousand dollars, a plot');
  assert.equal(spokenText('$1 more'), 'one dollar more'); assert.equal(spokenText('$1.50'), 'one dollar and fifty cents'); assert.equal(spokenText('$2,500.75'), 'two thousand five hundred dollars and seventy-five cents');
  assert.equal(spokenText('15% and 3.5%'), 'fifteen percent and three point five percent');
  assert.equal(spokenText('in 1985 and 2026'), 'in nineteen eighty-five and twenty twenty-six');
  assert.equal(spokenText('keys 1-9'), 'keys one to nine'); assert.equal(spokenText('200 balls'), 'two hundred balls'); assert.equal(spokenText('1,200 balls'), 'one thousand two hundred balls');
  assert.equal(spokenText('Range › Place the driving range'), 'Range, then Place the driving range');
  assert.equal(spokenText('Build ▸ Tips has hints'), 'Build, then Tips has hints');
  assert.equal(spokenText('Cart paths & roads › Walking path'), 'Cart paths and roads, then Walking path');
  assert.equal(spokenText('a + b = c'), 'a plus b equals c'); assert.equal(spokenText('Roads ✓'), 'Roads done');
  assert.equal(spokenText('plain words, kept as they are (and brackets).'), 'plain words, kept as they are (and brackets).');
  assert.equal(spokenStep('Your club, your money', 'You have $75,000.'), 'Your club, your money. You have seventy-five thousand dollars.');
  assert.equal(spokenStep('Build', 'Click a tee!'), 'Build. Click a tee!');
  // nothing a voice would spell out is left: no digit, no symbol of the lists above, in any step
  for (const s of voiceSteps()) { const say = spokenStep(s.title, s.body); assert.ok(!/[0-9$%&+=›▸»×✓]/.test(say), `${s.id}: "${say}"`); assert.ok(say.length > 20); }
});

test('the key of a voice file is the step id and a hash of the exact text; any change of the words is a different key', () => {
  const k = voiceKey('tour-town', 'Title', 'Body text.');
  assert.match(k, /^tour-town-[0-9a-f]{8}$/); assert.equal(k, voiceKey('tour-town', 'Title', 'Body text.'));
  assert.notEqual(k, voiceKey('tour-town', 'Title', 'Body text'), 'a changed word or full stop is another key');
  assert.notEqual(k, voiceKey('tour-town', 'Title ', 'Body text.')); assert.notEqual(k, voiceKey('tour-room', 'Title', 'Body text.'));
  assert.notEqual(voiceKey('a', 'x\ny', ''), voiceKey('a', 'x', 'y'), 'the title and the words are not run together');
  assert.equal(hash8('hello'), '4f9f2cab'); assert.equal(hash8(''), '811c9dc5');
});

test('the steps with a voice: the jam tutorial\'s 3, the town tutorial\'s 4 and the range guide\'s 9, each with its own key', () => {
  const steps = voiceSteps();
  assert.equal(steps.filter(s => s.set === 'jam').length, JAM_TOUR.length);
  assert.equal(steps.filter(s => s.set === 'guide').length, RANGE_GUIDE.length); assert.equal(RANGE_GUIDE.length, 9);
  assert.ok(steps.filter(s => s.set === 'tour').length >= 4 - JAM_TOUR.length);
  const keys = steps.map(s => voiceKey(s.id, s.title, s.body)); assert.equal(new Set(keys).size, keys.length, 'no two steps share a key');
  for (const s of steps) { assert.ok(s.title && s.body, s.id); assert.ok(s.body.length < 700, `${s.id} is long`); }
});

test('every voice file in the manifest is on disk and belongs to a step of this build\'s text', () => {
  const live = new Set(voiceSteps().map(s => voiceKey(s.id, s.title, s.body)));
  for (const [k, f] of Object.entries(VOICES)) {
    assert.ok(live.has(k), `${k} is made from words no step has now: run scripts/jam/make-voice.mjs again`);
    assert.ok(existsSync(join(process.cwd(), 'public', f.file)), `${f.file} is missing`);
    assert.ok(f.bytes > 1000 && f.seconds > 0.5);
  }
  assert.ok(Object.keys(VOICES).length === 0 || Object.keys(VOICES).length >= 3, 'voices are made for the jam tutorial at least');
  const m = JSON.parse(readFileSync(join(process.cwd(), 'src/game/sound/voice-manifest.json'), 'utf8')); assert.ok(m && typeof m.voices === 'object');
});

// ---------------------------------------------------------------- the player

class FakeVoiceAudio implements VoiceAudio {
  src = ''; volume = 1; currentTime = 5; preload = ''; plays = 0; pauses = 0; refuse = false;
  private ls = new Map<string, (() => void)[]>();
  play() { this.plays++; return this.refuse ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(); }
  pause() { this.pauses++; }
  addEventListener(t: string, fn: () => void) { this.ls.set(t, [...(this.ls.get(t) ?? []), fn]); }
  fire(t: string) { for (const f of this.ls.get(t) ?? []) f(); }
}
const TITLE = 'Your club', BODY = 'Money is tight.', KEY = voiceKey('tour-town', TITLE, BODY);
const FILES: Record<string, VoiceFile> = { [KEY]: { file: `audio/voice/${KEY}.mp3`, bytes: 90000, seconds: 8 }, [voiceKey('tour-room', 'B', 'b')]: { file: 'audio/voice/x.mp3', bytes: 5000, seconds: 2 } };
function rig(voices: Record<string, VoiceFile> = FILES) {
  class Ctx { state = 'running'; currentTime = 0; destination = {}; createGain() { return { gain: { value: 1, setTargetAtTime() { /* */ } }, connect: () => ({}) }; } createDynamicsCompressor() { const p = () => ({ value: 0 }); return { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p(), connect: () => ({}) }; } resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } }
  const store = new Map<string, string>(), core = new SoundCore({ AudioContext: Ctx as unknown as new () => AudioContext, store: { getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } }, hidden: () => false });
  const ducks: boolean[] = [], made: FakeVoiceAudio[] = [];
  const v = new Voice(core, { audio: () => { const a = new FakeVoiceAudio(); made.push(a); return a; }, voices, base: './', ducker: { duck: on => { ducks.push(on); } } });
  return { core, v, made, ducks };
}

test('the voice plays nothing before the first click, and nothing for a step with no file', () => {
  const { core, v, made } = rig();
  assert.equal(v.say('tour-town', TITLE, BODY), false, 'no click yet'); assert.equal(made.length, 0, 'not even an audio element');
  core.unlock();
  assert.equal(v.say('tour-golf', 'Other', 'words'), false, 'no file for these words'); assert.equal(made.length, 0);
  assert.equal(v.say('tour-town', TITLE, BODY + ' changed'), false, 'the words changed: no voice');
  assert.equal(v.say('tour-town', TITLE, BODY), true); assert.equal(made.length, 1);
  assert.equal(made[0]!.src, `./audio/voice/${KEY}.mp3`); assert.equal(made[0]!.preload, 'none'); assert.equal(made[0]!.plays, 1); assert.equal(v.speaking, true);
});

test('one voice at a time: a new step, stop and the end each let the music back', () => {
  const { core, v, made, ducks } = rig(); core.unlock();
  v.say('tour-town', TITLE, BODY); assert.deepEqual(ducks, [true]);
  v.say('tour-room', 'B', 'b'); assert.deepEqual(ducks, [true, false, true], 'the first stops (the music comes back) and the second starts'); assert.equal(made[0]!.pauses, 1); assert.equal(made.length, 1, 'one element for all');
  v.stop(); assert.deepEqual(ducks, [true, false, true, false]); assert.equal(v.speaking, false); assert.equal(made[0]!.currentTime, 0);
  const paused = made[0]!.pauses; v.stop(); assert.equal(made[0]!.pauses, paused, 'a stop with nothing speaking does nothing more');
  v.say('tour-town', TITLE, BODY); made[0]!.fire('ended'); assert.equal(v.speaking, false); assert.equal(ducks.at(-1), false);
  v.say('tour-town', TITLE, BODY); made[0]!.fire('error'); assert.equal(v.speaking, false); assert.equal(ducks.at(-1), false);
});

test('the voice follows the effects\' volume and its own switch; muted, it is not played', () => {
  const { core, v, made } = rig(); core.unlock();
  core.setVolume('sfx', 0.5); v.say('tour-town', TITLE, BODY); assert.equal(made[0]!.volume, 0.25);
  core.setVolume('sfx', 1); assert.equal(made[0]!.volume, 1);
  core.setVoice(false); assert.equal(v.speaking, false, 'switching it off while it speaks stops it'); assert.equal(v.say('tour-town', TITLE, BODY), false);
  core.setVoice(true); core.setMuted('sfx', true); assert.equal(v.say('tour-town', TITLE, BODY), false, 'the effects are muted'); core.setMuted('sfx', false);
  core.setMuted('all', true); assert.equal(v.say('tour-town', TITLE, BODY), false); core.setMuted('all', false);
  core.setMuted('music', true); assert.equal(v.say('tour-town', TITLE, BODY), true, 'the music\'s mute does not touch the voice');
  core.setVolume('sfx', NaN); assert.equal(core.get().sfx, 1, 'a NaN volume is refused');
});

test('a refused play lets the music back; no files means no voice at all', async () => {
  const r = rig(); r.core.unlock();
  r.v.say('tour-town', TITLE, BODY); r.made[0]!.refuse = true; r.v.say('tour-town', TITLE, BODY); await new Promise(res => setTimeout(res, 5));
  assert.equal(r.v.speaking, false); assert.equal(r.ducks.at(-1), false);
  const none = rig({}); none.core.unlock();
  assert.equal(none.v.available(), false); assert.equal(none.v.say('tour-town', TITLE, BODY), false); assert.equal(none.made.length, 0);
  assert.equal(r.v.available(), true); assert.equal(r.v.has('tour-town', TITLE, BODY), true); assert.equal(r.v.has('tour-town', TITLE, 'x'), false);
  const bare = new Voice(new SoundCore({ AudioContext: null, store: null }), { audio: null, voices: FILES, ducker: null });
  assert.doesNotThrow(() => { bare.say('tour-town', TITLE, BODY); bare.stop(); });
});
