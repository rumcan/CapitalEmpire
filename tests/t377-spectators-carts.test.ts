// T377 (#1033, the owner, 2026-11-08: "fix spectators walking in step 3 at a time and over water, greens, fairways or tee boxes, that includes where carts can drive.
// they should not be driving on tee boxes or greens and follow the cart paths. fix people standing watching next to a tee box. they need to be around it not on it."):
// a simulated tournament day on a course with a river and a pond, greens, fairways, big tee boxes and cart paths. The spectators walk from the gate to the
// galleries by the City's crowd (event/crowd.ts, with the router the City sets from the spectators' field: golf/walkfield.ts), drawn as the engine draws them
// (crowdview.ts); the galleries stand round a tee and a green (golf/galleries.ts); the field's carts drive the day (golf/play/carts.ts with the course's field).
// No spectator (the party's place, and each person drawn) and no cart (its stops, its drives, sampled along their length) is ever on a tee box, a green, a bunker or
// water; a gallery is not in front of a tee; carts keep to the paths; the people of a party are never in step. The same day on the old code (no router, no
// field, no ground for the galleries) puts them there: those checks are in the tests as the proof that these ones can fail.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Crowd, WALK_STRIDE } from '../src/game/event/crowd';
import { galleryPeople, walkerPeople, type CrowdPerson } from '../src/game/crowdview';
import { SPECTATOR_PEOPLE } from '../src/game/library';
import { galleryPlaces, gallerySpots } from '../src/game/golf/galleries';
import { G, RouteCache, SPECTATOR, SPECTATOR_GROW, SPECTATOR_WATER_GROW, dilate, groundAt, passable, type WalkField } from '../src/game/golf/walkfield';
import { buildWalkField, type Way } from '../src/game/golf/walkground';
import { CartPlay, cartPaths, fieldEntourage, makeField, playRound, teeTimes } from '../src/game/golf/play';
import type { CourseView, Lie, PlayCart, PlayHole } from '../src/game/golf/play';
import { TILE_M } from '../src/game/golf/types';

const NP = SPECTATOR_PEOPLE.length;
/** whether a spectator may stand at a point of a field */
const passableAt = (f: WalkField, x: number, y: number): boolean => passable(f, SPECTATOR, x, y);
/** the grounds nobody walks or drives on */
const blocked = (f: WalkField, x: number, y: number): boolean => { const g = groundAt(f, x, y); return g === G.tee || g === G.green || g === G.bunker || g === G.water; };

// ---------- course A: the crowd's day ----------
// three holes in rows 90 tiles apart (tee box 12 x 18 at x 40, green of radius 11 at x 300, a fairway of 18 between), a river down x 120-130 with a footbridge at y 143,
// a pond on the middle hole's fairway, a cart path down x 60. The map's width 420, height 300.
const HOLES_A = [0, 1, 2].map(k => ({ tee: { x: 40, y: 50 + 90 * k }, pin: { x: 300, y: 50 + 90 * k } }));
function surfA(x: number, y: number): number {
  for (const h of HOLES_A) {
    if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 11) return 8;
    if (x >= h.tee.x - 6 && x <= h.tee.x + 6 && y >= h.tee.y - 9 && y <= h.tee.y + 9) return 5;
  }
  if (Math.hypot(x - 180, y - 140) <= 12) return 3;
  for (const h of HOLES_A) if (x > h.tee.x && x < h.pin.x && Math.abs(y - h.tee.y) <= 9) return 4;
  return 1;
}
const wetA = (x: number, _y: number): boolean => x >= 120 && x < 130;
const WAYS_A: Way[] = [{ ax: 100, ay: 143, bx: 150, by: 143, hw: 2, cart: false, bridge: true }, { ax: 60, ay: 0, bx: 60, by: 300, hw: 1, cart: true }];
const fieldA = (): WalkField => buildWalkField(0, 0, 420, 300, { surf: surfA, wet: wetA, ways: WAYS_A, teeBoxes: HOLES_A.map(h => ({ x: h.tee.x, y: h.tee.y, r: 1.5 })), holes: HOLES_A.map(h => ({ tee: h.tee, aim: h.pin })) });
const TEES = HOLES_A.map((h, i) => ({ hole: i + 1, ...h.tee })), PINS = HOLES_A.map((h, i) => ({ hole: i + 1, ...h.pin }));
const GATE = { x: 20, y: 10 };

