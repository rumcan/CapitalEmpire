// T289 (#874): the owner's ploughed-field painting (F:/Art/newArt/PloughedFiled.png, read only: 1672 x 941, red-brown soil, its furrows running
// down to the right at about 31 degrees on screen) made into the farms' two ploughed tile sets, as the RUN families are (docs/art/
// GROUND-TEXTURE-METHOD.md steps 4 and 5): ploughed-field-run, furrows along the map's x axis (down to the right at 26.6 degrees on screen), and
// ploughed-field-y-run, along its y axis (down to the left). Each is the painting turned (never mirrored: the furrows' lit ridge stays on their upper
// side, toward the sun at the upper right) so its furrows lie on that axis, scaled per band so a furrow is FURROW_M apart on the map, then per
// band a big image of four quilted from it (Efros and Freeman 2001: QB px patches, QO px overlaps, the best of QC candidates within QT of the
// least error, minimum-error cuts; the patches are taken where their furrows continue the ones beside them), cut into four tiles, and the four
// healed with one shared strip (tile-heal.mjs healShared, HEAL_BAND px) so any tile meets any tile. The tiles are written as the set's PNGs
// (<art>/art/theme-consistency/generated/ground/run-grass/<family>/<band>/tiles-v1/tile-0x.png, the art folder prep-painted-tiles.mjs's
// RUN_SETS reads) and shipped as the game's WebPs (src/assets/ground/painted/tiles/<family>/<band>/), and their families written into
// src/game/painted-tiles.json as prep-painted-tiles.mjs writes a RUN family's (provisional, shipped as made), before the owner families, with
// the manifest's revision renewed (every family's key, as tests/painted-tiles.test.ts computes it).
//   node scripts/assets/prep-ploughed-field.mjs [--src F:/Art/newArt/PloughedFiled.png] [--art F:/ClaudeTemp/T289/art] [--review F:/ClaudeTemp/T289]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { ROOT } from './source.mjs';
import { HEAL_AS_MADE, HEAL_SHARED, healShared, setMismatch } from './tile-heal.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const SRC = opt('src', 'F:/Art/newArt/PloughedFiled.png'), ART = opt('art', 'F:/ClaudeTemp/T289/art'), REVIEW = opt('review', null);
const MANIFEST = path.join(ROOT, 'src/game/painted-tiles.json'), PAINTED = path.join(ROOT, 'src/assets/ground/painted');
/** the painting's furrow direction on screen (degrees, y down; measured: the angle whose cross profile varies most, as the shipped tiles are checked) and their spacing (px, measured: autocorrelation) */
const SRC_ANGLE = 28, SRC_PITCH = 38.5;
/** the furrows' spacing on the map (m) and, per band, the native px a world px (the band's anchor zoom on a DPR 2 screen); FAR's furrows kept
 *  a few px apart (at its true size they would be under 3 px: a flat brown), its MID a little wider for the same reason */
const FURROW_M = 0.9, BAND_K = { near: 1.2, mid: 0.4, far: 0.1 }, MIN_PITCH = { near: 0, mid: 12, far: 6 };
/** a map metre across an x-axis line on screen (world px): a tile (2 m) of y moves the screen (-64, 32), its part across the line */
const PX_PER_M_ACROSS = (64 * 32 * 2) / Math.hypot(64, 32) / 2;
const W = 1376, H = 768, HEAL_BAND = 48, QB_MAX = 176, QO_SHARE = 0.23, QC = 700, QT = 0.08, QUALITY = 90, BANDS = ['near', 'mid', 'far'];
const FAMILIES = [
  { id: 'ploughed-field-run', dir: 'ploughed-field', name: 'Ploughed field, furrows along x (painted, quilted)', angle: 26.565, seed: 2891 },
  { id: 'ploughed-field-y-run', dir: 'ploughed-field-y', name: 'Ploughed field, furrows along y (painted, quilted)', angle: -26.565, seed: 2892, from: 'ploughed-field-run' },
];
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const hex = m => '#' + m.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const m2 = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 100) / 100]));

/** the largest axis-aligned rectangle inside a w x h picture turned by a (radians): its width and height */
function inscribed(w, h, a) {
  const sa = Math.abs(Math.sin(a)), ca = Math.abs(Math.cos(a)), long = Math.max(w, h), short = Math.min(w, h), wide = w >= h;
  if (short <= 2 * sa * ca * long || Math.abs(sa - ca) < 1e-10) { const x = 0.5 * short; return wide ? [x / sa, x / ca] : [x / ca, x / sa]; }
  const c2 = ca * ca - sa * sa; return [(w * ca - h * sa) / c2, (h * ca - w * sa) / c2];
}
/** the furrows' direction in a picture (degrees, y down, to half a degree): the angle whose profile across it (the middle half's luminance
 *  averaged along each line) varies most */
