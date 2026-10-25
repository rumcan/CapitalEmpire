// T080: the GPU block formats the atlas pages transcode to (atlas-ktx2.ts), and the choice between them. Kept apart from the transcoder's
// worker so the tests can import it.
import type { GpuFormat } from './atlas-gl';

/** a block format and the Basis transcoder's target for it (basisu transcoder_texture_format) */
export interface KtxFormat extends GpuFormat { transcode: number }

// a fully transparent 4 x 4 block of each format (the part of a cell's border past its page's edge)
/** BC7 mode 6 (the mode bit is bit 6 of the first byte) with every endpoint and alpha 0 */
export const BC7_CLEAR = new Uint8Array([0x40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
/** ASTC LDR void-extent block (0x1fc in the low 9 bits, bit 9 clear for LDR, no extent) of colour RGBA 0 */
export const ASTC_CLEAR = new Uint8Array([0xfc, 0xfd, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 0]);
/** ETC2 RGBA8: an EAC alpha block of base 0 and multiplier 0, then an ETC2 colour block of base 0 whose texels all take the -8 modifier */
export const ETC2_CLEAR = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff]);

export const BC7: KtxFormat = { name: 'bc7', internal: 0x8e8c /* COMPRESSED_RGBA_BPTC_UNORM_EXT */, bpp: 1, compressed: true, clear: BC7_CLEAR, transcode: 6 };
export const ASTC: KtxFormat = { name: 'astc', internal: 0x93b0 /* COMPRESSED_RGBA_ASTC_4x4_KHR */, bpp: 1, compressed: true, clear: ASTC_CLEAR, transcode: 10 };
export const ETC2: KtxFormat = { name: 'etc2', internal: 0x9278 /* COMPRESSED_RGBA8_ETC2_EAC */, bpp: 1, compressed: true, clear: ETC2_CLEAR, transcode: 1 };

/** the best block format the GPU takes (BC7 on desktops, else ASTC 4x4, else ETC2), or null (the WebP pages as RGBA8 then) */
export function pickFormat(gl: Pick<WebGL2RenderingContext, 'getExtension'>): KtxFormat | null {
  if (gl.getExtension('EXT_texture_compression_bptc')) return BC7;
  if (gl.getExtension('WEBGL_compressed_texture_astc')) return ASTC;
  if (gl.getExtension('WEBGL_compressed_texture_etc')) return ETC2;
  return null;
}

/** does this build ship the KTX2 pages (vite.config.ts defines it in a production build; false in the dev server and the tests) */
export const ktx2Built = (): boolean => typeof __ATLAS_KTX2__ !== 'undefined' && __ATLAS_KTX2__;
/** a page level's KTX2 URL: its WebP's with the extension swapped (vite.config.ts atlasKtx2 writes it there) */
export const ktx2Url = (webp: string) => webp.replace(/\.webp(?=$|[?#])/, '.ktx2');
