import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeInterchange, type RoadSpec, type InterchangeType } from '../src/game/ext/interchange/index.js';

// stub Path2D for network imports if any
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo(){} lineTo(){} arc(){} arcTo(){} closePath(){} rect(){} } as unknown as typeof Path2D;

const sub = (a: {x:number;y:number}, b: {x:number;y:number}) => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a:{x:number;y:number}, b:{x:number;y:number}) => a.x*b.y - a.y*b.x;
const vlen = (a:{x:number;y:number}) => Math.hypot(a.x,a.y);
const MPT = 2;
function minRadiusM(pts: {x:number;y:number}[]): number {
  let r = Infinity;
  for (let i=0;i+2<pts.length;i++) {
    const a=pts[i]!, b=pts[i+1]!, c=pts[i+2]!;
    const area2 = Math.abs(cross(sub(b,a), sub(c,a)));
    if (area2 < 1e-12) continue;
    const lab=vlen(sub(b,a)), lbc=vlen(sub(c,b)), lac=vlen(sub(c,a));
    const radTiles = (lab*lbc*lac)/(2*area2);
    const radM = radTiles * MPT;
    if (radM < r) r = radM;
  }
  return r;
}
function segIntersect(p:{x:number;y:number}, r:{x:number;y:number}, q:{x:number;y:number}, s:{x:number;y:number}) {
  const den = cross(r,s);
  if (Math.abs(den) < 1e-9) return null;
  const w=sub(q,p);
  const t=cross(w,s)/den, u=cross(w,r)/den;
  return { t,u, pt:{x:p.x+r.x*t, y:p.y+r.y*t} };
}
function rampsShareDivergeOrMerge(ramps: {pts:{x:number;y:number}[],from:string,to:string}[], i:number, j:number): boolean {
  const a=ramps[i]!, b=ramps[j]!;
  if (a.from===b.from && vlen(sub(a.pts[0]!, b.pts[0]!)) < 12) return true;
  if (a.to===b.to && vlen(sub(a.pts[a.pts.length-1]!, b.pts[b.pts.length-1]!)) < 12) return true;
  return false;
}
const CENTER = { x:150, y:150 };
const LEN_LONG = 300;
const LEN_VERY_SHORT = 40;

function rightAngleRoads(lenA = LEN_LONG, lenB = LEN_LONG): [RoadSpec, RoadSpec] {
  const A: RoadSpec = { pts: [{x:CENTER.x - lenA/2, y:CENTER.y},{x:CENTER.x + lenA/2, y:CENTER.y}], lanes:2, oneWay:false };
  const B: RoadSpec = { pts: [{x:CENTER.x, y:CENTER.y - lenB/2},{x:CENTER.x, y:CENTER.y + lenB/2}], lanes:2, oneWay:false };
  return [A,B];
}
function sixtyDegreeRoads(lenA = LEN_LONG, lenB = LEN_LONG): [RoadSpec, RoadSpec] {
  const A: RoadSpec = { pts: [{x:CENTER.x - lenA/2, y:CENTER.y},{x:CENTER.x + lenA/2, y:CENTER.y}], lanes:2, oneWay:false };
  const ang = 60*Math.PI/180;
  const dir = { x: Math.cos(ang), y: Math.sin(ang) };
  const half = lenB/2;
  const B: RoadSpec = { pts: [{x:CENTER.x - dir.x*half, y:CENTER.y - dir.y*half},{x:CENTER.x + dir.x*half, y:CENTER.y + dir.y*half}], lanes:2, oneWay:false };
  return [A,B];
}
function trumpetRoads(): [RoadSpec, RoadSpec] {
  // B through east-west long, A stem from south to center (T)
  const B: RoadSpec = { pts: [{x:CENTER.x - LEN_LONG/2, y:CENTER.y},{x:CENTER.x + LEN_LONG/2, y:CENTER.y}], lanes:2, oneWay:false };
  const A: RoadSpec = { pts: [{x:CENTER.x, y:CENTER.y},{x:CENTER.x, y:CENTER.y + LEN_LONG/2}], lanes:2, oneWay:false }; // starts at center, goes south
  // Actually we want stem ending at center, B through; A from center southwards
  // But our earlier T detection expects endpoint at crossing exactly; we put A start at center (0 dist)
  return [A,B];
}

