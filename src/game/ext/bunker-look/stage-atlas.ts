/** Geometry-labelled bunker atlas: one 512-edge picture per native floor, wall and lip stage. */
export const BUNKER_STAGES = ['floor', 'wall', 'lip'] as const;
const FAINT_ALPHA = 32;
export type BunkerStage = typeof BUNKER_STAGES[number];

/** Pixel rectangles in the shared bitmap; native stages read only their own row. */
export function bunkerStageRect(width: number, renderHeight: number, stage: BunkerStage): [number, number, number, number] {
  return [0, BUNKER_STAGES.indexOf(stage) * renderHeight, width, renderHeight];
}

/**
 * Pack original RGBA unchanged into one of three disjoint stage rows using an explicit GPU geometry-ID pass.
 * The semantic shader writes floor red, wall green and lip blue; this never inspects the colour artwork.
 * At an antialiased part boundary the largest semantic coverage owns the whole original pixel, avoiding alpha overpaint.
 */
export function packBunkerStageAtlas(colour: Uint8ClampedArray, semantics: Uint8ClampedArray, width: number, height: number): {
  data: Uint8ClampedArray; width: number; height: number; renderWidth: number; renderHeight: number; pixels: [number, number, number];
} {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 512 || height > 512) throw new RangeError('Bunker stage artwork must fit a 512-pixel edge.');
  const length = width * height * 4;
  if (colour.length !== length || semantics.length !== length) throw new RangeError('Colour and semantic passes must have identical RGBA dimensions.');
  const data = new Uint8ClampedArray(length * 3), pixels: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < length; i += 4) {
    if (colour[i + 3] === 0) continue;
    let stage = 0;
    if (semantics[i + 1] > semantics[i]) stage = 1;
    if (semantics[i + 2] > semantics[i + stage]) stage = 2;
    if (semantics[i + stage] === 0 || semantics[i + 3] === 0) {
      // a faint antialiased fringe pixel can round to no label in the label pass (thin grass bands make many): it is dropped, not fatal
      if (colour[i + 3] < FAINT_ALPHA) continue;
      throw new Error('Visible bunker pixel has no geometry-stage classification.');
    }
    const to = stage * length + i;
    data[to] = colour[i]; data[to + 1] = colour[i + 1]; data[to + 2] = colour[i + 2]; data[to + 3] = colour[i + 3]; pixels[stage]++;
  }
  return { data, width, height: height * 3, renderWidth: width, renderHeight: height, pixels };
}
