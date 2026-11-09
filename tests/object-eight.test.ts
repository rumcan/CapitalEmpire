import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createObjectFacings, eventArtSet, facingAt, legacyObjectFacing, objectNormalReplacements } from '../src/game/object-eight-core';
import { OBJECT_FACING_KEYS, objectAnchor, objectFootprint, type ObjectEightSet } from '../src/game/object-eight-types';
import { PropsTool, type PropsHostCtx } from '../src/game/golf/propstool';
import { DECOR_BY_KEY, propTuple } from '../src/game/golf/decor';
import type { Prop } from '../src/game/types';
import { checkStructurePlacement, structureRect } from '../src/game/golf/eventtool';
import { nextStructureFacing, structurePicture } from '../src/game/golf/structure-facing';
import { EXISTING_OBJECT_EIGHT_SETS } from '../src/game/object-eight-existing';
import EXISTING_EVIDENCE from '../src/game/object-eight-existing.json';
import { objectFacings } from '../src/game/object-eight';
import { LIBRARY } from '../src/game/library';
import { AXIS_FOOT } from '../src/game/axis-library';

const views = Object.fromEntries(OBJECT_FACING_KEYS.map((key, i) => [key, { id: `test-eight:${key}`, headingDegrees: i % 2 ? i * 45 - 8 : i * 45, boxes: [objectFootprint(8, 4, i % 2 ? i * 45 - 8 : i * 45)] }])) as ObjectEightSet['views'];
const set: ObjectEightSet = { subject: 'test:eight', name: 'Eight', version: 1, review: 'approved', projection: 'normal+yaw8', views, baselineScale: 1, footprintMetres: { width: 8, depth: 4 }, eventTypes: ['standS'], visualTier: 'worn' };

test('24 reviewed historical sets are selectable in eight positions; held rows preserve saved indices', () => {
  assert.equal(EXISTING_OBJECT_EIGHT_SETS.length,24);assert.equal(EXISTING_EVIDENCE.excluded.length,8);
  const by=new Map(LIBRARY.map(i=>[i.id,i]));
  for(const s of EXISTING_OBJECT_EIGHT_SETS){
    const info=objectFacings(s.subject);assert.equal(info.mode,'eight',s.subject);assert.equal(new Set(info.ids).size,8);
    for(const [n,key]of OBJECT_FACING_KEYS.entries()){
      const source=by.get(s.sourceIds[key])!,clone=by.get(s.views[key].id)!;assert.deepEqual(clone.tex,source.tex);assert.notEqual(clone.id,source.id);
      assert.equal(facingAt(info,n).key,key);assert.equal(facingAt(info,n).flip,false);
      if(key.startsWith('yaw8'))assert.equal(AXIS_FOOT[source.id]![2],-8,'real yaw metadata, not an inferred square cardinal');
      else assert.deepEqual(clone.boxes,source.boxes,'normal lot-art geometry unchanged');
    }
  }
  for(const s of EXISTING_EVIDENCE.excluded)assert.ok(!EXISTING_OBJECT_EIGHT_SETS.some(q=>q.subject===s.subject), `${s.subject}: no historical reuse until repaired and reviewed`);
});

test('only explicit complete authored yaw8 families enable eight views, and every view enters the same cycle', () => {
  const ids = new Set(Object.values(views).map(v => v.id));
  const lookup = createObjectFacings([set], id => ids.has(id), () => null);
  const v = lookup(set.subject); assert.equal(v.mode, 'eight');
  assert.deepEqual(Array.from({ length: 9 }, (_, i) => facingAt(v, i).key), [...OBJECT_FACING_KEYS, 'normalNE']);
  for (const [i, key] of OBJECT_FACING_KEYS.entries()) { const current = lookup(views[key].id); assert.equal(current.at, i); assert.equal(facingAt(current, current.at + 1).id, views[OBJECT_FACING_KEYS[(i+1)%8]!].id); assert.equal(facingAt(current, i).flip, false); }
  ids.delete(views.yaw8W.id); const missing = lookup(set.subject); assert.equal(missing.mode, 'single'); assert.deepEqual(missing.missing, ['yaw8W']);
  const square = createObjectFacings([], () => true, () => ({ views: ['n','e','s','w'], at: 0 }));
  assert.equal(square('n').mode, 'four', 'a square cardinal set is never relabelled yaw8');
  const aliases = objectNormalReplacements([{ ...set, aliases: ['old:shanty','old:square'] }], id => id === 'old:square' ? null : [id,`view:${id}:se`,`view:${id}:sw`,`view:${id}:nw`]);
  assert.deepEqual(aliases.get('old:shanty'), [views.normalNE.id,views.normalSE.id]);
  assert.deepEqual(aliases.get('view:old:shanty:sw'), [views.normalSW.id,views.normalNW.id]);
  assert.equal(aliases.has('old:square'),false);
});

