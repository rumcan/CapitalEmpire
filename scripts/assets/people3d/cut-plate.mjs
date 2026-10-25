// A ground plate cut off a RUN person model, locally and free: RUN's text-to-3d sometimes models a patch of golf course (grass, balls,
// clubs) fused to the shoes (docs/HANDOVER-PEOPLE.md 3A). The plate is thin, wide and flat-topped, so it is found from the height profile
// (its top is one big spike of upward-facing area low down, then the width drops to the shoes), every triangle at or below its top
// surface is cut, and what the cut sets loose (balls, clubs, plate bumps) goes. The shoe soles are left open, which the game's camera (30 degrees down) never sees.
//
//   node scripts/assets/people3d/cut-plate.mjs <in.glb> <out.glb> [--margin 0.004] [--top <fraction>] [--clear 0] [--flat 0.06] [--keep 0.025]
//     --margin: how far above the found plate top to cut, as a fraction of the model's height (a lumpy plate needs more; too much opens the shoes)
//     --top: the plate top as a fraction of the height, instead of finding it
//     --clear: also cut, up to this fraction above the plate, everything outside the shoes' footprint (clubs or balls fused to a shoe)
//     --flat: the least flat upward area (as a share of the height squared) that counts as a plate (plates 0.13 to 0.67, people 0.002)
//     --keep: loose pieces smaller than this share of the body's triangles go (as rig-local-person.mjs)
// Prints the profile it read and what it cut; with no plate found it says so and writes nothing.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tot = process.env.TOT_REPO || path.resolve(root, '../TrickOrTreat');
const [input, output] = process.argv.slice(2), arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
if (!input || !output) throw new Error('Usage: node scripts/assets/people3d/cut-plate.mjs <in.glb> <out.glb> [--margin 0.004] [--top <fraction>] [--clear 0] [--flat 0.06] [--keep 0.025]');
const options = { margin: +arg('--margin', '0.004'), top: arg('--top', null), clear: +arg('--clear', '0'), flat: +arg('--flat', '0.06'), keep: +arg('--keep', '0.025') };

