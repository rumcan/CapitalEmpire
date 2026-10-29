// T251 (#728): golf balls bounce and roll on the ground. The shot model's end points are unchanged against main for a fixed set of shots (and the
// rounds' scores with them); the bounce and the roll (golf/play/roll.ts) are deterministic, follow the landing's surface (a higher bounce on the
// fairway, a dead stop in a bunker, a splash in water), end at the model's end point and bend with the ground's slope without moving that end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { chooseShot, hitShot, makeField, playRound, rng, teeTimes } from '../src/game/golf/play';
import type { CourseView, Lie, PlayHole, Pt } from '../src/game/golf/play';

/** the distance (tiles) from p to the segment a-b */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/** a four-hole course with every surface: each hole on its own row (y = 20 + 70 h) from x = 10; a green of 7 tiles round the pin with a bunker short
 *  right of it, a creek across the par 4s and 5s 120 tiles out, a fairway strip of 8 tiles along the line, rough within 30, fescue to 40, out beyond */
function rollCourse(): CourseView {
  const PARS: (3 | 4 | 5)[] = [4, 3, 5, 4];
  const holes: PlayHole[] = PARS.map((par, h) => {
    const y = 20 + 70 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 170 : par === 4 ? 390 : 510) / TILE_M, y };
    return { n: h + 1, par, tee, pin, line: [tee, pin] };
  });
  const lieAt = (x: number, y: number): Lie => {
    let d = Infinity, near: PlayHole = holes[0]!;
    for (const h of holes) { const e = segDist({ x, y }, h.tee, h.pin); if (e < d) { d = e; near = h; } }
    if (Math.hypot(x - near.pin.x, y - near.pin.y) <= 7) return 'green';
    if (Math.hypot(x - (near.pin.x - 11), y - (near.pin.y + 6)) <= 3.5) return 'bunker';
    if (near.par > 3 && x >= near.tee.x + 120 && x <= near.tee.x + 126 && d <= 40) return 'water';
    if (Math.hypot(x - near.tee.x, y - near.tee.y) <= 3) return 'tee';
    return d <= 8 ? 'fairway' : d <= 30 ? 'rough' : d <= 40 ? 'fescue' : 'out';
  };
  return { holes, lieAt };
}

/** a 32-bit FNV-1a digest of a string, hex */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** the fixed set of shots: every hole, from the tee and from points along and off its line, three skills, eight streams each; the model's club and aim
 *  (chooseShot), then where the ball ends, its lie and the penalty (hitShot), as one line per shot */
function fixedShots(view: CourseView): string[] {
  const lines: string[] = [];
  const LIES: Lie[] = ['tee', 'fairway', 'rough', 'fescue', 'bunker'];
  view.holes.forEach((h, hi) => {
    const L = Math.hypot(h.pin.x - h.tee.x, h.pin.y - h.tee.y);
    for (const share of [0, 0.35, 0.6, 0.85, 0.95]) for (const off of share ? [0, 12, -25] : [0]) {
      const from = { x: h.tee.x + (h.pin.x - h.tee.x) * share, y: h.tee.y + off + (h.pin.y - h.tee.y) * share }, lie = share ? LIES[1 + ((hi + Math.abs(off)) % 4)]! : 'tee';
      for (const skill of [0.25, 0.6, 0.95]) for (let k = 0; k < 8; k++) {
        const r = rng(4242 + k, hi * 7 + Math.round(share * 100), Math.round(skill * 100) + off), c = chooseShot(lie, from, h, skill, share === 0);
        if (c.club === 'putter') continue;
        const o = hitShot(r, skill, lie, from, c.aim, c.club, view);
        lines.push(`${hi} ${share} ${off} ${skill} ${k} ${c.club} ${o.to.x} ${o.to.y} ${o.lie} ${o.penalty}`);
      }
      void L;
    }
  });
  return lines;
}

/** the rounds' scores: a tier's field over three seeds on the course, every golfer's strokes by hole */
function fixedRounds(view: CourseView): string {
  const out: string[] = [];
  for (const [tier, seed] of [[1, 11], [3, 23], [5, 37]] as const) {
    const f = makeField(tier, seed), plan = playRound(view, f, teeTimes(f, seed), seed);
    out.push(plan.strokes.map(s => s.join(',')).join(';'), plan.shots.map(s => `${s.to.x},${s.to.y},${s.t}`).join(';'));
  }
  return out.join('|');
}

test('the shot model: the end points of a fixed set of shots and the rounds\' scores are the same as on main (T251 changes only what is drawn)', () => {
  const view = rollCourse(), shots = fixedShots(view);
  assert.ok(shots.length > 300, `a few hundred shots (${shots.length})`);
  const seen = new Set(shots.map(s => s.split(' ')[8])); // (the fixed set reaches every surface the roll knows)
  for (const l of ['fairway', 'rough', 'green', 'bunker']) assert.ok(seen.has(l), `some shot ends on ${l} (${[...seen]})`);
  // (pinned on main at b2fab6e, before T251)
  assert.equal(shots.length, 1248, 'the same set of shots');
  assert.equal(fnv(shots.join('\n')), '4b84a59f', 'the end points, their lies and penalties as on main');
  assert.equal(fnv(fixedRounds(view)), 'ba0e470c', 'the rounds: every stroke, end point and minute as on main');
});
