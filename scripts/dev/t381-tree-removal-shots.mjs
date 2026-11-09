// T381 (#1037, the owner, 2026-11-08: "I wanted to bulldoze some trees but I could not." / "tried the Rub out button on paint for trees and it does nothing."):
// the in-game run, on the grown town fixture (a forest, a river with its tree belts, the town's trees, the road network's street trees). For each kind of tree
// (planted by the brush, the forest's, the river belt's, the town's, a road's) it counts the trees in a circle, takes them with the real pointer (Paint > Trees
// > Erase, the Rub out brush; the bulldozer's click on one tree and its drag over a stand), checks the count it says, that none is left, that none comes back when
// the cells are planted again, and that undo gives them all back and redo takes them again; then the save and a reload. Prints each check (a failed one exits 1).
// It reads the game by what both versions have (the sprites' footprints, the cells' lists, the road trees' keys), so the same run on the code before the fix
// shows its checks failing: the forest's, belt's, town's and road's trees do not come out at all and nothing says so.
//   node scripts/dev/t381-tree-removal-shots.mjs --base http://localhost:5188/ --out E:/ClaudeTemp/T381 --tag after [--fixture range20] [--zoom 0.3]
// Needs a dev server (vite) on --base. One headless Edge, closed when done; a fresh profile.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://localhost:5188/'), out = opt('out', 'output/t381-shots'), tag = opt('tag', 'after'), fixture = opt('fixture', 'range20'), Z = +opt('zoom', '0.3');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => { window.__calm = 0; });
  await page.waitForFunction(() => { const g = window.__game; window.__calm = g.ground.busy === 0 && g.perf.chunksPending === 0 ? window.__calm + 1 : 0; return window.__calm > 20; }, null, { timeout: 90000, polling: 50 }).catch(() => console.log('  (settle timed out)'));
  await page.waitForTimeout(500);
};
const shot = async (page, name) => { const f = join(out, `${tag}-${name}.jpg`); await sharp(await page.screenshot({ type: 'png' })).jpeg({ quality: 86, mozjpeg: true }).toFile(f); console.log('  ' + f); };
const look = (page, p, z = Z) => page.evaluate(([x, y, z]) => { const g = window.__game; g.camEase = null; g.lookAt(x, y, z); g.emit(); }, [p.x, p.y, z]);
const screenOf = (page, p) => page.evaluate(([x, y]) => { const g = window.__game, q = g.screen(x, y); return { x: q.x / g.dpr, y: q.y / g.dpr }; }, [p.x, p.y]);
/** the trees by kind inside the circle (x, y, r tiles): planted (Prop.plant), the forest's, the river belts' (the tail of a forest cell's list), the town's, the road network's */
const census = (page, x, y, r) => page.evaluate(([x, y, r]) => window.__t381.census(x, y, r), [x, y, r]);
const toasts = page => page.evaluate(() => window.__toasts.splice(0));
let step = 0;
async function section(name, fn) { step++; console.log(`\n== ${step}. ${name}`); try { await fn(); } catch (e) { bad++; console.log(`FAIL (threw) ${String(e.message).split('\n')[0]}`); } }
/** the woodland's densest 24 x 24 window of the map (tiles): where the forest is thick */
const woodland = page => page.evaluate(() => {
  const g = window.__game, cls = g.terrain.cls, MAP = Math.round(Math.sqrt(cls.length)); let best = null;
  for (let y = 64; y < MAP - 96; y += 8) for (let x = 64; x < MAP - 96; x += 8) { let n = 0; for (let j = 0; j < 24; j += 3) for (let i = 0; i < 24; i += 3) if (cls[(y + j) * MAP + x + i] === 2) n++; if (!best || n > best.n) best = { x: x + 12, y: y + 12, n }; }
  return best;
});
/** a pixel on a tree's picture where the bulldozer's pick finds it (the fixed game: frontAt), else a point above its foot */
async function pixelOn(page, foot, match) {
  for (let dy = 0; dy >= -60; dy -= 3) for (const dx of [0, 4, -4, 8, -8, 12, -12]) {
    const ok = await page.evaluate(([mx, my, m]) => { const g = window.__game; if (!g.frontAt) return null; const f = g.frontAt(mx, my); return !!f && (m.tk !== undefined ? f.tk === m.tk : f.auto === m.auto); }, [foot.x + dx, foot.y + dy, match]);
    if (ok === null) return { x: foot.x, y: foot.y - 10 };
    if (ok) return { x: foot.x + dx, y: foot.y + dy };
  }
  return null;
}
try {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
  page.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${base}?fixture=${fixture}`, { timeout: 300000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
  await page.evaluate(() => {
    const g = window.__game; g.prebake = () => {}; g.closeWelcome?.(false); g.setSpeed(0); window.__night = 0; g.nightAmount = () => 0;
    window.__toasts = []; const t0 = g.toast.bind(g); g.toast = (t, k) => { window.__toasts.push(t); return t0(t, k); };
    const pos = k => ({ x: Math.floor(k / 262144) / 64, y: (k % 262144) / 64 });
    // a forest or town sprite's place: its key's (the fixed game) else the middle of its footprint (both)
    const at = p => p.tk !== undefined ? pos(p.tk) : { x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2 };
    const autoAt = key => { const m = /^(?:r?b?tree)@(-?[\d.]+),(-?[\d.]+)$/.exec(key); return m ? { x: +m[1], y: +m[2] } : null; };
    window.__t381 = {
      at, autoAt,
      census(x, y, r) {
        const c = { planted: 0, forest: 0, belt: 0, town: 0, auto: 0 }, inC = q => (q.x - x) ** 2 + (q.y - y) ** 2 <= r * r;
        for (const p of g.props) if (p.plant && inC({ x: p.x, y: p.y })) c.planted++;
        for (const [key, ps] of g.forest) { const nb = g.beltN.get(key) ?? 0; ps.forEach((p, i) => { if (!inC(at(p))) return; if (i >= ps.length - nb) c.belt++; else c.forest++; }); }
        for (const ps of g.townTrees.values()) for (const p of ps) if (inC(at(p))) c.town++;
        for (const k of g.autoByKey.keys()) { const q = autoAt(k); if (q && inC(q)) c.auto++; }
        return c;
      },
      /** a tree sprite of the forest ('forest') or the belts' tail ('belt') or the town ('town') nearest the point, with its place and key */
      nearest(kind, x, y) {
        let best = null, bd = Infinity;
        const see = p => { const q = at(p), d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = { tk: p.tk, x: q.x, y: q.y }; } };
        if (kind === 'forest' || kind === 'belt') for (const [key, ps] of g.forest) { const nb = g.beltN.get(key) ?? 0; ps.forEach((p, i) => { if ((kind === 'belt') === (i >= ps.length - nb)) see(p); }); }
        if (kind === 'town') for (const ps of g.townTrees.values()) for (const p of ps) see(p);
        return best;
      },
      /** the densest spot of a kind: the cell of that store with the most trees, its middle tree's place */
      densest(kind) {
        let best = null;
        for (const [key, ps] of kind === 'town' ? g.townTrees : g.forest) {
          const nb = kind === 'town' ? 0 : g.beltN.get(key) ?? 0, mine = ps.filter((p, i) => kind === 'belt' ? i >= ps.length - nb : kind === 'forest' ? i < ps.length - nb : true);
          if (!best || mine.length > best.n) best = { n: mine.length, mid: mine.length ? at(mine[Math.floor(mine.length / 2)]) : null };
        }
        return best && best.mid ? { n: best.n, ...best.mid } : null;
      },
    };
  });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await settle(page, 1500);
  const R = await page.evaluate(() => window.__game.paint.plant.trees.r);
  console.log(`the Trees brush radius ${R} tiles; whole-map census`, JSON.stringify(await census(page, 0, 0, 1e9)));

  /** the Trees brush's Rub out with the real pointer on tile p, then every check that goes with it; kinds: the census keys that must be emptied */
  async function rubOutAt(label, p, kinds) {
    await look(page, p); await settle(page);
    const before = await census(page, p.x, p.y, R), n0 = kinds.reduce((a, k) => a + before[k], 0);
    console.log(`  ${label}: before ${JSON.stringify(before)}`);
    check(n0 >= 3, `${label}: trees to rub out (${n0})`);
    await shot(page, `${label}-1-before`);
    await page.evaluate(() => { const g = window.__game; g.setTool('paint'); g.paint.setPlant('trees'); g.paint.rubOut = true; g.emit(); });
    const s = await screenOf(page, p); await page.mouse.move(s.x, s.y); await page.waitForTimeout(250);
    await toasts(page); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(500);
    const say = await toasts(page), after = await census(page, p.x, p.y, R);
    console.log(`  ${label}: after ${JSON.stringify(after)}; said ${JSON.stringify(say)}`);
    check(kinds.every(k => after[k] === 0), `${label}: no ${kinds.join(' / ')} tree left in the circle`);
    check(say.some(t => new RegExp(`Rubbed out ${n0} trees?`).test(t)), `${label}: it says how many it took (${n0})`);
    await settle(page); await shot(page, `${label}-2-rubbed-out`);
    // the cells planted again (something built beside them, the camera back): none of them comes back
    await page.evaluate(() => window.__game.dropTownTrees(0, 0, 1e5, 1e5)); await settle(page, 1500);
    const again = await census(page, p.x, p.y, R); check(kinds.every(k => again[k] === 0), `${label}: still none after the cells are planted again (${JSON.stringify(again)})`);
    // undo gives them back, redo takes them away again
    await page.evaluate(() => window.__game.paint.undoTop()); await settle(page, 1500);
    const back = await census(page, p.x, p.y, R); check(kinds.reduce((a, k) => a + back[k], 0) === n0, `${label}: undo gives all ${n0} back (${JSON.stringify(back)})`);
    await shot(page, `${label}-3-undone`);
    await page.evaluate(() => window.__game.paint.redoTop()); await settle(page, 1200);
    const redo = await census(page, p.x, p.y, R); check(kinds.every(k => redo[k] === 0), `${label}: redo takes them away again (${JSON.stringify(redo)})`);
    await page.evaluate(() => window.__game.paint.undoTop()); await settle(page, 1200); // (put back for the bulldozer's turn)
  }

  await section('Rub out takes the forest\'s trees', async () => {
    const spot = await woodland(page); console.log('  woodland at', JSON.stringify(spot)); await look(page, spot); await settle(page, 1500);
    const t = await page.evaluate(([x, y]) => window.__t381.nearest('forest', x, y), [spot.x, spot.y]); check(!!t, 'a forest tree near the woodland');
    if (t) await rubOutAt('forest', { x: t.x, y: t.y }, ['forest', 'belt', 'town', 'auto']);
  });
  await section('Rub out takes the river belts\' trees', async () => {
    const at = await page.evaluate(() => {
      const g = window.__game, MAP = Math.round(Math.sqrt(g.terrain.cls.length)), ws = g.terrain.waters, w = ws.find(q => q.kind === 'river') ?? ws[0], pts = w.pts.filter(p => p.x > 100 && p.y > 100 && p.x < MAP - 100 && p.y < MAP - 100);
      return pts[Math.floor(pts.length / 2)] ?? null;
    });
    console.log('  river at', JSON.stringify(at)); await look(page, at); await settle(page, 1500);
    const d = await page.evaluate(() => window.__t381.densest('belt')); check(!!d && d.n >= 3, `belt trees planted (${d?.n})`);
    if (d) await rubOutAt('belt', { x: d.x, y: d.y }, ['belt']);
  });
  await section('Rub out takes the town\'s trees', async () => {
    const c = await page.evaluate(() => { const g = window.__game, h = g.golf?.clubhouse; return h ? { x: h.x, y: h.y } : { x: 512, y: 512 }; });
    await look(page, c, 0.12); await settle(page, 1500);
    const d = await page.evaluate(() => window.__t381.densest('town')); check(!!d && d.n >= 3, `town trees planted (${d?.n})`);
    if (d) await rubOutAt('town', { x: d.x, y: d.y }, ['town']);
  });
  await section('Rub out takes the trees a brush planted (as before) and counts them', async () => {
    const p = await page.evaluate(() => { const g = window.__game, h = g.golf?.clubhouse ?? { x: 512, y: 512 }; return { x: h.x + 20, y: h.y + 20 }; });
    await look(page, p); await settle(page);
    const n = await page.evaluate(([x, y]) => { const g = window.__game, ids = g.plantPool('trees').map(q => q.id).slice(0, 4); return g.plantProps(ids, x, y, 5, 1.6, [1, 1], 7); }, [p.x, p.y]);
    check(n >= 3, `planted ${n} trees`);
    if (n >= 3) await rubOutAt('planted', p, ['planted']);
  });

  await section('The bulldozer takes one tree with a click, a stand with a drag, with a count, and undo gives them back', async () => {
    const spot = await woodland(page); await look(page, spot); await settle(page, 1500);
    await page.evaluate(() => { const g = window.__game; g.setTool('bulldoze'); g.emit(); });
    const t = await page.evaluate(([x, y]) => window.__t381.nearest('forest', x, y), [spot.x, spot.y]);
    const foot = await screenOf(page, t), hit = await pixelOn(page, foot, { tk: t.tk });
    check(!!hit, 'a pixel on the tree where the bulldozer picks it');
    const c0 = await census(page, t.x, t.y, 0.5), total0 = await page.evaluate(() => window.__game.perf.forest);
    if (hit) {
      await toasts(page); await page.mouse.move(hit.x, hit.y); await page.waitForTimeout(200); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(500);
      const say = await toasts(page), c1 = await census(page, t.x, t.y, 0.5), total1 = await page.evaluate(() => window.__game.perf.forest);
      console.log(`  click: ${JSON.stringify(c0)} -> ${JSON.stringify(c1)}; forest count ${total0} -> ${total1}; said ${JSON.stringify(say)}`);
      check(c0.forest >= 1 && c1.forest === c0.forest - 1, 'the click took that one tree'); check(total1 === total0 - 1, 'and only that one'); check(say.includes('Removed 1 tree'), 'it says "Removed 1 tree"');
      await page.evaluate(() => window.__game.paint.undoTop()); await settle(page, 1500);
      check((await census(page, t.x, t.y, 0.5)).forest === c0.forest, 'undo gives it back');
    }
    // a drag across the stand
    const A = { x: t.x - 12, y: t.y - 8 }, B = { x: t.x + 12, y: t.y + 8 }, sa = await screenOf(page, A), sb = await screenOf(page, B), mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const near = async () => { const c = await census(page, mid.x, mid.y, 30); return c.forest + c.belt + c.town; };
    const n0 = await near(); await shot(page, 'bulldoze-1-before');
    await toasts(page); await page.mouse.move(sa.x, sa.y); await page.waitForTimeout(150); await page.mouse.down();
    for (let i = 1; i <= 24; i++) { await page.mouse.move(sa.x + (sb.x - sa.x) * i / 24, sa.y + (sb.y - sa.y) * i / 24); await page.waitForTimeout(30); }
    await page.mouse.up(); await page.waitForTimeout(500);
    const say = await toasts(page), n1 = await near(), took = n0 - n1, said = say.map(s => /^Removed (\d+) trees?$/.exec(s)?.[1]).find(Boolean);
    console.log(`  drag: trees near ${n0} -> ${n1}; said ${JSON.stringify(say)}`);
    check(took >= 5, `the drag took a stand of trees (${took})`); check(Number(said) === took, `and says how many (${said} = ${took})`);
    await settle(page); await shot(page, 'bulldoze-2-after-drag');
    await page.evaluate(() => window.__game.paint.undoTop()); await settle(page, 1800);
    check((await near()) === n0, `undo gives all ${n0} back`); await shot(page, 'bulldoze-3-undone');
  });

  await section('A road\'s own tree (a street tree) goes with the bulldozer and stays away when the road is rebuilt', async () => {
    // the grown town has no road with trees: lay a boulevard (its median is tree-lined) through the woodland, as the road tool does (the editor's legs, then the commit)
    const spot = await woodland(page), laid = await page.evaluate(async ([x, y]) => {
      const g = window.__game, N = await import('/src/game/network.ts'), cls = N.CLASSES.find(c => c.id === 'boulevard');
      g.edit.addLegs([{ a: { x: x - 30, y }, b: { x: x + 30, y } }], cls, 0); g.commitNetwork();
      let n = 0; for (const k of g.autoByKey.keys()) if (/^tree@/.test(k)) n++; return n;
    }, [spot.x, spot.y]);
    console.log(`  a boulevard laid at ${spot.x},${spot.y}: ${laid} road trees`);
    const a = await page.evaluate(([x, y]) => { for (const k of window.__game.autoByKey.keys()) { const q = window.__t381.autoAt(k); if (q && Math.abs(q.x - x) < 28 && Math.abs(q.y - y) < 4) return { auto: k, x: q.x, y: q.y }; } return null; }, [spot.x, spot.y]);
    check(!!a, 'a road tree to take'); if (!a) return;
    await look(page, a); await settle(page);
    await shot(page, 'roadtree-1-before');
    await page.evaluate(() => { const g = window.__game; g.setTool('bulldoze'); g.emit(); });
    const foot = await screenOf(page, a), hit = await pixelOn(page, foot, { auto: a.auto });
    check(!!hit, 'a pixel on the road tree'); if (!hit) return;
    await toasts(page); await page.mouse.move(hit.x, hit.y); await page.waitForTimeout(200); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(500);
    const say = await toasts(page), gone = await page.evaluate(k => !window.__game.autoByKey.has(k), a.auto);
    check(gone, 'the road tree is gone'); check(say.includes('Removed 1 tree'), `it says "Removed 1 tree" (${JSON.stringify(say)})`);
    await settle(page); await shot(page, 'roadtree-2-removed');
    // the network makes its trees again after a rebuild: this one does not come back
    await page.evaluate(k => { const g = window.__game, r = g.autoRecs?.get(k); if (r) g.syncAutoProps([r], []); }, a.auto);
    check(await page.evaluate(k => !window.__game.autoByKey.has(k), a.auto), 'a rebuild of the roads does not bring it back');
    await page.evaluate(() => window.__game.paint.undoTop()); await settle(page, 800);
    check(await page.evaluate(k => window.__game.autoByKey.has(k), a.auto), 'undo gives it back');
  });

  // the save and the load: a new game (the fixture's page never writes its save), trees taken, the game saved to its store and the page loaded again
  await section('The save keeps the trees taken away: a reload with them gone', async () => {
    const url = `${base}?start=town&everyday=0&seed=7`, ctx2 = await browser.newContext({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 1 }), p2 = await ctx2.newPage();
    p2.on('pageerror', e => { console.log('[pageerror]', e.message); bad++; });
    const boot = async () => {
      await p2.goto(url, { timeout: 300000, waitUntil: 'domcontentloaded' }); await p2.waitForFunction(() => window.__game?.ready, null, { timeout: 300000 });
      await p2.evaluate(() => { const g = window.__game; g.prebake = () => {}; g.closeWelcome?.(false); g.setSpeed(0); });
    };
    const inCircle = (x, y, r) => p2.evaluate(([x, y, r]) => { const g = window.__game; let n = 0; for (const ps of g.forest.values()) for (const p of ps) { if (p.tk === undefined) continue; const q = { x: Math.floor(p.tk / 262144) / 64, y: (p.tk % 262144) / 64 }; if ((q.x - x) ** 2 + (q.y - y) ** 2 <= r * r) n++; } return n; }, [x, y, r]);
    try {
      await boot(); await settle(p2, 1500);
      const spot = await woodland(p2); await look(p2, spot); await settle(p2, 1500);
      const t = await p2.evaluate(([x, y]) => { const g = window.__game; let best = null, bd = Infinity; for (const ps of g.forest.values()) for (const p of ps) { if (p.tk === undefined) continue; const q = { x: Math.floor(p.tk / 262144) / 64, y: (p.tk % 262144) / 64 }, d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = q; } } return best; }, [spot.x, spot.y]);
      const before = await inCircle(t.x, t.y, R); check(before >= 3, `trees in the circle before (${before})`);
      const cut = await p2.evaluate(([x, y, r]) => window.__game.cutMapTrees(x, y, r), [t.x, t.y, R]); check(cut === before, `the cut took them (${cut} of ${before})`);
      const bytes = await p2.evaluate(() => window.__game.save()); check(bytes > 0, `the game saved (${bytes} bytes)`);
      // what the store holds
      const held = await p2.evaluate(async () => {
        const db = await new Promise((res, rej) => { const r = indexedDB.open('capital-empire', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        const buf = await new Promise((res, rej) => { const q = db.transaction('saves', 'readonly').objectStore('saves').get('town'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
        const text = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text(), d = JSON.parse(text);
        return { has: !!d.cutTrees, trees: d.cutTrees?.trees?.length ?? 0 };
      });
      console.log('  the store holds', JSON.stringify(held)); check(held.has && held.trees === cut, `the save has the ${cut} trees taken away (${held.trees})`);
      await boot(); await settle(p2, 1500);
      const size = await p2.evaluate(() => window.__game.treeCut.size); check(size >= cut, `the loaded game remembers them (${size})`);
      await look(p2, t); await settle(p2, 2000);
      const c = await inCircle(t.x, t.y, R); check(c === 0, `none of them is back after the reload (${c})`);
      await shot(p2, 'reload-trees-gone');
    } finally { await ctx2.close(); }
  });
  await ctx.close();
} finally { await browser.close(); }
console.log(bad ? `\n${bad} check(s) failed` : '\nall checks passed');
process.exit(bad ? 1 : 0);