const html = `<!doctype html><html><body>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
window.cut = async (b64, o) => {
  const loader = new GLTFLoader(), draco = new DRACOLoader();
  draco.setDecoderPath('/three/examples/jsm/libs/draco/'); loader.setDRACOLoader(draco); loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await new Promise((res, rej) => loader.parse(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer, '', res, rej));
  gltf.scene.updateMatrixWorld(true);
  // plain float attributes in world space (RUN's models are quantized: see rig-local-person.mjs)
  const meshes = [];
  gltf.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone();
    for (const [name, at] of Object.entries(geometry.attributes)) {
      if (at.array instanceof Float32Array && !at.normalized && !at.isInterleavedBufferAttribute) continue;
      const f = new Float32Array(at.count * at.itemSize);
      for (let i = 0; i < at.count; i++) for (let k = 0; k < at.itemSize; k++) f[i * at.itemSize + k] = at.getComponent(i, k);
      geometry.setAttribute(name, new T.BufferAttribute(f, at.itemSize));
    }
    geometry.applyMatrix4(mesh.matrixWorld);
    if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
    meshes.push({ mesh, geometry });
  });
  let lo = Infinity, hi = -Infinity;
  for (const { geometry } of meshes) { geometry.computeBoundingBox(); lo = Math.min(lo, geometry.boundingBox.min.y); hi = Math.max(hi, geometry.boundingBox.max.y); }
  const H = hi - lo;
  // the profile: the widest horizontal extent of each thin band over the bottom fifth
  const N = 400, bands = Array.from({ length: N / 5 }, () => [Infinity, -Infinity, Infinity, -Infinity]);
  for (const { geometry } of meshes) {
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = Math.floor((p.getY(i) - lo) / H * N); if (k >= bands.length) continue;
      const b = bands[k]; b[0] = Math.min(b[0], p.getX(i)); b[1] = Math.max(b[1], p.getX(i)); b[2] = Math.min(b[2], p.getZ(i)); b[3] = Math.max(b[3], p.getZ(i));
    }
  }
  const width = bands.map(b => Math.max(b[1] - b[0], b[3] - b[2], 0));
  // and the upward-facing area in each band: a plate's flat top is one big spike of it; shoe tops, balls and clubs give little (the width
  // alone misses plates with clubs standing round the shoes, 2026-10-24: those bands are as wide as the plate)
  const up = new Float64Array(bands.length), a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
  for (const { geometry } of meshes) {
    const p = geometry.attributes.position, idx = geometry.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      a.fromBufferAttribute(p, idx[i]); b.fromBufferAttribute(p, idx[i + 1]); c.fromBufferAttribute(p, idx[i + 2]);
      const k = Math.floor(((a.y + b.y + c.y) / 3 - lo) / H * N); if (k >= bands.length) continue;
      const n = b.clone().sub(a).cross(c.clone().sub(a)), area = n.length() / 2;
      if (area > 0 && n.y / (2 * area) > 0.8) up[k] += area / (H * H);
    }
  }
  const sum4 = (arr, j) => arr.slice(j, j + 4).reduce((s, v) => s + v, 0);
  const profile = width.filter((_, k) => k % 4 === 0).map((w, j) => (j * 4 / N * 100).toFixed(0).padStart(3) + '% ' + (w / H).toFixed(2) + '/' + sum4(up, j * 4).toFixed(3)).join('  ');
  // the plate: the band of the most flat area in the bottom 12%, if it is more than --flat (a plate's top is 0.1 to 0.6 of the height
  // squared; the good people's shoe tops about 0.002); its top is the highest band near it (4% up at most) with a tenth of that area
  // or still 0.8 of the plate's width (a lumpy top: spec_m_plaid's spread over 0-2%)
  let top = o.top != null ? +o.top : null, peak = 0, at = 0;
  for (let k = 0; k < Math.round(0.12 * N); k++) if (up[k] > peak) { peak = up[k]; at = k; }
  if (top == null && peak > o.flat) { let k = at; while (k + 1 < bands.length && k + 1 <= at + 0.04 * N && (up[k + 1] > 0.1 * peak || width[k + 1] > 0.8 * width[at])) k++; top = (k + 1) / N; }
  const shoes = width[Math.min(bands.length - 1, Math.round((top ?? 0) * N) + 4)];
  if (top == null) return { H, profile, plate: false, peak };
  const cutY = lo + (top + o.margin) * H, clearY = lo + (top + o.clear) * H;
  // the shoes' footprint: what is just above the clear height (or above the cut), widened a little
  const foot = [Infinity, -Infinity, Infinity, -Infinity], above = Math.max(cutY, clearY), pad = 0.01 * H;
  for (const { geometry } of meshes) {
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > above && p.getY(i) < above + 0.03 * H) { foot[0] = Math.min(foot[0], p.getX(i)); foot[1] = Math.max(foot[1], p.getX(i)); foot[2] = Math.min(foot[2], p.getZ(i)); foot[3] = Math.max(foot[3], p.getZ(i)); }
  }
  const outside = (p, v) => p.getX(v) < foot[0] - pad || p.getX(v) > foot[1] + pad || p.getZ(v) < foot[2] - pad || p.getZ(v) > foot[3] + pad;
  let plateCut = 0, clearCut = 0, dropped = 0;
  const scene = new T.Scene();
  for (const { mesh, geometry } of meshes) {
    const p = geometry.attributes.position, idx = geometry.index.array, kept = [];
    for (let i = 0; i < idx.length; i += 3) {
      const t = [idx[i], idx[i + 1], idx[i + 2]], ys = t.map(v => p.getY(v));
      if (Math.max(...ys) <= cutY) { plateCut++; continue; }
      if (o.clear > 0 && Math.max(...ys) <= clearY && t.every(v => outside(p, v))) { clearCut++; continue; }
      kept.push(...t);
    }
    // what the cut set loose: the connected parts (welded to find them), all but the body (the tallest) and big pieces beside it go
    const parents = new Int32Array(p.count), weld = new Map(), quantum = H * 1e-5;
    const find = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
    for (let i = 0; i < p.count; i++) { parents[i] = i; const key = [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v / quantum)).join(','); if (weld.has(key)) parents[i] = find(weld.get(key)); else weld.set(key, i); }
    for (let i = 0; i < kept.length; i += 3) { const r = find(kept[i]); parents[find(kept[i + 1])] = r; parents[find(kept[i + 2])] = r; }
    const parts = new Map();
    for (let i = 0; i < kept.length; i += 3) { const r = find(kept[i]); let q = parts.get(r); if (!q) parts.set(r, q = { tris: 0, lo: Infinity, hi: -Infinity }); q.tris++; for (let k = 0; k < 3; k++) { q.lo = Math.min(q.lo, p.getY(kept[i + k])); q.hi = Math.max(q.hi, p.getY(kept[i + k])); } }
    let body = null; for (const q of parts.values()) if (!body || q.hi - q.lo > body.hi - body.lo) body = q;
    const final = [];
    for (let i = 0; i < kept.length; i += 3) { const q = parts.get(find(kept[i])); if (q === body || q.tris >= Math.max(12, body.tris * o.keep)) final.push(kept[i], kept[i + 1], kept[i + 2]); else dropped++; }
    // only the vertices still used (the plate's own would stay in the file and count in the renderer's height: 2.10 units, a person too small)
    const remap = new Int32Array(p.count).fill(-1); let used = 0;
    for (const v of final) if (remap[v] < 0) remap[v] = used++;
    const compact = new T.BufferGeometry();
    for (const [name, at] of Object.entries(geometry.attributes)) {
      const f = new Float32Array(used * at.itemSize);
      for (let v = 0; v < p.count; v++) if (remap[v] >= 0) for (let k = 0; k < at.itemSize; k++) f[remap[v] * at.itemSize + k] = at.array[v * at.itemSize + k];
      compact.setAttribute(name, new T.BufferAttribute(f, at.itemSize));
    }
    compact.setIndex(final.map(v => remap[v]));
    scene.add(new T.Mesh(compact, mesh.material));
  }
  let newLo = Infinity; for (const m of scene.children) { const g = m.geometry, idx = g.index.array, pos = g.attributes.position; for (let i = 0; i < idx.length; i++) newLo = Math.min(newLo, pos.getY(idx[i])); }
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  const bytes = new Uint8Array(glb); let bin = '';
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { H, profile, plate: true, top, shoes: shoes / H, plateCut, clearCut, dropped, newH: hi - newLo, base64: btoa(bin) };
};
window.ready = true;
</script></body></html>`;

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  // three.js from TrickOrTreat's node_modules (read only), as rig-local-person.mjs
  await page.route('http://local-cut/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (!url.pathname.startsWith('/three/') || url.pathname.includes('..')) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: url.pathname.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', body: await fs.readFile(path.join(tot, 'node_modules', url.pathname)) });
  });
  await page.goto('http://local-cut/'); await page.waitForFunction(() => window.ready);
  const out = await page.evaluate(([b, o]) => window.cut(b, o), [(await fs.readFile(input)).toString('base64'), options]);
  console.log(`profile (height share: width / height): ${out.profile}`);
  if (!out.plate) { console.log(`${input}: no ground plate found (the most flat area low down: ${out.peak.toFixed(3)} of the height squared); nothing written`); process.exit(0); }
  await fs.writeFile(output, Buffer.from(out.base64, 'base64'));
  console.log(`${input}: plate top at ${(out.top * 100).toFixed(2)}% of the height (shoes ${out.shoes.toFixed(2)} wide), cut at +${(options.margin * 100).toFixed(2)}%: ${out.plateCut} plate triangles, ${out.clearCut} cleared beside the shoes, ${out.dropped} loose triangles dropped; height ${out.H.toFixed(3)} -> ${out.newH.toFixed(3)} -> ${output}`);
} finally { await browser.close(); }
