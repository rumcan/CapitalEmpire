/** #1296 (the owner, 2026-11-14: "I clicked on play just this hole and it started up the wrong golf game? it should be the cinderlinks one"): every way to play a hole or a round
 * yourself opens the golf view from behind the golfer (Cinderlinks). Source checks on the engine's entries (the whole flow, with real clicks and the view's frame up, is
 * scripts/dev/holes-playthrough.mjs) and on the captions the old top-down panels drew ("Stand In for swing meter art": nothing on screen says Stand In). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const eng = readFileSync('src/game/engine.ts', 'utf8');
/** the text of one method of the engine, from its header line to the next method at the same indent */
function method(head: RegExp): string {
  const m = head.exec(eng); assert.ok(m, `engine has ${head}`);
  const rest = eng.slice(m.index), end = rest.slice(1).search(/\n  (?:\/\*\*|private |[a-zA-Z0-9_]+\(.*\) *(?::[^{]+)?\{)/);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

test('1. the helper opens the view on the round at once, and says why when the view refuses the hole (the top-down round plays on from above)', () => {
  const f = method(/\n  private openRoundView\(\): boolean \{/);
  assert.match(f, /this\.hole3pWhy\(h\.n\)/); assert.match(f, /The golf view cannot open hole \$\{h\.n\} \(\$\{why\.join\(', '\)\}\): you play it from above/);
  assert.match(f, /this\.open3pRound\(\)/); assert.match(f, /return this\.view3pHole !== null/);
  assert.match(f, /if \(!r \|\| !v \|\| r\.over\) return false;/);
});

test('2. the hole card\'s Play chip (practiceStart: just this hole, all of the course) opens the view on its round', () => {
  const f = method(/\n  practiceStart\(n: number, scope: PracticeScope\) \{/);
  assert.match(f, /this\.setYourRound\(\{ \.\.\.r, practice: true \}\)/);
  assert.match(f, /this\.openRoundView\(\)/);
  assert.ok(f.indexOf('this.setYourRound') < f.indexOf('this.openRoundView()'), 'the round exists before the view opens on it');
});

test('3. the first tee\'s Play a round yourself (yourRoundStart), a booked round and an event\'s open it too; an event opens it once its competition rules are set', () => {
  const y = method(/\n  yourRoundStart\(choice: HoleChoice, picked: number\[\] = \[\], rules\?: RoundRules, inView = true\) \{/);
  assert.match(y, /if \(inView\) this\.openRoundView\(\);/);
  assert.match(y, /the golf view opens on its tee/, 'the toast does not send the player walking up to a tee when the view opens');
  const ev = method(/\n  playEvent\(id: EventId\) \{/);
  assert.match(ev, /this\.yourRoundStart\('all', \[\], \{ \.\.\.COMPETITION_RULES \}, false\)/);
  assert.ok(ev.indexOf('mode: MODE_OF[id]') < ev.indexOf('this.openRoundView()'), 'the event\'s mode and rules are on the round before the view reads them');
  const b = method(/\n  private beginPlanned\(sp: StartPlan\) \{/);
  assert.match(b, /yourRoundStart\('all', \[\]\)/, 'a booked round begins through yourRoundStart: the view opens in it');
  assert.match(b, /if \(this\.view3pHole === null\) \{ this\.watchFor\('round', true\)/, 'and the pace-of-play watch does not un-pause a clock the view holds still');
});

test('4. a money match opens it too (Match3p plays it there)', () => {
  const f = method(/\n  private matchBegin\(o: Opponent, stake: number, n: number, back: boolean\): boolean \{/);
  assert.match(f, /this\.openRoundView\(\)/);
});

test('5. the other entries: the round bar\'s view button was and stays open3pRound; Play this hole is open3p; the hole card\'s Play chip reaches practiceStart only', () => {
  const app = readFileSync('src/App.tsx', 'utf8'), card = readFileSync('src/ui/golf/HoleCard.tsx', 'utf8');
  assert.match(app, /onView=\{\(\) => game\.open3pRound\(\)\}/);
  assert.match(card, /game\.open3p\(c\.n\)/);
  assert.match(card, /game\.practiceStart\(c\.n, 'hole'\)/); assert.match(card, /game\.practiceStart\(c\.n, 'all'\)/);
  assert.doesNotMatch(card, /yourRoundStart|setYourRound/, 'the card starts no top-down round of its own');
});

/** every .ts and .tsx under a folder */
function files(dir: string): string[] { return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : []; }); }

test('6. nothing the UI draws on a canvas says Stand In (the swing meter and the spin ball drew "Stand In for ... art" in the normal game)', () => {
  for (const f of files('src/ui')) {
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /fillText\(\s*['"`]Stand In/, `${f} draws a Stand In caption`);
    assert.doesNotMatch(t, /(?:swing meter|spin ball) art/, `${f} names a stand-in for art it draws`);
  }
  for (const f of ['src/ui/ShotPanel.tsx', 'src/ui/SpinBall.tsx']) assert.doesNotMatch(readFileSync(f, 'utf8'), /fillText\([^)]*Stand/, `${f}: no caption`);
});