describe('T377: the galleries stand round a tee and a green, not on them', () => {
  const f0 = fieldA(), sf = dilate(f0, SPECTATOR_GROW, SPECTATOR_WATER_GROW);
  /** the people of a spot as the engine draws them (60 fans), by galleryPeople */
  const fans = (s: { x: number; y: number; kind: string; fx: number; fy: number; ax: number; ay: number; places?: number[] }, i: number): CrowdPerson[] => {
    const out: CrowdPerson[] = [], buf = Float32Array.of(s.x, s.y, 60, s.kind === 'stand' ? 2 : 0, s.fx, s.fy, s.ax, s.ay), n = galleryPeople(buf, 0, i, 100, NP, out, -1, undefined, s.places);
    return out.slice(0, n).map(p => ({ ...p }));
  };
  it('on the old code (no ground) the gallery of a big tee box and of a green stands on it', () => {
    const old = gallerySpots(TEES, PINS, []); let onTee = 0, onGreen = 0;
    old.forEach((s, i) => { for (const p of fans(s, i)) { const g = groundAt(f0, p.x, p.y); if (g === G.tee) onTee++; if (g === G.green) onGreen++; } });
    assert.ok(onTee > 20 && onGreen > 20, `${onTee} fans on tee boxes, ${onGreen} on greens`);
  });
  it('with the ground every fan of every gallery is on open ground: not on a tee, a green, a fairway, water, a bunker, nor in front of a tee', () => {
    const spots = gallerySpots(TEES, PINS, [], undefined, sf); assert.equal(spots.length, 6);
    spots.forEach((s, i) => {
      const ps = fans(s, i); assert.equal(ps.length, 60, `spot ${i}`);
      for (const p of ps) {
        const g = groundAt(f0, p.x, p.y);
        assert.ok(g === G.open || g === G.path || g === G.walk, `${s.kind} gallery of hole ${s.hole}: a fan at ${p.x.toFixed(1)}, ${p.y.toFixed(1)} on ground ${g}`);
        if (s.kind === 'tee') { const t = HOLES_A[s.hole - 1]!.tee, pin = HOLES_A[s.hole - 1]!.pin, L = Math.hypot(pin.x - t.x, pin.y - t.y); assert.ok(((p.x - t.x) * (pin.x - t.x) + (p.y - t.y) * (pin.y - t.y)) / L <= 1.2, `a fan of hole ${s.hole}'s tee gallery stands in front of the tee`); }
      }
      // round it: the gallery is near the tee or green it watches (within 16 tiles), not far off
      assert.ok(Math.hypot(s.x - s.fx, s.y - s.fy) <= 22, `${s.kind} spot ${i} stays round its tee or green (${Math.hypot(s.x - s.fx, s.y - s.fy).toFixed(1)} tiles)`);
    });
  });
});

/** a tee box of 4 x 8 tiles (x 40 to 44, y 56 to 64) with its marker at (42, 60), the line of play east to a green of radius 6 at (100, 60) with a bunker beside it at (96, 70) and a
 *  pond to the north of the tee (x 20 to 40, y 30 to 45): the ground of a small course, for the galleries' arc and ring */
