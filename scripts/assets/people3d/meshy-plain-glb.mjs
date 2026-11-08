// Writes <dir>/plain.glb: RUN's model.glb without Draco, quantization or webp (plain float attributes, PNG textures), the form Meshy's
// rigging accepts (meshy.mjs rig <id> --file plain.glb). Free, local; three.js in headless Edge as rig-local-person.mjs.
//   node scripts/assets/people3d/meshy-plain-glb.mjs <id> [--root art/spectators]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tot = process.env.TOT_REPO || path.resolve(root, '../TrickOrTreat');
const id = process.argv[2], arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
if (!id) throw new Error('Usage: node scripts/assets/people3d/meshy-plain-glb.mjs <id> [--root art/spectators]');
const dir = path.join(root, arg('--root', 'art/spectators'), id);

const html = `<!doctype html><html><body>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
window.plain = async b64 => {
  const loader = new GLTFLoader(), draco = new DRACOLoader();
  draco.setDecoderPath('/three/examples/jsm/libs/draco/'); loader.setDRACOLoader(draco); loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await new Promise((res, rej) => loader.parse(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer, '', res, rej));
  let faces = 0;
  gltf.scene.traverse(n => {
    if (!n.isMesh) return;
    // quantized attributes (normalized integers) become plain floats; getX/getY/getZ undo the normalization
    for (const [name, a] of Object.entries(n.geometry.attributes)) {
      const out = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
      n.geometry.setAttribute(name, new T.BufferAttribute(out, a.itemSize));
    }
    faces += (n.geometry.index ? n.geometry.index.count : n.geometry.attributes.position.count) / 3;
  });
  const buffer = await new GLTFExporter().parseAsync(gltf.scene, { binary: true, maxTextureSize: 2048 });
  let bin = ''; const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { base64: btoa(bin), faces };
};
window.ready = true;
</script></body></html>`;

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  await page.route('http://local-rig/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (!url.pathname.startsWith('/three/') || url.pathname.includes('..')) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: url.pathname.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', body: await fs.readFile(path.join(tot, 'node_modules', url.pathname)) });
  });
  await page.goto('http://local-rig/'); await page.waitForFunction(() => window.ready);
  const out = await page.evaluate(b => window.plain(b), (await fs.readFile(path.join(dir, 'model.glb'))).toString('base64'));
  await fs.writeFile(path.join(dir, 'plain.glb'), Buffer.from(out.base64, 'base64'));
  console.log(`${id}: plain.glb (${out.faces} faces, ${(out.base64.length * 0.75 / 1048576).toFixed(1)} MB)`);
} finally { await browser.close(); }
