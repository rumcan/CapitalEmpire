// The welcome card waits for the ground (T188, plan P23-UX P2-3: "the map is black while the ground bakes"): it shows once every chunk of the
// first view has a picture, or after WELCOME_WAIT_MS whatever (a view that never finishes must not hide the card for good). Pure.

/** the longest the welcome card waits for the first view's ground, ms */
export const WELCOME_WAIT_MS = 10000;
/** whether every chunk on screen has a picture */
export function allBaked(tiles: Iterable<{ tex: unknown }>): boolean { for (const t of tiles) if (!t.tex) return false; return true; }
/** whether the welcome card may show: the first view is baked, or it waited WELCOME_WAIT_MS since the game became ready */
export function welcomeReady(baked: boolean, sinceReadyMs: number): boolean { return baked || sinceReadyMs >= WELCOME_WAIT_MS; }