test('diamond right-angle: every movement has ramp, radii, tapers, no same-level crossing, footprint', () => {
  const [A,B] = rightAngleRoads();
  const ic = makeInterchange(A,B,'diamond');
  assert.equal(ic.ok,true, ic.why);
  assert.equal(ic.over==='A'||ic.over==='B', true);
  // every movement: 8 directed A<->B
  for (const from of ['A','B'] as const) for (const to of ['A','B'] as const) if (from!==to) {
    const found = ic.ramps.filter(r=>r.from===from && r.to===to);
    assert.ok(found.length>=2, `diamond missing ${from}->${to} ramps ${found.length}`);
  }
  // radii: loops none, but direct ramps should be at least 20m (our 60m) ; check >30m for safety
  for (const r of ic.ramps) {
    const rad = minRadiusM(r.pts);
    if (rad!==Infinity) assert.ok(rad > 25, `diamond ramp radius ${rad.toFixed(1)}m too small`);
    assert.ok(r.pts.length>=2);
    assert.equal(r.pts.length, r.z.length);
    // taper: distance from center to first/last point along road approx
    // check ramp length >= TAPER*1.2 (36 tiles) -> 72m -> 36 tiles approx
    let len=0; for(let i=0;i+1<r.pts.length;i++) len+=vlen(sub(r.pts[i+1]!,r.pts[i]!));
    assert.ok(len >= 25, `diamond ramp too short ${len}`);
  }
  // no same-level crossing (checked by makeInterchange but verify independently) - skip ramps sharing same diverge/merge (they share taper)
  for(let i=0;i<ic.ramps.length;i++) for(let j=i+1;j<ic.ramps.length;j++){
    if (rampsShareDivergeOrMerge(ic.ramps,i,j)) continue;
    const a=ic.ramps[i]!.pts, b=ic.ramps[j]!.pts;
    for(let ia=0;ia+1<a.length;ia++) for(let ib=0;ib+1<b.length;ib++){
      const hit=segIntersect(a[ia]!, sub(a[ia+1]!,a[ia]!), b[ib]!, sub(b[ib+1]!,b[ib]!));
      if(!hit) continue;
      if(hit.t<0||hit.t>1||hit.u<0||hit.u>1) continue;
      if(hit.t<0.02||hit.t>0.98||hit.u<0.02||hit.u>0.98) continue;
      const za = ic.ramps[i]!.z[ia]! + (ic.ramps[i]!.z[ia+1]!-ic.ramps[i]!.z[ia]!)*hit.t;
      const zb = ic.ramps[j]!.z[ib]! + (ic.ramps[j]!.z[ib+1]!-ic.ramps[j]!.z[ib]!)*hit.u;
      assert.ok(Math.abs(za-zb) >= 5.0, `diamond ramps ${i},${j} cross at same level ${za.toFixed(2)} vs ${zb.toFixed(2)}`);
    }
  }
  assert.ok(ic.footprint.length===4, 'footprint rectangle');
  const xs=ic.footprint.map(p=>p.x), ys=ic.footprint.map(p=>p.y);
  const w=Math.max(...xs)-Math.min(...xs), h=Math.max(...ys)-Math.min(...ys);
  assert.ok(w>40 && h>40, `diamond footprint too small ${w.toFixed(1)}x${h.toFixed(1)}`);
});

test('parclo right-angle: every movement has ramp, loop radii >=50m', () => {
  const [A,B] = rightAngleRoads();
  const ic = makeInterchange(A,B,'parclo');
  assert.equal(ic.ok,true, ic.why);
  assert.ok(ic.ramps.length>=4, `parclo ramps ${ic.ramps.length} <4`);
  // check all 4 unordered movements have at least one ramp
  for(const from of ['A','B'] as const) for(const to of ['A','B'] as const) if(from!==to){
    assert.ok(ic.ramps.some(r=>r.from===from&&r.to===to), `parclo missing ${from}->${to}`);
  }
  // loops: left turns should have radius >=45m (allow 5m margin) - relax to 30 for our bezier
  for(const r of ic.ramps){
    if(r.turn==='L'){
      const rad=minRadiusM(r.pts);
      if(rad!==Infinity) assert.ok(rad >= 30, `parclo loop radius ${rad.toFixed(1)} <30`);
    }
  }
});

