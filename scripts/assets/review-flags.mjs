// The owner's review flags on the studio's pictures (scripts/assets/review-flags.json, the sprite studio's Library: review/server.mjs /api/flag):
// a picture (a card's main picture or one of its views) is marked "more-angles", "angles-wrong" or "redo-style", or none. Read by the studio only.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './source.mjs';

export const FLAGS_FILE = path.join(ROOT, 'scripts/assets/review-flags.json');
/** the flags a picture can carry (the studio's buttons) */
export const FLAG_KINDS = ['more-angles', 'angles-wrong', 'redo-style'];
/** picture id -> { flag, at } */
export function readFlags() { try { return JSON.parse(fs.readFileSync(FLAGS_FILE, 'utf8')); } catch { return {}; } }
export function writeFlags(m) { fs.writeFileSync(FLAGS_FILE, JSON.stringify(Object.fromEntries(Object.entries(m).sort()), null, 1) + '\n'); }
