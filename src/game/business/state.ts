// The placed businesses (Phase B step 2): a business's definition (its type and rect), its running stats, and the view the UI and the save read.
// Pure TS, no DOM: the City keeps the list and the stats, the engine the defs. The formulas are in catalogue.ts.
import { START_SAT, type BusinessId, type Owned } from './catalogue';

/** a placed business: its id (1..), its type, the top-left tile (x, y) and its size in tiles (w, h, already turned) */
export interface BizDef { id: number; type: BusinessId; x: number; y: number; w: number; h: number }
/** a placed business's running figures: its id, level, xp (satisfied visitor cars), sat (satisfaction 0..1), goodDays (good days so far), revenue ($ so far),
 *  visitors (cars so far), and today's counts: visitors, late and missed cars, and the revenue ($) of the game day in progress */
export interface BizStats { id: number; level: number; xp: number; sat: number; goodDays: number; revenue: number; visitors: number; today: { visitors: number; late: number; missed: number; revenue: number } }
/** a placed business with its stats: what the worker sends the UI, and what the engine reads */
export type BizView = BizDef & BizStats;

/** a business's stats before it has any: level 1, no xp, satisfaction START_SAT, nothing counted */
export function freshStats(id: number): BizStats { return { id, level: 1, xp: 0, sat: START_SAT, goodDays: 0, revenue: 0, visitors: 0, today: { visitors: 0, late: 0, missed: 0, revenue: 0 } }; }
/** the businesses as the unlock tree reads them: each one's type (as its id), level, good days and revenue */
export function ownedOf(views: BizView[]): Owned[] { return views.map(v => ({ id: v.type, level: v.level, goodDays: v.goodDays, revenue: v.revenue })); }
