// T376 (#1032): the commercial buildings stand behind the pavement. A shop's or venue's picture draws more than its walls: steps, door mats, planters,
// kerbs and bushes reach out in front of them (the owner, 2026-11-08: "the buildings that are going onto the pavement ... the commercial buildings").
// The composer stood a picture's footprint inside its lot with REACH to spare past the line, so the picture's base came out over the sidewalk.
// basePad is how far a picture's ground contact reaches past its footprint toward the camera (base-pad-data.ts, measured from the pictures by
// scripts/assets/base-pads.mjs: the lowest opaque pixel of each column, so an awning or a sign above head height, drawn higher than its own ground point,
// never counts). Only a street on the camera's side (roads 0 to 2) can have a picture's base drawn over it; on the other roads the walls are the
// footprint's. compose.ts setBack moves a building back by what the lot front lacks. Pure, no DOM.
import { BASE_PAD } from './base-pad-data';

/** how far (tiles) the picture `id`, drawn at scale s (its owner scale times the preset's), reaches past its footprint toward a street on road `road`
 *  (presets.ts Road: 0 the street on +y, 1 on +x+y, 2 on +x); 0 for a street on the far side of the building and for a picture not measured */
export function basePad(id: string, road: number, s: number): number {
  const row = BASE_PAD[id];
  return row && road >= 0 && road <= 2 ? row[road]! * s / 2 : 0;
}

/** whether the table holds a row for the picture (every shop and venue picture has one: tests/street-base.test.ts) */
export const hasBasePad = (id: string): boolean => BASE_PAD[id] !== undefined;
