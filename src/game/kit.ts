// The concept's kit (T231, #671; docs/art/CONCEPT-LOOK.md steps 5 and 8): the library ids of the art agent's boulders, palms, shrubs, flower
// clumps, practice-green lamp posts, the pond-edge stones, the clipped hedge, the fountain jet's frames and the lily pads (prep-kit.mjs cuts
// them, prep-golf.mjs packs them on the golf page, golf-library.ts appendKit lists them last). Their own kinds (shrub, flower, palm, rock,
// lamp, fountain, decal, and fencex / fencey for the hedge's run pieces) keep them out of every pool that picks by kind (the lots' trees and bushes,
// the hole presets, the farms, the plant brushes' trees), so no lot, hole or farm drawn before them changes; they join the places named for
// them: the Props tool (golf/decor.ts), the plant brushes (plant.ts), the ponds (golf/ponds.ts) and the yards (lots/compose.ts kitYard).
// One picture each, the sun at the upper right as painted: never mirrored (mirror.ts drawnAs), but for T257's natural things (kitMirrors).
// Pure TS, no DOM.

/** a kit id */
export const isKit = (id: string): boolean => id.startsWith('kit:');
/** T257 (#747, the lead's call): the kit's natural one-view things, which a flip mirrors (one picture, two looks): the boulders, the shrubs, the
 *  flower clumps and the palms. Never the lamps, the hedge's pieces and end, the pond edge's pieces, the jet or the lily pads */
export const KIT_MIRRORS = /^kit:(boulder|shrub|flowers|palm)-/;
export const kitMirrors = (id: string): boolean => KIT_MIRRORS.test(id);

/** the six autumn shrubs (162), 1-1.5 m */
export const KIT_SHRUBS = ['kit:shrub-burning-bush', 'kit:shrub-golden-spirea', 'kit:shrub-boxwood-ball', 'kit:shrub-red-twig-dogwood', 'kit:shrub-blue-juniper', 'kit:shrub-plume-grass'] as const;
/** the ornamental grass with cream plumes among them (T234: the tufts in a pond rim's gaps) */
export const KIT_PLUME = 'kit:shrub-plume-grass';
/** the six flower clumps (163), 0.6 m */
export const KIT_FLOWERS = ['kit:flowers-mums-red', 'kit:flowers-mums-yellow', 'kit:flowers-mums-orange', 'kit:flowers-mums-white', 'kit:flowers-mums-bronze', 'kit:flowers-black-eyed-susans'] as const;
/** the boulders (36): small 0.8 m, medium 1.5 m, large 2.5 m, three shapes each */
export const KIT_BOULDERS = {
  small: ['kit:boulder-small-a', 'kit:boulder-small-b', 'kit:boulder-small-c'],
  medium: ['kit:boulder-medium-a', 'kit:boulder-medium-b', 'kit:boulder-medium-c'],
  large: ['kit:boulder-large-a', 'kit:boulder-large-b', 'kit:boulder-large-c'],
} as const;
/** the palms (43): windmill 4-6 m, Canary 6-10 m, dwarf fan clumps 2-3.5 m */
export const KIT_PALMS = {
  windmill: ['kit:palm-windmill-4m', 'kit:palm-windmill-5m', 'kit:palm-windmill-6m'],
  canary: ['kit:palm-canary-6m', 'kit:palm-canary-8m', 'kit:palm-canary-10m'],
  fan: ['kit:palm-dwarf-fan-2m', 'kit:palm-dwarf-fan-3m', 'kit:palm-dwarf-fan-3-5m'],
} as const;
export const KIT_PALM_IDS: readonly string[] = [...KIT_PALMS.windmill, ...KIT_PALMS.canary, ...KIT_PALMS.fan];
/** the practice-green lamp posts (45), 3.5 m, lit at night (kind lamp: their glows and the lamps' ground light) */
export const KIT_LAMPS = ['kit:lamp-post-single', 'kit:lamp-post-twin'] as const;

/** a run of pieces (R): its piece along the map's x axis and along its y axis, the piece's length (tiles; a tile is 2 m) and an end piece */
export interface RunKit { x: string; y: string; len: number; end?: string }
/** the clipped hedge (164): 4 m pieces, 0.7 m deep; its end block */
export const KIT_HEDGE: RunKit = { x: 'kit:hedge-x', y: 'kit:hedge-y', len: 2, end: 'kit:hedge-end' };
/** the pond-edge stones (158): run pieces 8 x 2 m (4 x 1 tiles; prep-kit.mjs says why) and the corners */
export const KIT_POND_EDGE = { x: 'kit:pond-edge-x', y: 'kit:pond-edge-y', len: 4, depth: 1, inner: 'kit:pond-edge-inner', outer: 'kit:pond-edge-outer' } as const;
/** the fountain jet's frames (159), a loop: FOUNTAIN_FPS frames a second */
export const KIT_FOUNTAIN = ['kit:fountain-jet-0', 'kit:fountain-jet-1', 'kit:fountain-jet-2', 'kit:fountain-jet-3'] as const;
export const FOUNTAIN_FPS = 7;
/** the lily pad clusters (160), flat on the water */
export const KIT_LILIES = ['kit:lily-pads-a', 'kit:lily-pads-b', 'kit:lily-pads-c', 'kit:lily-pads-d'] as const;

const FOUNTAIN_FRAME: ReadonlyMap<string, number> = new Map(KIT_FOUNTAIN.map((id, i) => [id, i]));
/** the frame of the fountain jet an id is (0..3), or -1 */
export const fountainFrame = (id: string): number => FOUNTAIN_FRAME.get(id) ?? -1;
/** the jet's frame id at time t (seconds), offset by a phase (each fountain its own, so two side by side do not pulse together) */
export const fountainAt = (t: number, phase = 0): string => KIT_FOUNTAIN[((Math.floor(t * FOUNTAIN_FPS + phase) % KIT_FOUNTAIN.length) + KIT_FOUNTAIN.length) % KIT_FOUNTAIN.length]!;
