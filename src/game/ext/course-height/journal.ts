// Undo journal for the course height field (T027): records the 16x16-sample blocks an action changes, so undo and redo can put them back.
// Pure TypeScript, no DOM. Touch a box BEFORE mutating it; end() keeps only the blocks whose heights changed.
import { CH_SIZE, CH_STEP, type CourseHeightField, type CourseTileBox } from './index';

/** samples per journal block side (a block is 16x16 samples, 32x32 tiles) */
const JB = 16;
/** journal blocks per field side (CH_SIZE / 16 = 64; a literal, since index.ts re-exports this file and CH_SIZE is not set yet when it loads); a block key is bj * JN + bi */
const JN = 64;

/** one undoable height edit: the 16x16-sample blocks it changed (key bj*64+bi), each block's 256 heights before and after */
export interface CourseHeightStep { keys: number[]; before: Float32Array[]; after: Float32Array[] }

/** copies a block's 256 heights out of the field into out (row-major, 16 per row) */
function readBlock(d: Float32Array, key: number, out: Float32Array): Float32Array {
 const bi = key % JN, bj = (key / JN) | 0;
 for (let dj = 0; dj < JB; dj++) { const row = (bj * JB + dj) * CH_SIZE + bi * JB; for (let di = 0; di < JB; di++) out[dj * JB + di] = d[row + di]!; }
 return out;
}
/** writes a block's 256 heights from src back into the field */
function writeBlock(d: Float32Array, key: number, src: Float32Array): void {
 const bi = key % JN, bj = (key / JN) | 0;
 for (let dj = 0; dj < JB; dj++) { const row = (bj * JB + dj) * CH_SIZE + bi * JB; for (let di = 0; di < JB; di++) d[row + di] = src[dj * JB + di]!; }
}

/** records the course height blocks an action touches (touch BEFORE mutating), for undo and redo */
export class CourseHeightJournal {
 private open: Map<number, Float32Array> | null = null;
 /** starts recording (a begin while recording keeps the open recording) */
 begin(): void { if (!this.open) this.open = new Map(); }
 /** whether a recording is open */
 get recording(): boolean { return this.open !== null; }
 /** copies every block overlapping the tile box that is not yet recorded (no-op when not recording) */
 touch(field: CourseHeightField, box: CourseTileBox): void {
  const rec = this.open; if (!rec) return;
  const bs = JB * CH_STEP;
  const bi0 = Math.max(0, Math.floor(box[0] / bs)), bi1 = Math.min(JN - 1, Math.ceil(box[2] / bs) - 1);
  const bj0 = Math.max(0, Math.floor(box[1] / bs)), bj1 = Math.min(JN - 1, Math.ceil(box[3] / bs) - 1);
  for (let bj = bj0; bj <= bj1; bj++) for (let bi = bi0; bi <= bi1; bi++) {
   const key = bj * JN + bi;
   if (!rec.has(key)) rec.set(key, readBlock(field.data, key, new Float32Array(JB * JB)));
  }
 }
 /** stops recording: the recorded blocks whose heights changed, with their heights now; null when none changed */
 end(field: CourseHeightField): CourseHeightStep | null {
  const rec = this.open; this.open = null; if (!rec) return null;
  const keys: number[] = [], before: Float32Array[] = [], after: Float32Array[] = [];
  for (const [key, old] of rec) {
   const now = readBlock(field.data, key, new Float32Array(JB * JB));
   let diff = false;
   for (let k = 0; k < JB * JB && !diff; k++) if (now[k] !== old[k]) diff = true;
   if (diff) { keys.push(key); before.push(old); after.push(now); }
  }
  return keys.length ? { keys, before, after } : null;
 }
 /** stops recording without making a step (an action that changed no height, or had no field) */
 drop(): void { this.open = null; }
 /** writes one side of a step back into the field (rev++), returns the tile box of its blocks (null for an empty step) */
 apply(field: CourseHeightField, step: CourseHeightStep, side: 'before' | 'after'): CourseTileBox | null {
  const src = side === 'before' ? step.before : step.after;
  let bi0 = JN, bi1 = -1, bj0 = JN, bj1 = -1;
  for (let k = 0; k < step.keys.length; k++) {
   const key = step.keys[k]!, bi = key % JN, bj = (key / JN) | 0;
   writeBlock(field.data, key, src[k]!);
   bi0 = Math.min(bi0, bi); bi1 = Math.max(bi1, bi); bj0 = Math.min(bj0, bj); bj1 = Math.max(bj1, bj);
  }
  if (bi1 < 0) return null;
  field.rev++;
  return [bi0 * JB * CH_STEP, bj0 * JB * CH_STEP, (bi1 + 1) * JB * CH_STEP, (bj1 + 1) * JB * CH_STEP];
 }
}
