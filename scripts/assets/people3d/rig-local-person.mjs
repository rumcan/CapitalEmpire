// A person rigged locally, without RUN's rig service: a base townsperson's skeleton and clips (art/people3d/<from>/anim_<clip>.glb) moved onto
// a new A-pose model (<root>/<id>/model.glb, from make-person-3d.mjs). Adapted from TrickOrTreat's scripts/art/rig-local-costume.mjs (read
// only): the two meshes are lined up by their bounds (centre, height), each new vertex takes the skin weights of the base body's 4 nearest
// vertices (a k-d tree, weighted by closeness), tiny loose islands of the generated mesh are dropped, and the result is exported with the
// base's skeleton and clip. Both models are RUN A-poses of an adult, so the joints line up; a very different build or pose will not.
//
//   node scripts/assets/people3d/rig-local-person.mjs <id> [--from base_man] [--root art/spectators] [--clips walk,idle] [--keep 0.025]
//
// out: <root>/<id>/anim_<clip>.glb for each clip (what render-person-3d.mjs reads), rigged.glb (the rest pose), receipt.json rigFrom
// Free (no credits). Clips RUN made later for the person (make-person-3d.mjs --clips) need RUN's rig; this only reuses the base's clips.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tot = process.env.TOT_REPO || path.resolve(root, '../TrickOrTreat');
const id = process.argv[2], arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
if (!id) throw new Error('Usage: node scripts/assets/people3d/rig-local-person.mjs <id> [--from base_man] [--root art/spectators] [--clips walk,idle] [--keep 0.025]');
const from = arg('--from', 'base_man'), dir = path.join(root, arg('--root', 'art/spectators'), id), keep = +arg('--keep', '0.025');
const clips = arg('--clips', 'walk,idle').split(',').map(c => c.trim()).filter(Boolean);
const baseDir = path.join(root, 'art/people3d', from), model = await fs.readFile(path.join(dir, 'model.glb'));
const sources = [...clips.map(c => ({ name: `anim_${c}.glb`, file: path.join(baseDir, `anim_${c}.glb`) })), { name: 'rigged.glb', file: path.join(baseDir, 'rigged.glb') }];

