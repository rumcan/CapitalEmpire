// T402 (#1080) part 3; the owner, 2026-11-09, with a farm along a screen-straight road: "the texture angles not correct". On a road at 45 degrees to the grid a farm's
// fields lie across the map's axes, and its ground was laid as if they lay on them: a ploughed field's art (a picture with its furrows along the map's x and one along its
// y) went down unturned, its furrows running across the field's own at 45 degrees; the fallow grass was a hard-edged lot patch (T361 #1016: "a hard edge that doesn't look
// right"), not laid the way the course lays its long grass. Now the art is turned by the angle between its axis and the field's rows (crops.ts cropArtTurn; the renderer
// lays the picture through that turn), and a field of grass is a painted area turned with its parcel, its edge feathered (farms.ts FB.grass), so a farm on a road at any
// angle has the same ground, orientation and look relative to its own fields as a farm on the axes. Headless: the turn, the composed farms' ground.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeFarm, type FarmParcel } from '../src/game/ext/farms';
import { CROP_SURFACE, cropArtTurn, cropSurface } from '../src/game/ext/farms/crops';
import { FIELD_GRASS } from '../src/game/ext/farms/farms';
import type { LotPatch } from '../src/game/ground-protocol';

const DEG = 180 / Math.PI;
/** a parcel turned by deg degrees (u, n orthonormal, as farmParcels makes them) */
const parcel = (i: number, deg: number, w = 40 + (i * 13) % 41, d = 80 + (i * 29) % 71): FarmParcel => {
  const t = deg / DEG, u = { x: Math.cos(t), y: Math.sin(t) }, n = { x: -u.y, y: u.x };
  // (the key does not hold the angle: a layout is a function of the key, so the same farm lies on every road)
  return { key: `t402tex:${i}`, o: { x: 600 + i * 11, y: 700 + i * 5 }, u, n, w, d, side: 1 };
};
/** an angle folded to -45..45 (a quarter turn of a field's grain is the same grain) */
const fold = (deg: number) => { let t = deg % 90; if (t >= 45 - 1e-6) t -= 90; else if (t < -45 - 1e-6) t += 90; return t; };
/** the angle a pair of lines meet at, folded to 0..90 (a line and its reverse are the same line) */
const between = (a: number, b: number) => { const r = ((a - b) % 180 + 180) % 180; return Math.min(r, 180 - r); };
/** the rows' angle on the map (degrees) of a crop patch: its own direction */
const rowsOf = (g: LotPatch) => Math.atan2(g.crop!.d[1], g.crop!.d[0]) * DEG;
/** the direction the picture's furrows run at once laid: the art's own axis (x: 0, y: 90) turned by the renderer's turn */
const laidAt = (g: LotPatch) => { const [dx, dy] = g.crop!.d, x = cropSurface(g.crop!.st, dx, dy) === CROP_SURFACE[g.crop!.st].x; return (x ? 0 : 90) + cropArtTurn(dx, dy); };
/** the angles of the farm's frame: the four axes, the four diagonals (a screen-straight road: 45 degrees to the grid) and some others */
const ANGLES = [0, 90, 180, 270, 45, 135, 225, 315, 20, 100, 200, 333, 30, 60];
const SEEDS = [20261109, 7, 12345];

test('the turn that lays the art along a field: none on the axes, the angle to the nearest axis elsewhere, the same for a row and its reverse', () => {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) assert.equal(cropArtTurn(dx, dy), 0, `${dx},${dy}: on an axis, no turn`);
  const s = Math.SQRT1_2;
  // (a tie goes to the x picture, as cropSurface chooses: the diagonal is 45 degrees from either axis)
  assert.equal(cropArtTurn(s, s), 45); assert.equal(cropArtTurn(s, -s), -45); assert.equal(cropArtTurn(-s, s), -45); assert.equal(cropArtTurn(-s, -s), 45);
  const c30 = Math.cos(30 / DEG), s30 = Math.sin(30 / DEG), c60 = Math.cos(60 / DEG), s60 = Math.sin(60 / DEG);
  assert.equal(cropArtTurn(c30, s30), 30); assert.equal(cropArtTurn(c60, s60), -30); // (60 degrees: nearest the y axis, 30 short of it)
  assert.equal(cropArtTurn(-c60, s60), 30); assert.equal(cropArtTurn(c30, -s30), -30);
  for (let a = 0; a < 360; a += 1) {
    const dx = Math.cos(a / DEG), dy = Math.sin(a / DEG), t = cropArtTurn(dx, dy), rev = cropArtTurn(-dx, -dy);
    assert.ok(Math.abs(t) <= 45 + 1e-9, `${a}: within 45 degrees (${t})`);
    assert.ok(Math.abs(t - rev) < 1e-3, `${a}: a row and its reverse turn alike (${t}, ${rev})`);
    // the picture's axis turned by it is the rows' own direction
    const x = Math.abs(dx) >= Math.abs(dy);
    assert.ok(between((x ? 0 : 90) + t, a) < 2e-4, `${a}: the art's furrows (${(x ? 0 : 90) + t}) run along the rows`);
  }
});

