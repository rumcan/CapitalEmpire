// T353 (#995): the house lots' wiring in the engine and the UI, read from the source (as T355's wiring test does: the engine is too big to start headless): a ball on a lot is
// out of bounds, the lots' ground is not course land, the estate is saved and loaded, its clock runs beside the club's month, sales go into the books' Lot sales, a road
// cannot be built through a lot, the bulldozer and the pointer reach the tool, and the menu has the row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(p), 'utf8');
const eng = read('src/game/engine.ts');
/** the text of one engine method, from its signature to the next line that starts a member at two spaces' indent (or the end of the file) */
const method = (sig: string): string => { const i = eng.indexOf(sig); assert.ok(i >= 0, `the engine has ${sig}`); const rest = eng.slice(i + sig.length), m = /\n {2}(?:private |readonly |get |set |async |static |\/\*\*)/.exec(rest); return eng.slice(i, i + sig.length + (m ? m.index : rest.length)); };

test('a ball on a lot is out of bounds: the played course is made with the lots', () => {
  const play = method('private playCourse(g: GolfSave): CourseView {');
  assert.match(play, /makeCourseView\(deriveHoles\(areas, g\.tees, g\.pins, g\.aims\), surfAt, lots && lots\.lots\.length \? \(x, y\) => !!ES\.lotAt\(lots, x, y\) : undefined\)/);
});

test('the course tools treat lot ground as not course land: the paint host, New hole and the tee boxes', () => {
  assert.match(eng, /ownedAt: \(x, y\) => this\.ownedAt\(x, y\) && !this\.onRangePlot\(x, y\) && !this\.onEstate\(x, y\), landWhy: \(x, y\) => \(this\.onRangePlot\(x, y\) \? 'range' : this\.onEstate\(x, y\) \? 'estate' : this\.ownedAt\(x, y\) \? '' : 'off'\)/);
  assert.match(eng, /own: \(x, y\) => this\.ownedAt\(x, y\) && !this\.onRangePlot\(x, y\) && !this\.onEstate\(x, y\), landWhy: \(x, y\) => LAND_WHY\[this\.onRangePlot\(x, y\) \? 'range' : this\.onEstate\(x, y\) \? 'estate' : 'off'\]/);
  assert.match(read('src/game/paint-tool.ts'), /export type LandRefusal = 'off' \| 'range' \| 'estate';/);
  assert.match(read('src/game/ext/hole-wizard/index.ts'), /export type LandWhy = 'off' \| 'range' \| 'estate' \| '';/);
});

test('the estate is saved with the golf game and read back on a load; a reset drops it', () => {
  assert.match(eng, /everyday: this\.dayBook\?\.save \?\? this\.golf\.everyday, estate: ES\.encodeEstate\(this\.estateRt\) \}/);
  assert.match(eng, /this\.golf = normalizeGolfSave\(d\.golf\);\n\s+this\.estateRt = ES\.normalizeEstate\(this\.golf\?\.estate\);/);
  assert.match(eng, /this\.golf = null;[^\n]* this\.estateRt = null;/); // (a reset drops the estate with the golf state: other resets of its own sit between them since T353)
  assert.match(read('src/game/golf/mode.ts'), /estate\?: EstateSave;/);
  assert.match(read('src/game/golf/mode.ts'), /if \(estate && normalizeEstate\(estate\)\) out\.estate = estate;/);
});

test('the estate runs beside the club: every two seconds; its lots are drawn through the lot queue, only the ones that changed', () => {
  assert.match(eng, /this\.payStaff\(\); this\.stepClub\(\); this\.estateStep\(\); \}/);
  assert.match(eng, /if \(this\.estateRt && this\.estateRt\.rev !== this\.estateRev\) this\.estateSync\(\);/);
  assert.match(method('  private applyLot(key: string) {'), /^ {2}private applyLot\(key: string\) \{\n\s+if \(key\.startsWith\('estate:'\)\) \{ this\.applyEstateLot\(key\); return; \}/);
  const sync = method('private estateSync() {');
  assert.match(sync, /this\.lotQueue\.add\(k\)/);
  assert.match(sync, /this\.estateDrawn\.get\(k\) !== st/);
});

