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
/** J7c (#1230; the lead's playtest: the bought range ran dry and earned nothing): the old range comes with its ball kit when bought, a ball tube, a push picker and a
 *  part-time range attendant (his wage, the attendant upgrade's upkeep, on the statement every month), so it keeps itself in balls at its starting demand; better
 *  pickers stay upgrades and the player may let the attendant go and pick by hand */
export const JAM_RANGE_KIT: readonly string[] = ['tube', 'pushpick', 'attendant'];
/** J7c: in the jam the attendants pick this many times as fast (measured on the built jam at 20x: a fresh range's golfers hit about 200 balls a town hour from its
 *  200-ball stock, the stock attendant picked about 23 an hour, so the bought range ran dry in its first month and earned nothing) */
export const JAM_STAFF_X = 12;
/** J7c: the balls the bought old range's ball room holds on top of a new range's 200 (5 buckets): each golfer walking in from the car park reserves a bucket, and at the
 *  lunchtime rush 13 come at once onto four bays (measured at 20x on the jam), so with 200 the rush drove on however fast the attendant picked; 800 is 20 buckets */
export const JAM_RANGE_BALLS = 600;