const html = `<!doctype html><html><body>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
window.rig = async (base, person, keep) => {
  const loader = new GLTFLoader(), draco = new DRACOLoader();
  draco.setDecoderPath('/three/examples/jsm/libs/draco/'); loader.setDRACOLoader(draco); loader.setMeshoptDecoder(MeshoptDecoder);
  const parse = b64 => new Promise((res, rej) => loader.parse(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer, '', res, rej));
  const original = await parse(base), generated = await parse(person);
  original.scene.updateMatrixWorld(true); generated.scene.updateMatrixWorld(true);
  const oldMeshes = [], newMeshes = [];
  original.scene.traverse(n => { if (n.isSkinnedMesh) oldMeshes.push(n); });
  generated.scene.traverse(n => { if (n.isMesh) newMeshes.push(n); });
  if (!oldMeshes.length || !newMeshes.length) throw new Error('Missing the base rig or the new mesh');
  const sourceSkeleton = oldMeshes[0].skeleton;
  if (oldMeshes.some(m => m.skeleton.bones.some((b, i) => b !== sourceSkeleton.bones[i]))) throw new Error('Several skeletons in the base');
  // the new geometry is baked to world space (not the base mesh's bind space), so the inverse binds are worked out afresh
  const skeleton = new T.Skeleton(sourceSkeleton.bones); skeleton.calculateInverses();
  const targetBox = new T.Box3().setFromObject(original.scene), sourceBox = new T.Box3().setFromObject(generated.scene);
  const height = targetBox.max.y - targetBox.min.y, ratio = height / (sourceBox.max.y - sourceBox.min.y);
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('Bad mesh bounds');
  const targetCenter = targetBox.getCenter(new T.Vector3()), sourceCenter = sourceBox.getCenter(new T.Vector3());
  // the base body's vertices (in its rest pose) with their skin weights, at most about 40,000
  const samples = [], point = new T.Vector3();
  const stride = Math.max(1, Math.ceil(oldMeshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0) / 40000));
  for (const mesh of oldMeshes) {
    // the bone matrices are not computed until a render: without this every skinned vertex reads as the origin
    mesh.skeleton.update();
    const g = mesh.geometry;
    for (let i = 0; i < g.attributes.position.count; i += stride) {
      mesh.getVertexPosition(i, point); point.applyMatrix4(mesh.matrixWorld);
      samples.push({ p: point.toArray(), indices: [0, 1, 2, 3].map(k => g.attributes.skinIndex.getComponent(i, k)), weights: [0, 1, 2, 3].map(k => g.attributes.skinWeight.getComponent(i, k)) });
    }
  }
  // a balanced k-d tree: the 4 nearest base vertices of each new vertex without a quadratic scan
  const tree = (pts, depth = 0) => {
    if (!pts.length) return null;
    const axis = depth % 3; pts.sort((a, b) => a.p[axis] - b.p[axis]);
    const mid = pts.length >> 1, node = { sample: pts[mid], axis, left: tree(pts.slice(0, mid), depth + 1), right: tree(pts.slice(mid + 1), depth + 1), min: [...pts[mid].p], max: [...pts[mid].p] };
    for (const c of [node.left, node.right]) if (c) for (let k = 0; k < 3; k++) { node.min[k] = Math.min(node.min[k], c.min[k]); node.max[k] = Math.max(node.max[k], c.max[k]); }
    return node;
  };
  const index = tree(samples);
  const nearest = p => {
    const best = [];
    const visit = node => {
      if (!node) return;
      if (best.length === 4) { let lower = 0; for (let k = 0; k < 3; k++) { const gap = Math.max(node.min[k] - p[k], p[k] - node.max[k], 0); lower += gap * gap; } if (lower >= best[3].d) return; }
      const q = node.sample.p, d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
      if (best.length < 4 || d < best[best.length - 1].d) { best.push({ sample: node.sample, d }); best.sort((a, b) => a.d - b.d); if (best.length > 4) best.pop(); }
      const delta = p[node.axis] - q[node.axis];
      visit(delta < 0 ? node.left : node.right);
      if (best.length < 4 || delta * delta <= best[best.length - 1].d) visit(delta < 0 ? node.right : node.left);
    };
    visit(index); return best;
  };
  const rootInverse = original.scene.matrixWorld.clone().invert();
  let vertices = 0, dropped = 0;
  for (const mesh of newMeshes) {
    let geometry = mesh.geometry.clone();
    // RUN's models come quantized (KHR_mesh_quantization: positions, normals and UVs as normalized integers): writing metres back into those
    // clamps them to [-1, 1], so every attribute is made plain floats first
    for (const [name, at] of Object.entries(geometry.attributes)) {
      if (at.array instanceof Float32Array && !at.normalized && !at.isInterleavedBufferAttribute) continue;
      const f = new Float32Array(at.count * at.itemSize);
      for (let i = 0; i < at.count; i++) for (let k = 0; k < at.itemSize; k++) f[i * at.itemSize + k] = at.getComponent(i, k);
      geometry.setAttribute(name, new T.BufferAttribute(f, at.itemSize));
    }
    // tiny loose islands of the generated mesh go (welded only to find what is connected; the UV seams stay)
    const input = geometry.attributes.position, parents = new Int32Array(input.count), weld = new Map();
    const quantum = Math.max(sourceBox.max.y - sourceBox.min.y, 1e-6) * 1e-5;
    const find = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
    for (let i = 0; i < input.count; i++) {
      parents[i] = i;
      const key = [input.getX(i), input.getY(i), input.getZ(i)].map(v => Math.round(v / quantum)).join(',');
      if (weld.has(key)) parents[i] = find(weld.get(key)); else weld.set(key, i);
    }
    const tris = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: input.count }, (_, i) => i);
    for (let i = 0; i < tris.length; i += 3) { const r = find(tris[i]); parents[find(tris[i + 1])] = r; parents[find(tris[i + 2])] = r; }
    const counts = new Map();
    for (let i = 0; i < tris.length; i += 3) { const r = find(tris[i]); counts.set(r, (counts.get(r) || 0) + 1); }
    const largest = Math.max(...counts.values()), threshold = Math.max(12, largest * keep), kept = [];
    for (let i = 0; i < tris.length; i += 3) if (counts.get(find(tris[i])) >= threshold) kept.push(tris[i], tris[i + 1], tris[i + 2]); else dropped++;
    geometry.setIndex(kept);   // kept indexed (TrickOrTreat un-indexed it: three times the vertices and the file size)
    // matte cloth and skin, like the townspeople (a GLB without metallicFactor reads as metal)
    for (const m of [].concat(mesh.material)) { m.metalness = 0; m.roughness = 0.9; m.needsUpdate = true; }
    geometry.applyMatrix4(mesh.matrixWorld);
    const positions = geometry.attributes.position, skinIndex = new Uint16Array(positions.count * 4), skinWeight = new Float32Array(positions.count * 4);
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).sub(sourceCenter).multiplyScalar(ratio).add(targetCenter);
      const w = new Map();
      for (const { sample, d } of nearest(point.toArray())) {
        const near = 1 / Math.max(d, height * height * 1e-8);
        for (let k = 0; k < 4; k++) w.set(sample.indices[k], (w.get(sample.indices[k]) || 0) + sample.weights[k] * near);
      }
      const ranked = [...w].sort((a, b) => b[1] - a[1]).slice(0, 4), total = ranked.reduce((s, x) => s + x[1], 0);
      if (!total) throw new Error('A vertex has no skin weight');
      ranked.forEach(([bone, v], k) => { skinIndex[i * 4 + k] = bone; skinWeight[i * 4 + k] = v / total; });
      point.applyMatrix4(rootInverse); positions.setXYZ(i, point.x, point.y, point.z);
    }
    geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(skinWeight, 4));
    geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    const skinned = new T.SkinnedMesh(geometry, mesh.material); skinned.name = 'person_' + vertices;
    original.scene.add(skinned); original.scene.updateMatrixWorld(true);
    skinned.bind(skeleton, skinned.matrixWorld.clone()); vertices += positions.count;
  }
  for (const m of oldMeshes) m.removeFromParent();
  const buffer = await new GLTFExporter().parseAsync(original.scene, { binary: true, animations: original.animations, onlyVisible: false, maxTextureSize: 2048 });
  let bin = ''; const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  const span = s => { const xs = s.map(q => q.p); const lo = [0, 1, 2].map(k => Math.min(...xs.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...xs.map(p => p[k]))); return lo.map((v, k) => +(hi[k] - v).toFixed(2)); };
  return { boxes: { base: [targetBox.min.toArray(), targetBox.max.toArray()].map(v => v.map(x => +x.toFixed(2))), baseSamples: span(samples), person: [sourceBox.min.toArray(), sourceBox.max.toArray()].map(v => v.map(x => +x.toFixed(2))) }, base64: btoa(bin), vertices, dropped, bones: skeleton.bones.length, animations: original.animations.map(a => a.name) };
};
window.ready = true;
</script></body></html>`;

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  // three.js from TrickOrTreat's node_modules (read only), as render-person-3d.mjs
  await page.route('http://local-rig/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (!url.pathname.startsWith('/three/') || url.pathname.includes('..')) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: url.pathname.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', body: await fs.readFile(path.join(tot, 'node_modules', url.pathname)) });
  });
  await page.goto('http://local-rig/'); await page.waitForFunction(() => window.ready);
  for (const s of sources) {
    const out = await page.evaluate(([b, m, k]) => window.rig(b, m, k), [(await fs.readFile(s.file)).toString('base64'), model.toString('base64'), keep]);
    await fs.writeFile(path.join(dir, s.name), Buffer.from(out.base64, 'base64'));
    if (s === sources[0]) console.log(JSON.stringify(out.boxes));
    console.log(`${id}: ${s.name} from ${from} (${out.vertices} vertices, ${out.dropped} loose triangles dropped, ${out.bones} bones, clips ${out.animations.join(', ') || 'none'})`);
  }
  const rf = path.join(dir, 'receipt.json'), r = JSON.parse(await fs.readFile(rf, 'utf8').catch(() => '{}'));
  r.rigFrom = `${from} (local rig transfer, rig-local-person.mjs)`; r.clipsFrom = Object.fromEntries(clips.map(c => [c, from]));
  await fs.writeFile(rf, JSON.stringify(r, null, 2) + '\n');
} finally { await browser.close(); }