function lineAngle(px, w, h, ch) {
  let best = 0, bv = -1;
  for (let a = -90; a < 90; a += 0.5) {
    const r = a * Math.PI / 180, nx = -Math.sin(r), ny = Math.cos(r), N = 2 * (w + h) * 2 + 8, s = new Float64Array(N), c = new Float64Array(N);
    for (let y = Math.floor(h / 4); y < (3 * h) / 4; y++) for (let x = Math.floor(w / 4); x < (3 * w) / 4; x++) { const k = Math.round((x * nx + y * ny) * 2) + (w + h) * 2 + 4, i = (y * w + x) * ch; s[k] += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11; c[k]++; }
    let m = 0, n = 0; for (let k = 0; k < N; k++) if (c[k] > 20) { m += s[k] / c[k]; n++; } m /= n;
    let v = 0; for (let k = 0; k < N; k++) if (c[k] > 20) { const d = s[k] / c[k] - m; v += d * d; } v /= n;
    if (v > bv) { bv = v; best = a; }
  }
  return best;
}
/** a seeded random (mulberry32) */
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** image quilting: an OW x OH RGB picture of QB px patches of the source (sw x sh RGB), each overlapping the ones left of and above it by QO px,
 *  picked among QC random candidates within QT of the least overlap error (luminance), joined along the minimum-error cut through each overlap */
function quilt(src, sw, sh, OW, OH, r) {
  // (a small source, FAR's: patches at most 60% of its short side)
  const QB = Math.min(QB_MAX, Math.floor(0.6 * Math.min(sw, sh))), QO = Math.max(8, Math.round(QB * QO_SHARE));
  const lum = new Float32Array(sw * sh); for (let i = 0; i < sw * sh; i++) lum[i] = src[i * 3] * 0.3 + src[i * 3 + 1] * 0.59 + src[i * 3 + 2] * 0.11;
  const out = new Uint8Array(OW * OH * 3), olum = new Float32Array(OW * OH), step = QB - QO;
  for (let by = 0; by * step < OH; by++) for (let bx = 0; bx * step < OW; bx++) {
    const ox = bx * step, oy = by * step, bw = Math.min(QB, OW - ox), bh = Math.min(QB, OH - oy), ow = Math.min(QO, bw), oh = Math.min(QO, bh);
    // the candidates' overlap errors (every second pixel)
    const cands = [];
    for (let k = 0; k < QC; k++) {
      const sx = Math.floor(r() * (sw - bw)), sy = Math.floor(r() * (sh - bh)); let e = 0;
      if (bx > 0) for (let y = 0; y < bh; y += 2) for (let x = 0; x < ow; x += 2) { const d = lum[(sy + y) * sw + sx + x] - olum[(oy + y) * OW + ox + x]; e += d * d; }
      if (by > 0) for (let y = 0; y < oh; y += 2) for (let x = 0; x < bw; x += 2) { const d = lum[(sy + y) * sw + sx + x] - olum[(oy + y) * OW + ox + x]; e += d * d; }
      cands.push({ sx, sy, e });
    }
    if (!cands.length || !cands.every(c => Number.isFinite(c.e))) throw new Error(`quilt: source ${sw}x${sh}, block ${bw}x${bh} at ${ox},${oy}: ${cands.slice(0, 2).map(c => JSON.stringify(c))}`);
    const best = Math.min(...cands.map(c => c.e)), ok = cands.filter(c => c.e <= best * (1 + QT) + 1e-6), c = ok[Math.floor(r() * ok.length)];
    // the minimum-error cuts: a mask of the new patch's pixels (1) against the old (0) in the overlaps
    const mask = new Uint8Array(bw * bh).fill(1);
    const cut = (len, wid, err) => { // a path down `len` rows through `wid` columns of least total error: the column at each row
      const D = new Float32Array(len * wid), from = new Int8Array(len * wid);
      for (let i = 0; i < wid; i++) D[i] = err(0, i);
      for (let j = 1; j < len; j++) for (let i = 0; i < wid; i++) { let b = D[(j - 1) * wid + i], f = 0; if (i > 0 && D[(j - 1) * wid + i - 1] < b) { b = D[(j - 1) * wid + i - 1]; f = -1; } if (i < wid - 1 && D[(j - 1) * wid + i + 1] < b) { b = D[(j - 1) * wid + i + 1]; f = 1; } D[j * wid + i] = b + err(j, i); from[j * wid + i] = f; }
      let i = 0; for (let k = 1; k < wid; k++) if (D[(len - 1) * wid + k] < D[(len - 1) * wid + i]) i = k;
      const path = new Int32Array(len); for (let j = len - 1; j >= 0; j--) { path[j] = i; i += from[j * wid + i]; }
      return path;
    };
    if (bx > 0) { const p = cut(bh, ow, (y, x) => { const d = lum[(c.sy + y) * sw + c.sx + x] - olum[(oy + y) * OW + ox + x]; return d * d; }); for (let y = 0; y < bh; y++) for (let x = 0; x < p[y]; x++) mask[y * bw + x] = 0; }
    if (by > 0) { const p = cut(bw, oh, (x, y) => { const d = lum[(c.sy + y) * sw + c.sx + x] - olum[(oy + y) * OW + ox + x]; return d * d; }); for (let x = 0; x < bw; x++) for (let y = 0; y < p[x]; y++) mask[y * bw + x] = 0; }
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      if (!mask[y * bw + x] && (bx > 0 || by > 0)) continue;
      const s = (c.sy + y) * sw + c.sx + x, o = (oy + y) * OW + ox + x;
      out[o * 3] = src[s * 3]; out[o * 3 + 1] = src[s * 3 + 1]; out[o * 3 + 2] = src[s * 3 + 2]; olum[o] = lum[s];
    }
  }
  return out;
}

