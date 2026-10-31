// Host-only edit-time worker. The copied SDK keeps its original approved renderer untouched.
import { BunkerBaker } from './stage-baker/bake.js';
import { packBunkerStageAtlas } from './stage-atlas.ts';

let baker, chain = Promise.resolve();
function pixels(image) {
  const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Bunker stage readback requires a 2D canvas.');
  context.drawImage(image, 0, 0); const result = context.getImageData(0, 0, image.width, image.height).data;
  canvas.width = canvas.height = 1; return result;
}
async function bake(request) {
  const started = performance.now();
  baker ??= new BunkerBaker({ maxRenderPixels: 4194304, maxOutputEdge: 512 });
  let colour, semantics, atlas, canvas;
  try {
    const snapshot = { ...request, maxEdge: 512 };
    colour = await baker.bake(snapshot);
    semantics = await baker.bake({ ...snapshot, semanticPass: true });
    if (colour.width !== semantics.width || colour.height !== semantics.height || colour.boundsWorldPx.some((v, i) => v !== semantics.boundsWorldPx[i])) throw new Error('Bunker colour and geometry stages do not share a projection.');
    const packed = packBunkerStageAtlas(pixels(colour.image), pixels(semantics.image), colour.width, colour.height);
    canvas = new OffscreenCanvas(packed.width, packed.height);
    const context = canvas.getContext('2d'); if (!context) throw new Error('Bunker atlas requires a 2D canvas.');
    context.putImageData(new ImageData(packed.data, packed.width, packed.height), 0, 0);
    atlas = await createImageBitmap(canvas, { premultiplyAlpha: 'premultiply' });
    return { ...colour, image: atlas, width: atlas.width, height: atlas.height, renderWidth: packed.renderWidth, renderHeight: packed.renderHeight,
      stagePixels: packed.pixels, decodedBytes: atlas.width * atlas.height * 4, bakeMs: performance.now() - started };
  } catch (error) { atlas?.close(); throw error; }
  finally { colour?.image.close(); semantics?.image.close(); if (canvas) canvas.width = canvas.height = 1; }
}
self.onmessage = ({ data }) => {
  if (data.t === 'dispose') { chain = chain.then(() => { baker?.dispose(); self.close(); }); return; }
  if (data.t !== 'bake') return;
  chain = chain.then(async () => {
    try { const sprite = await bake(data.request); self.postMessage({ id: data.id, sprite }, [sprite.image]); }
    catch (error) { self.postMessage({ id: data.id, error: error?.message ?? String(error) }); }
  });
};