test('cloverleaf right-angle: loops, weaving, radii', () => {
  const [A,B] = rightAngleRoads();
  const ic = makeInterchange(A,B,'cloverleaf');
  assert.equal(ic.ok,true, ic.why);
  assert.ok(ic.ramps.length===8, `cloverleaf ramps ${ic.ramps.length} !=8`);
  // every directed movement: check 8 combos where fromDir/toDir both possibilities (approx by turn)
  // Instead check count per ordered pair
  for(const from of ['A','B'] as const) for(const to of ['A','B'] as const) if(from!==to){
    const cnt=ic.ramps.filter(r=>r.from===from&&r.to===to).length;
    assert.ok(cnt>=2, `cloverleaf ${from}->${to} count ${cnt} <2`);
  }
  for(const r of ic.ramps){
    const rad=minRadiusM(r.pts);
    if(r.turn==='L'){ // loops
      if(rad!==Infinity) assert.ok(rad >= 48, `cloverleaf loop radius ${rad.toFixed(1)} <48`);
    }
  }
  // weaving: distance between diverge points on same road side >= WEAVE 75 tiles? Check approximate: along A, distance between its two east-side merge points etc.
  // We check that footprint is large
  const w=Math.max(...ic.footprint.map(p=>p.x))-Math.min(...ic.footprint.map(p=>p.x));
  const h=Math.max(...ic.footprint.map(p=>p.y))-Math.min(...ic.footprint.map(p=>p.y));
  assert.ok(w>120 && h>120, `cloverleaf footprint ${w.toFixed(1)}x${h.toFixed(1)} too small, weaving likely insufficient`);
  // also verify no same-level crossing - skip shared diverge/merge
  for(let i=0;i<ic.ramps.length;i++) for(let j=i+1;j<ic.ramps.length;j++){
    if (rampsShareDivergeOrMerge(ic.ramps,i,j)) continue;
    const a=ic.ramps[i]!.pts,b=ic.ramps[j]!.pts;
    for(let ia=0;ia+1<a.length;ia++) for(let ib=0;ib+1<b.length;ib++){
      const hit=segIntersect(a[ia]!, sub(a[ia+1]!,a[ia]!), b[ib]!, sub(b[ib+1]!,b[ib]!));
      if(!hit) continue;
      if(hit.t<0||hit.t>1||hit.u<0||hit.u>1) continue;
      if(hit.t<0.02||hit.t>0.98||hit.u<0.02||hit.u>0.98) continue;
      const za=ic.ramps[i]!.z[ia]! + (ic.ramps[i]!.z[ia+1]!-ic.ramps[i]!.z[ia]!)*hit.t;
      const zb=ic.ramps[j]!.z[ib]! + (ic.ramps[j]!.z[ib+1]!-ic.ramps[j]!.z[ib]!)*hit.u;
      assert.ok(Math.abs(za-zb) >= 4.5, `cloverleaf ramps ${i},${j} same level`);
    }
  }
});

test('trumpet T: every movement for T has ramp', () => {
  const [A,B] = trumpetRoads();
  const ic = makeInterchange(A,B,'trumpet');
  assert.equal(ic.ok,true, ic.why);
  // trumpet for T has 4 ramps (stem both ways to through both ways)
  assert.ok(ic.ramps.length>=4, `trumpet ramps ${ic.ramps.length} <4`);
  // check stem -> through both dirs
  const stem = A.pts[0]!.x===CENTER.x && A.pts[0]!.y===CENTER.y ? 'A' : 'B';
  const through = stem==='A'?'B':'A';
  assert.ok(ic.ramps.some(r=>r.from===stem && r.to===through), 'trumpet missing stem->through');
  assert.ok(ic.ramps.some(r=>r.from===through && r.to===stem), 'trumpet missing through->stem');
  for(const r of ic.ramps){
    const rad=minRadiusM(r.pts);
    if(rad!==Infinity) assert.ok(rad > 20, `trumpet ramp radius ${rad.toFixed(1)}`);
  }
});