test('legacy structures preserve boolean orientation and explicit normal views have matching placement bounds', () => {
  assert.equal(legacyObjectFacing(true), 'normalSE'); assert.equal(legacyObjectFacing(false), 'normalNE');
  const original = { typeId: 'standS', x: 10, y: 20, rotated: true };
  assert.deepEqual(structureRect(original), [10,20,4,8]);
  const explicit = structureRect({ ...original, facing: 'normalSE' });
  assert.ok(Math.abs(explicit[2]-4)<1e-9 && Math.abs(explicit[3]-8)<1e-9);
  assert.equal(structurePicture(original).facing, 'normalSE');
  const saved = JSON.parse(JSON.stringify({ ...original, facing: nextStructureFacing(original), visualTier: 'worn' }));
  assert.equal(structurePicture(saved).facing, saved.facing);
  const check = checkStructurePlacement({ ...original, mode: 'rent', facing: 'normalSE' }, { tier: 2, holes: [], existing: [], parcels: [[0,0,15,25]] });
  assert.equal(check.ok, false, 'turned depth, rather than original width, reaches outside land');
  const b = objectFootprint(8,4,53); assert.ok(b.hx>0 && b.hy>0 && Math.abs(b.hx-objectFootprint(8,4,45).hx)>.01, 'real eight-degree geometry differs from square cardinal');
});

test('visual condition selects distinct approved art without changing capacities or the old type', () => {
  const upgraded: ObjectEightSet = { ...set, subject: 'test:upgraded', visualTier: 'upgraded', capacity: 200 };
  assert.equal(eventArtSet([set, upgraded], 'standS')?.subject, set.subject);
  assert.equal(eventArtSet([set, upgraded], 'standS', 'upgraded')?.subject, upgraded.subject);
  assert.equal(eventArtSet([set, upgraded], 'standM'), undefined);
  assert.deepEqual(objectAnchor([{ hx: 4, hy: 2, dx: 2, dy: -2 }], [10,20,4,2]), { x: 11, y: 22 }, 'an off-centre foot uses the same bounds in preview and placement');
});

test('event previews and saved placements choose the same eight native pictures and actual yaw8 bounds', () => {
  const lookup = createObjectFacings([set], () => true, () => null);
  let state: { typeId: string; x: number; y: number; facing: typeof OBJECT_FACING_KEYS[number] } = { typeId: 'standS', x: 10, y: 20, facing: 'normalNE' };
  const ids = new Set<string>();
  for (const key of OBJECT_FACING_KEYS) {
    const preview = structurePicture(state, [set], lookup), loaded = JSON.parse(JSON.stringify(state));
    assert.equal(preview.facing, key); assert.equal(preview.flip, false); ids.add(preview.id);
    assert.equal(structurePicture(loaded, [set], lookup).id, preview.id);
    const box = views[key].boxes[0]!, rect = structureRect(loaded, [set]);
    assert.deepEqual(rect, [10,20,box.hx,box.hy], 'metre half extents convert to full extents in2m tiles');
    state = { ...state, facing: nextStructureFacing(state, [set], lookup) };
  }
  assert.equal(ids.size,8);assert.equal(state.facing,'normalNE');
});

test('held and selected props use eight real IDs, change collision footprint and retain facing in saves and moves', () => {
  const d = DECOR_BY_KEY.get('fountain')!, ids = Object.values(views).map(v => v.id), lookup = createObjectFacings([{ ...set, aliases: [d.id] }], id => ids.includes(id), () => null);
  const props = new Set<Prop>(); let selected: Prop | null = null, uid = 0;
  const footprint = (item: number, x: number, y: number, scale: number): [number, number, number, number] => {
    const b = objectFootprint(8,4,item%2 ? 53 : item/2*90); return [x-b.hx*scale/2,y-b.hy*scale/2,x+b.hx*scale/2,y+b.hy*scale/2];
  };
  const host: PropsHostCtx = {
    facings: lookup, golf: () => true, item: id => { const i=ids.indexOf(id);return i<0?undefined:i; }, idOf: p => ids[p.item]!, scaleOf: (_, want) => want ?? 1, footprint,
    spot: { owned: () => true, water: () => false, road: () => false, course: () => '' }, propsIn: () => [], props: () => props, propName: () => 'Eight', scene: () => null,
    addProp: (item,x,y,scale,flip) => { const b=footprint(item,x,y,scale),p:Prop={uid:++uid,item,x,y,scale,flip:!!flip,x0:b[0],y0:b[1],x1:b[2],y1:b[3]};props.add(p);return p; }, removeProp: p => {props.delete(p);},
    propAt: () => selected, tileAt: (x,y) => ({x,y}), selected: () => selected, select: p => {selected=p;}, hover: () => {}, money: () => 100000, spend: () => {}, step: (_,run) => {run();}, undo: () => {}, redo: () => {}, save: () => {}, toast: () => {}, emit: () => {},
  };
  const tool = new PropsTool(host); tool.pick('fountain'); tool.move(30,30);
  const base = tool.ghost!.box; const seen = new Set<number>();
  for(let i=0;i<8;i++){seen.add(tool.ghost!.item);assert.equal(tool.ghost!.flip,false);tool.turn();}
  assert.equal(seen.size,8); tool.turn(); assert.notDeepEqual(tool.ghost!.box,base);
  tool.place(); tool.pick(null); selected=[...props][0]!; const old=selected.item; tool.turn(); assert.notEqual(selected!.item,old); assert.equal(selected!.flip,false);
  const saved=JSON.parse(JSON.stringify(propTuple(ids[selected!.item]!,selected!))); assert.equal(saved[0],ids[selected!.item]);assert.equal(saved[3],0);
  const before=selected!;tool.down(before.x,before.y);tool.move(45,44);tool.up();assert.equal(selected!.item,before.item);assert.deepEqual([selected!.x,selected!.y],[45,44]);
});
