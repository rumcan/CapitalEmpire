// The Parking tool's bay-row preview in the shared ghost style (T020): a valid row drag draws the green-edged ghost with the "N bays · $cost" label,
// and a drag over the street draws the red one with the refusal reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { MAP } from '../src/game/iso';
import { TC } from '../src/game/terrain/types';
import { ParkingTool, type ParkingHost } from '../src/game/parking-tool';
import type { PaintView } from '../src/game/paint-tool';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** every tile buildable ground */
const TERRAIN = new Uint8Array(MAP * MAP).fill(TC.GROUND);
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

/** a network of one straight street along y = 300, from x 200 to 800 */
function street(): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, 300, 800, 300)], CLASS.street, 0);
  e.commit();
  return e.net;
}

/** a host on net with money, recording nothing (the preview is what is under test) */
function host(net: RoadNetwork, money = 1e6): ParkingHost {
  return {
    setLotGround: () => {},
    emit: () => {},
    save: () => {},
    toast: () => {},
    money: () => money,
    spend: () => {},
    sendParking: () => {},
    net: () => net,
    terrain: () => TERRAIN,
    mapSize: MAP,
    tollKeys: () => new Set<string>(),
  };
}

/** a recording overlay view: the ops on the ctx and the hint calls, in order */
function recordingView(): { view: PaintView; ops: string[]; hints: { text: string; bad: boolean }[] } {
  const ops: string[] = [], hints: { text: string; bad: boolean }[] = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: 'miter', font: '', textAlign: 'start', textBaseline: 'alphabetic',
    beginPath() { ops.push('beginPath'); },
    closePath() { ops.push('closePath'); },
    moveTo(x: number, y: number) { ops.push(`moveTo:${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`); },
    lineTo(x: number, y: number) { ops.push(`lineTo:${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`); },
    rect(x: number, y: number, w: number, h: number) { ops.push(`rect:${x},${y},${w},${h}`); },
    arc(x: number, y: number, r: number) { ops.push(`arc:${Math.round(x)},${Math.round(y)},${Math.round(r * 10) / 10}`); },
    fill() { ops.push(`fill:${String(this.fillStyle)}`); },
    stroke() { ops.push(`stroke:${String(this.strokeStyle)}:${this.lineWidth}`); },
    clip() { ops.push('clip'); },
    save() { ops.push('save'); },
    restore() { ops.push('restore'); },
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { ops.push(`transform:${a},${b},${c},${d},${e},${f}`); },
    setLineDash(s: number[]) { ops.push(`dash:${s.join(',')}`); },
    fillText(t: string) { ops.push(`fillText:${t}`); },
    strokeText(t: string) { ops.push(`strokeText:${t}`); },
  };
  const view = {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    dpr: 2,
    setIso(c: CanvasRenderingContext2D) { c.setTransform(2, 1, -2, 1, 100, 50); },
    screen(x: number, y: number) { return { x: 100 + (x - y) * 2, y: 50 + (x + y) }; },
    hint(_mx: number, _my: number, text: string, bad: boolean) { hints.push({ text, bad }); },
  };
  return { view, ops, hints };
}

test('a valid bay-row drag draws the green-edged ghost and the "N bays · $cost" label', () => {
  const t = new ParkingTool(host(street()));
  t.mode = 'rows';
  t.down({ x: 400, y: 306 });
  t.move({ x: 412.5, y: 306 }, 400, 306);
  assert.equal(t.why, '');
  const { view, ops, hints } = recordingView();
  t.drawPreview(view);
  assert.ok(ops.some(o => o.startsWith('stroke:#86efac:')), 'the ghost edge is the valid green');
  const h = hints[hints.length - 1]!;
  assert.ok(h.text.endsWith(`bays · $${t.cost.toLocaleString()}`), h.text);
  assert.equal(h.bad, false);
});

test('a bay-row drag over the street draws the red ghost and the refusal reason', () => {
  const t = new ParkingTool(host(street()));
  t.mode = 'rows';
  t.down({ x: 400, y: 302 });
  t.move({ x: 412.5, y: 302 }, 400, 302);
  assert.equal(t.why, 'a road runs over it');
  const { view, ops, hints } = recordingView();
  t.drawPreview(view);
  assert.ok(ops.some(o => o.startsWith('stroke:#f87171:')), 'the ghost edge is the invalid red');
  assert.ok(!ops.some(o => o.startsWith('stroke:#86efac:')), 'no green edge when refused');
  assert.deepEqual(hints[hints.length - 1], { text: t.why, bad: true });
});