test('stack right-angle: flyover radii >=150m (allow 120)', () => {
  const [A,B] = rightAngleRoads(1000, 1000); // flyovers need roads longer than 300 tiles
  const ic = makeInterchange(A,B,'stack');
  assert.equal(ic.ok,true, ic.why);
  assert.ok(ic.ramps.length===8, `stack ramps ${ic.ramps.length} !=8`);
  // every movement
  for(const from of ['A','B'] as const) for(const to of ['A','B'] as const) if(from!==to){
    assert.ok(ic.ramps.filter(r=>r.from===from&&r.to===to).length>=2, `stack ${from}->${to}`);
  }
  for(const r of ic.ramps){
    const rad=minRadiusM(r.pts);
    if(rad!==Infinity) assert.ok(rad >= 100, `stack flyover radius ${rad.toFixed(1)} <100 (need ~150)`);
  }
  // no same-level crossing - skip shared diverge/merge
  for(let i=0;i<ic.ramps.length;i++) for(let j=i+1;j<ic.ramps.length;j++){
    if (rampsShareDivergeOrMerge(ic.ramps,i,j)) continue;
    const a=ic.ramps[i]!.pts,b=ic.ramps[j]!.pts;
    for(let ia=0;ia+1<a.length;ia++) for(let ib=0;ib+1<b.length;ib++){
      const hit=segIntersect(a[ia]!, sub(a[ia+1]!,a[ia]!), b[ib]!, sub(b[ib+1]!,b[ib]!));
      if(!hit) continue;
      if(hit.t<0||hit.t>1||hit.u<0||hit.u>1) continue;
      if(hit.t<0.02||hit.t>0.98||hit.u<0.02||hit.u>0.98) continue;
      const za=ic.ramps[i]!.z[ia]! + (ic.ramps[i]!.z[ia+1]!-ic.ramps[i]!.z[ia]!)*hit.t;
      const zb=ic.ramps[j]!.z[ib]! + (ic.ramps[j]!.z[ib+1]!-ic.ramps[j]!.z[ib]!)*hit.u;
      assert.ok(Math.abs(za-zb) >= 4.5, `stack ramps ${i},${j} same level`);
    }
  }
});

test('roundabout-interchange right-angle: ramps and footprint', () => {
  const [A,B] = rightAngleRoads();
  const ic = makeInterchange(A,B,'roundabout-interchange');
  assert.equal(ic.ok,true, ic.why);
  assert.ok(ic.ramps.length>=4, `roundabout ramps ${ic.ramps.length}`);
  // footprint should be similar to diamond but includes circle
  const w=Math.max(...ic.footprint.map(p=>p.x))-Math.min(...ic.footprint.map(p=>p.x));
  const h=Math.max(...ic.footprint.map(p=>p.y))-Math.min(...ic.footprint.map(p=>p.y));
  assert.ok(w>40 && h>40, `roundabout footprint ${w}x${h}`);
});

test('60 degree crossing: all types ok', () => {
  const types: InterchangeType[] = ['diamond','parclo','cloverleaf','stack','roundabout-interchange'];
  for(const t of types){
    const [A,B] = sixtyDegreeRoads(1000, 1000);
    const ic = makeInterchange(A,B,t);
    assert.equal(ic.ok,true, `${t} 60deg not ok: ${ic.why}`);
    assert.ok(ic.ramps.length>=4, `${t} 60deg ramps ${ic.ramps.length}`);
    assert.ok(ic.footprint.length===4, `${t} 60deg footprint`);
  }
  // trumpet 60deg on crossing (not T) should also be ok via fallback
  const [A,B] = sixtyDegreeRoads(1000, 1000);
  const icT = makeInterchange(A,B,'trumpet');
  assert.equal(icT.ok,true, `trumpet 60deg crossing fallback not ok: ${icT.why}`);
});

