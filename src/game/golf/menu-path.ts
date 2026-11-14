// #1282 (the owner, 2026-11-14; PR #1288 had moved Facilities into the Course menu as its sixth tile): where the practice facilities are built, as the game's
// texts (the guide, the hints, the toasts, the cards and the practice area's label) name the way. One place, so they never disagree with the menus.
// The normal game: Course ▸ Facilities ▸ Practice (Facilities is a tile of the Course flyout, no rail button of its own). The jam build has no Facilities
// tile: its Build menu has a Practice group (ui/jam/build-menu.ts), so there it is Build ▸ Practice. Pure, no DOM.
import { JAM } from '../features';

/** the way to the practice facilities as a text says it (sep: the separator the text already used, ▸ or ›); jam: the jam build (default: this build) */
export function practicePath(sep: '▸' | '›' = '▸', jam: boolean = JAM): string {
  return jam ? `Build ${sep} Practice` : `Course ${sep} Facilities ${sep} Practice`;
}
