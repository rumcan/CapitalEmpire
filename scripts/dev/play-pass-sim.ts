// T334 (#960): the pure-model rounds of the play pass's playtest: a scripted golfer (tests/helpers/swing-bot.ts: the 3-click meter's timing with a person's
// bias and spread) plays whole rounds on a course through your own round's model (play/yours.ts playYours), and the totals are printed: score, putts, greens
// and fairways found, penalties, the drive, each club's carry against its nominal, the approach's proximity. Courses: the town's (the dump of
// scripts/dev/play-pass-playtest.mjs: --course <town-course.json>) and a hand-made one (the synthetic 18 of the tests: --course hand).
//   npx esbuild scripts/dev/play-pass-sim.ts --bundle --platform=node --format=esm --loader:.webp=empty --loader:.png=empty --outfile=E:/ClaudeTemp/T334/sim.mjs --log-level=warning
//   node E:/ClaudeTemp/T334/sim.mjs --course E:/ClaudeTemp/T334/playtest/town-course.json [--rounds 30] [--env wind=8,from=270] [--json out.json]
// --env: the conditions of play pass (T334): wind (mph), from (compass degrees), gusty (0..1): the model's conditions are used when the build has them.
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_M } from '../../src/game/golf/types';
import { botRound, HUMANS, mean, pct, type Human, type BotRound } from '../../tests/helpers/swing-bot';
import { gameSkills, START_SKILLS, PRESSURE } from '../../src/game/golf/player';
import { MODEL_V, envOf, type CourseView, type Lie, type OwnerInput, type PlayHole, type Pt } from '../../src/game/golf/play';
import * as shot from '../../src/game/golf/play/shot';

const args = process.argv.slice(2), opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1]! : d; };

/** the town course from the dump: the holes, the lie raster and the heights */
function fromDump(path: string): CourseView & { heightAt: (x: number, y: number) => number } {
  const D = JSON.parse(readFileSync(path, 'utf8')), { x0, y0, w, h } = D.box as { x0: number; y0: number; w: number; h: number };
  const CH: Record<string, Lie> = { t: 'tee', f: 'fairway', r: 'rough', e: 'fescue', b: 'bunker', g: 'green', w: 'water', o: 'out' };
  const lies: string = D.lies, buf = Buffer.from(D.heights as string, 'base64'), hs = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const lieAt = (x: number, y: number): Lie => { const i = Math.floor(x) - x0, j = Math.floor(y) - y0; return i < 0 || j < 0 || i >= w || j >= h ? 'out' : CH[lies[j * w + i]!]!; };
  const heightAt = (x: number, y: number): number => {
    const fx = x - 0.5 - x0, fy = y - 0.5 - y0, i = Math.max(0, Math.min(w - 2, Math.floor(fx))), j = Math.max(0, Math.min(h - 2, Math.floor(fy))), u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fy - j));
    return (hs[j * w + i]! * (1 - u) + hs[j * w + i + 1]! * u) * (1 - v) + (hs[(j + 1) * w + i]! * (1 - u) + hs[(j + 1) * w + i + 1]! * u) * v;
  };
  return { holes: D.holes as PlayHole[], lieAt, heightAt };
}

/** the hand-made course: the 18 synthetic holes of the tests (a green round each pin, a fairway strip, ponds beside two holes, rough, then out of bounds) */
function hand(): CourseView & { heightAt: (x: number, y: number) => number } {
  const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5], POND = [5, 12];
  const holes: PlayHole[] = PARS.map((par, i) => { const y = 20 + 60 * i, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y }; return { n: i + 1, par, tee, pin, line: [tee, pin] }; });
  const ponds = POND.map(i => ({ x: holes[i]!.tee.x + 100, y: holes[i]!.tee.y + 12.5 }));
  const seg = (p: Pt, a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0; return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t); };
  const lieAt = (x: number, y: number): Lie => {
    for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green';
    for (const q of ponds) if (Math.hypot(x - q.x, y - q.y) <= 7.5) return 'water';
    let d = Infinity; for (const h of holes) d = Math.min(d, seg({ x, y }, h.tee, h.pin));
    return d <= 7.5 ? 'fairway' : d <= 40 ? 'rough' : 'out';
  };
  return { holes, lieAt, heightAt: () => 0 };
}