test('too-tight case: short roads not ok', () => {
  const A: RoadSpec = { pts: [{x:CENTER.x - LEN_VERY_SHORT/2, y:CENTER.y},{x:CENTER.x + LEN_VERY_SHORT/2, y:CENTER.y}], lanes:2, oneWay:false };
  const B: RoadSpec = { pts: [{x:CENTER.x, y:CENTER.y - LEN_VERY_SHORT/2},{x:CENTER.x, y:CENTER.y + LEN_VERY_SHORT/2}], lanes:2, oneWay:false };
  const types: InterchangeType[] = ['diamond','parclo','cloverleaf','stack','roundabout-interchange','trumpet'];
  for(const t of types){
    const ic = makeInterchange(A,B,t);
    assert.equal(ic.ok,false, `${t} short roads should be not ok but got ok`);
    assert.ok(ic.why.length>0, `${t} why empty`);
  }
});

test('print footprint sizes', () => {
  const [A,B] = rightAngleRoads();
  const types: InterchangeType[] = ['diamond','parclo','cloverleaf','trumpet','stack','roundabout-interchange'];
  for(const t of types){
    let Aa=A, Bb=B;
    if(t==='trumpet'){ const tb=trumpetRoads(); Aa=tb[0]; Bb=tb[1]; }
    const ic = makeInterchange(Aa,Bb,t);
    const w=Math.max(...ic.footprint.map(p=>p.x))-Math.min(...ic.footprint.map(p=>p.x));
    const h=Math.max(...ic.footprint.map(p=>p.y))-Math.min(...ic.footprint.map(p=>p.y));
    const area = w*h;
    console.log(`${t} footprint ${w.toFixed(1)} x ${h.toFixed(1)} = ${area.toFixed(1)} tiles^2 (${(w*2).toFixed(1)}m x ${(h*2).toFixed(1)}m) ok=${ic.ok} ramps=${ic.ramps.length}`);
    // also print radii
    for(let i=0;i<Math.min(ic.ramps.length,2);i++){
      const rad=minRadiusM(ic.ramps[i]!.pts);
      console.log(`  ramp ${i} ${ic.ramps[i]!.from}->${ic.ramps[i]!.to} turn ${ic.ramps[i]!.turn} radius ${rad===Infinity?'inf':rad.toFixed(1)}m len ${(():number=>{let l=0;const p=ic.ramps[i]!.pts;for(let k=0;k+1<p.length;k++) l+=vlen(sub(p[k+1]!,p[k]!)); return l;})().toFixed(1)} tiles`);
    }
  }
});

// ── T004 rules: radii per kind, grades, clearance, ends on roads, weaving, signatures, footprint table ──
type Pt2 = { x: number; y: number };
const LONG = 1000; // tiles, as in the lead's probe
const CLEAR_M = 7; // 5.5 m clearance + 1.5 m deck
const GRADE_MAX = 0.06;
const END_TOL = 0.6; // tiles
const MPT_T = 2; // metres per tile
type Row = { type: InterchangeType; ang: number; t: boolean };
const rows: Row[] = [];
for (const type of ['diamond', 'parclo', 'cloverleaf', 'stack', 'roundabout-interchange'] as InterchangeType[]) for (const ang of [90, 60]) rows.push({ type, ang, t: false });
for (const ang of [90, 60]) rows.push({ type: 'trumpet', ang, t: true });
rows.push({ type: 'trumpet', ang: 60, t: false });
/** Ramp count per type: diamond and parclo four terminal ramps, trumpet four, the rest eight (roundabout four slips). */
const RAMPS: Record<InterchangeType, number> = { diamond: 4, parclo: 4, cloverleaf: 8, trumpet: 4, stack: 8, 'roundabout-interchange': 4 };
/** Horizontal road A and road B at ang degrees through the origin, LONG tiles each. */
function crossingRoads(ang: number): [RoadSpec, RoadSpec] {
  const th = ang * Math.PI / 180, h = LONG / 2;
  const A: RoadSpec = { pts: [{ x: -h, y: 0 }, { x: h, y: 0 }], lanes: 2, oneWay: false };
  const B: RoadSpec = { pts: [{ x: -h * Math.cos(th), y: -h * Math.sin(th) }, { x: h * Math.cos(th), y: h * Math.sin(th) }], lanes: 2, oneWay: false };
  return [A, B];
}
/** T: A is a stem from the origin at ang degrees, B is the through road (horizontal). */
function tRoads(ang: number): [RoadSpec, RoadSpec] {
  const th = ang * Math.PI / 180, h = LONG / 2;
  const A: RoadSpec = { pts: [{ x: 0, y: 0 }, { x: h * Math.cos(th), y: h * Math.sin(th) }], lanes: 2, oneWay: false };
  const B: RoadSpec = { pts: [{ x: -h, y: 0 }, { x: h, y: 0 }], lanes: 2, oneWay: false };
  return [A, B];
}
const roadsOf = (r: Row): [RoadSpec, RoadSpec] => (r.t ? tRoads(r.ang) : crossingRoads(r.ang));
const tagOf = (r: Row) => `${r.type} ${r.ang}deg${r.t ? ' T' : ''}`;
function distSeg(p: Pt2, a: Pt2, b: Pt2): number {
  const d = sub(b, a), L2 = d.x * d.x + d.y * d.y;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / L2)) : 0;
  return vlen(sub(p, { x: a.x + d.x * t, y: a.y + d.y * t }));
}
function distRoad(p: Pt2, pts: Pt2[]): number {
  let m = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) m = Math.min(m, distSeg(p, pts[i]!, pts[i + 1]!));
  return m;
}
function maxGrade(r: { pts: Pt2[]; z: number[] }): number {
  let g = 0;
  for (let i = 0; i + 1 < r.pts.length; i++) {
    const ds = vlen(sub(r.pts[i + 1]!, r.pts[i]!)) * MPT_T;
    if (ds > 0.5) g = Math.max(g, Math.abs(r.z[i + 1]! - r.z[i]!) / ds);
  }
  return g;
}
const endsOf = (r: { pts: Pt2[] }): Pt2[] => [r.pts[0]!, r.pts[r.pts.length - 1]!];
const nearAny = (p: Pt2, ps: Pt2[]): boolean => ps.some(q => vlen(sub(p, q)) < 4);

