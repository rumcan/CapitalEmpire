import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoundedLru, hasPickingPixel, mapConcurrent, pickingMask, taskLimiter } from '../src/game/ext/asset-residency';
import { AtlasGL, RGBA8_FORMAT } from '../src/game/atlas-gl';
import { onceVisible } from '../src/ui/thumb-visibility';

const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const flush = () => new Promise<void>(r => setImmediate(r));

test('alpha decodes stay at two concurrent sources and keep page indices despite out-of-order completion', async () => {
  const gates = Array.from({ length: 5 }, () => deferred<number>()), started: number[] = []; let active = 0, peak = 0;
  const work = mapConcurrent([0,1,2,3,4], 2, async n => { started.push(n); active++; peak = Math.max(peak, active); const value = await gates[n]!.promise; active--; return value; });
  assert.deepEqual(started, [0,1]); gates[1]!.resolve(11); await flush(); assert.deepEqual(started, [0,1,2]);
  gates[2]!.resolve(22); await flush(); assert.deepEqual(started, [0,1,2,3]);
  gates[0]!.resolve(0); await flush(); gates[3]!.resolve(33); gates[4]!.resolve(44);
  assert.deepEqual(await work, [0,11,22,33,44]); assert.equal(peak, 2);
});

test('decode failure waits for active work to finish without starting the remaining catalogue', async () => {
  const gate = deferred<void>(); let started = 0, settled = false;
  const work = mapConcurrent([0,1,2,3], 2, async n => { started++; if (n === 0) throw new Error('decode'); await gate.promise; return n; });
  void work.catch(() => { settled = true; }); await flush(); assert.equal(started, 2); assert.equal(settled, false);
  gate.resolve(); await assert.rejects(work, /decode/); assert.equal(started, 2);
});

test('full-page preview cache releases least-recently-used pages and clears remaining images on destroy', () => {
  const released: string[] = [], cache = new BoundedLru<string, string>(2, value => released.push(value));
  cache.set('a','A'); cache.set('b','B'); assert.equal(cache.get('a'),'A'); cache.set('c','C');
  assert.equal(cache.size,2); assert.equal(cache.get('b'),undefined); assert.deepEqual(released,['B']);
  cache.set('a','A2'); assert.deepEqual(released,['B','A']); cache.clear(); assert.equal(cache.size,0); assert.deepEqual(released,['B','A','C','A2']);
});

test('thumbnail work is limited even when many cards become visible together', async () => {
  const limit = taskLimiter(2), gates = Array.from({ length: 5 }, () => deferred<number>()); let active = 0, peak = 0;
  const work = gates.map(g => limit(async () => { active++; peak = Math.max(peak,active); const v = await g.promise; active--; return v; }));
  await flush(); assert.equal(active,2); gates[0]!.resolve(0); await flush(); assert.equal(active,2);
  gates[1]!.resolve(1); await flush(); gates[2]!.resolve(2); await flush(); gates[3]!.resolve(3); gates[4]!.resolve(4);
  assert.deepEqual(await Promise.all(work),[0,1,2,3,4]); assert.equal(peak,2);
});

test('hidden thumbnails request no source; visibility triggers once and unmount cancels callbacks', () => {
  let notify!: IntersectionObserverCallback, disconnected = 0, visible = 0, margin = '';
  const Observer = class {
    constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) { notify = callback; margin = options.rootMargin ?? ''; }
    observe() {} disconnect() { disconnected++; }
  } as unknown as typeof IntersectionObserver;
  const target = {} as Element, cancel = onceVisible(target, () => { visible++; }, Observer);
  notify([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver); assert.equal(visible,0); assert.equal(margin,'0px');
  notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver); assert.equal(visible,1);
  notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver); assert.equal(visible,1); cancel(); assert.ok(disconnected>=1);
  const cancelHidden = onceVisible(target, () => { visible++; }, Observer); cancelHidden();
  notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver); assert.equal(visible,1);
});

test('picking retains exact alpha thresholds, transparent holes and bit boundaries; unavailable masks never steal clicks', () => {
  const alphas=[0,1,8,15,16,200,255,16,0],rgba=new Uint8ClampedArray(36);alphas.forEach((a,i)=>{rgba[i*4+3]=a;});
  const mask=pickingMask(rgba,3,3,15);assert.deepEqual([...mask.bits],[0xf0,0]);
  alphas.forEach((a,i)=>assert.equal(hasPickingPixel(mask,i%3,Math.floor(i/3)),a>15));
  assert.equal(hasPickingPixel(null,1,1),false);assert.equal(hasPickingPixel(mask,-1,0),false);assert.equal(hasPickingPixel(mask,3,1),false);
});

test('atlas layer and minimum coarse-budget limits fail before allocating or decoding textures', async () => {
  let disposed=0,decoded=0;
  const source={format:RGBA8_FORMAT,level:async()=>{decoded++;throw new Error('must not decode');},dispose:()=>{disposed++;}};
  const gl={MAX_ARRAY_TEXTURE_LAYERS:0x88ff,getParameter:()=>256} as unknown as WebGL2RenderingContext;
  await assert.rejects(AtlasGL.create(gl,{dpr:1,pages:257,size:2048,levels:5,finest:1,source}),/257 pages.*256 texture-array layers/);
  const large={MAX_ARRAY_TEXTURE_LAYERS:0x88ff,getParameter:()=>4096} as unknown as WebGL2RenderingContext;
  await assert.rejects(AtlasGL.create(large,{dpr:1,pages:65,size:2048,levels:5,finest:1,source,budget:1024*1024}),/coarse pages require.*above/);
  assert.equal(disposed,2);assert.equal(decoded,0);
});
