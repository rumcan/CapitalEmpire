import { PHOTO_TEX } from '../../grass-art';
import { BUNKER_TEXTURE_SLOTS, DEFAULT_BUNKER_TEXTURES, type BunkerSettings, type BunkerTextureSlot } from './settings';
import { BUNKER_PACK_TEXTURES, type BunkerMaterials, type BunkerTextureEntry } from './stage-materials';

const words = (name: string) => name.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase()).replace(/ ([A-Z])(?=[a-z])/g, (_, c: string) => ' ' + c.toLowerCase());

/** Drop a .png/.jpg/.webp into ./textures/ and it shows up in every bunker texture picker (id file:<name>).
 *  The node test bundle has no import.meta.glob: there the folder is simply empty. */
function droppedTextures(): BunkerTextureEntry[] {
  let files: Record<string, string> = {};
  try { files = import.meta.glob('./textures/*.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>; }
  catch { /* not under Vite */ }
  return Object.entries(files).map(([path, url]) => {
    const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
    return { id: `file:${name}`, label: words(name), group: 'Added textures', url };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

/** Every picture a bunker slot can use: the bunker pack, the game's ground photos (the Paint tool's), and the drop-in folder (and the player's
 *  own uploads: registerOwnTexture). */
export const BUNKER_TEXTURE_LIBRARY: readonly BunkerTextureEntry[] = Object.freeze([
  ...BUNKER_PACK_TEXTURES,
  ...PHOTO_TEX.filter(photo => photo.src).map(photo => ({ id: `photo:${photo.tex}`, label: photo.tex === 'pad' ? 'Concrete' : words(photo.tex), group: 'Ground photos', url: photo.src })),
  ...droppedTextures(),
]);
const BY_ID = new Map(BUNKER_TEXTURE_LIBRARY.map(entry => [entry.id, entry]));
/** the player's own pictures (uploads.ts, kept in this browser), group 'Your textures', in the order they were added */
const OWN: BunkerTextureEntry[] = [];
let ownRev = 0;
const ownListeners = new Set<() => void>();
/** calls back when the player's own pictures change (the ground tells its workers); returns the unsubscribe */
export function onOwnTextures(cb: () => void): () => void { ownListeners.add(cb); return () => { ownListeners.delete(cb); }; }
const ownChanged = () => { ownRev++; for (const cb of ownListeners) cb(); };
/** one of the player's own pictures by id (upload:<hash>), or undefined */
export const ownTexture = (id: string): BunkerTextureEntry | undefined => OWN.find(e => e.id === id);
/** adds (or replaces) one of the player's own pictures; a bunker naming it bakes with it from now on */
export function registerOwnTexture(entry: BunkerTextureEntry): void {
  const at = OWN.findIndex(e => e.id === entry.id); if (at >= 0) OWN[at] = entry; else OWN.push(entry);
  BY_ID.set(entry.id, entry); ownChanged();
}
/** forgets one of the player's own pictures (a bunker naming it draws its slot's default) */
export function unregisterOwnTexture(id: string): void { const at = OWN.findIndex(e => e.id === id); if (at >= 0) OWN.splice(at, 1); BY_ID.delete(id); ownChanged(); }
/** the player's own pictures, and a number that changes with them (for the card's re-render) */
export const ownTextures = (): readonly BunkerTextureEntry[] => OWN;
export const ownTexturesRev = () => ownRev;

/** The entry a slot draws: an unknown id (a texture another browser had, or one since removed) draws the slot's default. */
export function bunkerTexture(slot: BunkerTextureSlot, id: string | undefined, library: ReadonlyMap<string, BunkerTextureEntry> = BY_ID): BunkerTextureEntry {
  return (id !== undefined ? library.get(id) : undefined) ?? library.get(DEFAULT_BUNKER_TEXTURES[slot]) ?? BUNKER_PACK_TEXTURES.find(entry => entry.id === DEFAULT_BUNKER_TEXTURES[slot])!;
}

/** The five pictures one bunker bakes with (only id, url and crop go to the worker). */
export function bunkerMaterials(settings: Readonly<BunkerSettings>, library?: ReadonlyMap<string, BunkerTextureEntry>): BunkerMaterials {
  const out = {} as BunkerMaterials;
  for (const slot of BUNKER_TEXTURE_SLOTS) {
    const { id, url, crop } = bunkerTexture(slot.slot, settings[slot.key], library);
    out[slot.slot] = crop ? { id, url, crop } : { id, url };
  }
  return out;
}

/** Groups in picker order. */
export function bunkerTextureGroups(): { group: string; entries: BunkerTextureEntry[] }[] {
  const groups = new Map<string, BunkerTextureEntry[]>();
  for (const entry of [...OWN, ...BUNKER_TEXTURE_LIBRARY]) groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
  return [...groups].map(([group, entries]) => ({ group, entries }));
}