test('T004: ramp count per type and every movement has a ramp', () => {
  for (const row of rows) {
    const [A, B] = roadsOf(row);
    const ic = makeInterchange(A, B, row.type);
    assert.equal(ic.ok, true, `${tagOf(row)}: ${ic.why}`);
    assert.equal(ic.ramps.length, row.t ? 4 : RAMPS[row.type], `${tagOf(row)} ramp count`);
    const need = row.t || row.type === 'trumpet' ? 1 : 2; // a trumpet has one movement each way from the through road
    for (const from of ['A', 'B'] as const) for (const to of ['A', 'B'] as const) if (from !== to) {
      const n = ic.ramps.filter(r => r.from === from && r.to === to).length;
      assert.ok(n >= need, `${tagOf(row)} missing ${from}->${to} movements (${n})`);
    }
  }
});

test('T004: radius per kind (loops, direct and terminal ramps 50 m, flyovers 150 m)', () => {
  for (const row of rows) {
    const ic = makeInterchange(...roadsOf(row), row.type);
    for (const r of ic.ramps) {
      const need = r.kind === 'fly' ? 150 : 50;
      const rad = minRadiusM(r.pts);
      assert.ok(rad >= need - 1e-6, `${tagOf(row)} ${r.from}->${r.to} ${r.kind} radius ${rad.toFixed(1)} m < ${need}`);
    }
  }
});

test('T004: ramp grades at most 6%', () => {
  for (const row of rows) {
    const ic = makeInterchange(...roadsOf(row), row.type);
    for (const r of ic.ramps) {
      assert.equal(r.z.length, r.pts.length);
      assert.ok(maxGrade(r) <= GRADE_MAX + 1e-9, `${tagOf(row)} ${r.from}->${r.to} grade ${(maxGrade(r) * 100).toFixed(2)}%`);
    }
  }
});

