// T080: one atlas page level, WebP -> premultiplied RGBA -> KTX2 (Basis UASTC 4x4 + Zstandard), in a worker thread of atlas-ktx2.mjs.
// worstPsnr() decodes KTX2 back with the transcoder the game ships (three's basis_transcoder) to check the round trip.
import { parentPort } from 'node:worker_threads';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';

/** WebP -> RGBA, colour premultiplied by alpha (as the game's createImageBitmap premultiplies the WebP pages) */
export async function premultiplied(webp) {
  const { data, info } = await sharp(webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]; if (a === 255) continue;
    data[i] = Math.round(data[i] * a / 255); data[i + 1] = Math.round(data[i + 1] * a / 255); data[i + 2] = Math.round(data[i + 2] * a / 255);
  }
  return { width: info.width, height: info.height, data };
}

/** UASTC 4x4 at the encoder's default effort 1 of 0-4 (effort 2 measured 0.5-0.7 dB better on the foliage and the views pages, invisible at
 *  6x enlargement, and took 3x as long: a cold cache 267 s instead of 87 s), Zstandard supercompression, no mipmaps (the pages ship their
 *  own sharpened mips), linear (the game samples the pages as plain RGBA8, not sRGB) */
export async function encode(webp) {
  return encodeToKTX2(webp, { isUASTC: true, needSupercompression: true, generateMipmap: false, isSetKTX2SRGBTransferFunc: false, isInputSRGB: false, uastcLDRQualityLevel: 1, imageDecoder: premultiplied });
}

let transcoder = null;
/** three's basis_transcoder (the one the game ships), in Node */
async function basis() {
  if (!transcoder) {
    const require = createRequire(import.meta.url), js = require.resolve('three/examples/jsm/libs/basis/basis_transcoder.js');
    // the emscripten wrapper declares a global BASIS (three's package is ESM, so it cannot be required): evaluate it as the game does
    const BASIS = new Function('require', '__dirname', '__filename', fs.readFileSync(js, 'utf8') + '\n;return BASIS;')(require, path.dirname(js), js), wasmBinary = fs.readFileSync(js.replace(/\.js$/, '.wasm'));
    transcoder = BASIS({ wasmBinary }).then(m => { m.initializeBasis(); return m; });
  }
  return transcoder;
}
/** transcode a single-level KTX2 to a format (13: RGBA32, 6: BC7, 10: ASTC 4x4, 1: ETC2 RGBA) */
export async function transcode(ktx2, format) {
  const m = await basis(), f = new m.KTX2File(new Uint8Array(ktx2));
  try {
    if (!f.isValid() || !f.startTranscoding()) throw new Error('not a valid KTX2');
    const out = new Uint8Array(f.getImageTranscodedSizeInBytes(0, 0, 0, format));
    if (!f.transcodeImage(out, 0, 0, 0, format, 0, -1, -1)) throw new Error('transcode failed');
    return { width: f.getWidth(), height: f.getHeight(), data: out };
  } finally { f.close(); f.delete(); }
}
/** the round trip of each level: PSNR and the largest channel error, KTX2 (decoded to RGBA) against the premultiplied WebP */
export async function worstPsnr(list) {
  const out = [];
  for (const it of list) {
    const a = await premultiplied(it.webp), b = await transcode(it.ktx2, 13);
    // over the texels that are not transparent in either (a page is mostly empty gutter, which would flatter the number)
    let se = 0, n = 0, maxErr = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      if (!a.data[i + 3] && !b.data[i + 3]) continue;
      for (let c = 0; c < 4; c++) { const d = a.data[i + c] - b.data[i + c]; se += d * d; if (Math.abs(d) > maxErr) maxErr = Math.abs(d); }
      n += 4;
    }
    out.push({ key: it.key, psnr: 10 * Math.log10(255 * 255 / Math.max(1e-9, se / Math.max(1, n))), maxErr });
  }
  return out;
}

// the Basis module prints its progress to the console: quiet in the build's threads
if (parentPort) console.log = () => {};
if (parentPort) parentPort.on('message', async m => {
  try { const ktx2 = await encode(Buffer.from(m.webp)); parentPort.postMessage({ ktx2 }, [ktx2.buffer]); }
  catch (e) { parentPort.postMessage({ error: String(e?.message ?? e) }); }
});