/** a family's picture, its furrows on its axis at the painting's own scale: the painting turned (its largest upright rectangle); for a family
 *  that turns from another (from), that family's picture quilted to BIG x BIG px and turned the rest of the way */
const BIG = 2600;
async function turnedRect(buf, turn) {
  const meta = await sharp(buf).metadata(), [iw, ih] = inscribed(meta.width, meta.height, turn * Math.PI / 180);
  const turned = await sharp(buf).removeAlpha().rotate(turn, { background: '#000000' }).png().toBuffer(), tm = await sharp(turned).metadata();
  const cw = Math.floor(iw) - 4, chh = Math.floor(ih) - 4;
  return { base: await sharp(turned).extract({ left: Math.floor((tm.width - cw) / 2), top: Math.floor((tm.height - chh) / 2), width: cw, height: chh }).png().toBuffer(), cw, chh };
}
async function baseOf(fam) {
  if (!fam.from) return { ...(await turnedRect(SRC, fam.angle - SRC_ANGLE)), turn: fam.angle - SRC_ANGLE };
  const f0 = FAMILIES.find(f => f.id === fam.from), b0 = await turnedRect(SRC, f0.angle - SRC_ANGLE);
  const { data } = await sharp(b0.base).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const big = await sharp(Buffer.from(quilt(data, b0.cw, b0.chh, BIG, BIG, rng(fam.seed))), { raw: { width: BIG, height: BIG, channels: 3 } }).png().toBuffer();
  return { ...(await turnedRect(big, fam.angle - f0.angle)), turn: fam.angle - SRC_ANGLE };
}

