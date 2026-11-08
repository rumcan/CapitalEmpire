// T309 (#894): camera.png for the ChatGPT pack of an animal: an in-game shot at the closest zoom (30%) of one animal grazing in its paddock with a person
// standing a few metres from it on the same ground, so the picture shows the game's camera angle, its light and the animal's size next to a person.
//   node scripts/dev/animal-camera-shot.mjs --base http://127.0.0.1:5188/ --animal cow-brown --out F:/ClaudeTemp/T309/camera-cow-brown.png
//        [--seeds 101,102,103,104,105] [--person spec_m_dad] [--dpr 2] [--crop 440x300] [--up 2]
// Needs a dev server (vite) on --base. The person is a library frame (the spectators' idle, facing the camera) drawn as an extra mover next to the animal
// (the dev page patches Game.animalMovers; the game is not changed). Tries the seeds in turn for a farm whose herd has the animal; one headless Edge,
// closed when done. The picture is cropped round the animal and the person and scaled up (--up): the game's own look at the art's resolution, small and soft.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:5188/'), animal = opt('animal', 'cow-brown'), out = opt('out', 'camera.png'), person = opt('person', 'spec_m_dad');
const seeds = opt('seeds', '101,102,103,104,105').split(','), dpr = +opt('dpr', '2'), up = +opt('up', '2');
const [CW, CH] = opt('crop', '440x300').split('x').map(Number);
const W = 1280, H = 800;
mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let done = false;
try {
  for (const seed of seeds) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('[pageerror]', e.message));
    await page.goto(`${base}?start=range&stamp=0&seed=${seed}`);
    await page.waitForFunction(() => window.__game?.ready, null, { timeout: 180000 });
    await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
    await page.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.setShowGrid(false); window.__night = 0; g.nightAmount = () => window.__night; });
    await page.waitForFunction(() => window.__game.farmsPending === 0, null, { timeout: 90000 }).catch(() => console.log('  (farms still composing)'));
    // the farm and the animal: the first of the herd with that art
    const found = await page.evaluate(async ([animal]) => {
      const g = window.__game, lib = await import('/src/game/animals-library.ts');
      const art = lib.ANIMALS.findIndex(a => a.id === animal); if (art < 0) return null;
      for (const [key, f] of g.farmAnimals) { const a = f.list.find(z => z.art === art); if (a) return { key, x: a.o.x + a.u.x * a.home[0] + a.n.x * a.home[1], y: a.o.y + a.u.y * a.home[0] + a.n.y * a.home[1], art }; }
      return null;
    }, [animal]);
    if (!found) { console.log(`seed ${seed}: no ${animal} in any herd`); await ctx.close(); continue; }
    console.log(`seed ${seed}: ${animal} in ${found.key} at ${found.x.toFixed(1)}, ${found.y.toFixed(1)}`);
    // the camera on it, closest zoom; the person added next to a grazing animal of that art (to its screen-left, 1.6 tiles away, the same ground line)
    await page.evaluate(async ([found, person]) => {
      const g = window.__game, lib = await import('/src/game/library.ts');
      const p = lib.SPECTATOR_PEOPLE.findIndex(q => q.id === `spectator:${person}`); if (p < 0) throw new Error('no such person ' + person);
      const item = lib.SPECTATOR_BASE + (p * lib.WALK_DIRS.length + lib.WALK_DIRS.indexOf('S')) * lib.SPECTATOR_FRAMES + 0; // facing the camera, idle
      g.camEase = null; g.cam.z = 0.3; g.cam.X = (found.x - found.y) * 64; g.cam.Y = (found.x + found.y) * 32;
      const orig = g.animalMovers.bind(g); window.__spot = null;
      g.animalMovers = (x0, y0, x1, y1, now) => {
        const o = orig(x0, y0, x1, y1, now);
        if (!window.__spot) {
          for (const d of o) { const id = lib.LIBRARY[d.item]?.id ?? ''; const m = /^animal:([^:]+):(\d+):(\d+)$/.exec(id); if (m && lib.ANIMALS[found.art].id === m[1] && +m[3] < 4) { window.__spot = { x: d.x, y: d.y, id }; break; } }
        }
        const s = window.__spot; if (!s) return o;
        const x = s.x - 1.13, y = s.y + 1.13; // screen-left by 1.6 tiles
        return o.concat([{ item, x, y, flip: false, scale: 1, x0: x - 0.35, y0: y - 0.35, x1: x + 0.35, y1: y + 0.35, moving: true }]);
      };
    }, [found, person]);
    await page.waitForFunction(() => window.__spot, null, { timeout: 120000 }).catch(() => console.log('  (no grazing animal seen)'));
    const spot = await page.evaluate(() => window.__spot);
    if (!spot) { await ctx.close(); continue; }
    // the camera on the pair's middle, then a settled moment (the ground bakes in)
    await page.evaluate(([s]) => { const g = window.__game, x = s.x - 0.56, y = s.y + 0.56; g.cam.X = (x - y) * 64; g.cam.Y = (x + y) * 32; g.cam.z = 0.3; }, [spot]);
    await page.evaluate(() => { window.__calm = 0; });
    await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 40000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
    // (the animal may have moved off while it settled: take it again as it is now, then shoot at once)
    const still = await page.evaluate(() => window.__spot);
    const png = await page.screenshot({ type: 'png' });
    const cw = Math.round(CW * dpr), ch = Math.round(CH * dpr), left = Math.max(0, Math.round(W * dpr / 2 - cw / 2)), top = Math.max(0, Math.round(H * dpr / 2 - ch / 2));
    await sharp(png).extract({ left, top, width: Math.min(cw, W * dpr - left), height: Math.min(ch, H * dpr - top) }).resize({ width: Math.round(cw * up), kernel: 'lanczos3' }).png().toFile(out);
    console.log(`camera shot: ${out} (animal ${spot.id}; at the end ${still?.id})`);
    await ctx.close(); done = true; break;
  }
} catch (e) { console.log('[error]', e); }
finally { await browser.close(); }
process.exit(done ? 0 : 1);