function smallCourse(): { f0: WalkField; sf: WalkField; tee: { x: number; y: number }; pin: { x: number; y: number } } {
  const tee = { x: 42, y: 60 }, pin = { x: 100, y: 60 };
  const surf = (x: number, y: number): number => Math.hypot(x - pin.x, y - pin.y) <= 6 ? 8 : Math.hypot(x - 96, y - 70) <= 3 ? 6 : x >= 40 && x < 44 && y >= 56 && y < 64 ? 5 : x > 44 && x < 100 && Math.abs(y - 60) <= 6 ? 4 : 1;
  const f0 = buildWalkField(0, 0, 140, 120, { surf, wet: (x, y) => x >= 20 && x < 40 && y >= 30 && y < 45, ways: [], teeBoxes: [{ x: tee.x, y: tee.y, r: 1.5 }], holes: [{ tee, aim: pin }] });
  return { f0, sf: dilate(f0, SPECTATOR_GROW, SPECTATOR_WATER_GROW), tee, pin };
}
describe('T377: a gallery is an arc round the back and sides of a tee box and a ring round a green, a few rows deep, not one clump', () => {
  const { f0, sf, tee, pin } = smallCourse(), u = { x: 1, y: 0 };
  const fans = (s: { x: number; y: number; kind: string; fx: number; fy: number; ax: number; ay: number; places?: number[] }, i: number): CrowdPerson[] => {
    const out: CrowdPerson[] = [], buf = Float32Array.of(s.x, s.y, 60, 0, s.fx, s.fy, s.ax, s.ay), n = galleryPeople(buf, 0, i, 100, NP, out, -1, undefined, s.places);
    return out.slice(0, n).map(p => ({ ...p }));
  };
  const near = (ps: number[]): { min: number; mean: number } => {
    let min = Infinity, sum = 0; const n = ps.length >> 1;
    for (let i = 0; i < n; i++) { let best = Infinity; for (let j = 0; j < n; j++) if (j !== i) best = Math.min(best, Math.hypot(ps[2 * i]! - ps[2 * j]!, ps[2 * i + 1]! - ps[2 * j + 1]!)); min = Math.min(min, best); sum += best; }
    return { min, mean: sum / n };
  };
  const distTo = (ground: number, x: number, y: number): number => { let d = Infinity; for (let j = 0; j < sf.h; j++) for (let i = 0; i < sf.w; i++) if (sf.g[j * sf.w + i] === ground) d = Math.min(d, Math.hypot(sf.x0 + i + 0.5 - x, sf.y0 + j + 0.5 - y)); return d; };
  it('a tee: places behind it and to its sides on open ground, never ahead of it, 3 rows deep about a metre apart, both sides of the line of play', () => {
    const ps = galleryPlaces(sf, 'tee', tee, u); assert.ok(ps.length >= 120, `${ps.length / 2} places`); assert.ok(ps.length <= 180);
    for (let i = 0; i < ps.length; i += 2) {
      const x = ps[i]!, y = ps[i + 1]!, g = groundAt(f0, x, y);
      assert.ok(g === G.open || g === G.path || g === G.walk, `a place at ${x}, ${y} on ground ${g}`);
      assert.ok(passableAt(sf, x, y), 'and clear of the grown tee box, green, bunker and water'); assert.ok((x - tee.x) * u.x + (y - tee.y) * u.y <= 0.5 + 1e-9, `a place ahead of the tee: ${x}, ${y}`);
    }
    const first = ps.slice(0, 180); let north = 0, south = 0, minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < first.length; i += 2) { const y = first[i]!; if (y < tee.y - 3) north++; if (y > tee.y + 3) south++; minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    assert.ok(north >= 8 && south >= 8, `the first 90 fans are on both sides of the line of play: ${north} to its north, ${south} to its south`);
    assert.ok(maxY - minY >= 13, `an arc of ${(maxY - minY).toFixed(1)} tiles across the line of play, not a clump of 5`);
    const rows = new Set<number>(); for (let i = 0; i < 180; i += 2) rows.add(Math.round(distTo(G.tee, ps[i]!, ps[i + 1]!) / 0.55));
    assert.ok(rows.size >= 2 && rows.size <= 4, `${rows.size} rows deep (distances to the box ${[...rows].join(', ')} half tiles)`);
    const nn = near(first); assert.ok(nn.min >= 0.45 && nn.mean <= 0.8, `about a metre apart: the nearest neighbour ${nn.min.toFixed(2)} at least, ${nn.mean.toFixed(2)} on average (tiles of 2 m)`);
  });
  it('a tee: filled from the best place outward: the back of the box first, the crowd growing sideways along the arc', () => {
    const ps = galleryPlaces(sf, 'tee', tee, u), lateral = (k: number) => { let m = 0; for (let i = 0; i < 2 * Math.min(k, ps.length >> 1); i += 2) m = Math.max(m, Math.abs(ps[i + 1]! - tee.y)); return m; };
    assert.ok(Math.abs(ps[1]! - tee.y) <= 1.5 && ps[0]! < tee.x - 3, `the first place is straight behind the box: ${ps[0]}, ${ps[1]}`);
    assert.ok(lateral(8) <= lateral(30) && lateral(30) <= lateral(60) && lateral(60) <= lateral(90), 'each crowd is wider than the one before');
    assert.ok(lateral(10) < 3 && lateral(90) > 6, `10 fans stand together behind the box (${lateral(10).toFixed(1)} wide), 90 reach round it (${lateral(90).toFixed(1)})`);
  });
  it('a green: a ring round its open sides, on open ground clear of the grown green, the bunker and the water, never in the cone of its approach', () => {
    const ps = galleryPlaces(sf, 'green', pin, u); assert.ok(ps.length >= 120, `${ps.length / 2} places`);
    let behind = 0, north = 0, south = 0;
    for (let i = 0; i < ps.length; i += 2) {
      const x = ps[i]!, y = ps[i + 1]!, g = groundAt(f0, x, y), dx = x - pin.x, dy = y - pin.y, r = Math.hypot(dx, dy);
      assert.ok(g === G.open || g === G.path || g === G.walk, `a place at ${x}, ${y} on ground ${g}`); assert.ok(passableAt(sf, x, y));
      assert.ok(r >= 8, `a place ${r.toFixed(1)} tiles from the pin: on the green or its collar`); assert.ok(Math.hypot(x - 96, y - 70) >= 5, 'or in the margin of the bunker');
      assert.ok(-dx / r <= Math.cos(35 * Math.PI / 180) + 1e-9, `a place in the cone of the approach: ${x}, ${y}`);
      if (dx > 4) behind++; if (dy < -4) north++; if (dy > 4) south++;
    }
    assert.ok(behind > 10 && north > 10 && south > 10, `behind ${behind}, to the north ${north}, to the south ${south}`);
    const first = ps.slice(0, 180), nn = near(first); assert.ok(nn.min >= 0.45 && nn.mean <= 0.8, `about a metre apart (${nn.min.toFixed(2)}, ${nn.mean.toFixed(2)})`);
    let a0 = Infinity, a1 = -Infinity; for (let i = 0; i < 180; i += 2) { const a = Math.atan2(first[i + 1]! - pin.y, first[i]! - pin.x); a0 = Math.min(a0, a); a1 = Math.max(a1, a); }
    assert.ok((a1 - a0) * 180 / Math.PI >= 100, `90 fans reach ${((a1 - a0) * 180 / Math.PI).toFixed(0)} degrees round the green`);
  });
  it('where the open ground round a tee is narrow the gallery is a row or two deeper (to 4) so its 60 fans have places', () => {
    // a tee box in a lake with a pocket of rough 14 tiles tall behind it: two rows would hold about 44 places, three or four hold the 60 a gallery draws
    const surf = (x: number, y: number): number => x >= 20 && x < 25 && y >= 25 && y < 35 ? 5 : x >= 4 && x < 20 && y >= 22 && y < 36 ? 1 : 3;
    const lake = buildWalkField(0, 0, 60, 60, { surf, wet: () => false, ways: [], teeBoxes: [{ x: 22, y: 30, r: 1.5 }], holes: [] }), pocket = dilate(lake, SPECTATOR_GROW, SPECTATOR_WATER_GROW);
    const ps = galleryPlaces(pocket, 'tee', { x: 22, y: 30 }, { x: 1, y: 0 });
    assert.ok(ps.length / 2 >= 60 && ps.length / 2 <= 90, `${ps.length / 2} places in a pocket where two rows would hold fewer than 60`);
    const cols = new Set<number>(); for (let i = 0; i < ps.length; i += 2) cols.add(Math.round(ps[i]! * 2)); assert.ok(cols.size <= 5, `${cols.size} columns of places: three or four rows deep, not ten`);
  });
  it('the spots carry the places (their point is the best place), the fans are drawn on them, none on a tee, a green, a bunker, water or a fairway; with no room round a tee the spot is the block as before', () => {
    const tees = [{ hole: 1, ...tee }], pins = [{ hole: 1, ...pin }], spots = gallerySpots(tees, pins, [], undefined, sf);
    for (const s of spots) { assert.ok(s.places && s.places.length >= 120, `${s.kind} places`); assert.deepEqual([s.x, s.y], [s.places![0], s.places![1]], 'the spot is at the best place'); }
    spots.forEach((s, i) => { const ps = fans(s, i); assert.equal(ps.length, 60); for (const p of ps) { const g = groundAt(f0, p.x, p.y); assert.ok(g === G.open || g === G.path || g === G.walk, `a fan on ground ${g}`); } });
    // a tee box in the middle of a lake: no place, so the old block (standingSpot) and no places
    const lake = buildWalkField(0, 0, 80, 80, { surf: (x, y) => x >= 38 && x < 42 && y >= 38 && y < 42 ? 5 : 3, wet: () => false, ways: [], teeBoxes: [{ x: 40, y: 40, r: 1.5 }], holes: [] });
    const cut = gallerySpots([{ hole: 1, x: 40, y: 40 }], [{ hole: 1, x: 200, y: 40 }], [], undefined, dilate(lake, 2, 1)).find(s => s.kind === 'tee')!;
    assert.equal(cut.places, undefined, 'no places on a tee box with no ground to stand on round it');
    assert.equal(gallerySpots(tees, pins, [])[0]!.places, undefined, 'and none with no field');
  });
});

