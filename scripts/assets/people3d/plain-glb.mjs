// A RUN model as a plain GLB for another service (Meshy's rigging said "Pose estimation failed" for RUN's own file, 2026-10-25): the node
// transforms baked in (RUN's models are Z-up under a turned root), no Draco, no quantization, PNG textures, the feet on y = 0 and centred,
// and turned about the vertical so the person faces +Z (Meshy: "the character's face must point toward the +Z axis").
// The facing is read from the feet (the toes reach out in front of the ankles) and printed; --turn <degrees> overrides it.
//
//   node scripts/assets/people3d/plain-glb.mjs <in.glb> <out.glb> [--turn <degrees about +Y>]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tot = process.env.TOT_REPO || path.resolve(root, '../TrickOrTreat');
const [input, output] = process.argv.slice(2), arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
if (!input || !output) throw new Error('Usage: node scripts/assets/people3d/plain-glb.mjs <in.glb> <out.glb> [--turn <degrees>]');

const html = `<!doctype html><html><body>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
window.plain = async (b64, turnArg) => {
  const loader = new GLTFLoader(), draco = new DRACOLoader();
  draco.setDecoderPath('/three/examples/jsm/libs/draco/'); loader.setDRACOLoader(draco); loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await new Promise((res, rej) => loader.parse(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer, '', res, rej));
  gltf.scene.updateMatrixWorld(true);
  // plain float attributes in world space (as cut-plate.mjs)
  const parts = [];
  gltf.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const g = mesh.geometry.clone();
    for (const [name, at] of Object.entries(g.attributes)) {
      if (at.array instanceof Float32Array && !at.normalized && !at.isInterleavedBufferAttribute) continue;
      const f = new Float32Array(at.count * at.itemSize);
      for (let i = 0; i < at.count; i++) for (let k = 0; k < at.itemSize; k++) f[i * at.itemSize + k] = at.getComponent(i, k);
      g.setAttribute(name, new T.BufferAttribute(f, at.itemSize));
    }
    g.applyMatrix4(mesh.matrixWorld);
    parts.push({ g, material: mesh.material });
  });
  const box = new T.Box3(); for (const { g } of parts) { g.computeBoundingBox(); box.union(g.boundingBox); }
  const H = box.max.y - box.min.y;
  // the facing: the mean of the lowest 3% (the soles, toes forward) minus the mean of 6 to 12% (the ankles and shins), on the ground plane
  const sole = new T.Vector3(), shin = new T.Vector3(); let ns = 0, nk = 0;
  for (const { g } of parts) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const h = (p.getY(i) - box.min.y) / H;
    if (h < 0.03) { sole.x += p.getX(i); sole.z += p.getZ(i); ns++; } else if (h > 0.06 && h < 0.12) { shin.x += p.getX(i); shin.z += p.getZ(i); nk++; } } }
  const fx = sole.x / ns - shin.x / nk, fz = sole.z / ns - shin.z / nk, facing = Math.atan2(fx, fz) * 180 / Math.PI;
  // turn so the facing becomes +Z (atan2(x, z) = 0), in steps of 90 degrees unless --turn says otherwise
  const turn = turnArg != null ? +turnArg : -Math.round(facing / 90) * 90;
  const m = new T.Matrix4().makeRotationY(turn * Math.PI / 180);
  const centre = box.getCenter(new T.Vector3());
  const scene = new T.Scene();
  for (const { g, material } of parts) { g.translate(-centre.x, -box.min.y, -centre.z); g.applyMatrix4(m); scene.add(new T.Mesh(g, material)); }
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  const bytes = new Uint8Array(glb); let bin = '';
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { H, facing, turn, base64: btoa(bin) };
};
window.ready = true;
</script></body></html>`;

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  // three.js from TrickOrTreat's node_modules (read only), as cut-plate.mjs
  await page.route('http://local-plain/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (!url.pathname.startsWith('/three/') || url.pathname.includes('..')) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: url.pathname.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', body: await fs.readFile(path.join(tot, 'node_modules', url.pathname)) });
  });
  await page.goto('http://local-plain/'); await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
  const out = await page.evaluate(([b, t]) => window.plain(b, t), [(await fs.readFile(input)).toString('base64'), arg('--turn')]);
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await fs.writeFile(output, Buffer.from(out.base64, 'base64'));
  console.log(`${input}: ${out.H.toFixed(3)} units tall, the toes point ${out.facing.toFixed(0)} degrees from +Z, turned ${out.turn} -> ${output} (${(Buffer.byteLength(out.base64, 'base64') / 1e6).toFixed(1)} MB)`);
} finally { await browser.close(); }