const courseArg = opt('course', 'hand'), view = courseArg === 'hand' ? hand() : fromDump(courseArg), N = +opt('rounds', '30');
/** --v 1|2: the shot model's version the bot's inputs carry (the putting: shot.ts PUTT_V2; default the current MODEL_V); --env wind=mph,from=deg: the day's steady wind and the lie's kinds and slopes for every full shot */
const STATS = Object.fromEntries(opt('stat', '').split(',').filter(Boolean).map(kv => kv.split('=')).map(([k, v]) => [k, +v!])) as Record<string, number>, SHAPE_ARG = opt('shape', '').split(',').map(Number);
const V = +opt('v', String(MODEL_V)), envArg = opt('env', ''), [wmph, wfrom] = envArg.replace(/wind=/, '').split(',').map(Number);
const modOf = (t: { lie: Lie; ball: Pt; suggested: { aim: Pt; club: string } }): Partial<OwnerInput> => ({ ...(V >= 2 ? { v: V } : {}), ...(SHAPE_ARG.length === 2 && t.suggested.club !== 'putter' && (SHAPE_ARG[0] || SHAPE_ARG[1]) ? { shape: { curve: Math.sign(SHAPE_ARG[0]!) as -1 | 0 | 1, flight: Math.sign(SHAPE_ARG[1]!) as -1 | 0 | 1 } } : {}), ...(envArg && t.suggested.club !== 'putter' ? { env: envOf(wmph! > 0 ? { mph: wmph!, from: wfrom ?? 270 } : null, view.kindAt, view.heightAt, t.ball, t.lie, t.suggested.aim) } : {}) });
/** a profile: the skills (0..100 each) the golfer plays at (your everyday game: nerve in it) */
const PROFILES: { name: string; sk: ReturnType<typeof gameSkills> }[] = [
  { name: 'start (hcp 18: 30/24/22/26)', sk: { ...gameSkills(START_SKILLS, PRESSURE.everyday), ...STATS } },
  { name: 'mid (50 each)', sk: gameSkills({ driving: 50, irons: 50, short: 50, putting: 50, nerve: 50 }, PRESSURE.everyday) },
  { name: 'good (75 each)', sk: gameSkills({ driving: 75, irons: 75, short: 75, putting: 75, nerve: 75 }, PRESSURE.everyday) },
];
const clubOf = (b: BotRound) => b.shots;
const rows: Record<string, unknown>[] = [];
/** the putting table: each putt's start distance bucket (m): how many, the share holed, and a hole's putts: 1, 2, 3 or more */
const BUCKETS = [0.5, 1, 1.5, 2, 3, 5, 8, 12, 20, 1e9];
function puttTable(rounds: BotRound[]): { le: number; n: number; make: number }[] {
  const n = BUCKETS.map(() => 0), m = BUCKETS.map(() => 0);
  for (const r of rounds) for (const s of r.shots) if (s.club === 'putter') { const k = BUCKETS.findIndex(b => s.distM <= b); n[k]++; if (s.shot.holed) m[k]++; }
  return BUCKETS.map((le, k) => ({ le, n: n[k]!, make: n[k] ? Math.round(100 * m[k]! / n[k]!) : 0 }));
}
/** the putts a hole took, from the first putt on (holes with at least one putt): shares of 1, 2 and 3 or more */
function puttsPerHole(rounds: BotRound[]): { p1: number; p2: number; p3: number } {
  let h = 0, a = 0, b = 0, c = 0;
  for (const r of rounds) { const byHole = new Map<number, number>(); for (const s of r.shots) if (s.club === 'putter') byHole.set(s.hole, (byHole.get(s.hole) ?? 0) + 1); for (const k of byHole.values()) { h++; if (k === 1) a++; else if (k === 2) b++; else c++; } }
  return { p1: Math.round(100 * a / h), p2: Math.round(100 * b / h), p3: Math.round(100 * c / h) };
}
const ONLY = opt('only', '').split(':');
for (const hname of ['novice', 'club', 'sharp'] as const) for (const [pi, p] of PROFILES.entries()) {
  if (ONLY[0] && (ONLY[0] !== hname || (ONLY[1] !== undefined && +ONLY[1] !== pi))) continue;
  const h: Human = HUMANS[hname], rounds: BotRound[] = [];
  for (let k = 0; k < N; k++) rounds.push(botRound(view, p.sk, h, 1000 + k, 1 + (k % 28), t => modOf(t)));
  const tot = rounds.map(r => r.total - r.par), putts = rounds.map(r => r.putts), girs = rounds.map(r => r.gir / r.pars.length * 100), fw = rounds.map(r => r.fairways / Math.max(1, r.fairwayHoles) * 100), pen = rounds.map(r => r.penalties);
  const all = rounds.flatMap(clubOf), drives = all.filter(s => s.club === 'driver' && s.stroke === 1 && s.totalM !== null), carries = (c: string) => all.filter(s => s.club === c && s.carryM !== null && s.lieBefore !== 'rough' && s.lieBefore !== 'bunker' && s.lieBefore !== 'fescue').map(s => s.carryM!);
  const row = { human: hname, profile: p.name, rounds: N, score: +mean(tot).toFixed(1), p10: pct(tot, 0.1), p90: pct(tot, 0.9), putts: +mean(putts).toFixed(1), gir: +mean(girs).toFixed(0), fw: +mean(fw).toFixed(0), pen: +mean(pen).toFixed(1),
    drive: +mean(drives.map(s => s.totalM!)).toFixed(0), driveCarry: +mean(drives.map(s => s.carryM!)).toFixed(0), carry: Object.fromEntries(['driver', 'wood3', 'iron4', 'iron6', 'iron8', 'pw', 'sw'].map(c => [c, +mean(carries(c)).toFixed(0)])) };
  const withPutts = { ...row, putting: puttTable(rounds).filter(q => q.n > 0).map(q => `${q.le > 1e8 ? '20+' : '<=' + q.le}m: ${q.make}% of ${q.n}`), perHole: puttsPerHole(rounds) };
  rows.push(withPutts); console.log(JSON.stringify(withPutts));
}
// a quick check of the nominal carries at these skills (shot.ts carryM)
console.log('nominal full carry at the start skills:', JSON.stringify(Object.fromEntries((['driver', 'wood3', 'iron6', 'sw'] as const).map(c => [c, +shot.carryM(c, PROFILES[0]!.sk[c === 'sw' ? 'short' : c === 'iron6' ? 'irons' : 'driving']).toFixed(0)]))));
const json = opt('json', '');
if (json) writeFileSync(json, JSON.stringify(rows, null, 1));
