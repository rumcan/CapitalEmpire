// Plan P26 (T214, #559): the balance model for club pros and memberships. Not game code: a season-by-season model of the proposed rules
// (docs/plans/P26.md section 6), run for a careful and a careless player over 10 seasons in the frame T221 and range:gate use:
//   - the club's income a season is range:gate's booking (scripts/sim/harness.ts seasonIncome: RANGE_SEASON plus simulateCampaign's
//     totalIncome for the careful or the careless player), with the campaign's old memberships (annualMembershipIncome) taken out and P26's
//     money put in (dues, lessons, the bar and the shop);
//   - the town's residents are T221's measured curve (PR #634's table: the careful town grows at its own pace, below its room), capped by the
//     room the money made gives (golf/towngrowth.ts earnedTarget), so the money P26 adds or removes moves the careless town only;
//   - the course follows range:gate's script: 2 holes in season 1, 9 in seasons 2-5, 18 from season 6.
// It imports the game's own functions where nothing changes (dailyGolfers, the green fee, the play days, the range's lesson numbers,
// earnedTarget, the business levels), and states every new number as a constant below (P26's tables). Each month: the pool, the sales, the
// churn, the dues. The pace term is a crude stand-in (waits climb once the tee sheet is 60% full); the game measures the real waits (T211).
//   npx esbuild scripts/sim/p26-members.ts --bundle --platform=node --format=esm --loader:.webp=empty --loader:.png=empty \
//     --outfile=output/sim/p26-members.mjs --log-level=warning && node output/sim/p26-members.mjs [--days 120] [--seasons 10] [--full]
// --days N: the billing days a season (OFF_SEASON_PLAY_DAYS; P05 D6 proposes 120); default the game's 24. --pool-town S: the residents' share
// of the pool (default 0.04; owner question Q1). --full: every column.
import { simulateCampaign } from '../../src/game/golf/campaign';
import { annualMembershipIncome, dailyGolfers, GREEN_FEE_PER_ROUND, OFF_SEASON_PLAY_DAYS } from '../../src/game/golf/yearend';
import { earnedTarget } from '../../src/game/golf/towngrowth';
import { LESSON, LESSON_SHARE, PRACTICE_SHARE, RANGE_SCALE_BASE } from '../../src/game/golf/rangesave';
import { levelFromXp } from '../../src/game/business/catalogue';

