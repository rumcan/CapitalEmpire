// The owner's fixes from the sprite studio (scripts/assets/review/server.mjs), read by every asset step:
//   scale-overrides.json  id -> the scale the sprite is drawn at (replaces the owner's map scale)
//   lot-edits.json        lot variant id -> placement index -> { dx, dy (metres), scale, flip, del }
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './source.mjs';

const file = name => path.join(ROOT, 'scripts/assets', name);
const read = name => { try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return {}; } };
const write = (name, m) => fs.writeFileSync(file(name), JSON.stringify(Object.fromEntries(Object.entries(m).sort()), null, 1) + '\n');
export const readScales = () => read('scale-overrides.json'), writeScales = m => write('scale-overrides.json', m);
export const readLotEdits = () => read('lot-edits.json'), writeLotEdits = m => write('lot-edits.json', m);
export const readWalkerFixes = () => read('walker-fixes.json'), writeWalkerFixes = m => write('walker-fixes.json', m);
/** the scale overrides (read once per process) */
export const SCALE_OVERRIDES = readScales();
/** a variant's placements with the owner's lot edits applied (moved, resized, flipped, deleted) */
export function applyLotEdits(id, items, edits = readLotEdits()) {
  const e = edits[id]; if (!e) return items;
  return items.map((p, i) => { const f = e[i]; if (!f) return p; if (f.del) return null; return { ...p, x: +(p.x + (f.dx ?? 0)).toFixed(3), y: +(p.y + (f.dy ?? 0)).toFixed(3), scale: f.scale ?? p.scale, flip: f.flip ?? p.flip }; }).filter(Boolean);
}