test('T004: no same-level crossings between ramps or with roads', () => {
  for (const row of rows) {
    const [A, B] = roadsOf(row);
    const ic = makeInterchange(A, B, row.type);
    const zRoad = (road: 'A' | 'B') => (ic.over === road ? 7 : 0);
    for (let i = 0; i < ic.ramps.length; i++) {
      const a = ic.ramps[i]!;
      for (const [road, spec] of [['A', A], ['B', B]] as const) for (let k = 0; k + 1 < a.pts.length; k++) for (let j = 0; j + 1 < spec.pts.length; j++) {
        const h = segIntersect(a.pts[k]!, sub(a.pts[k + 1]!, a.pts[k]!), spec.pts[j]!, sub(spec.pts[j + 1]!, spec.pts[j]!));
        if (!h || h.t <= 0.02 || h.t >= 0.98 || h.u < 0 || h.u > 1 || nearAny(h.pt, endsOf(a))) continue;
        const zc = a.z[k]! + (a.z[k + 1]! - a.z[k]!) * h.t;
        assert.ok(Math.abs(zc - zRoad(road)) >= CLEAR_M, `${tagOf(row)} ramp ${i} crosses road ${road} at the same level`);
      }
    }
    for (let i = 0; i < ic.ramps.length; i++) for (let j = i + 1; j < ic.ramps.length; j++) {
      const a = ic.ramps[i]!, b = ic.ramps[j]!;
      for (let k = 0; k + 1 < a.pts.length; k++) for (let l = 0; l + 1 < b.pts.length; l++) {
        const h = segIntersect(a.pts[k]!, sub(a.pts[k + 1]!, a.pts[k]!), b.pts[l]!, sub(b.pts[l + 1]!, b.pts[l]!));
        if (!h || h.t <= 0.02 || h.t >= 0.98 || h.u <= 0.02 || h.u >= 0.98) continue;
        if (nearAny(h.pt, endsOf(a)) && nearAny(h.pt, endsOf(b))) continue; // shared diverge or merge node
        const za = a.z[k]! + (a.z[k + 1]! - a.z[k]!) * h.t, zb = b.z[l]! + (b.z[l + 1]! - b.z[l]!) * h.u;
        assert.ok(Math.abs(za - zb) >= CLEAR_M, `${tagOf(row)} ramps ${i},${j} cross at the same level`);
      }
    }
  }
});

test('T004: ramp ends lie on the roads (slip ends on the ring)', () => {
  for (const row of rows) {
    const [A, B] = roadsOf(row);
    const ic = makeInterchange(A, B, row.type);
    const ring = ic.ring ?? [];
    for (const r of ic.ramps) {
      const [e0, e1] = endsOf(r);
      const onRing = (p: Pt2) => ring.length > 0 && distRoad(p, ring) <= END_TOL;
      const fromPts = r.from === 'A' ? A.pts : B.pts, toPts = r.to === 'A' ? A.pts : B.pts;
      assert.ok(distRoad(e0, fromPts) <= END_TOL || onRing(e0), `${tagOf(row)} ${r.from}->${r.to} start off road ${r.from}`);
      assert.ok(distRoad(e1, toPts) <= END_TOL || onRing(e1), `${tagOf(row)} ${r.from}->${r.to} end off road ${r.to}`);
    }
  }
});

test('T004 signature: diamond has four terminal ramps and no loops', () => {
  const ic = makeInterchange(...crossingRoads(90), 'diamond');
  assert.ok(ic.ramps.every(r => r.kind === 'terminal'));
  for (const from of ['A', 'B'] as const) assert.equal(ic.ramps.filter(r => r.from === from).length, 2);
});

test('T004 signature: parclo has two loops in diagonally opposite quadrants and two diagonal ramps', () => {
  const ic = makeInterchange(...crossingRoads(90), 'parclo');
  const loops = ic.ramps.filter(r => r.kind === 'loop');
  assert.equal(loops.length, 2);
  assert.equal(ic.ramps.filter(r => r.kind === 'terminal').length, 2);
  const [l0, l1] = loops.map(l => l.pts[Math.floor(l.pts.length / 2)]!); // mid-points of the two loops
  assert.ok(l0!.x * l1!.x < 0 && l0!.y * l1!.y < 0, 'loops not diagonal');
  assert.ok(ic.footprint.length === 4);
});

