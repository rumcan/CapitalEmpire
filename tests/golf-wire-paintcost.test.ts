// Tests for paint costs in golf mode and live estimation
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaBuildCost } from '../src/game/golf/costs';
import { PaintTool, type PaintHost } from '../src/game/paint-tool';

test('areaBuildCost computes seed cost for golf textures and zero for unmapped textures', () => {
  // 10x10 tile square = 100 tiles = 400 m²
  const pts = [0, 0, 10, 0, 10, 10, 0, 10];

  // green: $6/m² -> 400 * 6 = $2400
  assert.equal(areaBuildCost(pts, 'golfGreen', 'seed'), 2400);

  // fairway: $2/m² -> 400 * 2 = $800
  assert.equal(areaBuildCost(pts, 'golfFairway', 'seed'), 800);

  // bunker: $4/m² -> 400 * 4 = $1600
  assert.equal(areaBuildCost(pts, 'bunkerSand', 'seed'), 1600);

  // unmapped classic textures: $0
  assert.equal(areaBuildCost(pts, 'rockyDirt', 'seed'), 0);
});

test('PaintTool charges treasury and commits area in golf mode when funds are sufficient', () => {
  let spent = 0;
  let toasted = '';
  let saved = false;
  let treasury = 5000;

  const host: PaintHost = {
    setLotGround: () => {},
    emit: () => {},
    save: () => { saved = true; },
    toast: (t) => { toasted = t; },
    affine: () => {},
    plant: () => 0,
    unplant: () => 0,
    plantPool: () => [],
    placeProps: () => 0,
    golfMode: () => true,
    money: () => treasury,
    spend: (n) => { spent += n; treasury -= n; },
  };

  const tool = new PaintTool(host);
  tool.style.tex = 'golfGreen';

  // 10x10 tile square -> $2400
  tool.pts = [0, 0, 10, 0, 10, 10, 0, 10];
  (tool as unknown as { finish: (lasso: boolean) => void }).finish(false);

  assert.equal(spent, 2400);
  assert.equal(treasury, 2600);
  assert.equal(tool.areas.length, 1);
  assert.ok(saved);
  assert.equal(toasted, '');
});

test('PaintTool refuses commitment with warning toast when treasury cannot pay in golf mode', () => {
  let spent = 0;
  let toasted = '';
  let toastKind = '';

  const host: PaintHost = {
    setLotGround: () => {},
    emit: () => {},
    save: () => {},
    toast: (t, k) => { toasted = t; toastKind = k ?? ''; },
    affine: () => {},
    plant: () => 0,
    unplant: () => 0,
    plantPool: () => [],
    placeProps: () => 0,
    golfMode: () => true,
    money: () => 500, // Not enough for $2400
    spend: (n) => { spent += n; },
  };

  const tool = new PaintTool(host);
  tool.style.tex = 'golfGreen';

  tool.pts = [0, 0, 10, 0, 10, 10, 0, 10];
  (tool as unknown as { finish: (lasso: boolean) => void }).finish(false);

  assert.equal(spent, 0, 'should not spend when funds are insufficient');
  assert.equal(tool.areas.length, 0, 'should not commit area when funds are insufficient');
  assert.ok(toasted.includes('Not enough money'), `expected warning toast, got ${toasted}`);
  assert.equal(toastKind, 'warn');
});
