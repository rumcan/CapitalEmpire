// T295 (#880; the owner, 2026-11-02: "add a ticket so the town starts with only farms and trailer park buildings and caravans and junk yards and only
// you later get nice buildings as the driving range makes more money and your own house upgrades"): the building tiers. A lot draws only the presets
// (and the shops and houses swapped in) whose buildings are at or below its tier (LotState.tier, set from the town's tier, Town.tier), and the town's
// tier is the lower of its income tier (the range's takings) and its home tier (the player's house). Pure, no library import: the worker's town
// reads tierOf and the thresholds; the composer reads the building test (compose.ts).

/** the building tiers, by index: 0 starter (farms, trailer parks, junk yards, the run-down houses), 1 modest, 2 town (the default), 3 fine */
export const TIER_NAMES: readonly string[] = ['starter', 'modest', 'town', 'fine'];
/** the tier rules over a library id, in order: the first match wins; a building no rule names is town (2). Tier 3 is the large houses and the
 *  casino: a range start's town reaches them only with a house (townTier: its home tier plus one) */
export const TIER_RULES: readonly (readonly [RegExp, number])[] = [
  [/farmhouse-wrap|house-large|estate|villa|mansion|casino/, 3],
  [/(^|[:_-])farm/, 0],
  [/barn/, 0],
  [/(?<!boat-)trailer|mobile-home|camper|pop-?up|caravan/, 0],
  [/junk|scrap|crushed-car/, 0],
  [/rundown|derelict|boarded|abandoned|shack|lean-to|\bshed/, 0],
  [/garage|workshop|cottage|ranch|bungalow|house_[012](?!\d)|industrial-|gas/, 1],
];
/** a building's tier from its library id (see TIER_RULES) */
export function tierOf(id: string): number { for (const [re, t] of TIER_RULES) if (re.test(id)) return t; return 2; }
/** a preset's tier: the highest tier of its building props (isBuilding tells a building's id from a prop's); 0 for a preset with none */
export function presetTier(p: { props: readonly { id: string }[] }, isBuilding: (id: string) => boolean): number {
  let t = 0; for (const q of p.props) if (isBuilding(q.id)) t = Math.max(t, tierOf(q.id)); return t;
}
/** the income tier of a takings figure ($): the highest index of the thresholds it reaches (0 below the second) */
export function incomeTier(takings: number, at: readonly number[]): number { let t = 0; for (let i = 0; i < at.length; i++) if (takings >= at[i]!) t = i; return t; }
/** the town's tier: the lower of its income tier (the range's takings against TIER_TAKINGS) and its home tier plus one (the player's home stage: 0 caravan,
 *  1 cottage, 2 house: the home allows the town up to 1, 2, 3; the owner, 2026-11-02, so the large houses and the casino come once the range earns with a house) */
export function townTier(takings: number, homeStage: number, at: readonly number[]): number { return Math.min(incomeTier(takings, at), Math.max(0, Math.min(3, homeStage + 1))); }