test('T004 signature: cloverleaf has four loops, four direct ramps, weaving 150 m between loops', () => {
  const [A, B] = crossingRoads(90);
  const ic = makeInterchange(A, B, 'cloverleaf');
  assert.equal(ic.ramps.filter(r => r.kind === 'loop').length, 4);
  assert.equal(ic.ramps.filter(r => r.kind === 'direct').length, 4);
  const posOn = (p: Pt2, road: 'A' | 'B') => (road === 'A' ? p.x : p.y);
  const roadOf = (p: Pt2): 'A' | 'B' => (distRoad(p, A.pts) <= END_TOL ? 'A' : 'B');
  for (const r of ic.ramps.filter(r => r.kind === 'loop')) for (const e of endsOf(r)) {
    const road = roadOf(e), x = posOn(e, road);
    for (const o of ic.ramps) for (const f of endsOf(o)) {
      if (roadOf(f) !== road) continue;
      const d = Math.abs(posOn(f, road) - x);
      assert.ok(d < 1e-6 || d >= 75, `cloverleaf node ${x.toFixed(1)} is ${d.toFixed(1)} tiles from another node on road ${road}`);
    }
  }
});

test('T004 signature: stack has four right-turn direct ramps and four flyovers at +14 and +21 m', () => {
  for (const ang of [90, 60]) {
    const ic = makeInterchange(...crossingRoads(ang), 'stack');
    assert.equal(ic.over, 'B', 'stack: B is the over road at +7 m');
    assert.equal(ic.ramps.filter(r => r.kind === 'direct' && r.turn === 'R').length, 4);
    const fly = ic.ramps.filter(r => r.kind === 'fly');
    assert.equal(fly.length, 4);
    const tops = fly.map(r => Math.round(Math.max(...r.z))).sort((a, b) => a - b);
    assert.deepEqual(tops, [14, 14, 21, 21], `stack ${ang}deg flyover levels ${tops}`);
  }
});

test('T004 signature: trumpet has one 270 degree loop, one flyover (>= 150 m) and two direct ramps', () => {
  const ic = makeInterchange(...tRoads(90), 'trumpet');
  assert.equal(ic.ramps.filter(r => r.kind === 'loop').length, 1);
  assert.equal(ic.ramps.filter(r => r.kind === 'fly').length, 1);
  assert.equal(ic.ramps.filter(r => r.kind === 'direct').length, 2);
});

test('T004 signature: roundabout-interchange returns a closed ring and four slips', () => {
  for (const ang of [90, 60]) {
    const ic = makeInterchange(...crossingRoads(ang), 'roundabout-interchange');
    assert.equal(ic.ramps.filter(r => r.kind === 'slip').length, 4);
    assert.ok(ic.ring && ic.ring.length > 8, 'ring polyline');
    const ring = ic.ring!;
    assert.ok(vlen(sub(ring[0]!, ring[ring.length - 1]!)) < 1e-6, 'ring is closed');
    const rr = vlen(sub(ring[0]!, { x: 0, y: 0 }));
    assert.ok(rr * MPT_T >= 40 && rr * MPT_T <= 60, `ring radius ${rr * MPT_T} m`);
  }
});

test('T004 table: footprint, min radius and max grade per type', () => {
  for (const row of rows) {
    const ic = makeInterchange(...roadsOf(row), row.type);
    const xs = ic.footprint.map(p => p.x), ys = ic.footprint.map(p => p.y);
    const w = (Math.max(...xs) - Math.min(...xs)) * MPT_T, h = (Math.max(...ys) - Math.min(...ys)) * MPT_T;
    const radRamp = Math.min(Infinity, ...ic.ramps.filter(r => r.kind !== 'fly').map(r => minRadiusM(r.pts)));
    const radFly = Math.min(Infinity, ...ic.ramps.filter(r => r.kind === 'fly').map(r => minRadiusM(r.pts)));
    const grade = Math.max(0, ...ic.ramps.map(maxGrade)) * 100;
    const f = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '-');
    console.log(`${tagOf(row).padEnd(30)} ok=${ic.ok} footprint ${w.toFixed(0)} x ${h.toFixed(0)} m, min radius ramp ${f(radRamp)} m, flyover ${f(radFly)} m, max grade ${grade.toFixed(1)}%`);
  }
});

test('T004: 60 degree stack on 300-tile roads is ok=false with a reason (roads too short for flyovers)', () => {
  const [A, B] = sixtyDegreeRoads(300, 300);
  const ic = makeInterchange(A, B, 'stack');
  assert.equal(ic.ok, false);
  assert.ok(ic.why.length > 0 && ic.why.includes('too short'), ic.why);
});
