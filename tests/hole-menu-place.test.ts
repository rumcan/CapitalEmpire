// #1296 (the owner: "the window should be overflow visible"): where the Holes panel's + dropdown goes (ui/course/menu-place.ts). Pure: npm test (bundled by esbuild, run by node --test).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { placeMenu } from '../src/ui/course/menu-place';

const MENU = { width: 240, height: 150 };

describe('the + menu\'s place (#1296)', () => {
  it('goes under the badge with their left edges together when there is room', () => {
    const at = placeMenu({ left: 210, top: 400, bottom: 432 }, MENU, 1440, 900);
    assert.deepEqual(at, { left: 210, top: 436 });
  });
  it('hangs out of the panel: only the window bounds it (the badge near the panel\'s bottom edge, the menu longer than the panel left under it)', () => {
    // a panel ending at 524 px, the badge at 410..442: the menu runs to 592 px, past the panel's edge and still inside the window
    const at = placeMenu({ left: 215, top: 410, bottom: 442 }, MENU, 1440, 900);
    assert.equal(at.top, 446); assert.ok(at.top + MENU.height > 524 && at.top + MENU.height <= 900 - 6);
  });
  it('goes above the badge when the window has no room below it', () => {
    const at = placeMenu({ left: 300, top: 800, bottom: 832 }, MENU, 1440, 900);
    assert.equal(at.top, 800 - 4 - 150); assert.ok(at.top + MENU.height <= 800);
  });
  it('keeps inside the window on every side: the badge near the right edge shifts the menu left, never off the left edge', () => {
    assert.equal(placeMenu({ left: 1400, top: 100, bottom: 130 }, MENU, 1440, 900).left, 1440 - 6 - 240);
    assert.equal(placeMenu({ left: -30, top: 100, bottom: 130 }, MENU, 1440, 900).left, 6);
  });
  it('a menu taller than the window sits at the top edge, one wider than it at the left edge', () => {
    assert.equal(placeMenu({ left: 10, top: 300, bottom: 330 }, { width: 240, height: 2000 }, 1440, 900).top, 6);
    assert.equal(placeMenu({ left: 300, top: 300, bottom: 330 }, { width: 2000, height: 100 }, 1440, 900).left, 6);
  });
  it('at the largest Text size (the measured sizes scaled by 1.25) the three items still fit whole', () => {
    const m = { width: 300, height: 193 };   // the menu's size at 125%: what the play-through measured
    for (const top of [100, 400, 700, 760, 860]) {
      const at = placeMenu({ left: 260, top, bottom: top + 40 }, m, 1440, 900);
      assert.ok(at.left >= 6 && at.left + m.width <= 1440 - 6 && at.top >= 6 && at.top + m.height <= 900 - 6, `badge at ${top}: ${JSON.stringify(at)}`);
    }
  });
});
