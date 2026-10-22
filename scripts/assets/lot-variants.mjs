// The baked house lots the game places (one sprite per lot): for each lot size, front-facing and rear variants, each with its
// own house (dealt from a shuffled deck so no two variants share one), story, car and seed. Deterministic: prep-sprites.mjs
// renders them into the atlas; `node scripts/assets/lot-variants.mjs` writes a contact sheet to output/lots/.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { LIB, LIB_DIR, render, toScreen } from './lot-render.mjs';
import { findGlows, shines } from './find-glows.mjs';
import { CARS, HOUSES, REARS, RUNDOWN, fitsLot, half, keepInBakedLot, layoutLot, ownerScale } from './lot-layout.mjs';
import { ROOT } from './source.mjs';
import { applyLotEdits, readLotEdits } from './overrides.mjs';

/** the lot sizes the town makes (tiles: w along the street x d deep; 2 m per tile) and how many variants each gets */
export const LOT_SIZES = [{ w: 8, d: 15, front: 10, rear: 6 }];
const FRONT_STORIES = ['family', 'retired', 'worker', 'party', 'dreamer', 'mechanic', 'family', 'retired', 'neglected', 'party'];
const REAR_STORIES = ['family', 'party', 'retired', 'dreamer', 'worker', 'neglected'];