describe('T377: the spectators walk the day without crossing a tee, a green, a bunker or water, each their own way', () => {
  const f0 = fieldA(), sf = dilate(f0, SPECTATOR_GROW, SPECTATOR_WATER_GROW);
  /** the crowd's day: 8 groups of 3 from the gate to each gallery spot, started a little apart; the router (or none: the old straight line); each step's places and people */
  function day(router: boolean) {
    const rc = new RouteCache(sf, SPECTATOR), C = new Crowd(1, 0), spots = gallerySpots(TEES, PINS, [], undefined, router ? sf : null); C.varied = true;
    C.setSpots(spots.length); if (router) C.router = (x, y, tx, ty) => rc.route({ x, y }, { x: tx, y: ty });
    const added: number[] = []; let step = 0, centres = 0, badCentres = 0, people = 0, badPeople = 0, fairway = 0;
    const frames: { t: number; fr: number[]; pos: { x: number; y: number }[] }[] = [];
    const buf = new Float32Array(WALK_STRIDE * 200), out: CrowdPerson[] = [];
    for (let n = 0; n < 8; n++) for (let i = 0; i < spots.length; i++) {
      const s = spots[i]!, k = n * spots.length + i;
      C.add({ x: GATE.x + (k % 3) * 0.3, y: GATE.y, tx: s.x + (k % 5) * 0.2 - 0.4, ty: s.y, n: 3, town: 0, stage: 3, route: i }); added.push(k);
    }
    const paces = C.walkers.map(w => w.v!);
    while (C.walkers.length && step < 4000) {
      C.step(1.0); step++;
      if (step % 4) continue;
      let o = 0;
      for (const w of C.walkers) {
        const v = w.via ? w.via[w.vi ?? 0] : undefined;
        buf[o] = w.x; buf[o + 1] = w.y; buf[o + 2] = w.n; buf[o + 3] = w.stage; buf[o + 4] = v ? v.x : w.tx; buf[o + 5] = v ? v.y : w.ty; buf[o + 6] = w.id ?? 0; o += WALK_STRIDE;
        centres++; if (blocked(f0, w.x, w.y)) badCentres++; if (groundAt(f0, w.x, w.y) === G.fairway) fairway++;
      }
      const t = step / 6;
      for (let i = 0; i < o; i += WALK_STRIDE) {
        const k = walkerPeople(buf, i, i / WALK_STRIDE, t, NP, out);
        for (let j = 0; j < k; j++) { people++; if (blocked(f0, out[j]!.x, out[j]!.y)) badPeople++; }
        if (i === 0 && k === 3) frames.push({ t, fr: [out[0]!.frame, out[1]!.frame, out[2]!.frame], pos: [0, 1, 2].map(j => ({ x: out[j]!.x, y: out[j]!.y })) });
      }
    }
    return { C, steps: step, centres, badCentres, people, badPeople, fairway, paces, frames, spots };
  }
  it('on the old code (straight lines) groups walk over the river, a green or a tee box', () => {
    const d = day(false); console.log(`old walkers: ${d.badCentres} of ${d.centres} places on a blocked ground`); assert.equal(d.C.walkers.length, 0, 'they all arrive');
    assert.ok(d.badCentres > 50, `${d.badCentres} of ${d.centres} places of groups on a tee, a green or water`);
  });
  it('with the router no group and no person drawn is ever on a tee, a green, a bunker or water, and they all arrive and count at their gallery', () => {
    const d = day(true); console.log(`walkers: ${d.centres} places, ${d.people} people sampled, ${d.fairway} on a fairway, ${d.steps} steps`); assert.equal(d.C.walkers.length, 0, `they all arrive (${d.steps} steps)`);
    assert.equal(d.badCentres, 0, `${d.badCentres} of ${d.centres} places of groups on a blocked ground`);
    assert.equal(d.badPeople, 0, `${d.badPeople} of ${d.people} people drawn on a blocked ground`);
    assert.ok(d.centres > 500 && d.people > 1500, `${d.centres} places, ${d.people} people sampled`);
    assert.equal(d.C.gallery.reduce((a, b) => a + b, 0), 8 * 6 * 3, 'every fan is at a gallery');
    assert.ok(d.fairway / d.centres < 0.2, `${(100 * d.fairway / d.centres).toFixed(1)}% of the time on a fairway: crossed where it must, not walked along`);
  });
  it('each group has its own pace (0.85 to 1.15 of the walk) and the groups arrive spread out', () => {
    const d = day(true), p = d.paces; assert.ok(Math.min(...p) >= 0.85 && Math.max(...p) <= 1.15, `${Math.min(...p)} to ${Math.max(...p)}`);
    assert.ok(Math.max(...p) - Math.min(...p) > 0.15, 'not all alike'); assert.ok(new Set(p.map(v => v.toFixed(3))).size > 40, 'nearly all different');
  });
  it('the three of a party are never in step: their frames differ at almost every moment, their places differ and drift', () => {
    const d = day(true), fr = d.frames; assert.ok(fr.length >= 40, `${fr.length} samples of a party`);
    const apart = fr.filter(s => new Set(s.fr).size === 3 || (s.fr[0] !== s.fr[1] && s.fr[1] !== s.fr[2] && s.fr[0] !== s.fr[2])).length;
    assert.ok(apart / fr.length > 0.6, `three different frames in ${apart} of ${fr.length} samples`);
    const same = fr.filter(s => s.fr[0] === s.fr[1] && s.fr[1] === s.fr[2]).length; assert.ok(same / fr.length < 0.1, `all three on one frame in ${same} of ${fr.length}`);
    let minGap = Infinity, drift = 0; const dxs: number[] = [];
    for (const s of fr) { for (const [a, b] of [[0, 1], [1, 2], [0, 2]] as const) minGap = Math.min(minGap, Math.hypot(s.pos[a]!.x - s.pos[b]!.x, s.pos[a]!.y - s.pos[b]!.y)); dxs.push(Math.hypot(s.pos[0]!.x - s.pos[1]!.x, s.pos[0]!.y - s.pos[1]!.y)); }
    drift = Math.max(...dxs) - Math.min(...dxs);
    assert.ok(minGap > 0.15, `never on top of each other (closest ${minGap.toFixed(2)} tiles)`); assert.ok(drift > 0.15, `the gap between two of them drifts (${drift.toFixed(2)} tiles)`);
  });
  it('a group whose way is not worked out yet (the budget of the City for a step) waits where it is and asks again next step', () => {
    const C = new Crowd(1, 0); C.setSpots(1); let asked = 0, ready = false;
    C.router = () => { asked++; return ready ? [{ x: 20, y: 10 }, { x: 20, y: 30 }] : undefined; };
    C.add({ x: 10, y: 10, tx: 20, ty: 30, n: 3, town: 0, stage: 3, route: 0 });
    const first = () => C.walkers[0]!;
    C.step(1); C.step(1);
    assert.equal(asked, 2, 'asked each step'); assert.deepEqual([first().x, first().y], [10, 10], 'it has not moved'); assert.ok(first().via === undefined, 'and has no way yet');
    ready = true; C.step(1);
    assert.equal(asked, 3); assert.equal(first().via?.length, 2, 'it has its way'); assert.ok(first().x > 10.5 && Math.abs(first().y - 10) < 0.01, 'and walks it: first along y = 10 to the corner at x = 20');
  });
  it('two parties side by side are not in step with each other either', () => {
    const buf = Float32Array.of(50, 50, 3, 3, 60, 50, 1, 50, 52, 3, 3, 60, 52, 2), a: CrowdPerson[] = [], b: CrowdPerson[] = []; let same = 0, n = 0;
    for (let t = 0; t < 30; t += 0.25) { walkerPeople(buf, 0, 0, t, NP, a); walkerPeople(buf, WALK_STRIDE, 1, t, NP, b); n++; if (a[0]!.frame === b[0]!.frame && a[1]!.frame === b[1]!.frame && a[2]!.frame === b[2]!.frame) same++; }
    assert.ok(same / n < 0.1, `${same} of ${n} moments the two parties show the same three frames`);
  });
});

