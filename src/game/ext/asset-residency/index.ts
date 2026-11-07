/** Bounded image work/residency. These helpers never substitute opaque rectangles for absent picking pixels. */
export async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, map: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new RangeError('Positive decode concurrency required');
  const result = new Array<R>(items.length); let next = 0, failed = false, failure: unknown;
  const worker = async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try { result[index] = await map(items[index]!, index); } catch (error) { failed = true; failure = error; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  if (failed) throw failure;
  return result;
}

export function taskLimiter(concurrency: number): <T>(run: () => Promise<T>) => Promise<T> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new RangeError('Positive decode concurrency required');
  let active = 0; const queue: (() => void)[] = [];
  const pump = () => { while (active < concurrency && queue.length) queue.shift()!(); };
  return <T>(run: () => Promise<T>) => new Promise<T>((resolve, reject) => {
    queue.push(() => { active++; void Promise.resolve().then(run).then(resolve, reject).finally(() => { active--; pump(); }); });
    pump();
  });
}

export class BoundedLru<K, V> {
  private entries = new Map<K, V>();
  constructor(readonly capacity: number, private release: (value: V) => void = () => {}) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError('Positive image capacity required');
  }
  get size(): number { return this.entries.size; }
  get(key: K): V | undefined {
    if (!this.entries.has(key)) return undefined;
    const value = this.entries.get(key)!; this.entries.delete(key); this.entries.set(key, value); return value;
  }
  set(key: K, value: V): void {
    if (this.entries.has(key)) { const old = this.entries.get(key)!; this.entries.delete(key); if (old !== value) this.release(old); }
    this.entries.set(key, value);
    while (this.entries.size > this.capacity) { const oldest = this.entries.keys().next().value!; const old = this.entries.get(oldest)!; this.entries.delete(oldest); this.release(old); }
  }
  clear(): void { for (const value of this.entries.values()) this.release(value); this.entries.clear(); }
}

export interface PickingMask { w: number; h: number; bits: Uint8Array }
export function pickingMask(rgba: Uint8ClampedArray, w: number, h: number, threshold: number): PickingMask {
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 || rgba.length !== w * h * 4) throw new RangeError('Picking pixels do not match image');
  const bits = new Uint8Array((w * h + 7) >> 3);
  for (let i = 0; i < w * h; i++) if (rgba[i * 4 + 3]! > threshold) bits[i >> 3]! |= 1 << (i & 7);
  return { w, h, bits };
}
export function hasPickingPixel(mask: PickingMask | null | undefined, x: number, y: number): boolean {
  if (!mask || x < 0 || x >= mask.w || y < 0 || y >= mask.h) return false;
  const i = y * mask.w + x; return !!((mask.bits[i >> 3]! >> (i & 7)) & 1);
}
