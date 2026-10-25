// T080 compressed atlas pages (src/game/atlas-formats.ts): the block format the GPU takes is chosen BC7 first, then ASTC, then ETC2; a page
// level's KTX2 sits beside its WebP; each format's transparent block really is transparent; the tests (like the dev server) use WebP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASTC, ASTC_CLEAR, BC7, BC7_CLEAR, ETC2, ETC2_CLEAR, ktx2Built, ktx2Url, pickFormat } from '../src/game/atlas-formats';

const gpu = (...exts: string[]) => ({ getExtension: (n: string) => (exts.includes(n) ? {} : null) }) as unknown as Pick<WebGL2RenderingContext, 'getExtension'>;

test('the block format: BC7 on a desktop GPU, else ASTC, else ETC2, else none (RGBA8 from the WebP pages)', () => {
  assert.equal(pickFormat(gpu('EXT_texture_compression_bptc', 'WEBGL_compressed_texture_astc', 'WEBGL_compressed_texture_etc')), BC7);
  assert.equal(pickFormat(gpu('WEBGL_compressed_texture_astc', 'WEBGL_compressed_texture_etc')), ASTC);
  assert.equal(pickFormat(gpu('WEBGL_compressed_texture_etc', 'WEBGL_compressed_texture_s3tc')), ETC2);
  assert.equal(pickFormat(gpu('WEBGL_compressed_texture_s3tc')), null, 'S3TC (DXT5) is not used: it blocks the lettering');
  for (const f of [BC7, ASTC, ETC2]) { assert.equal(f.bpp, 1, 'one byte per texel, a quarter of RGBA8'); assert.ok(f.compressed); assert.equal(f.clear!.length, 16); }
  // basisu transcoder_texture_format: cTFBC7_RGBA 6, cTFASTC_4x4_RGBA 10, cTFETC2_RGBA 1
  assert.deepEqual([BC7.transcode, ASTC.transcode, ETC2.transcode], [6, 10, 1]);
});

test('a page level\'s KTX2 URL is its WebP\'s with the extension swapped (dev paths, hashed build files, queries)', () => {
  assert.equal(ktx2Url('./assets/sprites-0-0-DGorQ3MO.webp'), './assets/sprites-0-0-DGorQ3MO.ktx2');
  assert.equal(ktx2Url('http://127.0.0.1:5321/assets/views-3-1-x_Y.webp'), 'http://127.0.0.1:5321/assets/views-3-1-x_Y.ktx2');
  assert.equal(ktx2Url('/src/assets/atlas/sprites-0-0.webp?import'), '/src/assets/atlas/sprites-0-0.ktx2?import');
  assert.equal(ktx2Url('a.webp.png'), 'a.webp.png');
});

test('the transparent blocks decode to transparent black', () => {
  // BC7: the mode is the lowest set bit of the first byte; mode 6 has 7-bit endpoints R G B A (two each) right after: all zero
  assert.equal(BC7_CLEAR[0], 1 << 6); assert.ok(BC7_CLEAR.subarray(1).every(b => b === 0));
  // ASTC: block mode 0x1fc in bits 0-8 marks a void-extent block, bit 9 clear is LDR, bits 10-11 reserved as 1, the extents all 1 (none),
  // then the constant colour as four UNORM16: 0
  const head = ASTC_CLEAR[0]! | (ASTC_CLEAR[1]! << 8);
  assert.equal(head & 0x1ff, 0x1fc); assert.equal((head >> 9) & 1, 0); assert.equal((head >> 10) & 3, 3);
  assert.ok(ASTC_CLEAR.subarray(2, 8).every(b => b === 0xff)); assert.ok(ASTC_CLEAR.subarray(8).every(b => b === 0));
  // ETC2 RGBA8: EAC alpha first (base 0, multiplier 0: every alpha 0), then the colour block: base 0, every texel's index 3 (-8, clamped to 0)
  assert.ok(ETC2_CLEAR.subarray(0, 12).every(b => b === 0)); assert.ok(ETC2_CLEAR.subarray(12).every(b => b === 0xff));
});

test('the tests, like the dev server, have no KTX2 pages', () => { assert.equal(ktx2Built(), false); });
