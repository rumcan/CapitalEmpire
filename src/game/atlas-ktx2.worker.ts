// T080: transcodes the atlas page levels (KTX2, Basis UASTC 4x4; scripts/assets/atlas-ktx2.mjs) to the GPU's block format off the main
// thread, with the transcoder three ships (Binomial's basis_transcoder, Apache-2.0). Messages: { id, url, format } -> { id, width, height,
// blocks } (transferred) or { id, error }.
import jsUrl from 'three/examples/jsm/libs/basis/basis_transcoder.js?url';
import wasmUrl from 'three/examples/jsm/libs/basis/basis_transcoder.wasm?url';

interface KTX2File {
  isValid(): boolean; startTranscoding(): boolean; getWidth(): number; getHeight(): number; close(): void; delete(): void;
  getImageTranscodedSizeInBytes(level: number, layer: number, face: number, format: number): number;
  transcodeImage(dst: Uint8Array, level: number, layer: number, face: number, format: number, alphaForOpaque: number, channel0: number, channel1: number): number;
}
interface BasisModule { initializeBasis(): void; KTX2File: new (data: Uint8Array) => KTX2File }

let basis: Promise<BasisModule> | null = null;
function load(): Promise<BasisModule> {
  // the emscripten wrapper declares a global BASIS; evaluated from its text, so it works in a classic or a module worker
  basis ??= Promise.all([fetch(jsUrl).then(r => r.text()), fetch(wasmUrl).then(r => r.arrayBuffer())]).then(([js, wasmBinary]) => {
    const BASIS = new Function(js + '\n;return BASIS;')() as (o: { wasmBinary: ArrayBuffer }) => Promise<BasisModule>;
    return BASIS({ wasmBinary });
  }).then(m => { m.initializeBasis(); return m; });
  return basis;
}

self.onmessage = async (e: MessageEvent<{ id: number; url: string; format: number }>) => {
  const { id, url, format } = e.data;
  try {
    const [m, buf] = await Promise.all([load(), fetch(url).then(r => { if (!r.ok) throw new Error(`${r.status} ${url.slice(-60)}`); return r.arrayBuffer(); })]);
    const f = new m.KTX2File(new Uint8Array(buf));
    try {
      if (!f.isValid() || !f.startTranscoding()) throw new Error('not a valid KTX2: ' + url.slice(-60));
      const blocks = new Uint8Array(f.getImageTranscodedSizeInBytes(0, 0, 0, format));
      if (!f.transcodeImage(blocks, 0, 0, 0, format, 0, -1, -1)) throw new Error('transcode failed: ' + url.slice(-60));
      (self as unknown as Worker).postMessage({ id, width: f.getWidth(), height: f.getHeight(), blocks }, [blocks.buffer]);
    } finally { f.close(); f.delete(); }
  } catch (err) { (self as unknown as Worker).postMessage({ id, error: String((err as Error)?.message ?? err) }); }
};