test('a ploughed field on a road at 45 degrees to the grid wears its art along its own rows, as one on the axes does', () => {
  let n = 0; const seen = new Map<number, number>();
  for (const deg of ANGLES) for (let i = 0; i < 14; i++) for (const seed of SEEDS) for (const month of [0, 3, 6, 8, 10]) {
    const p = parcel(i, deg), c = composeFarm(p, seed, { model: 2, month });
    for (const g of c.ground) {
      if (!g.crop) continue;
      // the rows follow the field: along the parcel's u or its n
      const rows = rowsOf(g), uAng = Math.atan2(p.u.y, p.u.x) * DEG;
      assert.ok(Math.min(between(rows, uAng), between(rows, uAng + 90)) < 0.02, `${p.key}: rows ${rows} along the parcel (${uAng})`);
      // laid, the picture's furrows run along the rows: the orientation to the field is the same at every angle (0 off), where unturned they were up to 45 off
      assert.ok(between(laidAt(g), rows) < 0.02, `${p.key}: art furrows ${laidAt(g)} along the rows ${rows}`);
      const unturned = between(cropSurface(g.crop.st, g.crop.d[0], g.crop.d[1]) === CROP_SURFACE[g.crop.st].x ? 0 : 90, rows);
      seen.set(deg, Math.max(seen.get(deg) ?? 0, unturned)); n++;
    }
  }
  assert.ok(n > 300, `crop fields composed: ${n}`);
  // the negative: without the turn a farm on a diagonal road had its furrows 45 degrees off its field's rows, a farm on the axes none
  assert.ok(seen.get(45)! > 44 && seen.get(135)! > 44, 'unturned, the 45 degree farm was off by 45');
  assert.ok(seen.get(0)! < 0.02 && seen.get(90)! < 0.02, 'unturned, the farm on the axes was right');
  assert.ok(seen.get(30)! > 29 && seen.get(20)! > 19, 'and any other angle off by its own');
});

/** the farm's fields of grass: model 2's fallow fields (ground patches of the long grass) */
const grassOf = (c: { ground: LotPatch[] }) => c.ground.filter(g => g.tex === 'golfLongGrass');

test('a field of grass is a painted area turned with its parcel and feathered at its edge: no hard-edged lot patch of long grass', () => {
  let n = 0;
  for (const deg of ANGLES) for (let i = 0; i < 14; i++) for (const seed of SEEDS) {
    const p = parcel(i, deg), c = composeFarm(p, seed, { model: 2, month: 5 });
    for (const g of grassOf(c)) {
      assert.ok(g.paint, `${p.key}: the long grass is laid as a painted area (a lot patch has a cut edge)`);
      const a = g.paint!;
      assert.equal(a.e, 'flat', 'its edge feathered, as the course\'s rough and fescue');
      assert.equal(a.s, FIELD_GRASS.s, 'the course\'s own scale');
      assert.equal(a.b, 0, 'no border');
      assert.ok(a.z < -1e6 + 0 && a.z >= FIELD_GRASS.z, 'under every area the player paints (the range\'s ground sits at -1e6)');
      // its texture's angle is the parcel's turn from the axes, folded: the same orientation to the field on every road angle
      assert.ok(a.a >= -45 && a.a < 45, `${a.a} folded`);
      assert.ok(Math.abs(a.a - fold(deg)) < 1e-3, `${p.key}: texture angle ${a.a} follows the parcel (${deg}: ${fold(deg)})`);
      // the area is the field's own rectangle: four corners, inside the parcel
      assert.equal(g.pts.length, 8);
      n++;
    }
  }
  assert.ok(n > 60, `fallow fields composed: ${n}`);
});

