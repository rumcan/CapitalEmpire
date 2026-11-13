## things Where things grow
Plants, rocks and glowing things are placed by hashed scatter, not on a grid a player could see, and each kind keeps to its ground.
R: Woods hold trees, bushes and ferns; rough and meadow hold grass clumps, flowers and the odd tree; hillsides and rock hold boulders and grass; the shore holds reeds. Nothing glows and nothing is magic: it is a golf course.
R: At the feet of the cliffs lie fallen boulders of many sizes, with grass and bushes between them.
R: Nothing grows on the tee, the fairway, the green, the first cut, sand, water, a cliff face or the tee's ramp.
R: A thing's four numbers (form, size, hue, fullness) come from slow noise over the land plus its own hash.
R: On a host's course that sends its trees (T451), the trees inside the box it sent them for are the host's own, each where the host has it, of its species' build and its height and crown; outside that box the land grows its own as ever.
File: game.js
Check: function cellObjects(
Check: function hostTree(

````js file=game.js

// ---- things: the scatter of plants and rocks, per 128 x 128 px cell
const OC = 128;
const ocells = new Map();
function sprd(n) { return clamp((n - 0.5) * 2.6 + 0.5, 0, 1); }
// Trees: one rule for the whole land, near and far. A tree's place and looks come straight from the land's own function, so the tree seen 250 m away
// is the same tree, in the same place, when the golfer reaches it: nothing is swapped on the way (the idea of Nanite's levels of detail: what is far is
// the same thing, only drawn smaller). One chance per cell of about 2.5 m.
const TGC = 32 / 13;
const treeMemo = new Map();
function treeAt(gx, gy) {
  const key = (gx + 32768) * 65536 + (gy + 32768);
  let t = treeMemo.get(key); if (t !== undefined) return t;
  t = null;
  const HT = course ? course.ht : null;   // T451: inside the box a host sent its trees for, the host's tree of this cell (or none) and never one of the land's own
  if (HT) { const cx = (gx + 0.5) * TGC, cy = (gy + 0.5) * TGC; if (cx >= HT.x0 && cx <= HT.x1 && cy >= HT.y0 && cy <= HT.y1) { const s = HT.at.get(key); t = s ? hostTree(s, gx, gy) : null; treeMemo.set(key, t); return t; } }
  const q = hash2(gx, gy, SEED + 342);
  if (q < 0.26 * BTREE) {
    const x = (gx + hash2(gx, gy, SEED + 340)) * TGC, y = (gy + hash2(gx, gy, SEED + 341)) * TGC, H = hole;
    field(x, y, FO);
    const h = FO.h, dF = FO.dF, dG = FO.dG, dB = FO.dB, dT = FO.dT, dP = FO.dP, wood = FO.wood, dry = FO.dry;
    field(x + 0.4, y, FO); const hx1 = FO.h; field(x - 0.4, y, FO); const hx0 = FO.h; field(x, y + 0.4, FO); const hy1 = FO.h; field(x, y - 0.4, FO);
    const gr = Math.hypot(hx1 - hx0, hy1 - FO.h) / 0.8, m = matOf(h, gr, dF, dG, dB, dT, dP, wood, dry, 0, 0);
    const ax = x - H.tee.x, ay = y - H.tee.y, al = ax * H.rx + ay * H.ry - H.teeL;
    if ((m === M_FOREST || (m === M_ROUGH && q < 0.035) || (m === M_DEEP && q < 0.028)) && !(course && courseLineD(x, y) < 13) && gr <= 0.45 &&   // (on a real course no tree stands on a hole's line of play, nor within 13 m of it)
      dF >= 1.6 && dG >= 3 && dT >= 1.4 && dB >= 1 && !(al > -19 && al < 14 && Math.abs(ay * H.rx - ax * H.ry) < 3.6)) {   // (a lane is kept clear behind the tee, where the camera stands, and ahead of it)
      const j = (n) => hash2(gx * 17 + n, gy * 29 + n, SEED + 320), h0 = sprd(fbm(x / 52 - 7.1, y / 52 + 2.6, SEED + 312, 2));
      const c = [clamp(sprd(fbm(x / 41 + 1.7, y / 41 + 9.2, SEED + 310, 2)) + (j(0) - 0.5) * 0.4, 0, 1), clamp(0.5 + (fbm(x / 23 + 4.4, y / 23, SEED + 311, 2) - 0.5) * 1.6 + (j(1) - 0.5) * 0.6, 0, 1),
        clamp(h0 * h0 * 0.9 + (j(2) - 0.5) * 0.3, 0, 1), clamp(0.5 + (fbm(x / 13 - 2.2, y / 13 + 5.5, SEED + 313, 2) - 0.5) * 1.4 + (j(3) - 0.5) * 0.5, 0, 1)];
      const Ht = Math.round(150 + c[1] * 170);
      t = { k: K_TREE, u: Math.round(x * PPM), v: Math.round(y * PPV), lift: Math.round(h * ZP), seed: (hash2(gx * 7, gy * 3, SEED + 330) * 2147483647) | 0, c, H: Ht, rx: Math.round(Ht * (c[0] < CONT ? 0.17 + j(4) * 0.06 : 0.3 + j(4) * 0.12)), spr: null, flat: false, d: 0, sx: 0, libS: 1, born: 0, x, y, gx, gy, spk: 0, spk2: 0 };
      if (t2(c[0])) { t.H = Math.round(t.H * BT2H); t.rx = Math.round(t.H * 0.36 * BT2RX); } else if (t3(c[0])) { t.H = Math.round(t.H * BT3H); t.rx = Math.round(t.H * 0.36 * BT3RX); }   // the biome's own tree has its own build
    }
  }
  treeMemo.set(key, t);
  return t;
}
// T451: a host's tree (course.ht, made by hostTrees in parts/03b-realcourse.md): s = { x, y (m), h (height, m), cw (crown width, m), f (form: 0 conifer,
// 1 broadleaf, 2 airy broadleaf, 3 palm, 4 dead, T454: 5 cactus, 6 bush, 7 acacia), hue (0..1 along the leaf colours), p (its species' index) }. H and rx are its true size (px at PPM a
// metre), so its shadow, its reach and the far stand-in that borrows its size are right; its own sculpture is made smaller (mkTree: at most HMAX
// px tall) and drawn larger by S.sk. c[0] is set to the form's place on the land's own scale (conifer, full, airy) for whatever reads it.
const HMAX = 340;
function hostTree(s, gx, gy) {
  field(s.x, s.y, FO);
  const H = Math.max(40, Math.round(s.h * PPM)), rx = Math.max(12, Math.round(s.cw * 0.5 * PPM)), f = s.f;
  const c = [f === 0 ? 0.02 : f === 2 || f === 4 ? 0.85 : 0.45, clamp((s.h - 4) / 16, 0, 1), s.hue, f === 4 ? 0 : 0.6];
  return { k: K_TREE, u: Math.round(s.x * PPM), v: Math.round(s.y * PPV), lift: Math.round(FO.h * ZP), seed: (hash2(gx * 7, gy * 3, SEED + 331) * 2147483647) | 0, c, H, rx,
    hf: f, sp: s.p, spr: null, flat: false, d: 0, sx: 0, libS: 1, born: 0, x: s.x, y: s.y, gx, gy, spk: 0, spk2: 0 };
}
function isCon(o) { return o.hf !== undefined ? o.hf === 0 : o.c[0] < CONT; }   // a conifer: the host's word for its own trees, the land's share for the rest
// The mower's plaid (after the owner's photograph of a criss-cross fairway): strong stripes along the hole, light and dark by turns, crossed by a fainter
// set at right angles. plaid() = 2 light stripe under a light cross band, 1 light under dark, -1 dark under light, -2 dark under dark.
const MOW_W = 3.6, MOW_IN = 2.2;   // a stripe's width, m; the width of the border mown round the fairway's edge, m
function plaid(lat, along, w) { const a = Math.floor(lat / w + 500.5) & 1, b = Math.floor(along / w + 500.5) & 1; return a ? (b ? 2 : 1) : (b ? -1 : -2); }
// Each stripe ends squarely where the mower turned: whether a point is inside the striped ground is asked at the middle of its own stripe, not at the point,
// so the striped ground's edge runs in steps, a step at each stripe. dF = how far inside the fairway the point is; g* = how dF and the sideways distance
// change per metre east and south.
function stripeDF(dF, lat, gFx, gFy, gLx, gLy, w) { const den = gLx * gLx + gLy * gLy; return den > 1e-6 ? dF + ((Math.floor(lat / w + 500.5) - 500) * w - lat) * (gFx * gLx + gFy * gLy) / den : dF; }
// A green is mown finer than a fairway: a checker of narrow passes laid on the diagonal of the hole's line, and a clean-up pass or two round its edge that
// follows the outline. greenSt() = 0 on the clean-up ring, else the checker (2, 1, -1, -2 as plaid() gives them).
const GRN_W = 1.1, GRN_IN = 1.5;
function greenSt(dG, lat, along) { return dG > -GRN_IN ? 0 : plaid((lat + along) * 0.7071, (along - lat) * 0.7071, GRN_W); }
function mowLinesG(dG) { const f = (dG + 40) / 0.75; return f - Math.floor(f) < 0.22 ? -6 : 0; }
function mowLines(dF) { const f = (dF + 40) / 0.95; return f - Math.floor(f) < 0.2 ? -7 : 0; }   // the border and the first cut are mown in passes that follow the fairway's outline: a thin darker line each pass
function cellObjects(ix, iy) {
  const key = (ix + 32768) * 65536 + (iy + 32768);
  let list = ocells.get(key);
  if (list) return list;
  list = [];
  const H = hole;
  let trees = 0;
  for (let k = 0; k < 5; k++) {
    const u = ix * OC + hash2(ix * 5 + k, iy, SEED + 300) * OC, v = iy * OC + hash2(ix, iy * 5 + k, SEED + 301) * OC, q = hash2(ix * 3 + k, iy * 7 + k, SEED + 302);
    const x = u / PPM, y = v / PPV, tx = Math.floor(u / TPX), ty = Math.floor(v / TPX), T = tileAt(tx, ty);
    const tk = Math.min(64, Math.round((v - ty * TPX) * 0.25)) * TN + Math.min(64, Math.round((u - tx * TPX) * 0.25));
    const m = matOf(T.h[tk], T.g[tk], T.dF[tk], T.dG[tk], T.dB[tk], T.dT[tk], T.dP[tk], T.wood[tk], T.dry[tk], 0, 0);
    if (m <= M_CUT || m === M_CLIFF) continue;
    if (T.dF[tk] < 1.6 || T.dG[tk] < 3 || T.dT[tk] < 1.4 || T.dB[tk] < 1) continue;
    const ax = x - H.tee.x, ay = y - H.tee.y, al = ax * H.rx + ay * H.ry - H.teeL;
    if (al > -2 && al < 12 && Math.abs(ay * H.rx - ax * H.ry) < 3.2) continue;   // the ramp stays clear
    let kind = -1;
    if (m === M_FOREST) kind = q < 0.1 ? K_TREE : q < 0.2 ? K_BUSH : q < 0.42 ? K_GRASS : q < 0.47 ? K_FLOWER : q < 0.49 ? K_ROCK : -1;
    else if (m === M_ROUGH) kind = q < 0.014 ? K_TREE : q < 0.045 ? K_BUSH : q < 0.2 ? K_GRASS : q < 0.26 ? K_FLOWER : q < 0.28 ? K_ROCK : -1;
    else if (m === M_DEEP) kind = q < 0.36 ? K_GRASS : q < 0.56 ? K_FLOWER : q < 0.59 ? K_BUSH : q < 0.6 ? K_TREE : q < 0.615 ? K_ROCK : -1;
    else if (m === M_HILL) kind = q < 0.16 ? K_ROCK : q < 0.31 ? K_GRASS : q < 0.35 ? K_BUSH : -1;
    else if (m === M_ROCK) kind = q < 0.2 ? K_ROCK : q < 0.26 ? K_GRASS : -1;
    else if (m === M_MUD) kind = q < 0.6 ? K_REED : -1;
    if (kind === K_TREE) kind = -1;   // (trees have their own rule: treeAt)
    if (kind >= 0) kind = bioKind(kind, hash2(ix * 5 + k, iy * 7 - k, SEED + 305));
    const tl = T.tal[tk], qf = hash2(ix * 11 + k, iy * 13 - k, SEED + 303), pf = tl > 0.04 ? 0.16 + tl * 0.74 : 0;   // at a cliff's foot: fallen boulders, with grass and bushes come up between them
    if (qf < pf) kind = qf < pf * 0.64 ? K_ROCK : qf < pf * 0.87 ? K_GRASS : K_BUSH;
    if (kind < 0 || kind === K_BUSH || kind === K_GRASS) continue;   // (the small bushes and the grass clumps are gone, at the owner's word: they added little to the grass)
    if (kind === K_TREE) { if (T.g[tk] > 0.45) kind = K_BUSH; else if (trees++) continue; }
    const j = (n) => hash2(ix * 17 + k * 3 + n, iy * 29 + n, SEED + 320);
    const h0 = sprd(fbm(x / 52 - 7.1, y / 52 + 2.6, SEED + 312, 2));
    const c = [
      clamp((kind === K_FLOWER ? sprd(fbm(x / 19 + 1.7, y / 19 + 9.2, SEED + 310, 2)) : sprd(fbm(x / 41 + 1.7, y / 41 + 9.2, SEED + 310, 2))) + (j(0) - 0.5) * 0.4, 0, 1),
      clamp(0.5 + (fbm(x / 23 + 4.4, y / 23, SEED + 311, 2) - 0.5) * 1.6 + (j(1) - 0.5) * 0.6, 0, 1),
      clamp((kind === K_TREE || kind === K_BUSH ? h0 * h0 * 0.9 : h0) + (j(2) - 0.5) * 0.3, 0, 1),
      clamp(0.5 + (fbm(x / 13 - 2.2, y / 13 + 5.5, SEED + 313, 2) - 0.5) * 1.4 + (j(3) - 0.5) * 0.5, 0, 1)];
    const o = { k: kind, u: Math.round(u), v: Math.round(v), lift: Math.round(T.h[tk] * ZP), seed: (hash2(ix * 7 + k, iy * 3 - k, SEED + 330) * 2147483647) | 0, c, H: 0, rx: 0, spr: null, flat: false, d: 0, sx: 0, libS: 1, born: 0, x, y, gx: 0, gy: 0, spk: 0, spk2: 0 };
    if (kind === K_TREE) { o.H = Math.round(150 + c[1] * 170); o.rx = Math.round(o.H * (c[0] < CONT ? 0.17 + j(4) * 0.06 : 0.3 + j(4) * 0.12)); }
    else if (kind === K_BUSH) { o.H = Math.round(26 + c[1] * 28); o.rx = Math.round(o.H * 0.6); }
    else if (kind === K_ROCK) { o.rx = Math.round(qf < pf ? 9 + j(5) * j(5) * (20 + tl * 30) : 8 + c[1] * c[1] * 30); o.H = o.rx; }
    else if (kind === K_GRASS) o.H = Math.round(16 + c[1] * 28);
    else if (kind === K_REED) o.H = Math.round(38 + c[1] * 34);
    else if (kind === K_FLOWER) o.H = Math.round(11 + c[1] * 15);
    else if (kind === K_GLOW) o.H = Math.round(9 + c[1] * 17);
    else o.H = Math.round(12 + c[1] * 26);
    list.push(o);
  }
  { const x0 = ix * OC / PPM, y0 = iy * OC / PPV;                     // the trees that stand in this cell
    for (let gy = Math.floor(y0 / TGC) - 1; gy <= Math.floor((y0 + OC / PPV) / TGC) + 1; gy++) for (let gx = Math.floor(x0 / TGC) - 1; gx <= Math.floor((x0 + OC / PPM) / TGC) + 1; gx++) {
      const t = treeAt(gx, gy); if (t && Math.floor(t.u / OC) === ix && Math.floor(t.v / OC) === iy) list.push(t); } }
  ocells.set(key, list);
  return list;
}
function objSprite(o) {
  if (!o.spr) o.spr = o.k === K_TREE ? mkTree(o) : o.k === K_BUSH ? mkBush(o) : o.k === K_ROCK ? mkRock(o) : o.k === K_GRASS ? mkGrass(o, false) : o.k === K_REED ? mkGrass(o, true)
    : o.k === K_FLOWER ? mkFlower(o) : o.k === K_GLOW ? mkGlowcap(o) : mkCrystal(o);
  return o.spr;
}
````

## ground The ground
The ground is painted pixel by pixel in chunks of 128 x 128, each pixel with a colour, a light level and a height. Nothing is tiled: every value comes from the pixel's own place in the world.
R: Each ground has its own colour ramp and its own grain: the green is smooth, mown grass has short runs, rough has longer blade runs, sand has drifting ripples, rock has cracks.
R: Where two grounds meet, the edge is broken by noise; taller grass gets a dark lip over shorter grass, and a bunker gets a shaded back wall and a sunlit front edge.
R: The light is posterized into six bands with a dithered edge (a soft staircase); a shadow halves the light and keeps the ground's own colour and texture, never black and never a flat wash.
R: Small things are stamped into the ground by hashed scatter: grass tufts, tiny flowers in drifts, stones, fallen leaves, twigs, lichen, sand ripples.
R: Every plant and rock casts a shadow to the lower left, ragged at its rim and, under foliage, dappled with sun flecks.
R: A cliff face is rock in columns between long upright cracks; each column is a stack of big blocks (about a metre) of its own heights, parted by joints that each tilt their own way, so no block is a box. A block has its own tone; most stand proud with a lit top and sunward edge, some are set back and shaded by their neighbours; some carry a facet, a crack, a split or a cap of grass.
R: A cliff's pattern is pinned to the cliff: it stays still on the rock when the camera turns, walks or looks from far away.
R: Scree lies at the feet of the cliffs: soil and gravel with stones of many sizes on it, thinning out into the grass. The same function colours cliff pixels in a chunk and the face pixels the renderer fills in.
R: Each pixel of rough, meadow, first cut and hillside carries a blade height: clumps of blades of uneven height with gaps between, none on stones, and a flower stands at a blade's tip.
R: Mown ground shows the mower's stripes; a bunker's sand is raked in furrows that follow its shape, with a smooth pale rim.
R: Grain is clumped (small noise blobs), not sprinkled pixel by pixel, so grass reads as painted clusters; flowers grow in drifts.
File: game.js
Check: function genChunk(
Check: function faceCol(
Check: function shadeEllipse(

````js file=game.js

// ---- ground: the chunks
const G_GREEN = ramp(['#3aa15a', '#48b05c', '#58bd5e', '#6cc862', '#82d268', '#98da72']);
const G_FAIR = ramp(['#2f8a4c', '#3c9c4c', '#4dae4c', '#63be4e', '#7ccb54', '#98d660']);
const G_TEE = ramp(['#2c8c58', '#38a05a', '#48b25c', '#5cc260', '#74ce68', '#8ed874']);
const G_CUT = ramp(['#267a48', '#318c48', '#409e48', '#54ae4a', '#6cbc50', '#88c85c']);
const G_ROUGH = ramp(['#17584a', '#1e6a48', '#287c46', '#369046', '#4aa248', '#64b24e', '#84c05a']);
const G_DEEP = ramp(['#1c5a48', '#286a44', '#3a7c42', '#529044', '#70a248', '#96b454', '#c0c468']);
const G_LITTER = ramp(['#2a2a33', '#3a3536', '#4c4236', '#5e5038', '#725f3c', '#877044']);
const G_HILL = ramp(['#3e6a44', '#52803f', '#6a9440', '#86a646', '#a4b652', '#c2c466']);
const G_SOIL = ramp(['#3f2d2c', '#523a31', '#664937', '#7a593e', '#8f6b48', '#a47f56']);
const G_SAND = ramp(['#c9a36a', '#dcb97c', '#ebcd90', '#f5dda6', '#fbeabc', '#fff4d2']);
const G_WATER = ramp(['#17457e', '#1c5a9c', '#2474b6', '#3690cc', '#52acdc', '#7cc8e8', '#aee0f0']);
const G_LICHEN = ramp(['#b8863a', '#d6a84a', '#a8c088', '#c4d8a4']);

// a cliff face's colour: rock in blocks of uneven height and width, each with its own tone, a lit top, a shaded foot, dark crevices
// between them and moss on some. u, v = the ground pixel the face belongs to, zz = the height on the face (px), grain = the pixel's own noise
const ROCKB = ramp(['#2a2540', '#443a54', '#62566a', '#857278', '#a99386', '#cab49c', '#e6d5b6']);

// ---- biomes and course styles: one course, seven looks. A biome is a set of colours for every ground and every plant, how thickly trees stand, how many
// of them are conifers, and how tall the grass grows. The ramps the painters and sculptors read are overwritten in place, so nothing else changes; the
// land's makers (the page and the workers alike) are told the biome and start over. Fairways, greens and tees stay green everywhere: they are watered.
const BIO_R = { green: G_GREEN, fair: G_FAIR, tee: G_TEE, cut: G_CUT, rough: G_ROUGH, deep: G_DEEP, litter: G_LITTER, hill: G_HILL, soil: G_SOIL, sand: G_SAND, water: G_WATER, rockb: ROCKB,
  conif: CONIF, blade: BLADE, straw: STRAW, moss: MOSSR, reed: REEDR, rockr: ROCKR, rockw: ROCKW, leaf0: LEAF[0], leaf1: LEAF[1], leaf2: LEAF[2], leaf3: LEAF[3], leaf4: LEAF[4] };
const BIO_BASE = {}, GBASE0 = [0, 0, 0, 0, 0, 2, 6, 17, 2, 5, 0, 0, 0];
let BTREE = 1, CONT = 0.26, BGR = 1, BSP = 0, BFL = 1, BBU = 1, BRK = 0, BGC = 1, biomeId = 'parkland';   // (BSP: how much sparser the grass's tufts stand; BFL, BBU, BGC: how many of the flowers, bushes and grass clumps are kept; BRK: how many lost bushes become rocks)
let BSAND = 0;   // the biome's open ground is wind-blown sand (the desert)
// Sand the wind has shaped: long ripples across the wind, a little bowed and forked, each a light crest with its shadow on the lee side, strong on
// some stretches and smoothed away on others (after photographs of rippled dune sand: few tones, even spacing, calm between). Returns a change of light.
function sandRipple(u, v) {
  const x = u / PPM, y = v / PPV, amp = vnoise(x / 8.5 + 3, y / 8.5 + 9, SEED + 131); if (amp < 0.34) return 0;
  const s = (x * 0.8 + y * 0.6) / 0.95 + 2.6 * vnoise(x / 4.2, y / 4.2, SEED + 132) + 0.35 * vnoise(x / 1.3 + 5, y / 1.3, SEED + 133), f = s - Math.floor(s), k = amp > 0.5 ? 1 : (amp - 0.34) * 6.25;
  return f > 0.66 ? -Math.round(30 * k) : f > 0.48 ? -Math.round(13 * k) : f < 0.14 ? Math.round(6 * k) : 0;   /* (mostly shadow: bright sand is near the top of the light already, so a crest cannot be made much lighter; the lee is made darker) */   // (a broad light crest, a broad shadow in its lee: waves a metre apart, not grain)
}
let BT2 = 0, BT2H = 1, BT2RX = 1;   // the biome's own tree (1 palm, 2 cactus, 3 acacia), its height and its spread beside the usual tree's
function t2(c0) { return BT2 > 0 && c0 >= CONT && c0 < 0.66; }
let BT3 = 0, BT3H = 1, BT3RX = 1;   // the biome's second tree, in place of the airy broadleaf one (3: a thorn tree, the acacia's build made small)
function t3(c0) { return BT3 > 0 && c0 >= 0.66 && c0 >= CONT; }   // which trees are the biome's own: those that would be full broadleaf trees
function bioKind(kind, r) {   // the biome's own mix of small plants (r: a second chance number for this place)
  if (kind === K_FLOWER) return r < BFL ? K_FLOWER : r < BFL + 0.3 ? K_GRASS : -1;
  if (kind === K_BUSH) return r < BBU ? K_BUSH : r < BBU + BRK ? K_ROCK : -1;
  if (kind === K_GRASS) return r < BGC ? K_GRASS : -1;
  return kind;
}
const BIOMES = {
  parkland: { name: 'Parkland' },
  coastal: { name: 'Coastal', sparse: -0.02, fl: 0.45, bu: 1, rk: 0, gc: 1, trees: 0.45, conShare: 0.5, grass: 1.1,
    green: ['#3c9460', '#4aa264', '#5cb06a', '#72bc72', '#8ac87e', '#a2d28c'], fair: ['#4a8a50', '#5a9a54', '#6eaa5a', '#84b862', '#9cc46e', '#b4d07e'],
    rough: ['#5c6a48', '#70804e', '#869258', '#9ca466', '#b0b478', '#c4c48c', '#d4d2a2'], deep: ['#6a6648', '#807a54', '#989062', '#aea672', '#c2ba86', '#d2cc9c', '#e0dcb4'],   // (fescue: straw and grey-green, not lemon)
    hill: ['#6a7444', '#7e884a', '#949c54', '#aaae62', '#bebe74', '#d0cc8a'], litter: ['#3a362e', '#4c4636', '#5e5840', '#726a4a', '#867c56', '#9a9064'],
    sand: ['#b8a078', '#ccb68c', '#dcc8a0', '#e8d8b4', '#f2e6c8', '#faf2dc'], water: ['#1c3e5e', '#24527a', '#306a94', '#4484a8', '#5e9eba', '#82b8cc', '#aad0dc'],
    rockb: ['#2c2c38', '#44444e', '#606068', '#7e7e82', '#9c9a98', '#b8b4ac', '#d4cec0'], blade: ['#5a5a30', '#72703a', '#8c8846', '#a6a056', '#c0b86a', '#d8ce84'],
    leaf0: ['#1c3a34', '#28503c', '#386844', '#4e804c', '#6a9856', '#8cae66'], leaf1: ['#22423a', '#305a40', '#427248', '#5a8a52', '#78a25e', '#9ab870'], leaf2: ['#3c5230', '#526a36', '#6a823e', '#869a4a', '#a2b05a', '#c0c470'],
    leaf3: ['#5a5a1c', '#807c22', '#a69e2a', '#c8be36', '#e2d84e', '#f4ec78'], leaf4: ['#4a2a4e', '#643a66', '#804e80', '#9c669a', '#b684b2', '#d0a6cc'] },   // (gorse yellow, heather purple)
  beachside: { name: 'Beachside', tree2: 1, t2h: 1.15, t2rx: 0.95, fl: 0.8, bu: 0.8, rk: 0, gc: 0.8, trees: 0.6, conShare: 0.02, grass: 1,
    green: ['#34a860', '#44b862', '#58c666', '#70d26c', '#8adc76', '#a4e486'], fair: ['#2e9a4e', '#3cac50', '#50bc54', '#68ca5a', '#84d664', '#a2e074'],
    rough: ['#1e6e52', '#288252', '#369654', '#4aa858', '#62b860', '#80c66e', '#a2d284'], deep: ['#2a6e4a', '#3c8248', '#54964a', '#70a850', '#90b85c', '#b0c66e', '#d0d288'],
    hill: ['#5a8a4a', '#70a04c', '#88b452', '#a2c45e', '#bcd270', '#d4de88'], sand: ['#d8c49a', '#e6d4ac', '#f0e2c0', '#f8eed2', '#fdf6e2', '#fffcf0'],
    water: ['#0e5a7a', '#127694', '#1a92ac', '#2caec0', '#4cc8d0', '#7adcdc', '#aeece8'], rockb: ['#3a3440', '#544a52', '#706466', '#8e807c', '#ac9e94', '#c8bcac', '#e2d8c6'],
    leaf2: ['#1c5a36', '#2a7a3c', '#40983e', '#62b442', '#8ccc4c', '#bce064'] },
  desert: { name: 'Desert', sandy: 1, tree2: 2, t2h: 0.55, t2rx: 0.45, tree3: 3, t3h: 0.5, t3rx: 1.05, gb: [0, 0, 0, 0, 0, 1, 1, 3, 0, 1, 0, 0, 0], sparse: 0.6, fl: 0.06, bu: 0.55, rk: 0.35, gc: 0.35, trees: 0.22, conShare: 0, grass: 0.3,
    rough: ['#a07c50', '#b4905e', '#c6a46e', '#d4b680', '#e0c692', '#ead4a6', '#f2e0ba'], deep: ['#96724a', '#aa8658', '#bc9a68', '#ccae7a', '#dac08c', '#e6d0a0', '#f0deb6'],   // (more sand than grass: the rough is pale sand with a little dry grass in it)
    hill: ['#9c7650', '#b08a5c', '#c29e6a', '#d2b27c', '#e0c490', '#ecd4a6'], litter: ['#b89060', '#caa472', '#d8b684', '#e4c696', '#eed4a8', '#f6e0ba'], moss: ['#a88456', '#bc9866', '#ccac78', '#dabe8a', '#e6ce9e'],   // (where a wood's floor would lie, far from the fairway: soft sand, no green in it)
    soil: ['#8a6442', '#a0784e', '#b48c5c', '#c6a06c', '#d6b47e', '#e4c692'], sand: ['#cfa66e', '#dfba80', '#ecca92', '#f4d8a6', '#f9e4ba', '#fdeece'],
    rockb: ['#4a2420', '#6a3428', '#8a4834', '#a85e42', '#c27852', '#d89468', '#e8b488'], rockr: ['#5a342c', '#744438', '#8e5846', '#a86e56', '#c08868', '#d4a47e', '#e4c098'], rockw: ['#6a3a2a', '#864a32', '#a05e3e', '#b8764c', '#cc905e', '#deac76', '#ecc692'],
    blade: ['#5a5a34', '#6e7040', '#84864c', '#9c9c5a', '#b4b26c', '#cac682'], straw: ['#6a5430', '#866a38', '#a28244', '#bc9a54', '#d2b26a', '#e4ca86'],
    leaf0: ['#3a4a34', '#4a5c3c', '#5e7046', '#748452', '#8e9a62', '#aab078'], leaf1: ['#44503a', '#566442', '#6a784c', '#829058', '#9ca668', '#b8bc80'], leaf2: ['#5a5a34', '#70703c', '#888846', '#a0a054', '#b8b866', '#d0cc80'],
    leaf3: ['#6a4a2c', '#846034', '#9e783e', '#b6904c', '#cca860', '#dec07a'], leaf4: ['#5a5a34', '#70703c', '#888846', '#a0a054', '#b8b866', '#d0cc80'] },
  savanna: { name: 'Savanna', tree2: 3, t2h: 0.8, t2rx: 1.25, gb: [0, 0, 0, 0, 0, 3, 9, 22, 6, 10, 0, 0, 0], sparse: 0.05, fl: 0.15, bu: 0.5, rk: 0.1, gc: 1, trees: 0.2, conShare: 0, grass: 1.15,
    green: ['#4a9a52', '#5aa856', '#6eb65c', '#84c264', '#9ace70', '#b0d880'], fair: ['#5a8a44', '#6c9a48', '#80aa4e', '#96b856', '#acc462', '#c2d074'],
    rough: ['#6e6a30', '#848038', '#9c9642', '#b4aa50', '#c8bc62', '#d8cc78', '#e6da92'], deep: ['#7a6428', '#927a30', '#aa903c', '#c0a64c', '#d2ba60', '#e0cc78', '#ecdc94'],
    hill: ['#84743a', '#9a8a42', '#b09e4e', '#c4b25e', '#d4c472', '#e2d48a'], litter: ['#4a3c28', '#5e4c30', '#725e3a', '#867046', '#9a8454', '#ae9864'],
    sand: ['#c49a62', '#d6ae74', '#e4c088', '#eed09c', '#f6deb2', '#fceac8'], rockb: ['#3a2c28', '#544038', '#70584a', '#8c725e', '#a88e74', '#c2aa8c', '#dac6a6'],
    blade: ['#6a6430', '#827c38', '#9c9644', '#b6ae54', '#cec468', '#e2d882'],
    leaf0: ['#2e4a2a', '#3e5e30', '#527436', '#6a8a3e', '#86a04a', '#a6b65c'], leaf1: ['#3c5228', '#50682e', '#688034', '#84983e', '#a2ae4c', '#c0c460'], leaf2: ['#5a5e28', '#727830', '#8c923a', '#a6aa48', '#c0c05a', '#d8d472'],
    leaf3: ['#7a5a22', '#96722a', '#b28c34', '#caa644', '#debe5a', '#eed476'], leaf4: ['#5a5e28', '#727830', '#8c923a', '#a6aa48', '#c0c05a', '#d8d472'] },
  jungle: { name: 'Jungle', gb: [0, 0, 0, 0, 0, 3, 8, 20, 9, 8, 0, 0, 0], sparse: -0.05, fl: 1, bu: 1, rk: 0, gc: 1, trees: 1.7, conShare: 0, grass: 1.3,
    green: ['#2aa056', '#38b05a', '#4abe5e', '#60ca64', '#7ad66e', '#94e07e'], fair: ['#1e8a44', '#2a9c46', '#3aae4a', '#50be50', '#6acc5a', '#88d86a'],
    rough: ['#0e4a3a', '#145c3c', '#1c703e', '#288442', '#3a9848', '#52aa52', '#70ba62'], deep: ['#0c4234', '#125436', '#1a683a', '#267c40', '#389048', '#50a254', '#70b266'],
    hill: ['#1e5a38', '#2a6e3a', '#3a823e', '#4e9646', '#66a852', '#82b862'], litter: ['#1c2420', '#283228', '#364232', '#46543c', '#586648', '#6a7a56'],
    water: ['#0e3e4a', '#14525a', '#1c686c', '#2a807e', '#40988e', '#60b0a0', '#8ac8b6'], rockb: ['#1e2a2a', '#30403c', '#465850', '#607266', '#7c8c7e', '#9aa698', '#b8c0b2'],
    leaf3: ['#0a3a2a', '#0f5234', '#186c3c', '#2a8a44', '#48a84e', '#72c45c'], leaf4: ['#14402a', '#1e5c30', '#2e7a36', '#4a9a3c', '#72b844', '#a4d455'] },
  snow: { name: 'Snow', gb: [0, 0, 0, 0, 0, 1, 2, 5, 1, 2, 0, 0, 0], sparse: 0.4, fl: 0, bu: 0.5, rk: 0.2, gc: 0.4, trees: 0.9, conShare: 0.85, grass: 0.35,
    green: ['#4c9a72', '#5ca87c', '#70b688', '#88c496', '#a2d0a6', '#bcdcb8'], fair: ['#4a8a6a', '#5a9a74', '#6eaa80', '#86ba8e', '#a0c8a0', '#bcd6b6'],
    rough: ['#7a8ea4', '#92a4b8', '#aabaca', '#c0cedb', '#d6e0ea', '#e8eef4', '#f6f9fc'], deep: ['#6e86a0', '#869cb4', '#9eb2c6', '#b8c8d8', '#d0dce8', '#e4ecf2', '#f4f8fb'],
    hill: ['#8a9cb2', '#a0b0c4', '#b6c4d4', '#ccd8e4', '#e0e8f0', '#f2f6fa'], litter: ['#3a3e4c', '#4e5462', '#666c7a', '#808694', '#9ca2ae', '#b8bec8'],
    soil: ['#4a4650', '#5e5a64', '#74707a', '#8c8892', '#a6a2aa', '#c0bcc4'], sand: ['#b8b4ac', '#cac6be', '#dad8d0', '#e8e6e0', '#f2f1ec', '#fafaf6'],
    water: ['#1c3a5c', '#284e74', '#38668e', '#5082a6', '#70a0be', '#98bed4', '#c2dae8'], rockb: ['#2e3444', '#454c5c', '#606878', '#7e8694', '#9ea6b0', '#bec4cc', '#dde2e6'],
    conif: ['#12262e', '#183a3c', '#22504a', '#346a5c', '#8eb0aa', '#e8f0f0'], blade: ['#5a6e7a', '#72868f', '#8c9ea6', '#a8b8be', '#c6d2d6', '#e6eef0'], straw: ['#7a7260', '#948c78', '#aea690', '#c6c0ac', '#dcd8c8', '#f0eee4'],
    moss: ['#5a6e74', '#768a90', '#96a8ac', '#b8c8ca', '#dce6e8'],
    leaf0: ['#1e3a44', '#2e5658', '#4a7a76', '#86aaa6', '#c8dcda', '#f6fafa'], leaf1: ['#1e3a44', '#2e5658', '#4a7a76', '#86aaa6', '#c8dcda', '#f6fafa'], leaf2: ['#1c3a3c', '#28524c', '#3a6c5e', '#5a8c7c', '#a8c6bc', '#f0f6f4'],
    leaf3: ['#3a2c2c', '#54403a', '#6e5648', '#8a705c', '#c8c4c0', '#f4f6f8'], leaf4: ['#1e3a44', '#2e5658', '#4a7a76', '#86aaa6', '#c8dcda', '#f6fafa'] },
};
// ---- course types: how a course is kept, whatever its biome. A type sets how long the grass is on each ground, where the grounds lie beside the fairway,
// how the fairways and greens are mown, how even or patchy the turf is, how the ball runs, how many trees stand and flowers grow.
//   Links:   everything in play short and firm; no first cut to speak of; long fescue everywhere a few metres off the fairway; few trees; faint mowing.
//   Tour:    set up for a championship: narrow fairways, a thin first cut, deep thick rough and then fescue; crisp plaid; the fastest greens.
//   Private: manicured: full plaid stripes, a wide first cut, short even rough you can play from, trimmed edges, more flowers.
//   Public:  a town course: wide fairways with no mowing lines, no first cut, rough of all lengths, dry and worn patches, shaggy bunker edges, slow greens.
// gm: the grass's length on each ground, times the biome's own (water, green, sand, tee, fairway, first cut, rough, long grass, wood floor, hill, cliff, rock, mud).
const CTYPES = {
  links:   { name: 'Links',   gm: [1, 1, 1, 1, 1, 0.5, 1.7, 1.5, 1, 1.5, 1, 1, 1],  fwo: 1.5, cutw: 0.7, collar: 1.2, deepd: 4,   dryt: 0.45, woodt: 0.14, trees: 0.3, mow: 0.25, gmow: 0.3, patch: 0.12, trim: 1, fl: 0.6,  sparse: -0.03, greenDrag: 0.85, fairDrag: 0.75, roughDrag: 1.25 },
  tour:    { name: 'Tour',    gm: [1, 1, 1, 1, 1, 1, 1.6, 1.4, 1.1, 1.2, 1, 1, 1],  fwo: -2,  cutw: 1.5, collar: 2,   deepd: 12,  dryt: 0.5,  woodt: 0,    trees: 1,   mow: 1.15, gmow: 1,   patch: 0,    trim: 1, fl: 0.6,  sparse: -0.04, greenDrag: 0.78, fairDrag: 0.9,  roughDrag: 1.35 },
  private: { name: 'Private', gm: [1, 1, 1, 1, 1, 0.8, 0.8, 0.7, 0.8, 0.8, 1, 1, 1], fwo: 0,   cutw: 2.8, collar: 2.4, deepd: 1e9, dryt: 0.6,  woodt: 0,    trees: 1,   mow: 1.2,  gmow: 1.2, patch: 0,    trim: 1, fl: 1.4,  sparse: 0,     greenDrag: 0.9,  fairDrag: 1,    roughDrag: 0.85 },
  public:  { name: 'Public',  gm: [1, 1, 1, 1, 1, 1.6, 1.1, 1.15, 1, 1, 1, 1, 1],   fwo: 2.5, cutw: 0,   collar: 0.8, deepd: 1e9, dryt: 0.5,  woodt: 0,    trees: 0.9, mow: 0,    gmow: 0,   patch: 0.55, trim: 0, fl: 1.25, sparse: 0.08,  greenDrag: 1.3,  fairDrag: 1.15, roughDrag: 1.1 },
};
let MOWK = 1, GMOWK = 1, PATCH = 0, RTRIM = 1, ctypeId = 'private';   // how strong the mower's pattern is on fairways and on greens; how patchy the fairway's turf; whether the grass is trimmed round bunkers
function fairPatch(tone, n3) { return PATCH ? (tone - 0.5) * PATCH + n3 * PATCH * 0.5 : 0; }   // an unkempt fairway's uneven tone
function setBiome(id, ty) {
  const B = BIOMES[id] || BIOMES.parkland; biomeId = BIOMES[id] ? id : 'parkland';
  if (ty && CTYPES[ty]) ctypeId = ty; const C = CTYPES[ctypeId];
  const fit = (src, n) => Uint32Array.from({ length: n }, (v, i) => src[Math.min(src.length - 1, Math.round(i * (src.length - 1) / (n - 1)))]);
  for (const k in BIO_R) { const R = BIO_R[k]; if (!BIO_BASE[k]) BIO_BASE[k] = Uint32Array.from(R); R.set(fit(B[k] ? ramp(B[k]) : BIO_BASE[k], R.length)); }
  if (B.fair && !B.tee) G_TEE.set(mixRamp(G_FAIR, G_GREEN, 0.35));       // (the tee between the fairway and the green; the first cut between the fairway and the rough)
  if (B.fair && !B.cut) G_CUT.set(mixRamp(G_FAIR, fit(G_ROUGH, G_FAIR.length), 0.4));
  BTREE = B.trees === undefined ? 1 : B.trees; CONT = B.conShare === undefined ? 0.26 : B.conShare; BGR = B.grass === undefined ? 1 : B.grass;
  for (let i = 0; i < GBASE0.length; i++) GBASE[i] = Math.min(60, Math.round((B.gb ? B.gb[i] : GBASE0[i] * BGR) * C.gm[i]));   // the biome's grass, as long as this type of course keeps it   // how tall the grass stands on each ground: the biome's own, or the usual scaled
  BSAND = B.sandy || 0;
  BT2 = B.tree2 || 0; BT2H = B.t2h || 1; BT2RX = B.t2rx || 1; BT3 = B.tree3 || 0; BT3H = B.t3h || 1; BT3RX = B.t3rx || 1;
  BTREE *= C.trees; FWO = C.fwo; CUTW = C.cutw; COLLAR = C.collar; DEEPD = C.deepd; DRYT = C.dryt; WOODT = C.woodt; MOWK = C.mow; GMOWK = C.gmow; PATCH = C.patch; RTRIM = C.trim;
  BSP = (B.sparse || 0) + C.sparse; BFL = (B.fl === undefined ? 1 : B.fl) * C.fl; if (BFL > 1) BFL = 1;
  if (0) BFL = B.fl === undefined ? 1 : B.fl; BBU = B.bu === undefined ? 1 : B.bu; BRK = B.rk || 0; BGC = B.gc === undefined ? 1 : B.gc;
}
let fcA0 = 1, fcA1 = 0, fcAm = 0, fcZ0 = 1, fcZ1 = 0, fcS0 = 0, fcS1 = 0, fcOff = 0, fcLean = 0, fcBits = 0, fcOpen = false;   // the block the last call was in (most calls stay in it)
function fcJ(c, r) { return r * 64 + hash2(c, r, 524) * 36; }                  // the joint under block r of column c ...
function fcT(c, r) { return (hash2(c, r, 526) - 0.5) * 0.44; }                // ... and its tilt
function fcB(c, r) { let hb = Math.imul(c, 374761393) ^ Math.imul(r, 668265263) ^ 0x5bd1e995; hb = Math.imul(hb ^ (hb >>> 13), 1274126177); return (hb ^ (hb >>> 16)) >>> 0; }
// a cliff face's colour. The rock stands in columns between long upright cracks; each column is a stack of blocks of its own heights,
// parted by joints that each tilt their own way, so no block is a box. A block has its own tone; most stand proud, with a lit top (thicker
// toward one end) and a lit sunward edge; some are set back and shaded by their neighbours; some carry a facet, a crack, a split or a cap of grass.
// a = the place along the face (ground px: u + 0.9 v of the point of the face itself), zz = the height on the face (px), grain = the pixel's own noise
function faceCol(a, zz, grain) {
  let da = a - fcAm;
  if (a < fcA0 || a >= fcA1 || zz - fcS0 * da < fcZ0 || zz - fcS1 * da >= fcZ1) {
    let c = Math.floor(a / 64); const j = hash2(c, 3, 521) * 34;
    if (a - c * 64 < j) { c--; fcA0 = c * 64 + hash2(c, 3, 521) * 34; fcA1 = (c + 1) * 64 + j; } else { fcA0 = c * 64 + j; fcA1 = (c + 1) * 64 + hash2(c + 1, 3, 521) * 34; }
    fcAm = (fcA0 + fcA1) * 0.5; da = a - fcAm;
    fcOff = hash2(c, 4, 522) * 64; fcLean = (hash2(c, 5, 523) - 0.5) * 0.24;
    const zl = zz + fcOff; let r = Math.floor(zl / 64), s0 = fcT(c, r), z0 = fcJ(c, r);
    if (zl - s0 * da < z0) { r--; s0 = fcT(c, r); z0 = fcJ(c, r); }
    let s1 = fcT(c, r + 1), z1 = fcJ(c, r + 1);
    if (zl - s1 * da >= z1) { r++; s0 = s1; z0 = z1; s1 = fcT(c, r + 1); z1 = fcJ(c, r + 1); }
    fcZ0 = z0 - fcOff; fcZ1 = z1 - fcOff; fcS0 = s0; fcS1 = s1; fcBits = fcB(c, r); fcOpen = ((fcB(c, r + 1) >>> 16) & 255) <= 56;   // (the block above runs on into this one)
  }
  const zb = fcZ0 + fcS0 * da, fz = zz - zb, rh = fcZ1 + fcS1 * da - zb, ft = rh - fz, w = fcA1 - fcA0, zg = (zz + fcOff) % 26, B = fcBits;
  const fa = a - fcA0 + (fz - rh * 0.5) * fcLean + Math.abs((zg < 0 ? zg + 26 : zg) - 13) * 0.32 - 2;   // the upright cracks lean and zigzag
  const b0 = (B & 255) / 256, b1 = ((B >>> 8) & 255) / 256, b2 = ((B >>> 16) & 255) / 256, b3 = (B >>> 24) / 256;
  if (fa < 2.2 || (fz < 2.2 && b2 > 0.22)) return ROCKB[fa < 1 || fz < 1 ? 0 : 1];              // the crevices: the block's left and its foot (one block in five runs on into the one below)
  const back = b3 > 0.72;
  if (b3 < 0.18 && !fcOpen && ft < 4 + b1 * 9 + grain * 5) return rampAt(G_ROUGH, 0.45 + (9 - ft) * 0.045 + grain * 0.2);   // a cap of grass, ragged below
  let t = 0.5 + (b0 - 0.5) * 0.3 + (fz / rh - 0.5) * 0.14 + (grain - 0.5) * 0.07;
  if (back) { t -= 0.08; if (ft < 9) t -= 0.21 - ft * 0.016; if (fa > w - 8) t -= 0.13; }      // set back: the block above and the block on the sunward side shade it
  else {
    const top = 2.5 + 7 * (b1 > 0.5 ? fa / w : 1 - fa / w);                                      // the lit top, thicker toward one end
    if (!fcOpen && ft < top) t += ft < top * 0.4 ? 0.34 : 0.23;
    else if (fz < 8) t -= 0.13;                                                                  // the shaded foot
    if (fa > w - 5) t += 0.13; else if (fa < 7) t -= 0.11;                                       // the sunward edge, the shaded side
  }
  if (b3 > 0.3 && b3 < 0.62) t += fz > rh * (0.25 + b1 * 0.5) + (fa - w * 0.5) * (b2 - 0.5) * 1.3 ? 0.065 : -0.055;   // a facet: the block breaks along a slanting line
  if (b1 < 0.4) { const cx = w * (0.25 + b2 * 0.5) + (fz - rh * 0.5) * (b0 - 0.5) * 0.9; if (fa > cx && fa < cx + 1.6) t -= 0.24; }   // a crack running up the block
  if (b2 < 0.32) { const sz = rh * (0.35 + b1 * 0.3); if (fz > sz && fz < sz + 1.6) t -= 0.26; else if (fz < sz) t -= 0.05; else if (fz < sz + 5) t += 0.14; }   // a split: the upper piece has its own lit edge
  if (grain > 0.975) t -= 0.14;                                                                  // chips
  return rampAt(b0 > 0.78 ? ROCKW : ROCKB, t < 0 ? 0 : t > 0.999 ? 0.999 : t);
}
function faceWob(u, v) { return (vnoise(u / 37, v / 53, 77) - 0.5) * 6; }
// A face is drawn between two samples of the land along a ray (this one, at its top, and the one before, at its foot). Where on the ground each height of
// the face really lies is found from the land's height at the quarter points between them, so the rock's pattern is pinned to the rock: it does not slide
// when the camera turns or the samples fall elsewhere. fbA = the place (a) at this sample, fbD = how far a runs back to the sample before.
let fbA = 0, fbD = 0, fbT = 0, fbB = 0, fb1 = 0, fb2 = 0, fb3 = 0, fbOn = false, fbK = 0, fbH = 0;
function faceA(z) {
  if (!fbOn) return fbA;
  let f;
  if (z >= fb1) f = fbT > fb1 ? 0.25 * (fbT - z) / (fbT - fb1) : 0;
  else if (z >= fb2) f = fb1 > fb2 ? 0.25 + 0.25 * (fb1 - z) / (fb1 - fb2) : 0.25;
  else if (z >= fb3) f = fb2 > fb3 ? 0.5 + 0.25 * (fb2 - z) / (fb2 - fb3) : 0.5;
  else f = fb3 > fbB ? 0.75 + 0.25 * (fb3 - z) / (fb3 - fbB) : 0.75;
  return fbA - (f < 0 ? 0 : f > 1 ? 1 : f) * fbD;
}

const CH = 128;
const chunks = new Map();
let lastChunk = null, lastCK = NaN;
function chunkAt(cx, cy) {
  const key = (cx + 32768) * 65536 + (cy + 32768);
  if (key === lastCK) return lastChunk;
  let C = chunks.get(key);
  if (!C) { C = genChunk(cx, cy); chunks.set(key, C); }
  lastCK = key; lastChunk = C;
  return C;
}
function hasChunk(cx, cy) { return chunks.has((cx + 32768) * 65536 + (cy + 32768)); }

let gcol = null, gmt = null, gshd = null, gU0 = 0, gV0 = 0;
function stPx(u, v, rgb, dL) {   // paint one ground pixel of the chunk being made; it keeps the light it had, shifted by dL
  const x = u - gU0, y = v - gV0; if (x < 0 || y < 0 || x >= CH || y >= CH) return;
  const i = y * CH + x, m = gmt[i]; if (m === M_WATER || m === M_CLIFF) return;
  let L = (gcol[i] >>> 24) + dL; L = L < 1 ? 1 : L > 200 ? 200 : L;
  gcol[i] = ((L << 24) | rgb) >>> 0; if (gflOn) GFL[i] = gflOn;
}
function stL(u, v, dL) {
  const x = u - gU0, y = v - gV0; if (x < 0 || y < 0 || x >= CH || y >= CH) return;
  const i = y * CH + x, c = gcol[i]; let L = c >>> 24; if (L > 200) return;
  L += dL; L = L < 1 ? 1 : L > 200 ? 200 : L;
  gcol[i] = ((L << 24) | (c & 0xffffff)) >>> 0;
}
function stStone(u, v, rx, ry, rp, s) {
  gflOn = 2;
  for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
    const q = hash2(u + dx, v + dy, s);
    if ((dx / (rx + 0.4)) * (dx / (rx + 0.4)) + (dy / (ry + 0.4)) * (dy / (ry + 0.4)) + (q - 0.5) * 0.3 > 1) continue;
    const t = 0.5 + 0.3 * dx / (rx + 0.4) - 0.34 * dy / (ry + 0.4) + (q - 0.5) * 0.16;
    stPx(u + dx, v + dy, rampAt(rp, t), Math.round((t - 0.5) * 44));
  }
  gflOn = 0;
  for (let dx = -rx - 1; dx <= rx - 1; dx++) stL(u + dx, v + ry + 1, -24);
  stL(u - rx - 1, v + ry, -20); if (ry > 1) stL(u - rx - 1, v, -16);
}
function stamp(m, u, v, q, s) {   // one small thing rooted at ground pixel (u, v)
  const r = (k) => hash2(u * 31 + k, v * 17 - k, s);
  if (m === M_ROUGH || m === M_DEEP || m === M_CUT || m === M_HILL || m === M_MUD) {
    const rp = m === M_HILL ? G_HILL : m === M_DEEP ? G_DEEP : m === M_CUT ? G_CUT : m === M_MUD ? REEDR : G_ROUGH;
    if (q < (m === M_CUT ? 0.3 : m === M_HILL ? 0.45 : 0.78)) {            // a tuft of blades, lighter toward the tips, dark at the foot
      const nb = m === M_CUT ? 2 : 3 + ((r(1) * 4) | 0), mx = m === M_CUT ? 3 : m === M_DEEP ? 9 : 6;
      for (let b = 0; b < nb; b++) {
        const bx = u + ((r(2 + b) * 7) | 0) - 3, len = 2 + ((r(10 + b) * (mx - 1)) | 0), lean = ((r(20 + b) * 5) | 0) - 2, jt = (r(30 + b) - 0.5) * 0.2;
        for (let k = 0; k < len; k++) stPx(bx + Math.round(lean * k * k / (len * len)), v - k, rampAt(rp, 0.35 + 0.6 * k / len + jt), -12 + ((26 * k / len) | 0));
      }
      stL(u - 1, v + 1, -14); stL(u, v + 1, -18); stL(u + 1, v + 1, -10);
    } else if (q < 0.975 && m !== M_HILL && m !== M_MUD) {                    // a flower; they grow in drifts, and the same kinds grow together
      if (vnoise(u / 61, v / 31, SEED + 111) < (m === M_DEEP ? 0.4 : m === M_CUT ? 0.66 : 0.56)) return;
      const fk = Math.min(4, (vnoise(u / 170, v / 85, SEED + 110) * 5 + r(3) * 1.3 - 0.4) | 0), pr = PETAL[fk < 0 ? 0 : fk], sh = 2 + ((r(4) * (m === M_DEEP ? 5 : 3)) | 0);
      for (let k = 0; k < sh; k++) stPx(u, v - k, rampAt(BLADE, 0.3 + 0.4 * k / sh), -4);
      const y = v - sh;
      gflOn = 1; stPx(u - 1, y, pr[1], 16); stPx(u + 1, y, pr[2], 28); stPx(u, y - 1, pr[2], 30); stPx(u, y + 1, pr[0], 4); stPx(u, y, fk === 0 ? PETAL[4][1] : pr[2], 30); gflOn = 0;
    } else stStone(u, v, 1 + ((r(7) * 3) | 0), 1 + ((r(8) * 2) | 0), ROCKB, s + 5);
  } else if (m === M_FOREST) {
    if (q < 0.5) { const lc = r(1) < 0.5 ? LEAF[3] : r(1) < 0.8 ? STRAW : BARK, t = 0.35 + r(2) * 0.6; stPx(u, v, rampAt(lc, t), 6); stPx(u + 1, v, rampAt(lc, t - 0.18), 0); if (r(3) < 0.5) stPx(u + 1, v - 1, rampAt(lc, t + 0.1), 8); }   // a fallen leaf
    else if (q < 0.64) { const len = 4 + ((r(1) * 5) | 0), sl = (r(2) - 0.5) * 1.2; for (let k = 0; k < len; k++) stPx(u + k, v + Math.round(k * sl), rampAt(BARK, 0.15 + r(3) * 0.2), -8); }   // a twig
    else if (q < 0.82) { for (let b = 0; b < 4; b++) { const bx = u + ((r(2 + b) * 6) | 0) - 3, len = 2 + ((r(10 + b) * 3) | 0); for (let k = 0; k < len; k++) stPx(bx, v - k, rampAt(MOSSR, 0.3 + 0.6 * k / len), -6 + k * 6); } }   // a moss tuft
    else stStone(u, v, 1 + ((r(7) * 2) | 0), 1, ROCKR, s + 5);   // a stone among the leaves
  } else if (m === M_ROCK) {
    if (q < 0.34) { let x = u, y = v; const lc = G_LICHEN[(r(1) * 4) | 0], n = 4 + ((r(2) * 7) | 0); for (let k = 0; k < n; k++) { stPx(x, y, lc, 4); const d = (r(10 + k) * 4) | 0; x += d === 0 ? 1 : d === 1 ? -1 : 0; y += d === 2 ? 1 : d === 3 ? -1 : 0; } }   // a lichen blotch
    else if (q < 0.5) { for (let b = 0; b < 3; b++) { const bx = u + ((r(2 + b) * 5) | 0) - 2, len = 2 + ((r(10 + b) * 3) | 0); for (let k = 0; k < len; k++) stPx(bx, v - k, rampAt(G_HILL, 0.3 + 0.6 * k / len), -6 + k * 6); } }
    else if (q < 0.7) stStone(u, v, 1 + ((r(7) * 3) | 0), 1 + ((r(8) * 2) | 0), ROCKR, s + 5);
  } else if (m === M_SAND) {
    if (q < 0.1) { stPx(u, v, r(1) < 0.5 ? ROCKR[2 + ((r(2) * 3) | 0)] : 0xf4f4f8, r(1) < 0.5 ? -6 : 20); stL(u - 1, v + 1, -16); }   // a pebble or a shell
    else if (q < 0.3) { const len = 5 + ((r(1) * 9) | 0); let y = v; for (let k = 0; k < len; k++) { if (r(10 + k) < 0.3) y += r(30 + k) < 0.5 ? 1 : -1; stL(u + k, y, 14); stL(u + k, y + 1, -12); } }   // a wind ripple
  } else if (m === M_FAIR) {
    if (q < 0.035) { stPx(u, v, PETAL[0][2], 30); if (r(1) < 0.4) stPx(u + 1, v, PETAL[4][1], 16); }                                   // a daisy
    else if (q < 0.11) { stL(u, v, -12); stL(u + 1, v - 1, -8); stL(u, v - 1, 10); }                                                   // a thicker tuft
  }
}
// a shadow on the ground: an ellipse with a ragged rim; under foliage it is dappled with sun flecks; shadows never stack
function shadeEllipse(uc, vc, ru, rv, dapple, seed) {
  const x0 = Math.max(0, Math.floor(uc - ru) - gU0), x1 = Math.min(CH - 1, Math.ceil(uc + ru) - gU0), y0 = Math.max(0, Math.floor(vc - rv) - gV0), y1 = Math.min(CH - 1, Math.ceil(vc + rv) - gV0);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const du = (x + gU0 + 0.5 - uc) / ru, dv = (y + gV0 + 0.5 - vc) / rv, e = du * du + dv * dv;
    if (e > 1) continue;
    const i = y * CH + x; if (gshd[i]) continue;
    if (e > 0.7 && hash2(x + gU0, y + gV0, seed) < (e - 0.7) / 0.3) continue;
    if (dapple && hash2((x + gU0) >> 1, (y + gV0) >> 1, seed + 1) < 0.13) continue;
    gshd[i] = 1;
    const c = gcol[i], L = c >>> 24; if (L > 200) continue;
    gcol[i] = ((((L * 0.78 + 1) | 0) << 24) | (c & 0xffffff)) >>> 0;   /* (only the soft shade of an overcast day is painted in: the sun's own shadow is added where the sun is, see the sun patches) */
  }
}
function castShadow(o) {
  if (o.k === K_TREE) {
    if (isCon(o)) { for (let k = 0; k <= 9; k++) { const s = k / 9, z = o.H * s, r = o.rx * (1 - s * 0.86) + 3; shadeEllipse(o.u + SHU * z, o.v + SHV * z, r * 0.9, r * 0.5 + 1, k > 0, o.seed); } }
    else { const zc = o.H * 0.66; for (let k = 1; k < 10; k++) shadeEllipse(o.u + SHU * zc * k / 10, o.v + SHV * zc * k / 10, 4.5, 2.6, false, o.seed); shadeEllipse(o.u + SHU * zc, o.v + SHV * zc, o.rx * 1.02, o.rx * 0.52, true, o.seed); }
  } else if (o.k === K_BUSH || o.k === K_ROCK) shadeEllipse(o.u + SHU * o.H * 0.4, o.v + SHV * o.H * 0.4 + 1, o.rx * 0.95, o.rx * 0.42 + 1, false, o.seed);
  else shadeEllipse(o.u + SHU * o.H * 0.3, o.v + SHV * o.H * 0.3 + 1, o.H * 0.3 + 3, 2.5 + o.H * 0.06, true, o.seed);
}

const CSH = new Int8Array(128);   // a column's own shift of its grass grain (one hash per column, not per pixel)
const NG2 = new Float32Array(128 * 128), NG3 = new Float32Array(128 * 128), NGC = new Float32Array(128 * 128);
function noiseFill(out, U0, V0, sx, sy, s) {   // vnoise(u / sx, v / sy, s) for every pixel of a chunk: the same numbers, a lattice value hashed once per cell instead of four times per pixel
  for (let y = 0; y < CH; y++) {
    const fy = (V0 + y) / sy, yi = Math.floor(fy), yf = fy - yi, vv = yf * yf * (3 - 2 * yf);
    let lxi = NaN, a = 0, b = 0, c = 0, d = 0;
    for (let x = 0; x < CH; x++) {
      const fx = (U0 + x) / sx, xi = Math.floor(fx), xf = fx - xi, uu = xf * xf * (3 - 2 * xf);
      if (xi !== lxi) { if (xi === lxi + 1) { a = b; c = d; } else { a = hash2(xi, yi, s); c = hash2(xi, yi + 1, s); } b = hash2(xi + 1, yi, s); d = hash2(xi + 1, yi + 1, s); lxi = xi; }
      out[y * CH + x] = a + (b - a) * uu + (c - a) * vv + (a - b - c + d) * uu * vv;
    }
  }
}
const NF = 15, c00 = new Float32Array(NF), c10 = new Float32Array(NF), c01 = new Float32Array(NF), c11 = new Float32Array(NF), fv = new Float32Array(NF);
const GBASE = new Uint8Array([0, 0, 0, 0, 0, 2, 6, 17, 2, 5, 0, 0, 0]), GFL = new Uint8Array(128 * 128);   // how tall each ground's grass stands (height px); what the stamps left on each pixel (1 a flower, 2 a stone)
let gflOn = 0;
const RANK = new Int8Array([-9, 0, -1, 0, 1, 2, 3, 4, -9, -9, -9, -9, -9]);   // how tall each ground's grass stands (sand is sunken; -9 = not ranked)
function genChunk(cx, cy) {
  const T = tileAt(cx >> 1, cy >> 1); tileLight(T);
  const FL = [T.h, T.g, T.dF, T.dG, T.dB, T.dT, T.dP, T.wood, T.dry, T.tone, T.lt, T.sh, T.tal, T.mow, T.mow2];
  const ox = (cx & 1) * 32, oy = (cy & 1) * 32, U0 = cx * CH, V0 = cy * CH;
  const col = new Uint32Array(CH * CH), lift = new Int16Array(CH * CH), mt = new Uint8Array(CH * CH), shd = new Uint8Array(CH * CH), gr = new Uint8Array(CH * CH);
  GFL.fill(0);
  const wl = T.wl, wlPx = Math.round(wl * ZP);
  for (let x = 0; x < CH; x++) CSH[x] = (hash2(U0 + x, 0, SEED + 8) * 4) | 0;
  const GRC = hole.green.c, GRS = hole.green.s;
  noiseFill(NG2, U0, V0, 9.1, 4.6, SEED + 90); noiseFill(NG3, U0, V0, 37, 18.5, SEED + 91); noiseFill(NGC, U0, V0, 4.3, 2.9, SEED + 99);
  let maxLift = -32768;
  for (let bj = 0; bj < 32; bj++) for (let bi = 0; bi < 32; bi++) {
    const k = (oy + bj) * TN + ox + bi;
    for (let f = 0; f < NF; f++) { const A = FL[f]; c00[f] = A[k]; c10[f] = A[k + 1]; c01[f] = A[k + TN]; c11[f] = A[k + TN + 1]; }
    const gFx = (c10[2] - c00[2] + c11[2] - c01[2]) * 0.125 * PPM, gFy = (c01[2] - c00[2] + c11[2] - c10[2]) * 0.125 * PPV, gLx = (c10[13] - c00[13] + c11[13] - c01[13]) * 0.125 * PPM, gLy = (c01[13] - c00[13] + c11[13] - c10[13]) * 0.125 * PPV;   // (for the mower: how the fairway's edge distance and the sideways distance change per metre)
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      const fx = (tx + 0.5) * 0.25, fy = (ty + 0.5) * 0.25, w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      for (let f = 0; f < NF; f++) fv[f] = c00[f] * w00 + c10[f] * w10 + c01[f] * w01 + c11[f] * w11;
      const u = U0 + bi * 4 + tx, v = V0 + bj * 4 + ty, i = (bj * 4 + ty) * CH + bi * 4 + tx, h = fv[0], g = fv[1];
      const n1 = hash2(u, v, SEED + 5), n2 = NG2[i] - 0.5, n3 = NG3[i] - 0.5, nc = NGC[i] - 0.5;
      const m = matOf(h, g, fv[2], fv[3], fv[4], fv[5], fv[6], fv[7], fv[8], (n1 - 0.5) * 0.1 + nc * 0.3 + n2, n2 * 0.25 + nc * 0.1);
      let lf = Math.round(h * ZP), rgb;
      mt[i] = m;
      if (m === M_WATER) {
        const depth = wl - h, dc = clamp(Math.round(depth * 14), 0, 29);
        lift[i] = wlPx; if (wlPx > maxLift) maxLift = wlPx;
        col[i] = (((201 + dc) << 24) | (depth < 0.16 + nc * 0.14 ? (nc + n3 > 0.1 ? 0xd6dc9c : 0xe0d08a) : rampAt(G_WATER, clamp(1 - depth / 1.2, 0.02, 0.98) + nc * 0.14 - (fv[11] > 0.5 ? 0.16 : 0)))) >>> 0;
        continue;
      }
      let tb = (Math.floor(fv[10] * 6 + nc * 0.7) + 0.5) / 6;       // the soft staircase: six bands, dithered at their edges
      tb = tb < 0.08 ? 0.08 : tb > 1 ? 1 : tb;
      if (m === M_CLIFF) tb = 0.5 + 0.5 * tb;                                // a face turned from the sun still takes sky light, so its strata stay readable
      else if (fv[11] > 0.48 + nc * 0.4) { tb *= 0.78; shd[i] = 1; }
      let t = 0.5 + (fv[9] - 0.5) * 1.1 + n3 * 0.6, mowL = 0;                // the slow tone every ground shares; the mower's stripe
      const tp = Math.round((t + nc * 0.3) * 5) / 5, ck = nc > 0.17 ? 1 : nc < -0.19 ? -1 : 0, ck2 = n2 > 0.2 ? 1 : n2 < -0.22 ? -1 : 0;   // (pixel art: tp = the tone in flat patches, their borders ragged by the clump noise; ck, ck2 = a cluster one step lighter or darker)
      if (m >= M_ROUGH && m !== M_CLIFF && fv[12] + nc * 0.4 + n2 * 0.2 > 0.4) {   // scree: soil and gravel (the stones are stamped on it below)
        const gv = vnoise(u / 3.3, v / 2.1, SEED + 98);
        rgb = gv < 0.42 ? rampAt(G_SOIL, t = 0.2 + gv + (n1 - 0.5) * 0.3) : rampAt(vnoise(u / 23, v / 12, SEED + 89) > 0.55 ? ROCKW : ROCKB, t = 0.16 + gv * 0.7 + (n1 - 0.5) * 0.16);
        mt[i] = M_ROCK;
      }
      else if (m === M_GREEN) { const q = greenSt(fv[3], fv[13], fv[14]); if (!q) { mowL = (mowLinesG(fv[3]) - 1) * GMOWK; rgb = rampAt(G_GREEN, 0.5 - 0.04 * GMOWK); } else { mowL = ((q > 0 ? 5 : -5) + (q === 2 || q === -1 ? 3 : -3)) * GMOWK; rgb = rampAt(G_GREEN, 0.5 + (q > 0 ? 0.12 : -0.12) * GMOWK); } }
      else if (m === M_FAIR) {
        if (stripeDF(fv[2] - FWO, fv[13], gFx, gFy, gLx, gLy, MOW_W) > -MOW_IN) { mowL = (mowLines(fv[2] - FWO) - 3) * MOWK; rgb = rampAt(G_FAIR, t = 0.5 - 0.06 * MOWK + fairPatch(fv[9], n3)); }   // the border round the edge, mown along the outline
        else { const q = plaid(fv[13], fv[14], MOW_W); mowL = ((q > 0 ? 8 : -8) + (q === 2 || q === -1 ? 6 : -6)) * MOWK; rgb = rampAt(G_FAIR, t = 0.5 + (q > 0 ? 0.15 : -0.15) * MOWK + fairPatch(fv[9], n3)); if (PATCH > 0.3 && vnoise(u / 31, v / 16, SEED + 77) > 0.69 - n3 * 0.1) { rgb = rampAt(G_DEEP, 0.56 + n3 * 0.2); mowL = 0; } }   /* (an unkempt fairway has dry, worn patches) */
      }
      else if (m === M_TEE) { const st = (Math.floor(u / PPM / 1.1 + 4000) + Math.floor(v / PPV / 1.1 + 4000)) & 1; mowL = (st ? 3 : -3) * MOWK; rgb = rampAt(G_TEE, t = 0.5 + (fv[9] - 0.5) * 0.45 + (ck > 0 && n3 > 0.06 ? 0.17 : 0) + (st ? 0.06 : -0.06) * MOWK); }
      else if (m === M_CUT) { rgb = rampAt(G_CUT, t = tp + ck2 * 0.12); if (fv[2] < 2.6) mowL = mowLines(fv[2]); }   // (the first cut: its passes follow the fairway's outline too)
      else if (m === M_ROUGH) rgb = rampAt(G_ROUGH, t = tp + ck * 0.15 + (ck === 0 ? ck2 * 0.08 : 0));
      else if (m === M_DEEP) rgb = rampAt(G_DEEP, t = tp + ck * 0.15 + (ck === 0 ? ck2 * 0.1 : 0));
      else if (m === M_FOREST) { tb *= 0.9; rgb = vnoise(u / 21, v / 10.5, SEED + 92) + nc * 0.5 > 0.6 ? rampAt(MOSSR, t = tp + ck2 * 0.2) : rampAt(G_LITTER, t = tp + ck * 0.17 + (ck === 0 ? ck2 * 0.1 : 0)); }
      else if (m === M_HILL) rgb = vnoise(u / 6.3, v / 3.1, SEED + 93) + (g - 0.3) * 1.2 + nc * 0.5 > 0.82 ? rampAt(G_SOIL, t = tp + ck2 * 0.17)
        : rampAt(G_HILL, t = tp + ck * 0.17 + (ck === 0 ? ck2 * 0.1 : 0));
      else if (m === M_ROCK) {
        if (vnoise(u / 8.3, v / 4.1, SEED + 96) > 0.66 + (g - 0.62) * 0.6) rgb = rampAt(G_HILL, t += (n1 - 0.5) * 0.6);
        else { t = 0.34 + 0.5 * vnoise(u / 13.1, v / 6.5, SEED + 95) + nc * 0.16 + n3 * 0.3; if (Math.abs(vnoise(u / 11.3, v / 5.6, SEED + 94) - 0.5) < 0.03) t -= 0.34; rgb = rampAt(ROCKB, t); }
      }
      else if (m === M_CLIFF) { rgb = faceCol(u + v * 0.9, lf + faceWob(u, v), n1); t = 0.5; }
      else if (m === M_SAND) {                                                 // raked sand: furrows that follow the bunker's own shape, a smooth pale rim
        t = 0.56 + (vnoise((u + n3 * 40) / 15, v / 2.6, SEED + 97) - 0.5) * 0.22 + (fv[9] - 0.5) * 0.25; t = Math.round(t * 7) / 7;   // flat patches of tone, no grain to every pixel (on a bunker's banks the grain stood on end as streaks)
        if (fv[4] > -0.35) t += 0.15; else if (fv[1] < 0.3) { const rk = fv[4] * 2.3 + n3 * 0.5, rf = rk - Math.floor(rk); if (rf < 0.22) { t -= 0.1; mowL = -6; } else if (rf > 0.86) { t += 0.07; mowL = 4; } }   // the rake's furrows: broad, soft, and only on the floor (the banks are smooth sand)
        rgb = rampAt(G_SAND, t);
      }
      else rgb = nc + n2 * 0.6 > 0.12 ? rampAt(ROCKB, t = 0.35 + nc + (n1 - 0.5) * 0.2) : rampAt(G_SAND, t = 0.3 + (fv[9] - 0.5) * 0.5 + nc * 0.5 + (n1 - 0.5) * 0.1);   // the shore: wet sand and pebbles
      if (BSAND && (m === M_ROUGH || m === M_DEEP || m === M_HILL || m === M_FOREST)) mowL += sandRipple(u, v);
      let L = Math.round(14 + 186 * tb + (t - 0.5) * 16) + mowL; L = L < 1 ? 1 : L > 200 ? 200 : L;
      col[i] = ((L << 24) | rgb) >>> 0; lift[i] = lf; if (lf > maxLift) maxLift = lf;
      const gb = GBASE[mt[i]];                                               // grass: clumps (the same noise that colours them) of blades of uneven height, with gaps
      if (gb) { const hb = hash2(u >> 1, v >> 2, SEED + 12); if (hb > (gb > 10 ? 0.12 : 0.3) + BSP) gr[i] = Math.round(gb * (0.5 + 0.9 * (n2 + 0.5) * (0.55 + 0.9 * (n3 + 0.5))) * (0.55 + 0.45 * ((hb * 7.13) % 1)) * (RTRIM && fv[4] < 0.6 ? (fv[4] < 0.15 ? 0 : (fv[4] - 0.15) / 0.45) : 1));   /* (trimmed short round a bunker: its edge is a clean line, not a row of blades standing over the sand) */ }   // (a tuft: two pixels wide, one height)
    }
  }
  gcol = col; gmt = mt; gshd = shd; gU0 = U0; gV0 = V0;
  for (let y = 1; y < CH - 2; y++) for (let x = 0; x < CH; x++) {   // lips: taller grass over shorter, a bunker's back wall and front edge
    const i = y * CH + x, m = mt[i], a = mt[i - CH], b = mt[i + CH], rm = RANK[m];
    if (rm < -1) continue;
    if (m === M_SAND) { if (a !== M_SAND && RANK[a] > -2) { stL(U0 + x, V0 + y, -36); stL(U0 + x, V0 + y + 1, -20); } else if (b !== M_SAND && RANK[b] > -2) stL(U0 + x, V0 + y, 14); }
    else if (RANK[b] > -2 && rm > RANK[b]) stL(U0 + x, V0 + y, -22 - (rm - RANK[b]) * 4);
    else if (RANK[a] > -2 && rm > RANK[a] && m !== M_SAND) stL(U0 + x, V0 + y, 10);
  }
  for (let j = Math.floor((V0 - 2) / 16); j <= Math.floor((V0 + CH + 12) / 16); j++) for (let i = Math.floor((U0 - 10) / 16); i <= Math.floor((U0 + CH + 10) / 16); i++) {
    for (let k = 0; k < 3; k++) {
      const u = i * 16 + ((hash2(i * 3 + k, j, SEED + 200) * 16) | 0), v = j * 16 + ((hash2(i, j * 3 + k, SEED + 201) * 16) | 0);
      stamp(matAt(u / PPM, v / PPV), u, v, hash2(i * 7 + k, j * 5 + k, SEED + 202), SEED + 210 + k);
    }
  }
  for (let j = Math.floor((V0 - 4) / 16); j <= Math.floor((V0 + CH + 4) / 16); j++) for (let i = Math.floor((U0 - 8) / 16); i <= Math.floor((U0 + CH + 8) / 16); i++) {   // stones on the scree and out into the grass
    const tl = talAt(i * 16 + 8, j * 16 + 8); if (tl < 0.05) continue;
    const n = 2 + Math.round(tl * 8);
    for (let k = 0; k < n; k++) {
      const q = hash2(i * 7 + k, j * 3 + k, SEED + 222); if (q > 0.25 + tl) continue;
      const u = i * 16 + ((hash2(i * 5 + k, j, SEED + 220) * 16) | 0), v = j * 16 + ((hash2(i, j * 5 + k, SEED + 221) * 16) | 0), z = hash2(i * 3 + k, j * 7 - k, SEED + 223);
      stStone(u, v, 1 + ((z * z * (2.2 + tl * 5)) | 0), 1 + ((z * z * (1.2 + tl * 2.6)) | 0), q * 37 % 1 < 0.3 ? ROCKW : ROCKB, SEED + 224 + k);
    }
  }
  for (let i = 0; i < CH * CH; i++) { const f = GFL[i]; if (f === 2) gr[i] = 0; else if (f === 1 && GBASE[mt[i]]) gr[i] = (Math.min(60, Math.max(gr[i], GBASE[mt[i]]) + 2)) | 128; }   // no blade on a stone; a flower stands at a blade's tip
  for (let j = Math.floor((V0 - 170) / OC); j <= Math.floor((V0 + CH + 40) / OC); j++) for (let i = Math.floor((U0 - 120) / OC); i <= Math.floor((U0 + CH + 420) / OC); i++) for (const o of cellObjects(i, j)) castShadow(o);
  for (let i = 0; i < CH * CH; i++) { const c = col[i]; if ((c >>> 24) <= 200) col[i] = (shd[i] ? c | 0x01000000 : c & 0xfeffffff) >>> 0; }   // the light level's lowest bit says: a cast shadow lies here
  gcol = gmt = gshd = null;
  return { cx, cy, col, lift, mt, maxLift: maxLift + 62, gr, lc: null, lt: -1, l1: null, l2: null, g1: null, g2: null };
}
// middle land: a tile's own colours, one per sample (no painted detail, no cast shadows: it is far enough away)
const FAR_RAMP = [G_WATER, G_GREEN, G_SAND, G_TEE, G_FAIR, G_CUT, G_ROUGH, G_DEEP, G_LITTER, G_HILL, ROCKB, ROCKB, G_SAND];
function shadeSample(m, h, hx, hy, tone, q, st, wl) {   // one far or middle sample -> a packed colour with its light. q: the slow noise the painted ground uses (0..1); st: the mower's stripe (-1, 0, 1)
  if (m === M_WATER) return (((201 + clamp(Math.round((wl - h) * 14), 0, 29)) << 24) | rampAt(G_WATER, clamp(1 - (wl - h) / 1.2, 0.02, 0.98))) >>> 0;
  const d = (-hx * SUNX - hy * SUNY + SUNZ) / Math.sqrt(hx * hx + hy * hy + 1), n3 = q - 0.5;
  let tb = (Math.floor(clamp((d - 0.2) / 0.686, 0, 1) * 6 + n3 * 0.6) + 0.5) / 6; tb = tb < 0.08 ? 0.08 : tb > 1 ? 1 : tb;
  if (m === M_CLIFF) tb = 0.5 + 0.5 * tb;
  let t, dL = 0;   // (the same numbers the painted ground uses, less its finest grain)
  if (m === M_FAIR) { if (st === 0) { t = 0.44; dL = -3; } else { t = 0.5 + (st > 0 ? 0.15 : -0.15); dL = (st > 0 ? 8 : -8) + (st === 2 || st === -1 ? 6 : -6); } t = 0.5 + (t - 0.5) * MOWK + fairPatch(tone, n3); dL *= MOWK; }   // (st: the mower's plaid; 0 = the border)
  else if (m === M_GREEN) { if (st === 0) { t = 0.46; dL = -2; } else { t = 0.5 + (st > 0 ? 0.12 : -0.12); dL = (st > 0 ? 5 : -5) + (st === 2 || st === -1 ? 3 : -3); } t = 0.5 + (t - 0.5) * GMOWK; dL *= GMOWK; }
  else if (m === M_TEE) { t = 0.5 + (tone - 0.5) * 0.45 + n3 * 0.2 + st * 0.06 * MOWK; dL = st * 3 * MOWK; }
  else if (m === M_SAND) t = 0.6 + (tone - 0.5) * 0.25 + n3 * 0.12;
  else { t = 0.5 + (tone - 0.5) * 1.1 + n3 * 0.3; if (m === M_FOREST) tb *= 0.9; }   // (calmer than the painted ground: far things take fewer tones)
  let L = Math.round(14 + 186 * tb + (t - 0.5) * 16) + dL; L = L < 1 ? 1 : L > 200 ? 200 : L;
  return ((L << 24) | rampAt(FAR_RAMP[m], t)) >>> 0;
}
// the shadows of trees, bushes and rocks on a grid of far or middle samples (the painted ground has them pixel by pixel: these are the same shadows, coarser)
const SHM = new Uint8Array(6400);
function markEllipse(W, H, u0, v0, su, sv, cu, cv, ru, rv) {
  const i0 = Math.max(0, Math.ceil((cu - ru - u0) / su)), i1 = Math.min(W - 1, Math.floor((cu + ru - u0) / su)), j0 = Math.max(0, Math.ceil((cv - rv - v0) / sv)), j1 = Math.min(H - 1, Math.floor((cv + rv - v0) / sv));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const du = (u0 + i * su - cu) / ru, dv = (v0 + j * sv - cv) / rv; if (du * du + dv * dv <= 1) SHM[j * W + i] = 1; }
}
function gridShadows(col, W, H, u0, v0, su, sv, T) {   // T: the tile whose own bushes and rocks cast too (none for a far piece)
  SHM.fill(0, 0, W * H);
  const xa = u0 / PPM - 8, xb = (u0 + W * su) / PPM + 8, ya = v0 / PPV - 8, yb = (v0 + H * sv) / PPV + 8;
  for (let gy = Math.floor(ya / TGC); gy <= Math.floor(yb / TGC); gy++) for (let gx = Math.floor(xa / TGC); gx <= Math.floor(xb / TGC); gx++) {
    const o = treeAt(gx, gy); if (!o) continue;
    if (isCon(o)) { for (let k = 0; k <= 9; k += 3) { const s = k / 9, z = o.H * s, r = o.rx * (1 - s * 0.86) + 3; markEllipse(W, H, u0, v0, su, sv, o.u + SHU * z, o.v + SHV * z, r * 0.9 + su * 0.5, r * 0.5 + 1 + sv * 0.5); } }
    else { const zc = o.H * 0.66; markEllipse(W, H, u0, v0, su, sv, o.u + SHU * zc, o.v + SHV * zc, o.rx * 1.02, o.rx * 0.52); }
  }
  if (T) for (let cj = 0; cj < 2; cj++) for (let ci = 0; ci < 2; ci++) for (const o of cellObjects(T.tx * 2 + ci, T.ty * 2 + cj)) if (o.k === K_BUSH || o.k === K_ROCK) markEllipse(W, H, u0, v0, su, sv, o.u + SHU * o.H * 0.4, o.v + SHV * o.H * 0.4 + 1, o.rx * 0.95, o.rx * 0.42 + 1);
  for (let k = 0, n = W * H; k < n; k++) { const c = col[k], L = c >>> 24; if (L <= 200) col[k] = (SHM[k] ? ((((L * 0.78 + 1) | 0) | 1) << 24) | (c & 0xffffff) : c & 0xfeffffff) >>> 0; }   // (the lowest bit of the light: a cast shadow lies here)
}
function tileLook(T) {
  if (T.look) return T.look;
  const L = new Uint32Array(TN * TN), GH = new Uint8Array(TN * TN), H = T.h, u0 = T.tx * TPX, v0 = T.ty * TPX, GRC = hole.green.c, GRS = hole.green.s;
  for (let j = 0, k = 0; j < TN; j++) for (let i = 0; i < TN; i++, k++) {
    const i0 = i > 3 ? i - 4 : 0, i1 = i < TN - 4 ? i + 4 : TN - 1, j0 = j > 1 ? j - 2 : 0, j1 = j < TN - 2 ? j + 2 : TN - 1;
    const hx = (H[j * TN + i1] - H[j * TN + i0]) / ((i1 - i0) * 4 / PPM), hy = (H[j1 * TN + i] - H[j0 * TN + i]) / ((j1 - j0) * 4 / PPV);
    const m = matOf(H[k], T.g[k], T.dF[k], T.dG[k], T.dB[k], T.dT[k], T.dP[k], T.wood[k], T.dry[k], 0, 0);
    const u = u0 + i * 4, v = v0 + j * 4, n3 = vnoise(u / 37, v / 18.5, SEED + 91), scree = T.tal[k] > 0.5 && m >= M_ROUGH && m !== M_CLIFF;
    let st = 0;
    if (m === M_FAIR) { const ka = i < TN - 1 ? k + 1 : k, kb = i > 0 ? k - 1 : k, kc = j < TN - 1 ? k + TN : k, kd = j > 0 ? k - TN : k, sx = PPM / ((ka - kb) * 4 || 1), sy = PPV / (((kc - kd) / TN) * 4 || 1);
      st = stripeDF(T.dF[k] - FWO, T.mow[k], (T.dF[ka] - T.dF[kb]) * sx, (T.dF[kc] - T.dF[kd]) * sy, (T.mow[ka] - T.mow[kb]) * sx, (T.mow[kc] - T.mow[kd]) * sy, MOW_W) > -MOW_IN ? 0 : plaid(T.mow[k], T.mow2[k], MOW_W); }
    else if (m === M_GREEN) st = greenSt(T.dG[k], T.mow[k], T.mow2[k]);
    else if (m === M_TEE) st = ((Math.floor(u / PPM / 1.1 + 4000) + Math.floor(v / PPV / 1.1 + 4000)) & 1) ? 1 : -1;
    L[k] = shadeSample(scree ? M_ROCK : m, H[k], hx, hy, T.tone[k], n3, st, T.wl); if (m === M_SAND || m === M_MUD || m === M_WATER) GH[k] = 255;   // (255: soft ground, never a rock face)
    const gb = scree ? 0 : GBASE[m];                          // how tall the grass stands here (the painted ground's own clumps, at this grid's grain)
    if (gb) GH[k] = Math.round(gb * (0.5 + 0.9 * vnoise(u / 9.1, v / 4.6, SEED + 90) * (0.55 + 0.9 * n3)) * 0.9 * (RTRIM && T.dB[k] < 0.6 ? (T.dB[k] < 0.15 ? 0 : (T.dB[k] - 0.15) / 0.45) : 1));   // (smooth from sample to sample: nothing here may twinkle as the camera moves)
  }
  gridShadows(L, TN, TN, u0, v0, 4, 4, T);
  T.look = L; T.gh = GH;
  return L;
}
// far land: 32 m squares, one sample every 0.4 m, straight from the land's own function
const FTS = 32, FTN = 80, FTD = FTS / FTN, DFAR_ = 260;
function farStep(F) {
  const fx = F.fx, fy = F.fy, N = FTN + 2;
  if (!F.hh) { F.hh = new Float32Array(N * N); F.ff = new Float32Array(N * N * 12); }
  const hh = F.hh, ff = F.ff;
  if (F.row < N) {                                          // first the land's own numbers, ten rows a slice
    const j1 = Math.min(N, F.row + 10);
    for (let j = F.row; j < j1; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, o = k * 12;
      field(fx * FTS + (i - 0.5) * FTD, fy * FTS + (j - 0.5) * FTD, FO);
      hh[k] = FO.h; ff[o] = FO.dF; ff[o + 1] = FO.dG; ff[o + 2] = FO.dB; ff[o + 3] = FO.dT; ff[o + 4] = FO.dP; ff[o + 5] = FO.wood; ff[o + 6] = FO.dry; ff[o + 7] = FO.tone; ff[o + 8] = FO.tal; ff[o + 9] = FO.mow; ff[o + 10] = FO.wl; ff[o + 11] = FO.mow2;
    }
    F.row = j1;
    return;
  }
  const h = new Float32Array(FTN * FTN), col = new Uint32Array(FTN * FTN), wood = new Uint8Array(FTN * FTN), mm = new Uint8Array(FTN * FTN);
  for (let j = 0; j < FTN; j++) for (let i = 0; i < FTN; i++) {
    const k = (j + 1) * N + i + 1, o = k * 12, hx = (hh[k + 1] - hh[k - 1]) / (2 * FTD), hy = (hh[k + N] - hh[k - N]) / (2 * FTD), q = hash2(fx * FTN + i, fy * FTN + j, SEED + 78);
    const m = matOf(hh[k], Math.hypot(hx, hy), ff[o], ff[o + 1], ff[o + 2], ff[o + 3], ff[o + 4], ff[o + 5], ff[o + 6], 0, 0);
    h[j * FTN + i] = m === M_WATER ? ff[o + 10] : hh[k];
    const wx = fx * FTS + (i + 0.5) * FTD, wy = fy * FTS + (j + 0.5) * FTD;
    const N12 = N * 12, st = m === M_FAIR ? (stripeDF(ff[o] - FWO, ff[o + 9], (ff[o + 12] - ff[o - 12]) / (2 * FTD), (ff[o + N12] - ff[o - N12]) / (2 * FTD), (ff[o + 21] - ff[o - 3]) / (2 * FTD), (ff[o + N12 + 9] - ff[o - N12 + 9]) / (2 * FTD), MOW_W) > -MOW_IN ? 0 : plaid(ff[o + 9], ff[o + 11], MOW_W)) : m === M_GREEN ? greenSt(ff[o + 1], ff[o + 9], ff[o + 11]) : 0;   // the mower's plaid, each stripe ending squarely
    col[j * FTN + i] = shadeSample(ff[o + 8] > 0.5 && m >= M_ROUGH && m !== M_CLIFF ? M_ROCK : m, hh[k], hx, hy, ff[o + 7], vnoise(wx * PPM / 37, wy * PPV / 18.5, SEED + 91), st, ff[o + 10]);   // (a wood's floor is the wood's floor: its trees stand on it, near and far)
    mm[j * FTN + i] = m; if (hx * hx + hy * hy > 0.64 && m !== M_SAND && m !== M_MUD) wood[j * FTN + i] = 1;
    else { const gb = ff[o + 8] > 0.5 ? 0 : GBASE[m]; if (gb) wood[j * FTN + i] = 2 + Math.min(250, Math.round(gb * (0.5 + 0.9 * vnoise(wx * PPM / 9.1, wy * PPV / 4.6, SEED + 90) * (0.55 + 0.9 * vnoise(wx * PPM / 37, wy * PPV / 18.5, SEED + 91))) * 0.9)); }   // (2 and up: how tall the grass stands here, plus 2: the far land carries its grass too, so it does not stop at a line)   // (steep here: rock; a bunker's lip is sand)
  }
  const trees = [];                                         // the trees that stand on this piece (the land's one rule for trees)
  for (let cj = 0; cj < 13; cj++) for (let ci = 0; ci < 13; ci++) { const t = treeAt(fx * 13 + ci, fy * 13 + cj); if (t) trees.push(t); }
  gridShadows(col, FTN, FTN, (fx * FTS + 0.5 * FTD) * PPM, (fy * FTS + 0.5 * FTD) * PPV, FTD * PPM, FTD * PPV, null);
  F.h = h; F.col = col; F.wood = wood; F.trees = trees; F.hh = F.ff = null; F.ready = true;
}
// ---- LAND-WORKER-END: everything above this line also runs in the land worker (see the renderer's wkStart). Nothing above may touch the page.
````
