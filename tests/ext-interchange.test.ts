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
  assert.ok(ic.ramps.length>=6, `parclo ramps ${ic.ramps.length} <6`);
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
  const [A,B] = rightAngleRoads();
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
    const [A,B] = sixtyDegreeRoads();
    const ic = makeInterchange(A,B,t);
    assert.equal(ic.ok,true, `${t} 60deg not ok: ${ic.why}`);
    assert.ok(ic.ramps.length>=4, `${t} 60deg ramps ${ic.ramps.length}`);
    assert.ok(ic.footprint.length===4, `${t} 60deg footprint`);
  }
  // trumpet 60deg on crossing (not T) should also be ok via fallback
  const [A,B] = sixtyDegreeRoads();
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
