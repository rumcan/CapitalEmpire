// The living scene's prepared world (J12, #1271): src/assets/showcase/menu.cesave, a save made by the game itself (scripts/jam/menu-scene-build.mjs) and
// loaded by the engine in place of the player's (engine.ts showcaseLoader). A separate file from showcase.ts: it imports the asset, which only the bundler can.
import { gunzip, upgradeSave, type SaveV5 } from './save';
import saveUrl from '../assets/showcase/menu.cesave?url';

/** the prepared world as a loadable save, or null when it cannot be had (the page then starts again without the scene) */
export async function loadShowcaseSave(): Promise<SaveV5 | null> {
  try {
    const r = await fetch(saveUrl); if (!r.ok) return null;
    const buf = await r.arrayBuffer(), u = new Uint8Array(buf);
    // gzip as stored; a server that unpacked it on the way (Content-Encoding) hands over the JSON itself
    const text = u[0] === 0x1f && u[1] === 0x8b ? await gunzip(buf) : new TextDecoder().decode(buf);
    const d = JSON.parse(text) as { version: number; map: number } & Partial<SaveV5>;
    return upgradeSave(d);
  } catch { return null; }
}
