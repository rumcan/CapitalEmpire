// T359 (#1006): the words of a setting step on the undo stack ("Undone: fairway texture", the ↶ button's tip): which look field a change touched,
// the surface's name and whose look it is. Pure: no DOM, importable from node tests.
import { ownerName } from './golf/looks';
import type { BrushKind } from './paint';

/** the look fields a change may touch, in the order the first one named wins: [fields, the words] */
const FIELD_WORDS: readonly (readonly [readonly string[], string])[] = [
  [['tex'], 'texture'], [['scale'], 'texture size'], [['angle'], 'texture angle'], [['ox', 'oy'], 'texture position'], [['tone', 'toneAmt', 'tint'], 'exposure'],
  [['mtex'], 'blend texture'], [['mshare', 'msoft', 'mpatch'], 'blend'], [['mscale', 'mangle'], 'blend size'], [['mox', 'moy'], 'blend position'],
  [['btex'], 'border texture'], [['bscale', 'bangle'], 'border texture size'], [['box', 'boy'], 'border texture position'], [['btone', 'btoneAmt', 'btint'], 'border exposure'],
  [['mow'], 'mowing lines'], [['round', 'smooth'], 'round off'], [['shadow'], 'shadow'], [['border'], 'border'], [['radius'], 'corners'], [['bunker'], 'bunker look'],
];
/** what a style change touched, in words ("texture", "border texture", "mowing lines"; "look" for anything else) */
export function styleWords(patch: object): string {
  const keys = Object.keys(patch);
  for (const k of keys) for (const [fields, words] of FIELD_WORDS) if (fields.includes(k)) return words;
  return 'look';
}
/** a surface's lower-case name ("fairway", "long grass", "waste area") */
const KIND_NAME: Readonly<Record<BrushKind, string>> = { fairway: 'fairway', green: 'green', tee: 'tee', rough: 'rough', bunker: 'bunker', water: 'water', waste: 'waste area', longGrass: 'long grass', path: 'cart path' };
export const kindName = (k: BrushKind): string => KIND_NAME[k] ?? k;
/** the setting step's label: "fairway texture (hole 3)", "green mowing lines (course default)" */
export function settingLabel(kind: BrushKind, words: string, owner: string): string {
  return `${kindName(kind)} ${words} (${owner === 'default' ? 'course default' : ownerName(owner)})`;
}
