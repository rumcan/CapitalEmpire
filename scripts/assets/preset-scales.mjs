// The largest scale the owner's lot presets draw each sprite at (T190, #489: a preset prop sized up to 1.5 times its size counts as drawn, so the
// Rebuild packs its picture that big where the source has the pixels and it stays sharp). Read only: src/game/lots/lot-presets.json is the owner's.
// A preset prop's scale is relative to its sprite's own size (the studio's or the owner's), so this is that multiple; 1 when no preset grows it.
import fs from 'node:fs';
import path from 'node:path';

/** id -> the largest preset scale of its props (1 at least); a missing or unreadable presets file gives an empty map */
export function presetScales(root) {
  const out = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'src/game/lots/lot-presets.json'), 'utf8')), list = Array.isArray(raw) ? raw : raw?.presets ?? [];
    for (const p of list) for (const q of p?.props ?? []) if (typeof q?.id === 'string' && Number.isFinite(q.scale) && q.scale > (out.get(q.id) ?? 1)) out.set(q.id, Math.min(q.scale, 1.5));
  } catch { /* no presets: every sprite packed for its own size */ }
  return out;
}