const arg = (k: string, d: number) => { const i = process.argv.indexOf(k); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const PLAY_DAYS = arg('--days', OFF_SEASON_PLAY_DAYS), SEASONS = arg('--seasons', 10), FULL = process.argv.includes('--full');

// ---- P26's proposed numbers (docs/plans/P26.md sections 1-4) ----
/** the start price ($ a month) and the fair price: (FAIR_BASE + FAIR_Q x quality + FAIR_REP x rep) x FAIR_18 on 18 holes x (1 + FAIR_LEVEL x (level - 1)) */
export const PRICE_START = 40, FAIR_BASE = 15, FAIR_Q = 30, FAIR_REP = 15, FAIR_18 = 1.4, FAIR_LEVEL = 0.08;
/** the pool (the golfers who might join): POOL_TOWN of the residents plus POOL_VISIT x the visitors a day */
export const POOL_TOWN = arg('--pool-town', 0.04), POOL_VISIT = 0.8;
/** the founding drive: the share of the pool that joins in the clubhouse's first month */
export const FOUNDING = 0.4;
/** sales a month (a share of the pool not yet members) and churn a month (a share of the members); the staff's terms */
export const J_BASE = 0.02, J_PRO = 0.025, J_SEC = 0.02, C_BASE = 0.02, C_PRICE = 0.04, C_PACE = 0.01, C_PRO = 0.008, C_SEC = 0.004, C_MIN = 0.004;
/** a member: upkeep $ a month, the visitors a day he no longer is (his lost green fees), the share of members on a day's tee sheet (T208's),
 *  the bar spend a round ($), the lessons a season he takes once the club has a pro */
export const MEMBER_UPKEEP = 4, MEMBER_VISITS = 0.15, MEMBER_PLAY = 0.35, MEMBER_BAR = 3, MEMBER_LESSONS = 1;
/** wages $ a month; the buildings' price and upkeep $ a month */
export const WAGE = { head: 900, teach: 300, sec: 450 }, OFFICE = { cost: 14000, upkeep: 80 }, HUT = { cost: 4000, upkeep: 25 };
/** the clubhouse's visit cars: today $22 a visitor, 4 a car; P26 $8 a visitor (the bar and the shop), +20% with a head pro */
export const VISIT_OLD = 22, VISIT_NEW = 8, PARTY = 4, SHOP_PRO = 0.2;
/** short-game lessons at a practice-green hut: the share of the green's users who take one, the price ($) */
export const SHORT_SHARE = 0.08, SHORT_LESSON = 12;
/** a teaching pro's lessons a season at most: one an hour, 11 open hours, 2.4 town days a season, times the range's scale */
export const PRO_CAP = 11 * 2.4 * RANGE_SCALE_BASE;
/** the range's customers a season in range:gate's frame (RANGE_SEASON $18,000 at the $6 bucket) */
const RANGE_CUSTOMERS = 18000 / 6;
/** the tee sheet's groups (T208: 07:00-15:00 at 8 minutes) and the golfers a group */
const SHEET = Math.floor((900 - 420) / 8) + 1, PER_GROUP = 3.35;
/** T221's measured residents of the careful town (PR #634, range:gate seed 1 --player), seasons 1, 3, 5, 10, 20; log-linear between */
const CAREFUL_POP: [number, number][] = [[1, 63], [3, 408], [5, 823], [10, 2600], [20, 5541]];
const popAt = (k: number) => { for (let i = 1; i < CAREFUL_POP.length; i++) { const [a, pa] = CAREFUL_POP[i - 1]!, [b, pb] = CAREFUL_POP[i]!; if (k <= b) return pa * Math.pow(pb / pa, (k - a) / (b - a)); } return CAREFUL_POP[CAREFUL_POP.length - 1]![1]; };
const holesAt = (k: number) => k <= 1 ? 2 : k <= 5 ? 9 : 18;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const money = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');

/** the fair price ($ a month) */
export function fairPrice(q: number, r: number, holes: number, level: number): number {
  return (FAIR_BASE + FAIR_Q * q + FAIR_REP * r) * (holes >= 18 ? FAIR_18 : 1) * (1 + FAIR_LEVEL * (level - 1));
}
/** the lessons a teaching pro's hut books a season ($): at the range LESSON_SHARE of the customers at LESSON, at a practice green SHORT_SHARE of the
 *  green's users (PRACTICE_SHARE.putting of the customers) at SHORT_LESSON; each capped by PRO_CAP */
export function hutLessons(where: 'range' | 'green', customers: number): number {
  return where === 'range' ? Math.min(customers * LESSON_SHARE, PRO_CAP) * LESSON : Math.min(customers * PRACTICE_SHARE.putting * SHORT_SHARE, PRO_CAP) * SHORT_LESSON;
}

interface Player {
  name: string; campaign: 'careful' | 'careless'; quality: number; clubFrom: number; hutFrom: number; headFrom: number; secFrom: number;
  /** the price it sets each season from the fair price: null keeps the start price */
  price: ((fair: number) => number) | null;
}
const PLAYERS: Player[] = [
  // the careful player: a teaching hut and pro at the range in season 1, the clubhouse in season 2 with the first nine, the office and the head pro
  // in season 3, the secretary with the 18 in season 6; the dues set to the fair price (to $5) each season
  { name: 'careful', campaign: 'careful', quality: 85, clubFrom: 2, hutFrom: 1, headFrom: 3, secFrom: 6, price: f => Math.round(f / 5) * 5 },
  // the same club with no staff and no huts (what the staff are worth), the dues still set to the fair price
  { name: 'careful, no staff', campaign: 'careful', quality: 85, clubFrom: 2, hutFrom: 99, headFrom: 99, secFrom: 99, price: f => Math.round(f / 5) * 5 },
  // the careless player: the clubhouse a season later, no staff, no huts, the start price left as it is
  { name: 'careless', campaign: 'careless', quality: 75, clubFrom: 3, hutFrom: 99, headFrom: 99, secFrom: 99, price: null },
];

interface Season { k: number; holes: number; rep: number; pop: number; D: number; pool: number; members: number; level: number; fair: number; price: number;
  sales: number; left: number; fill: number; popOld: number; dues: number; lessons: number; bar: number; staff: number; memberCost: number; net: number; today: number; room: number }

function run(p: Player): { seasons: Season[]; bought: number; vsToday: number } {
  const camp = simulateCampaign({ years: SEASONS, strategy: p.campaign }).history;
  let earned = 0, earnedOld = 0, members = 0, xp = 0, vsToday = 0, bought = 0;
  const seasons: Season[] = [];
  for (let k = 1; k <= SEASONS; k++) {
    const y = camp[k - 1]!, rep = y.reputation, holes = holesAt(k), q = p.quality / 100, r = rep / 100, success = k >= 3 ? 1.2 : 1;
    // the town: the careful pace, capped by the room of the money made so far (P26's, and today's for today's column)
    const room = earnedTarget(earned, success), pop = Math.min(popAt(k), room), popOld = Math.min(popAt(k), earnedTarget(earnedOld, success));
    const club = k >= p.clubFrom, head = club && k >= p.headFrom, sec = head && k >= p.secFrom, hut = k >= p.hutFrom;
    if (k === p.headFrom) bought += OFFICE.cost;
    if (k === p.hutFrom) bought += HUT.cost;
    const D = club ? dailyGolfers(p.quality, rep, holes) : 0, level = levelFromXp(xp);
    const fair = club ? fairPrice(q, r, holes, level) : 0, price = !club ? 0 : p.price ? p.price(fair) : PRICE_START;
    let dues = 0, memberUpkeep = 0, lost = 0, sales = 0, left = 0, fill = 0, pool = 0;
    for (let m = 0; m < 12 && club; m++) {
      pool = POOL_TOWN * pop + POOL_VISIT * D;
      if (k === p.clubFrom && m === 0) { members = FOUNDING * pool; sales += members; }
      const visitors = Math.max(0.5 * D, D - MEMBER_VISITS * members);
      fill = (MEMBER_PLAY * members + visitors) / PER_GROUP / SHEET;
      const waitAvg = 2 + 25 * clamp((fill - 0.6) / 0.4, 0, 1), slow = clamp((waitAvg - 5) / 25, 0, 1);
      const appeal = (0.5 + 0.5 * q) * (0.7 + 0.6 * r) * (0.9 + 0.1 * (level - 1)) * (holes >= 18 ? 1.15 : holes >= 9 ? 1 : holes / 9) * (1 - 0.3 * slow);
      const pf = clamp(1 + 2 * (1 - price / fair), 0.1, 2);
      const j = (J_BASE + (head ? J_PRO : 0) + (sec ? J_SEC : 0)) * appeal * pf;
      const c = Math.max(C_MIN, C_BASE + C_PRICE * Math.max(0, price / fair - 1) + C_PACE * slow - (head ? C_PRO : 0) - (sec ? C_SEC : 0));
      const s = j * Math.max(0, pool - members), out = c * members;
      sales += s; left += out; members = Math.max(0, members + s - out);
      dues += members * price; memberUpkeep += members * MEMBER_UPKEEP;
      lost += (D - visitors) * GREEN_FEE_PER_ROUND * PLAY_DAYS / 12;
    }
    // the clubhouse's visit cars (dailyDemand: 25 a day per 1,000 residents, a 2-minute trip, satisfaction 0.9; 2.4 town days a season); its xp
    // counts the cars and (P26) the golfers who check in
    const cars = club ? 25 / 1000 * pop * Math.exp(-2 / 6) * (1 + 0.25 * (level - 1)) * 0.95 * 2.4 : 0;
    const carsOld = club ? 25 / 1000 * popOld * Math.exp(-2 / 6) * 0.95 * 2.4 : 0;
    xp += cars + (club ? 2.4 * (D + MEMBER_PLAY * members) : 0);
    const bar = cars * PARTY * VISIT_NEW * (head ? 1 + SHOP_PRO : 1) + members * MEMBER_PLAY * PLAY_DAYS * MEMBER_BAR;
    const lessons = (hut ? hutLessons('range', RANGE_CUSTOMERS) : 0) + ((head || hut) ? members * MEMBER_LESSONS * LESSON : 0);
    const staff = 12 * ((head ? WAGE.head + OFFICE.upkeep : 0) + (hut ? WAGE.teach + HUT.upkeep : 0) + (sec ? WAGE.sec : 0));
    // today's club money for the same club: the old memberships (booked once a year) and the old visit cars at $22 a visitor
    const today = (club ? annualMembershipIncome(p.quality, rep, holes) : 0) + carsOld * PARTY * VISIT_OLD;
    const income = dues + bar + lessons, net = income - staff - memberUpkeep - lost;
    const base = 18000 + y.totalIncome - y.membershipIncome;
    earned += base + income; earnedOld += base + today; vsToday += net - today;
    seasons.push({ k, holes, rep, pop, popOld, D, pool, members, level, fair, price, sales, left, fill, dues, lessons, bar, staff, memberCost: memberUpkeep + lost, net, today, room });
  }
  return { seasons, bought, vsToday: vsToday - bought };
}

console.log(`P26 balance model: ${PLAY_DAYS} play days a season (the game: ${OFF_SEASON_PLAY_DAYS}; P05 D6: 120), ${SEASONS} seasons`);
console.log(`a teaching pro's range lessons a season by the range's customers: ${[3000, 6000, 12000, 31000].map(n => `${n.toLocaleString('en-US')}: ${money(hutLessons('range', n))}`).join(', ')}`);
console.log(`a practice-green hut's short-game lessons a season: ${[3000, 6000, 12000, 31000].map(n => `${n.toLocaleString('en-US')}: ${money(hutLessons('green', n))}`).join(', ')}`);
for (const p of PLAYERS) {
  const out = run(p);
  console.log(`\n${p.name}`);
  console.log(FULL
    ? 'season | holes | rep | residents | visitors a day | pool | members | level | fair | price | joined | left | sheet | dues | lessons | bar+shop | staff+buildings | member upkeep+lost fees | P26 net | today | room'
    : 'season | residents | pool | members | fair | price | dues | lessons | bar+shop | staff | members\' cost | P26 net | today\'s club money');
  for (const s of out.seasons) console.log((FULL
    ? [s.k, s.holes, s.rep, Math.round(s.pop), s.D, Math.round(s.pool), Math.round(s.members), s.level, money(s.fair), money(s.price), Math.round(s.sales), Math.round(s.left), `${Math.round(100 * s.fill)}%`,
      money(s.dues), money(s.lessons), money(s.bar), money(s.staff), money(s.memberCost), money(s.net), money(s.today), Math.round(s.room)]
    : [s.k, Math.round(s.pop), Math.round(s.pool), Math.round(s.members), money(s.fair), money(s.price), money(s.dues), money(s.lessons), money(s.bar), money(s.staff), money(s.memberCost), money(s.net), money(s.today)]).join(' | '));
  const sum = (f: (s: Season) => number) => out.seasons.reduce((a, s) => a + f(s), 0);
  console.log(`${p.name}: ${SEASONS} seasons: P26 net ${money(sum(s => s.net))} (buildings ${money(out.bought)} more), today's ${money(sum(s => s.today))}; the treasury against today's rules ${money(out.vsToday)}; residents in season ${SEASONS}: ${Math.round(out.seasons[SEASONS - 1]!.pop)} (today's rules: ${Math.round(out.seasons[SEASONS - 1]!.popOld)})`);
}