test('a sale goes into the books as Lot sales, the levy as the club\'s business, a finished house\'s owner joins the club', () => {
  const step = method('private estateStep() {');
  assert.match(step, /this\.traffic\.spend\('lots', -s\.price\)/);
  assert.match(step, /this\.traffic\.spend\('business', -out\.levy\)/);
  assert.match(step, /members: club\.members \+ n/);
  assert.match(step, /if \(club\) \{/, 'no clubhouse, no club: nothing is booked and nobody joins');
  assert.match(read('src/game/city.ts'), /spend\(kind: 'construction' \| 'compensation' \| 'business' \| 'upkeep' \| 'lots' \| 'balls', n: number\): void \{ this\.budget\.spend\(kind, n\); \}/);
  assert.match(read('src/App.tsx'), /\['Lot sales', l\.lots \?\? 0, true\]/);
});

test('a road cannot be built through a lot; the bulldozer takes a lot still for sale off the market; a built-on block shows no survey line', () => {
  assert.match(eng, /return \[\.\.\.routeObstacles\(\{ course, biz: this\.bizDefs, parks: this\.parkDefs, structures: this\.rangeStructs\(\), tolls, places: this\.placeStructures\(\) \}\), \.\.\.this\.estateObstacles\(\)\];/);
  assert.match(eng, /if \(this\.golf && this\.estateBulldoze\(t\.x, t\.y\)\) return; \/\/ T353/);
  assert.match(method('private estateBulldoze(x: number, y: number): boolean {'), /if \(l\.st !== ES\.ST\.SALE\) \{[^\n]*return true; \}/);
  assert.match(eng, /for \(const l of this\.estateRt\?\.lots \?\? \[\]\) \{ const q = ES\.boxOf\(l\); if \(q\[0\] < x1 && q\[2\] > x0 && q\[1\] < y1 && q\[3\] > y0\) return true; \} \/\/ T353/);
});

test('the pointer, Esc and the other building tools reach the House lots tool; another tool puts it down', () => {
  assert.match(eng, /if \(this\.estatePlacing && this\.tool === 'course'\) \{ this\.overlay\.setPointerCapture\(e\.pointerId\); this\.estateTool\.down\(mx, my\); break; \}/);
  assert.match(eng, /else if \(this\.estatePlacing && this\.tool === 'course'\) this\.estateTool\.move\(mx, my\);/);
  assert.match(eng, /if \(this\.estatePlacing && this\.tool === 'course' && this\.estateTool\.dragging\) \{ const gm = this\.ghostMouse; if \(gm\) this\.estateTool\.up\(gm\.mx, gm\.my\); else this\.estateTool\.cancel\(\); \}/);
  assert.match(eng, /pointerLeave\(\) \{ this\.estateTool\.leave\(\);/);
  assert.match(eng, /if \(this\.estatePlacing && this\.tool === 'course'\) \{ if \(!this\.estateTool\.cancel\(\)\) this\.placeEstate\(false\); return true; \}/);
  assert.match(eng, /\} else if \(this\.estatePlacing && this\.tool === 'course'\) \{ \/\/ T353\n\s+this\.drawEstateGhost\(ctx\);/);
  // the clubhouse, the halfway house and the pro buildings put it down; so does any other tool (setTool)
  assert.equal([...eng.matchAll(/this\.estateOff\(\)/g)].length >= 5, true);
  assert.match(eng, /this\.clubPlacing = false; this\.halfwayPlacing = false; this\.estateOff\(\); \} else if/);
  assert.match(eng, /&& !this\.proPlacing && !this\.estatePlacing\)\) return ''/);
});

