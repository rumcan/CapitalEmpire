// The sprites the owner removed from the game (the review tool, scripts/assets/review/server.mjs): every asset step skips them.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './source.mjs';

export const REMOVED_FILE = path.join(ROOT, 'scripts/assets/removed.json');
/** id -> { at, note } */
export function readRemoved() { try { return JSON.parse(fs.readFileSync(REMOVED_FILE, 'utf8')); } catch { return {}; } }
export function writeRemoved(m) { fs.writeFileSync(REMOVED_FILE, JSON.stringify(Object.fromEntries(Object.entries(m).sort()), null, 1) + '\n'); }
/** the removed ids as a set (read once per process) */
export const REMOVED = new Set(Object.keys(readRemoved()));
