// T459 (the owner: "a Show me button that does nothing? are you guys not testing buttons? ... maybe its time to add some unit tests"): what the jam
// build's menu cards and tips do when clicked, out of App.tsx so a test can run every one against a stub game (tests/jam-buttons.test.ts) and see
// that it reaches the engine. Pure TS, no DOM: App.tsx passes the game and its own bits of UI state (which rail item is lit, the Build menu, the tips).
import type { BuildAct } from './build-menu';
import type { TipShow } from './tips';
import type { RangeUpgradeId } from '../../game/golf/rangesave';

/** what a menu card's act and a tip's Show me need of the engine (engine.ts Game has them all) */
export interface ActHost {
  range: { cardOpen: boolean; scene: { counter: { x: number; y: number } } | null };
  openRangeCard(open?: boolean): void;
  placeRangePart(id: 'range' | 'carpark' | 'practice'): void;
  lookAt(x: number, y: number, z?: number): void;
  buyRangeUpgrade(id: RangeUpgradeId): void;
  setTool(t: 'select' | 'path'): void;
  paint: { setProperty(on: boolean): void };
  startFirstHole(): void;
  placeClubhouse(on: boolean): void;
  armPractice(id: 'putting' | 'chipping', show?: boolean): void;
  buyRange(): void;
  panel: string | null;
  toggleMoneyPanel(): void;
  guideShowMe(id: string): void;
}
/** the UI state a card or a tip touches: the rail item to light, the Build menu (null: shut; else the tab), the tips card */
export interface ActUi { rail(id: string | null): void; build(tab: string | null): void; tips(open: boolean): void }

/** a Build menu card picked: the same placement the rail and the range card start (the menu shuts first). Returns what it started */
export function runBuildAct(game: ActHost, a: BuildAct, ui: ActUi): string {
  ui.build(null);
  if (a.k !== 'rangeCard' && a.k !== 'junk' && game.range.cardOpen) game.openRangeCard(false);
  switch (a.k) {
    case 'place': ui.rail('range'); game.placeRangePart(a.id); return `place ${a.id}`;
    case 'upgrade': { ui.rail('range'); const sc = game.range.scene; if (sc) game.lookAt(sc.counter.x, sc.counter.y); game.buyRangeUpgrade(a.id); return `upgrade ${a.id}`; }
    case 'rangeCard': ui.rail('range'); game.setTool('select'); game.openRangeCard(true); return 'range card';
    case 'newHole': ui.rail('course'); game.paint.setProperty(false); game.startFirstHole(); return 'new hole';
    case 'paths': ui.rail(null); game.setTool('path'); return 'paths';
    case 'clubhouse': ui.rail('course'); game.placeClubhouse(true); return 'clubhouse';
    case 'green': ui.rail(null); game.armPractice(a.id, true); return `green ${a.id}`;
    case 'buyRange': game.buyRange(); return 'buy range';
    case 'junk': ui.rail('range'); game.setTool('select'); game.openRangeCard(true); return 'junk';
  }
}

/** a tip's Show me: the Build menu, the Bank, or the range's balls (Walk out to them, guide.ts' buckets step). Returns what it showed */
export function runTipShow(game: ActHost, s: TipShow, ui: ActUi): string {
  switch (s) {
    case 'build': ui.tips(false); ui.build('range'); return 'build menu';
    case 'bank': if (game.panel !== 'bank') game.toggleMoneyPanel(); return 'bank';
    case 'balls': game.guideShowMe('guide-range-buckets'); return 'balls';
  }
}
