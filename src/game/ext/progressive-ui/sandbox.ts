// Sandbox mode (#1314; the owner, 2026-11-14: "add a sandbox mode to the menu start where everything is unlocked and there's no tutorial"; #1317's MVP note: "in
// sandbox let them choose if they want to build the city roads themselves"). A new game chosen as Sandbox on the title card: every tool, building, upgrade, course
// tool and card the game gates is open from the start (the engine's unlock-all, Engine.sandboxUnlock, and the progressive UI's sandbox fact), the treasury starts at
// SANDBOX_MONEY, and there is no tutorial: no start tutorial, no guided build, no hints, no welcome card, no Tips, no Goal pill. The choice is saved with the game
// (GolfProgress.sandbox), so a sandbox game loads as one, and the top bar wears a Sandbox tag.
// Pure TypeScript, no DOM. index.ts re-exports this file; the imports from './index' are read inside function bodies only (no import-cycle surprises).
import { NEW_BADGE_IDS, type GolfProgress } from './index';

/** a sandbox game's options, saved with it (GolfProgress.sandbox). townRoads: the town lays its own gravel streets as it grows (#1317: the player chose not to
 *  build the town's roads himself); false: the player builds them, as in the normal game (the town grows only along his roads: T292) */
export interface SandboxSave { townRoads: boolean }

/** the treasury a sandbox game starts with ($10,000,000): plenty for every hole, the clubhouse and the upgrades, while the money stays real (the Bank, the
 *  statement and net worth keep working; the dev server's unlimited money shows an infinite treasury the money game's panels were not made for) */
export const SANDBOX_MONEY = 10_000_000;

/** a loaded sandbox flag made well formed: null (a normal game) for anything that is not an object; townRoads true only when saved true */
export function normalizeSandbox(x: unknown): SandboxSave | null {
  if (!x || typeof x !== 'object') return null;
  return { townRoads: (x as Partial<SandboxSave>).townRoads === true };
}

/** turns a new game's progress into a sandbox game's: the flag saved, no start tutorial and no guided build (their cards never show), the range's ramp and the
 *  course's stages at the top (every tool open, even where a check reads the stage rather than the flag) and every NEW badge already seen (nothing to discover).
 *  Returns the same object */
export function makeSandbox(p: GolfProgress, o: SandboxSave): GolfProgress {
  p.sandbox = { townRoads: o.townRoads };
  delete p.guide; delete p.tour;
  if (p.ramp !== undefined) p.ramp = 3;
  p.stage = 3;
  p.seen = [...new Set([...p.seen, ...NEW_BADGE_IDS])];
  return p;
}

/** the money to pay into a fresh sandbox treasury of `money` so it holds SANDBOX_MONEY (0 when it holds that much already) */
export function sandboxTopUp(money: number): number { return Number.isFinite(money) ? Math.max(0, SANDBOX_MONEY - money) : 0; }
