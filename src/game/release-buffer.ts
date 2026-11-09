// T375: a typed array's memory given back now. A typed array's bytes live outside the JS heap (V8 calls them backing stores, performance.memory counts them), and a dropped
// array's bytes wait for a full collection: V8 starts one when its own heap grows, not when a few dead 20 to 40 MB buffers pile up, so the load's scratch arrays (the vector
// shadows' mesh built, copied and uploaded twice on a dev page: 170 MB) stayed in the heap's numbers for as long as nothing else made one run. Detaching the buffer
// (ArrayBuffer.prototype.transfer: Chrome and Edge 114, Firefox 122, Safari 17.4, Node 21) frees the bytes at once. Only for an array nobody reads afterwards: its views go empty.
// Pure: importable from node (tests) and the game.

type Detachable = ArrayBuffer & { transfer?: (newByteLength?: number) => ArrayBuffer };

/** free the bytes behind a typed array (or an ImageData's pixels) now; a runtime without ArrayBuffer.prototype.transfer leaves them to the collector, as before */
export function releaseBuffer(a: { buffer: ArrayBufferLike } | null | undefined): void {
  if (!a) return;
  try { (a.buffer as Detachable).transfer?.(0); } catch { /* a buffer that cannot be detached stays for the collector */ }
}