const made = [];
for (const fam of FAMILIES) {
  // the painting turned so its furrows lie on the family's axis (sharp turns clockwise for a positive angle, which on a y-down screen adds it), then
  // its largest upright rectangle
  const { base, cw, chh, turn } = await baseOf(fam);
  const levels = {};
  for (const band of BANDS) {
    const pitch = Math.max(MIN_PITCH[band], FURROW_M * PX_PER_M_ACROSS * BAND_K[band]), k = pitch / SRC_PITCH;
    const { data: src, info } = await sharp(base).resize(Math.round(cw * k), Math.round(chh * k), { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    
    const big = quilt(src, info.width, info.height, 2 * W, 2 * H, rng(fam.seed * 7 + BANDS.indexOf(band)));
    const four = [[0, 0], [W, 0], [0, H], [W, H]].map(([x0, y0]) => { const t = new Uint8Array(W * H * 3); for (let y = 0; y < H; y++) t.set(big.subarray(((y0 + y) * 2 * W + x0) * 3, ((y0 + y) * 2 * W + x0 + W) * 3), y * W * 3); return t; });
    const ang = lineAngle(four[0], W, H, 3), before = setMismatch(four, W, H, 3), healed = healShared(four, W, H, 3, HEAL_BAND), done = setMismatch(healed.tiles, W, H, 3);
    const folder = `art/theme-consistency/generated/ground/run-grass/${fam.dir}/${band}/tiles-v1`, tiles = [], decoded = [], means = [];
    fs.mkdirSync(path.join(ART, folder), { recursive: true }); fs.mkdirSync(path.join(PAINTED, 'tiles', fam.id, band), { recursive: true });
    for (const [i, px] of healed.tiles.entries()) {
      const id = `tile-0${i + 1}`, png = await sharp(Buffer.from(px), { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer();
      fs.writeFileSync(path.join(ART, folder, `${id}.png`), png);
      const file = `tiles/${fam.id}/${band}/${id}.webp`, webp = await sharp(png).webp({ quality: QUALITY, effort: 6, smartSubsample: true }).toBuffer();
      fs.writeFileSync(path.join(PAINTED, file), webp);
      const st = await sharp(png).stats(), mean = st.channels.slice(0, 3).map(c => c.mean); means.push(mean);
      decoded.push((await sharp(webp).raw().toBuffer()));
      tiles.push({ id, file, sha256: sha256(png), mean: hex(mean), source: `${folder}/${id}.png` });
    }
    const after = setMismatch(decoded, W, H, 3), b = m2(done);
    const status = `T289: the owner's ploughed-field painting (PloughedFiled.png) turned ${turn.toFixed(1)} degrees (furrows at ${ang.toFixed(1)}), at ${k.toFixed(3)}x (furrows ${pitch.toFixed(1)} px apart), quilted into four and healed with one shared strip (${HEAL_SHARED}, ${HEAL_BAND} px): finished tiles that meet one another as made; across any two tiles LR ${m2(before).lr} -> ${b.lr} (inside ${b.h}), TB ${m2(before).tb} -> ${b.tb} (inside ${b.v})`;
    levels[band] = { revision: `${band}-tiles-v1`, folder, native: [W, H], decision: { file: null, sha256: null }, tiles, status,
      heal: { method: HEAL_AS_MADE, band: 0, fallback: `T289's finished ${band}-tiles-v1 tiles (shared-strip healed when made)`, before: b, healed: b, after: m2(after) } };
    console.log(`${fam.id} ${band}: furrows at ${ang.toFixed(1)} deg, ${pitch.toFixed(1)} px apart (x${k.toFixed(3)} of ${cw}x${chh}); seams LR ${m2(before).lr} -> ${b.lr} (inside ${b.h}), TB ${m2(before).tb} -> ${b.tb} (inside ${b.v}); shipped LR ${m2(after).lr} TB ${m2(after).tb}`);
    if (REVIEW) {
      // the review: the four shuffled 4 x 4 (any tile beside any)
      const order = [0, 1, 2, 3, 2, 0, 3, 1, 3, 2, 1, 0, 1, 3, 0, 2], comp = order.map((t, i) => ({ input: Buffer.from(healed.tiles[t]), raw: { width: W, height: H, channels: 3 }, left: (i % 4) * W, top: Math.floor(i / 4) * H }));
      await sharp({ create: { width: 4 * W, height: 4 * H, channels: 3, background: '#000' } }).composite(comp).resize(1600).jpeg({ quality: 85 }).toFile(path.join(REVIEW, `${fam.id}-${band}-4x4.jpg`));
    }
  }
  const nearMean = levels.near.tiles.map(t => t.mean);
  made.push({ id: fam.id, materialId: `painted:${fam.id}`, name: fam.name, kind: 'cut', revision: null, selection: null, provisional: true, light: null, mean: nearMean[0], levels });
}

// the manifest: the two families (replacing any earlier take) before the owner families, every family's key, the revision renewed
const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const familyKey = f => {
  if (f.selection) return f.selection.sha256;
  if (!f.owner) return sha256(BANDS.flatMap(b => f.levels[b].tiles.map(t => t.sha256)).join(':'));
  const h0 = f.levels.near.heal;
  if (h0.method === 'wrap-bridge-v1') return sha256(BANDS.map(b => f.levels[b].tiles[0].sha256).join(':') + `|${h0.method}/${h0.band}`);
  return sha256(BANDS.map(b => {
    const lv = f.levels[b], h = lv.heal;
    if (h.method === HEAL_AS_MADE) return `${b}:${h.method}:${lv.tiles.map(t => t.sha256).join(',')}`;
    const c = `${b}:${h.method}/${h.band}@${h.centre.x},${h.centre.y}`;
    if (h.method === HEAL_SHARED) return `${c}:${lv.tiles.map(t => t.sha256).join(',')}`;
    const t = lv.tiles[0], cr = t.crop?.x0 !== undefined ? `:crop ${t.crop.x0},${t.crop.y0},${t.crop.w}x${t.crop.h}` : '';
    return `${c}${cr}:${t.sha256}`;
  }).join('|'));
};
for (const f of made) f.revision = familyKey(f).slice(0, 12);
const ids = new Set(made.map(f => f.id)), rest = man.families.filter(f => !ids.has(f.id)), at = rest.findIndex(f => f.owner);
man.families = [...rest.slice(0, at < 0 ? rest.length : at), ...made, ...(at < 0 ? [] : rest.slice(at))];
man.revision = sha256(man.families.map(familyKey).join(':')).slice(0, 12);
fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 1) + '\n');
console.log(`painted-tiles.json: ${man.families.length} families, revision ${man.revision}; the set PNGs in ${path.join(ART, 'art/theme-consistency/generated/ground/run-grass')}`);