test('the menu and the card: Course > Buildings > House lots, the App picks it up, the card offers an estate street', () => {
  assert.match(read('src/ui/flyout-menu.ts'), /leaf\(b, 'House lots', \{ k: 'estate' \}, 'house'\)/);
  assert.match(read('src/App.tsx'), /case 'estate': game\.placeEstate\(true\); break;/);
  const card = read('src/ui/course/BuildingsPanel.tsx');
  assert.match(card, /<EstateCard game=\{game\} \/>/);
  assert.match(card, /onClick=\{\(\) => game\.drawEstateStreet\(\)\} data-testid="estate-draw-street"/);
  assert.match(eng, /this\.clubDriveBuilt\(cls\); this\.estateStreetBuilt\(cls\);/);
});

test('the entry point for streets laid by code (T354): layEstateLots lays lots along street pieces through placeLots, pays for them and clears the ground; its inputs are public', () => {
  assert.match(eng, /\n {2}estateStreets\(near: Pt, r: number\): ES\.StreetSeg\[\] \{/);
  assert.match(eng, /\n {2}estateEnv\(\): ES\.EstateEnv \{/);
  assert.match(method('estateEnv(): ES.EstateEnv {'), /anyHeading: true,/); // (T354: the composer draws a house on every road heading, so the lot rules do not refuse a street for its angle)
  assert.match(eng, /\n {2}estateMake\(\): ES\.Estate \{/);
  const lay = method('layEstateLots(along: ES.Along, free = false): ES.PlaceResult {'); // (T354: free, an imported estate's lots come with the course)
  assert.match(lay, /if \(!this\.golf\) return \{ placed: \[\], refused: \[\], cost: 0 \};/);
  assert.match(lay, /ES\.planLots\(e, along, env\)/);
  assert.match(lay, /if \(cost > this\.money && !free\) return \{ placed: \[\]/);
  assert.match(lay, /ES\.placeLots\(e, along, env, this\.golfMonthAt\(performance\.now\(\)\), this\.seed\)/);
  assert.match(lay, /else if \(r\.cost\) this\.traffic\.spend\('construction', r\.cost\)/);
  assert.match(lay, /this\.estateLaid\(r\.placed\)/);
  // the laying clears the rough, the long grass and the fescue under the lots (they show their own ground), as a rub out does (carved)
  const laid = method('estateLaid(placed: readonly ES.EstateLot[]) {');
  assert.match(laid, /ES\.cellsUnder\(l, g\)/);
  assert.match(laid, /paintCells\(g, idx, idx\.length, SURF\.none, 0, 0, \{ carve: true \}\)/);
  // the tool's click and drag go through the same laying (the tool charges and clears through its context)
  assert.match(eng, /laid: placed => this\.estateLaid\(placed\),/);
});

test('a house on the estate is the town\'s lot composition and nothing more (T385, #1042: the owner\'s lot rule is that composition\'s): one compose state, no props of the estate\'s own on a lot being built or built', () => {
  const apply = method('private applyEstateLot(key: string) {');
  assert.match(apply, /this\.placeLot\(key, \{ o: l\.o, u: l\.u, n: l\.n, w: l\.w, d: l\.d \}, this\.estateLotState\(l\)\)/);
  assert.doesNotMatch(apply, /addProp|put\(|lotProps/, 'a lot being built or built adds nothing of its own');
  assert.match(method('private estateLotState(l: ES.EstateLot): ComposeState {'), /\{ use: LU\.RES, level: l\.st === ES\.ST\.BUILT \? LV\.BUILT : LV\.BUILDING, decline: 0, seed: l\.seed \}/);
  // the estate's own props are the plots' (before a house stands): the For Sale post, and the sold plot's first delivery
  const plot = method('private placeEstatePlot(key: string, l: ES.EstateLot) {');
  assert.match(plot, /if \(l\.st === ES\.ST\.SALE\) put\(ES\.SALE_SIGN, [^)]*\);\n\s+else \{ put\(SITE_LUMBER\[0\]!, [^)]*\); put\(SITE_HEAPS\[0\]!, [^)]*\); \}/);
  assert.match(apply, /else this\.placeEstatePlot\(key, l\);/);
});
