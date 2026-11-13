/** Features switched off for now (the owner's calls); flip one back to bring its UI and its system back as they were. */

/** Greenkeeping (T016 grass care, T175 on the rail): the owner, 2026-10-27, "hide/remove greenkeeping from the game for now". Off: no
 *  Greenkeeping on the rail or in the Course flyout, no Grass button or panel, and the grass-care system disabled (no condition layer
 *  on the ground, no charges), so the turf never drifts while the player cannot care for it. */
export const GREENKEEPING = false;

/** The Zoud GameLab jam build ("Fairway Fortune", docs/JAM.md): `npm run build:jam` sets VITE_JAM=1. On: the rail, the gear menu and the cards
 *  are cut to the money game (no dev tools, Studio, town traffic and decoration, career, real places, tournaments, night golf), unlimited money
 *  never applies and a new game is the range start with JAM_START_MONEY. Off (false) in tests (no import.meta.env under node) and every other build. */
export const JAM: boolean = (() => { try { return import.meta.env?.VITE_JAM === '1'; } catch { return false; } })();
/** the jam game's starting cash, $ */
export const JAM_START_MONEY = 75_000;
/** T459 (docs/JAM.md "Balance"): the range takings in a season that open New hole and the clubhouse in the jam (the game's own is $20,000 or season 2,
 *  which kept a jam player off the course for half of the two-season goal) */
export const JAM_RAMP_TAKINGS = 2_000;
/** T459 ("Balance"): in the jam the green fees are paid per playable hole: the everyday golf's fees times this for each playable hole (2: a hole of about
 *  $26k earns about $1,300 a month once grown in, paying itself back in about 20 months). Without it nine holes took about what one did, so a hole never
 *  paid back what it cost and borrowing to build never paid */
export const JAM_FEE_PER_HOLE = 2;