const shuffle = (a, seed) => { const b = [...a]; let x = seed >>> 0; for (let i = b.length - 1; i > 0; i--) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; const j = x % (i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
/** the screen box (native px) that holds every placement's picture and the lot's own diamond */
export function boundsOf(items, W, D) {
  const c = [toScreen(0, 0), toScreen(W, 0), toScreen(0, D), toScreen(W, D)];
  let x0 = Math.min(...c.map(p => p[0])), y0 = Math.min(...c.map(p => p[1])), x1 = Math.max(...c.map(p => p[0])), y1 = Math.max(...c.map(p => p[1]));
  for (const s of items) {
    const it = LIB.get(s.id); if (!it) continue;
    const k = s.scale ?? 1, [mx, my] = toScreen(s.x, s.y), l = s.flip ? mx - (it.w - it.ax) * k : mx - it.ax * k, t = my - it.ay * k;
    x0 = Math.min(x0, l); y0 = Math.min(y0, t); x1 = Math.max(x1, l + it.w * k); y1 = Math.max(y1, t + it.h * k);
  }
  return [Math.floor(x0) - 2, Math.floor(y0) - 2, Math.ceil(x1) + 2, Math.ceil(y1) + 2];
}

/** every variant: { id, name, W, D (metres), rear, story, items, raw (the layout before the owner's edits, with any swapped house),
 *  houseIdx (the house's index in raw: the owner's edits are keyed by index), house: { id, x, y, scale }, swapped (the house rejected,
 *  when another stands in its place) }.
 *  The owner rejects a lot's house in the sprite studio (Lots tab: Delete on the house). The lot then gets another house of its pool in
 *  the same spot (its front wall where the old one's was, centred on it), so the owner's other edits, keyed by index, still apply: the
 *  first in the pool's deck order that no other lot uses, no lot has rejected, and whose footprint fits within the old house's (a little
 *  slack; else the smallest that fits the lot). A lot's rejects are its deleted original plus its edits' `houseRejects` list (a replacement
 *  deleted in turn). The deck itself never changes (a lot's layout and so its indices depend on it). */
export function lotVariants() {
  const out = [], all = readLotEdits(), plans = [];
  for (const sz of LOT_SIZES) {
    const W = sz.w * 2, D = sz.d * 2;
    for (const rear of [false, true]) {
      const n = rear ? sz.rear : sz.front, stories = rear ? REAR_STORIES : FRONT_STORIES;
      const houses = shuffle((rear ? REARS : HOUSES).filter(id => fitsLot(id, W, D)), 7 + sz.w * 31 + (rear ? 1 : 0)), cars = shuffle(CARS, 11 + sz.d);
      for (let i = 0; i < n; i++) {
        const story = stories[i % stories.length], seed = 1000 * sz.w + 100 * (rear ? 1 : 0) + i + 1;
        const l = layoutLot({ W, D, rear, story, seed, house: story === 'neglected' && !rear ? undefined : houses[i % houses.length], car: cars[i % cars.length] });
        const id = `lot:${sz.w}x${sz.d}-${rear ? 'rear' : 'front'}-${i}`, e = all[id] ?? {};
        const houseIdx = l.items.findIndex(p => p.id === l.house.id && Math.abs(p.x - l.house.x) < 1e-6 && Math.abs(p.y - l.house.y) < 1e-6);
        const rejects = [...(houseIdx >= 0 && e[houseIdx]?.del ? [l.house.id] : []), ...(e.houseRejects ?? [])];
        plans.push({ sz, i, W, D, rear, story, l, id, e, houseIdx, rejects, pool: rear ? REARS : story === 'neglected' && RUNDOWN.length ? RUNDOWN : houses });
      }
    }
  }
  // the houses rejected anywhere are used nowhere; the houses kept are not dealt again
  const rejected = new Set(plans.flatMap(p => p.rejects)), used = new Set(plans.filter(p => !p.rejects.length).map(p => p.l.house.id)), uses = new Map();
  for (const p of plans) if (!p.rejects.length) uses.set(p.l.house.id, (uses.get(p.l.house.id) ?? 0) + 1);
  for (const p of plans) {
    const { sz, i, W, D, rear, story, l, id, e, houseIdx } = p;
    let raw = l.items, edits = all, swapped = null;
    if (p.rejects.length && houseIdx >= 0) {
      const old = l.items[houseIdx], [ohx, ohy] = half(old.id, old.scale, old.flip), front = rear ? old.y - ohy : old.y + ohy;
      const fit = (pool, slack, fresh = true) => (fresh ? pool : [...pool].sort((a, b) => (uses.get(a) ?? 0) - (uses.get(b) ?? 0))).find(h => !rejected.has(h) && (!fresh || !used.has(h)) && fitsLot(h, W, D) && (([hx, hy]) => hx <= ohx + slack && hy <= ohy + slack)(half(h, ownerScale(h), old.flip)));
      // an unused house of the pool first; with none left (the rear-view pool is small), the least used one another lot has too, rather than none
      const full = rear ? REARS : HOUSES, pick = fit(p.pool, 0.4) ?? fit(p.pool, 1.5) ?? fit(full, 1.5) ?? fit(p.pool, 1.5, false) ?? fit(full, 3, false);
      if (pick) {
        used.add(pick); uses.set(pick, (uses.get(pick) ?? 0) + 1); swapped = old.id;
        const s = +ownerScale(pick).toFixed(3), [, hy] = half(pick, s, old.flip);
        raw = l.items.map((q, k) => k === houseIdx ? { ...q, id: pick, scale: s, y: +(rear ? front + hy : front - hy).toFixed(3) } : q);
        // the house's own edit (its delete) is spent on the swap; the rest of the lot's edits apply as keyed
        const own = { ...e }; delete own[houseIdx]; edits = { ...all, [id]: own };
      }
    }
    const items = applyLotEdits(id, raw, edits).filter(q => keepInBakedLot(q.id)), h = raw[houseIdx] ?? l.house;
    out.push({ id, name: `House lot ${sz.w}x${sz.d} ${rear ? 'rear' : 'front'} ${i + 1} (${story})`, W, D, rear, story, items, raw, houseIdx, swapped,
      house: items.find(q => q.id === h.id && Math.abs(q.x - h.x) < 3) ?? h });
  }
  return out;
}

/** a variant as a library-style item: its picture (PNG at `res` px per native px) and its size, anchor (the lot centre) and
 *  footprint (the whole lot; `block` = the house, for the planner map) */
/** the night lights of the builder's sprites (its night-light.js LIGHT_TYPES; the game's copy is src/game/night-light.ts), houses by category */
const LIGHT_TYPES = [
  ['lamp', /^world:streetlamp$/], ['neon', /^world:(arcade|diner)$/],
  ['window', /^(town:(bakery|barber|fish_tackle|grocery|hardware|laundromat|pharmacy|postoffice|firestation)|ref:building-(corner-shop|corner-store|grocery|church|school)|world:(video_rental|video|church|school|primary_school|diner_v2))/],
  ['porch', /^(world:house_\d|gen:house-|gen:back-|expansion:(cottage|dormer|duplex|victorian|ranch)-)/], ['pumpkin', /(pumpkin|ref:halloween-pumpkin-cluster)/],
  ['lantern', /^ref:halloween-lantern$/], ['stand', /^(world:(candy_stand|vending)|town:(phone_booth|bus_stop))$/], ['fire', /^expansion:firepit$/],
];
const lightOf = it => LIGHT_TYPES.find(([, re]) => re.test(it.id))?.[0] ?? (it.category === 'Houses' || it.category === 'House backs' ? 'porch' : null);
/** a lot's night lights (the builder's spriteLights: buildings shine out of their front, +y or +x when mirrored; everything else lights the
 *  ground it stands on), in metres from the lot's anchor (its centre), and its sprites' lit windows in the lot picture's native px */
async function nightOf(v, box) {
  const lights = [], glows = [];
  for (const s of v.items) {
    const it = LIB.get(s.id); if (!it || it.flat) continue;
    const type = lightOf(it), k = s.scale ?? 1;
    if (type) {
      const b = it.base ?? { hx: it.fw || 1, hy: it.fh || 1, dx: 0, dy: 0 }; let hx = b.hx * k, hy = b.hy * k, dx = (b.dx || 0) * k, dy = (b.dy || 0) * k;
      if (s.flip) { [hx, hy] = [hy, hx]; [dx, dy] = [dy, dx]; }
      const out = type === 'porch' ? 1 : 1.6, front = type === 'porch' || type === 'window' || type === 'neon';
      const [x, y] = !front ? [s.x + dx, s.y + dy] : s.flip ? [s.x + dx + hx + out, s.y + dy] : [s.x + dx, s.y + dy + hy + out];
      lights.push({ dx: +(x - v.W / 2).toFixed(2), dy: +(y - v.D / 2).toFixed(2), type });
    }
    const own = it.glows?.length ? it.glows : shines(it.id, it.category) ? await findGlows(path.join(LIB_DIR, it.file), { id: it.id, w: it.w, cat: it.category }) : [];
    if (own.length) {
      const [mx, my] = toScreen(s.x, s.y), left = (s.flip ? mx - (it.w - it.ax) * k : mx - it.ax * k) - box[0], top = my - it.ay * k - box[1];
      for (const g of own) glows.push({ x: +(left + (s.flip ? it.w - g.x : g.x) * k).toFixed(1), y: +(top + g.y * k).toFixed(1), r: +(g.r * k).toFixed(1) });
    }
  }
  return { lights, glows };
}

export async function bakeVariant(v, res) {
  const box = boundsOf(v.items, v.W, v.D), png = await render(v.items, box, res, { lot: { W: v.W, D: v.D } });
  const [cx, cy] = toScreen(v.W / 2, v.D / 2), h = v.house, it = LIB.get(h.id), s = h.scale;
  // boxes in the game's convention: metres around the anchor, hx and hy the half extents (fw and fh are the footprint in
  // tiles, so the house's half extents in metres are fw and fh times its scale)
  return {
    png, w: box[2] - box[0], h: box[3] - box[1], ax: cx - box[0], ay: cy - box[1], ...(await nightOf(v, box)),
    boxes: [{ hx: v.W / 2, hy: v.D / 2, dx: 0, dy: 0 }],
    block: { hx: +(it.fw * s).toFixed(2), hy: +(it.fh * s).toFixed(2), dx: +(h.x - v.W / 2).toFixed(2), dy: +(h.y - v.D / 2).toFixed(2) },
  };
}

// ---- run directly: a contact sheet of every variant
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const OUT = path.join(ROOT, 'output/lots'); fs.mkdirSync(OUT, { recursive: true });
  const vs = lotVariants(), tiles = [], cell = 520;
  for (const [k, v] of vs.entries()) {
    const b = await bakeVariant(v, 0.35);
    tiles.push({ input: await sharp(b.png).resize(cell - 10, cell - 40, { fit: 'inside' }).png().toBuffer(), left: (k % 4) * cell + 5, top: Math.floor(k / 4) * cell + 5 });
    tiles.push({ input: Buffer.from(`<svg width="${cell}" height="30"><text x="6" y="20" font-size="15" fill="#fff" font-family="monospace">${v.id} ${v.story} · ${v.house.id.replace(/^variation:/, 'v:').slice(0, 30)}</text></svg>`), left: (k % 4) * cell, top: Math.floor(k / 4) * cell + cell - 32 });
    console.log(v.id, v.story, v.house.id, ownerScale(v.house.id).toFixed(2), `${b.w}x${b.h} native`);
  }
  await sharp({ create: { width: 4 * cell, height: Math.ceil(vs.length / 4) * cell, channels: 4, background: '#46522c' } }).composite(tiles).png().toFile(path.join(OUT, 'variants.png'));
}