// ---------- course B: the field's carts ----------
const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5];
const HOLES_B: PlayHole[] = PARS.map((par, h) => { const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y }; return { n: h + 1, par, tee, pin, line: [tee, pin] }; });
const segDist = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0; return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t); };
/** the surface at a point of course B (the course grid's ids): a green of radius 6, a tee box 8 x 10, a fairway 7.5 each side, rough */
function surfB(x: number, y: number): number {
  for (const h of HOLES_B) { if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 8; if (Math.abs(x - h.tee.x) <= 4 && Math.abs(y - h.tee.y) <= 5) return 5; }
  let d = Infinity; for (const h of HOLES_B) d = Math.min(d, segDist({ x, y }, h.tee, h.pin));
  return d <= 7.5 ? 4 : 1;
}
/** the lie the play reads (the map's creek is not a course surface: the game's lieAt does not see it either) */
const lieB = (x: number, y: number): Lie => { const s = surfB(x, y); if (s === 8) return 'green'; if (s === 5) return 'tee'; if (s === 4) return 'fairway'; let d = Infinity; for (const h of HOLES_B) d = Math.min(d, segDist({ x, y }, h.tee, h.pin)); return d <= 40 ? 'rough' : 'out'; };
const viewB: CourseView = { holes: HOLES_B, lieAt: lieB };
/** the creek down x 120-124 (map water) crossed by the paths (bridges), and a cart path 15 tiles beside each hole, joined behind the tees, with one more across hole 3's tee box */
const wetB = (x: number, _y: number): boolean => x >= 120 && x < 124;
const PATH_LINES = (() => {
  const lines: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  HOLES_B.forEach((h, i) => { const a = { x: h.tee.x - 15, y: h.tee.y + 15 }, b = { x: h.pin.x + 10, y: h.pin.y + 15 }; lines.push({ a, b }); const nx = HOLES_B[i + 1]; if (nx) lines.push({ a, b: { x: nx.tee.x - 15, y: nx.tee.y + 15 } }); });
  const t3 = HOLES_B[2]!.tee; lines.push({ a: { x: t3.x - 14, y: t3.y }, b: { x: t3.x + 14, y: t3.y } });
  return lines;
})();
const fieldB = (): WalkField => buildWalkField(-30, -30, 340, 1160, { surf: surfB, wet: wetB, ways: PATH_LINES.map(l => ({ ax: l.a.x, ay: l.a.y, bx: l.b.x, by: l.b.y, hw: 1, cart: true, bridge: true })), teeBoxes: HOLES_B.map(h => ({ x: h.tee.x, y: h.tee.y, r: 1.5 })), holes: HOLES_B.map(h => ({ tee: h.tee, aim: h.pin })) });

