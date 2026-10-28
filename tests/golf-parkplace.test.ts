// T237 (#694): where a car park may go (golf/parkplace.ts). The Car park tool snaps a rectangle onto the road beside it, refuses a spot a
// building hides in screen space, and keeps car parks off the driving range's tee box and outfield.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS, RoadNetwork, type Leg } from '../src/game/network';
import { NetEditor } from '../src/game/netops';
import { frontage, type CarParkDef } from '../src/game/event/carpark';
import { HIDDEN_MAX, hiddenBy, hiddenShare, rangeKeepOutWhy, snapToRoad } from '../src/game/golf/parkplace';
import { rangeKeepOut } from '../src/game/golf/rangebiz';
import { RANGE_PLOT, plotPoint } from '../src/game/golf/range';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const ROAD_Y = 300;
const leg = (ax: number, ay: number, bx: number, by: number): Leg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
function road(): RoadNetwork {
  const e = new NetEditor(new RoadNetwork());
  e.addLegs([leg(200, ROAD_Y, 800, ROAD_Y)], CLASS.street, 0);
  e.commit();
  return e.net;
}

test('a rectangle dragged a few tiles off the road snaps onto its verge, the road its frontage', () => {
  const net = road(), verge = CLASS.street!.h + CLASS.street!.walk;
  // north of the road, its south edge a few tiles short of the verge: moved down to the verge
  const d: CarParkDef = { id: 0, x: 400, y: 276, w: 20, h: 16 };
  assert.equal(frontage(net, d), null);
  const s = snapToRoad(net, d)!;
  assert.ok(s, 'snapped');
  assert.equal(s.x, 400); assert.equal(s.w, 20); assert.equal(s.h, 16);
  const gap = ROAD_Y - (s.y + s.h) - verge;
  assert.ok(gap >= 0 && gap < 1, `verge gap ${gap}`);
  assert.ok(frontage(net, s), 'the road is its frontage');
  // south of the road too
  const t = snapToRoad(net, { id: 0, x: 400, y: 307, w: 20, h: 16 })!;
  assert.ok(t && t.y >= ROAD_Y + verge && t.y - ROAD_Y - verge < 1 && frontage(net, t));
  // one with a frontage already stays where it is; one far from any road is not moved
  assert.equal(snapToRoad(net, s), s);
  assert.equal(snapToRoad(net, { id: 0, x: 400, y: 200, w: 20, h: 16 }), null);
});

test('a building hides the ground just behind it in screen space (the -x -y side), never the ground in front', () => {
  const b = { rect: [100, 100, 20, 20] as [number, number, number, number], name: 'the clubhouse' };
  // behind it (up the screen: smaller x and y) and in its column: hidden
  const behind = { x: 96, y: 96, w: 12, h: 12 };
  assert.ok(hiddenShare(behind, b) > HIDDEN_MAX);
  assert.equal(hiddenBy(behind, [b])?.name, 'the clubhouse');
  // in front of it (down the screen: larger x and y): never hidden
  assert.equal(hiddenShare({ x: 121, y: 121, w: 12, h: 12 }, b), 0);
  // beside it, to the screen's left or right (x - y far off): not hidden
  assert.equal(hiddenShare({ x: 80, y: 125, w: 12, h: 12 }, b), 0);
  assert.equal(hiddenBy({ x: 125, y: 80, w: 12, h: 12 }, [b]), null);
  // far behind it, past its reach: not hidden
  assert.equal(hiddenShare({ x: 40, y: 40, w: 12, h: 12 }, b), 0);
});

test('no car park on the range\'s tee box or outfield; the front beside the drive stays open', () => {
  for (const f of [0, 1, 2, 3] as const) {
    const plot = (f % 2 === 0 ? [1000, 1000, RANGE_PLOT[0], RANGE_PLOT[1]] : [1000, 1000, RANGE_PLOT[1], RANGE_PLOT[0]]) as [number, number, number, number];
    const keep = rangeKeepOut(plot, f), at = (u0: number, u1: number, v0: number, v1: number) => {
      const a = plotPoint(plot, f, u0, v0), b = plotPoint(plot, f, u1, v1);
      return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    };
    assert.ok(rangeKeepOutWhy(at(30, 50, 19, 30), keep), `facing ${f}: the tee box`);
    assert.ok(rangeKeepOutWhy(at(10, 30, 60, 80), keep), `facing ${f}: the outfield`);
    assert.ok(rangeKeepOutWhy(at(10, 20, 4, 10), keep), `facing ${f}: the yard`);
    assert.equal(rangeKeepOutWhy(at(50, 69, 2, 17), keep), '', `facing ${f}: the front by the drive`);
  }
});