test('a farm on the axes and one on a road at 45 degrees have the same ground orientation relative to their fields', () => {
  // (a layout holds the buildings' world footprints, which turn with the parcel: the two farms need not have the same fields, but each patch of each is laid the same way to its own field)
  const got: Record<number, { crops: number; grass: number; furrows: number[]; grain: number[]; unturned: number[] }> = { 0: { crops: 0, grass: 0, furrows: [], grain: [], unturned: [] }, 45: { crops: 0, grass: 0, furrows: [], grain: [], unturned: [] } };
  for (const deg of [0, 45]) for (let i = 0; i < 14; i++) for (const seed of SEEDS) for (const month of [1, 5, 8]) {
    const p = parcel(i, deg), c = composeFarm(p, seed, { model: 2, month }), r = got[deg]!;
    for (const g of c.ground) {
      if (g.crop) {
        // the art's furrows, laid, against the field's own rows: the same at every road angle (the nearest axis, unturned, was 0 off on the axes and 45 off on the diagonal)
        r.crops++; r.furrows.push(between(laidAt(g), rowsOf(g)));
        r.unturned.push(between(cropSurface(g.crop.st, g.crop.d[0], g.crop.d[1]) === CROP_SURFACE[g.crop.st].x ? 0 : 90, rowsOf(g)));
      }
      if (g.paint) {
        // a grass field's texture angle against its parcel's own (a quarter turn of a grain is the same grain)
        r.grass++; r.grain.push(Math.abs(fold(g.paint.a - deg)));
      }
    }
  }
  for (const deg of [0, 45]) {
    const r = got[deg]!;
    assert.ok(r.crops > 40 && r.grass > 8, `${deg}: crop fields ${r.crops}, fields of grass ${r.grass}`);
    assert.ok(Math.max(...r.furrows) < 0.02, `${deg}: furrows along the rows (off by ${Math.max(...r.furrows)})`);
    assert.ok(Math.max(...r.grain) < 1e-3, `${deg}: grass texture angle along the parcel (off by ${Math.max(...r.grain)})`);
  }
  // the negative: the same art unturned lay 45 degrees off its rows on the diagonal road and right on the axes: the two farms' grounds were not alike
  assert.ok(Math.max(...got[0]!.unturned) < 0.02 && Math.min(...got[45]!.unturned) > 44.9, 'unturned: 0 off on the axes, 45 off at 45 degrees');
});

test('the lane runs from the road to the fields as one dirt lane with its wheel ruts: no flat grey gravel bar through the yard', () => {
  // (the owner, 2026-11-09: "the grey farm lane ... a flat grey bar": the yard's stretch of the lane was the gravel photo, dark grey cobbles in a hard-edged slab between the dirt lane and the dirt track)
  let n = 0;
  for (const deg of [0, 45, 100, 333]) for (let i = 0; i < 14; i++) for (const seed of SEEDS) {
    const p = parcel(i, deg), c = composeFarm(p, seed, { model: 2, month: 6 });
    assert.ok(!c.ground.some(g => g.tex === 'gravel'), `${p.key}: no gravel in a farm of the farm model 2`);
    // the lane (from the road: its front edge at b = 0) and the drive through the yard, both hard-edged dirt with their two ruts
    const ruts = c.ground.filter(g => g.tex === 'dirt' && g.hard && g.lines && g.lines.length >= 8);
    assert.ok(ruts.length >= 2, `${p.key}: the lane and the yard drive wear their ruts (${ruts.length})`);
    // the lane starts at the road (its front edge at b = 0): the yard's drive is one of the others, so the lane and the drive are two patches
    const lane = ruts.find(g => g.pts.some((_, k) => k % 2 === 0 && Math.abs((g.pts[k]! - p.o.x) * p.n.x + (g.pts[k + 1]! - p.o.y) * p.n.y) < 1e-6));
    assert.ok(lane, `${p.key}: a lane from the road`);
    n++;
  }
  assert.ok(n >= 168);
  // the older farm model keeps its gravel yard (saves made with it)
  assert.ok(composeFarm(parcel(1, 45), SEEDS[0]!, { model: 1 }).ground.some(g => g.tex === 'gravel'));
});

test('farms are stable and the older farm model keeps its ground', () => {
  const p = parcel(3, 45), a = composeFarm(p, SEEDS[0]!, { model: 2, month: 4 }), b = composeFarm(p, SEEDS[0]!, { model: 2, month: 4 });
  assert.equal(JSON.stringify(a.ground), JSON.stringify(b.ground), 'deterministic');
  // (the model 1 farms of older saves: their fields are dirt, rows as lines; nothing there is a painted area)
  for (let i = 0; i < 40; i++) for (const deg of [0, 45]) assert.ok(!composeFarm(parcel(i, deg), SEEDS[0]!, { model: 1 }).ground.some(g => g.paint), 'model 1 has no painted areas');
  // the lane, the yard and the track keep their hard, plain patches
  const c = composeFarm(parcel(5, 45), SEEDS[0]!, { model: 2, month: 6 });
  assert.ok(c.ground.some(g => g.tex === 'dirt' && g.hard));
});
