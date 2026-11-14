// The magenta keyer (scripts/assets/key-magenta.mjs): the despill that keeps brightness, the speck clean-up and the haze limit, on a small
// made-up picture. The keyer is loaded at run time (not bundled: it needs sharp's native module).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type Keyer = { keyMagenta: (input: Buffer, o?: Record<string, unknown>) => Promise<Buffer>; KEY_DEFAULTS: Record<string, unknown> };
const load = async () => {
  const url = pathToFileURL(resolve('scripts/assets/key-magenta.mjs')).href, sharp = (await import(['sharp'][0]!)).default;
  return { k: (await import(url)) as Keyer, sharp };
};

// 120 x 120 of magenta (250, 10, 245): a 40 px grey block (one pixel of it tinted magenta), a half-magenta pixel beside the block, a
// 3 x 3 white speck, and a half-magenta pixel far from everything
const W = 120, BG = [250, 10, 245];
function picture(): Buffer {
  const d = Buffer.alloc(W * W * 3);
  const put = (x: number, y: number, c: number[]) => { d[(y * W + x) * 3] = c[0]!; d[(y * W + x) * 3 + 1] = c[1]!; d[(y * W + x) * 3 + 2] = c[2]!; };
  const half = (c: number[]) => c.map((v, i) => Math.round((v + BG[i]!) / 2));
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) put(x, y, BG);
  for (let y = 20; y < 60; y++) for (let x = 20; x < 60; x++) put(x, y, [120, 120, 120]);
  put(30, 30, [165, 150, 165]);
  put(60, 40, half([120, 120, 120]));
  for (let y = 100; y < 103; y++) for (let x = 100; x < 103; x++) put(x, y, [255, 255, 255]);
  put(110, 10, half([255, 255, 255]));
  return d;
}
async function key(o: Record<string, unknown>) {
  const { k, sharp } = await load();
  const png = await sharp(picture(), { raw: { width: W, height: W, channels: 3 } }).png().toBuffer();
  const { data } = await sharp(await k.keyMagenta(png, o)).raw().toBuffer({ resolveWithObject: true });
  return (x: number, y: number) => [...data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)];
}

test('key-magenta: the background goes, the block stays, a half-magenta edge pixel is half see-through and un-mixed to the block grey', async () => {
  const px = await key({});
  assert.equal(px(5, 5)[3], 0);
  assert.deepEqual(px(40, 40), [120, 120, 120, 255]);
  const e = px(60, 40);
  assert.ok(Math.abs(e[3]! - 128) < 12, `alpha ${e[3]}`);
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(e[c]! - 120) < 8, `colour ${e}`);
});

test('key-magenta: despill "keep" moves the tint into the other channels (brightness kept), "cut" throws it away, strength 0 leaves it', async () => {
  const keep = (await key({}))(30, 30), cut = (await key({ despill: 'cut' }))(30, 30), off = (await key({ despillStrength: 0 }))(30, 30);
  assert.deepEqual(keep, [160, 160, 160, 255]);
  assert.deepEqual(cut, [150, 150, 150, 255]);
  assert.deepEqual(off, [165, 150, 165, 255]);
});

test('key-magenta: a speck under `despeckle` px goes, and stays with despeckle 0', async () => {
  assert.equal((await key({}))(101, 101)[3], 0);
  assert.equal((await key({ despeckle: 0, haze: 0 }))(101, 101)[3], 255);
});

test('key-magenta: a see-through pixel far from the object fades with the haze limit, and stays without it', async () => {
  assert.equal((await key({}))(110, 10)[3], 0);
  assert.ok((await key({ despeckle: 0, haze: 0 }))(110, 10)[3]! > 100);
});

// The owner, 2026-11-14: "chat gpt can make transparent pngs ... dont have to key out": a picture with its own transparency is used as painted
test('a transparent picture is not keyed: its own alpha is kept (solid 250+ made 255, clear 4- made 0, soft shadow untouched); a magenta one is keyed', async () => {
  const { sharp } = await load();
  const k = (await import(pathToFileURL(resolve('scripts/assets/key-magenta.mjs')).href)) as { ownAlpha: (b: Buffer) => Promise<Buffer | null>; alphaOrKey: (b: Buffer) => Promise<{ png: Buffer; keyed: boolean }> };
  const W = 40, px = Buffer.alloc(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, inBlock = x >= 10 && x < 30 && y >= 10 && y < 30, shadow = y === 32 && x >= 10 && x < 30;
    px[i] = 200; px[i + 1] = 60; px[i + 2] = 190;   // (a pinkish object: a keyer would eat it)
    px[i + 3] = inBlock ? 252 : shadow ? 90 : 3;
  }
  const clearPng = await sharp(px, { raw: { width: W, height: W, channels: 4 } }).png().toBuffer();
  const r = await k.alphaOrKey(clearPng); assert.equal(r.keyed, false);
  const out = await sharp(r.png).raw().toBuffer(), at = (x: number, y: number) => [...out.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)];
  assert.deepEqual(at(20, 20), [200, 60, 190, 255], 'the object keeps its colour, fully solid');
  assert.equal(at(2, 2)[3], 0, 'clear'); assert.equal(at(20, 32)[3], 90, 'the soft shadow as painted');
  const opaque = await sharp({ create: { width: W, height: W, channels: 3, background: { r: 250, g: 10, b: 245 } } }).png().toBuffer();
  assert.equal(await k.ownAlpha(opaque), null, 'no transparency of its own');
  assert.equal((await k.alphaOrKey(opaque)).keyed, true);
});
