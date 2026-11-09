import { LIBRARY } from './library';
import { OBJECT_EIGHT_SETS } from './object-eight-library';
import { fourViews, axisViews, sizeKey } from './lots/preset-art';
import { createObjectFacings } from './object-eight-core';
const IDS = new Set(LIBRARY.map(i => i.id));
export const objectFacings = createObjectFacings(OBJECT_EIGHT_SETS, id => IDS.has(id), id => fourViews(id) ?? axisViews(id), sizeKey);