describe('T377: the field\'s carts never stand or drive on a tee, a green, a bunker or water, and follow the paths', () => {
  const f0 = fieldB();
  /** a day of the carts (tier 1, seed 5, as the entourage tests): every cart sampled every 0.2 game minutes from before the first tee time to the end */
  function day(field: WalkField | null) {
    const f = makeField(1, 5), gs = teeTimes(f, 5); fieldEntourage(f, gs, 1);
    const plan = playRound(viewB, f, gs, 5), cp = new CartPlay(plan, viewB, cartPaths(PATH_LINES), { x: 0, y: 0 }, field);
    const t0 = Math.min(...gs.map(g => g.tee)) - 12, t1 = Math.max(...gs.map(g => g.tee)) + 330, out: PlayCart[] = [];
    let n = 0, bad = 0, moving = 0, onPath = 0, stopsBad = 0, stops = 0; const prev = new Map<number, { x: number; y: number }>();
    for (let c = 0; c < cp.size; c++) for (let h = 0; h < viewB.holes.length; h++) for (const v of cp.stops(c, h)) { stops++; if (blocked(f0, v.stop.x, v.stop.y)) stopsBad++; }
    for (let m = t0; m <= t1; m += 0.2) {
      const k = cp.update(m, out);
      for (let i = 0; i < k; i++) {
        const q = out[i]!; n++; if (blocked(f0, q.x, q.y)) bad++;
        const p = prev.get(q.cart); if (p && Math.hypot(q.x - p.x, q.y - p.y) > 0.05) { moving++; if (groundAt(f0, q.x, q.y) === G.path) onPath++; }
        prev.set(q.cart, { x: q.x, y: q.y });
      }
    }
    return { carts: cp.size, n, bad, moving, onPath, stops, stopsBad };
  }
  it('on the old code (no field) carts park on a tee box (the path across it) and drive across the creek', () => {
    const d = day(null); console.log(`old carts: ${d.bad} of ${d.n} samples and ${d.stopsBad} of ${d.stops} stops on a blocked ground`); assert.ok(d.carts >= 2 && d.n > 500, `${d.carts} carts, ${d.n} samples`);
    assert.ok(d.bad + d.stopsBad > 20, `${d.bad} samples and ${d.stopsBad} stops on a tee, a green, a bunker or water`);
  });
  it('with the field no cart is ever on one, at a stop or on a drive', () => {
    const d = day(f0); assert.ok(d.carts >= 2 && d.n > 500 && d.stops > 100, `${d.carts} carts, ${d.n} samples, ${d.stops} stops`);
    assert.equal(d.stopsBad, 0, `${d.stopsBad} of ${d.stops} stops on a blocked ground`); assert.equal(d.bad, 0, `${d.bad} of ${d.n} samples on a blocked ground`);
  });
  it('the carts are on the cart paths most of the time they drive', () => {
    const d = day(f0), old = day(null); console.log(`carts: with the field ${d.onPath}/${d.moving} driving samples on a path; old ${old.onPath}/${old.moving}; samples ${d.n}, stops ${d.stops}`); assert.ok(d.moving > 200, `${d.moving} moving samples`);
    assert.ok(d.onPath / d.moving >= 0.85, `${(100 * d.onPath / d.moving).toFixed(0)}% of the driving on a path (the old code: ${(100 * old.onPath / old.moving).toFixed(0)}%)`);
    assert.ok(d.onPath / d.moving >= old.onPath / old.moving + 0.05, 'and more than the old routes gave');
  });
  it('drawn with a box (a game frame) the searches a drawing makes are few, and still no cart is on a tee, a green, a bunker or water', () => {
    const f = makeField(1, 5), gs = teeTimes(f, 5); fieldEntourage(f, gs, 1);
    const plan = playRound(viewB, f, gs, 5), free = new CartPlay(plan, viewB, cartPaths(PATH_LINES), { x: 0, y: 0 }, f0), framed = new CartPlay(plan, viewB, cartPaths(PATH_LINES), { x: 0, y: 0 }, f0);
    const t0 = Math.min(...gs.map(g => g.tee)) - 12, t1 = Math.max(...gs.map(g => g.tee)) + 330, a: PlayCart[] = [], b: PlayCart[] = [], box = [-30, -30, 340, 1160];
    let nFree = 0, nFramed = 0, bad = 0, ms = 0, worst = 0, draws = 0, slow = 0; const times: number[] = [];
    for (let m = t0; m <= t1; m += 0.2) {
      nFree += free.update(m, a);
      const w0 = performance.now(), k = framed.update(m, b, null, box), dt = performance.now() - w0; ms += dt; worst = Math.max(worst, dt); nFramed += k; draws++; times.push(dt); if (dt > 4) slow++;
      for (let i = 0; i < k; i++) if (blocked(f0, b[i]!.x, b[i]!.y)) bad++;
    }
    times.sort((x, y) => x - y);
    console.log(`framed carts: ${nFramed} of ${nFree} samples drawn, ${bad} on a blocked ground; ${framed.searches} searches over ${draws} drawings: ${ms.toFixed(0)} ms in all, median ${times[draws >> 1]!.toFixed(3)}, p99 ${times[Math.floor(draws * 0.99)]!.toFixed(2)}, worst ${worst.toFixed(2)} ms, ${slow} drawings over 4 ms`);
    assert.equal(bad, 0, `${bad} samples on a blocked ground`);
    assert.ok(nFramed >= nFree * 0.97, `a cart waits a drawing for its way now and then, not more: ${nFramed} of ${nFree} samples`);
  });
  it('with no bridge over the creek no drive is made across the water: the cart is carried (not drawn on that drive) and is at its stop after it', () => {
    // the same course with the paths' bridges taken away: the creek cuts the course in two, and a drive across it has no way
    const cut = buildWalkField(-30, -30, 340, 1160, { surf: surfB, wet: wetB, ways: PATH_LINES.map(l => ({ ax: l.a.x, ay: l.a.y, bx: l.b.x, by: l.b.y, hw: 1, cart: true })), teeBoxes: HOLES_B.map(h => ({ x: h.tee.x, y: h.tee.y, r: 1.5 })), holes: HOLES_B.map(h => ({ tee: h.tee, aim: h.pin })) });
    const f = makeField(1, 5), gs = teeTimes(f, 5); fieldEntourage(f, gs, 1);
    const plan = playRound(viewB, f, gs, 5), old = new CartPlay(plan, viewB, cartPaths(PATH_LINES), { x: 0, y: 0 }, null), now = new CartPlay(plan, viewB, cartPaths(PATH_LINES), { x: 0, y: 0 }, cut);
    const t0 = Math.min(...gs.map(g => g.tee)) - 12, t1 = Math.max(...gs.map(g => g.tee)) + 330, a: PlayCart[] = [], b: PlayCart[] = [];
    let nOld = 0, nNow = 0, bad = 0, badOld = 0, stopsBad = 0;
    for (let c = 0; c < now.size; c++) for (let h = 0; h < viewB.holes.length; h++) for (const v of now.stops(c, h)) if (blocked(cut, v.stop.x, v.stop.y)) stopsBad++;
    for (let m = t0; m <= t1; m += 0.2) {
      const ka = old.update(m, a), kb = now.update(m, b); nOld += ka; nNow += kb;
      for (let i = 0; i < ka; i++) if (blocked(cut, a[i]!.x, a[i]!.y)) badOld++;
      for (let i = 0; i < kb; i++) if (blocked(cut, b[i]!.x, b[i]!.y)) bad++;
    }
    console.log(`# no bridge: old ${badOld} of ${nOld} samples on a blocked ground; now ${bad} of ${nNow} (${nOld - nNow} not drawn: carried), ${stopsBad} stops on a blocked ground`);
    assert.ok(badOld > 50, `the old drives cross the creek (${badOld} samples)`);
    assert.equal(bad, 0, `no sample on a blocked ground (${bad})`); assert.equal(stopsBad, 0, 'nor a stop');
    assert.ok(nNow < nOld * 0.97 && nNow > nOld * 0.4, `the carts carried across are not drawn on their drive: ${nNow} of ${nOld} samples`);
  });
});
