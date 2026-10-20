// Renders an animated 3D townsperson (art/people3d/<id>/, from make-person-3d.mjs) into the game's walk template: 8 facings drawn
// for real (no mirroring), each an idle frame and WALK frames of one walk cycle, with the game's 2:1 dimetric camera (30 degrees down).
// Adapted from TrickOrTreat's scripts/art/render-hero-3d.mjs (three.js in headless Edge; the same lighting and dark rim), without the gun.
//
//   node scripts/assets/people3d/render-person-3d.mjs <id> [--height <metres, default 1.78>] [--walk <frames, default 8>]
//
// in:  art/people3d/<id>/*.glb   the rigged model with its walk clip (and an idle clip when RUN made one)
// out: art/people3d/<id>/sheet.webp + sheet.json   the people-sheet format TrickOrTreat's art/people uses: rows S SW W NW N NE E SE, columns
//      idle then walk1..walkN, frames at ART_PPM pixels per metre with the feet at the anchor; and preview.png (every frame, labelled)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tot = process.env.TOT_REPO || path.resolve(root, '../TrickOrTreat');
const id = process.argv[2], arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
if (!id) throw new Error('Usage: node scripts/assets/people3d/render-person-3d.mjs <id> [--height m] [--walk n]');
/** the art scale of the people sheets (px per metre), the person's height, the walk frames, supersampling; the frame (px) and the feet in it */
const ART_PPM = 128, HEIGHT = arg('--height', 1.78), WALK = arg('--walk', 8), SS = 3;
const FW = 160, FH = Math.ceil(HEIGHT * ART_PPM + 44), AX = FW / 2, AY = FH - 10;
/** the sheet's rows, and each one's screen direction (degrees, 0 = right, clockwise: S faces the viewer) */
const ROWS = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'], SCREEN = { E: 0, SE: 45, S: 90, SW: 135, W: 180, NW: 225, N: 270, NE: 315 };
const dir = path.join(root, 'art/people3d', id), files = (await fs.readdir(dir)).filter(f => f.endsWith('.glb'));
const pickGlb = re => files.find(f => re.test(f.toLowerCase()));
const walkFile = pickGlb(/walk/) ?? 'rigged.glb', idleFile = pickGlb(/idle/);
const b64 = async f => (await fs.readFile(path.join(dir, f))).toString('base64');

const html = `<!doctype html><html><body style="margin:0;background:transparent">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const parse = b64 => { const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), loader = new GLTFLoader(), draco = new DRACOLoader();
  draco.setDecoderPath('/three/examples/jsm/libs/draco/'); loader.setDRACOLoader(draco); loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise((res, rej) => loader.parse(bytes.buffer, '', res, rej)); };
window.render = async (walkB64, idleB64, o) => {
  const gltf = await parse(walkB64), idle = idleB64 ? await parse(idleB64) : null;
  const canvas = document.createElement('canvas'); canvas.width = o.FW * o.SS; canvas.height = o.FH * o.SS;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  // bright and fairly flat, like the painted sprites: the game adds its own night, shadows and light pools
  scene.add(new THREE.AmbientLight(0xffffff, 2.1));
  const key = new THREE.DirectionalLight(0xfff1dd, 1.5); key.position.set(-2, 4, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 0.7); rim.position.set(3, 2, -3); scene.add(rim);
  const pivot = new THREE.Group(); scene.add(pivot); pivot.add(gltf.scene);
  const bones = {}; gltf.scene.traverse(n => { if (n.isBone) bones[n.name] = n; if (n.isMesh) { n.frustumCulled = false; for (const m of [].concat(n.material)) { m.metalness = 0; m.roughness = 1; } } });
  const hips = bones.Hips ?? Object.values(bones).find(b => /hips|pelvis/i.test(b.name));
  if (!hips) throw new Error('Rig has no hips bone (have: ' + Object.keys(bones).join(',') + ')');
  const walk = gltf.animations.filter(c => c.duration > 0.1).sort((a, b) => b.duration - a.duration)[0];
  if (!walk) throw new Error('No walk clip in the model (clips: ' + gltf.animations.map(c => c.name + ' ' + c.duration).join(', ') + ')');
  const idleClip = idle?.animations.find(c => c.duration > 0.1) ?? null;
  const mixer = new THREE.AnimationMixer(gltf.scene), walkAct = mixer.clipAction(walk), idleAct = idleClip ? mixer.clipAction(idleClip) : null;
  const hipsRest = hips.position.clone();
  // the height from the walk's first frame: feet on the ground, scaled to the person's height
  walkAct.play(); mixer.setTime(0); pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltf.scene), h = box.max.y - box.min.y, s = o.HEIGHT / h;
  gltf.scene.scale.setScalar(s); gltf.scene.position.set(0, -box.min.y * s, 0);
  const ppm = o.ART_PPM * o.SS, halfW = canvas.width / 2 / ppm, halfH = canvas.height / 2 / ppm, pitch = Math.PI / 6;
  const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, 100);
  const up = new THREE.Vector3(0, Math.cos(pitch), -Math.sin(pitch)), back = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
  // the feet (the origin) at the frame's anchor
  const target = up.clone().multiplyScalar((o.AY - o.FH / 2) / o.ART_PPM);
  cam.position.copy(target).addScaledVector(back, 20); cam.up.copy(up); cam.lookAt(target); cam.updateMatrixWorld(true);
  const frames = [], stay = () => { hips.position.x = hipsRest.x; hips.position.z = hipsRest.z; };   // walk in place: no root motion
  const world = b => b.getWorldPosition(new THREE.Vector3()), bone = re => Object.values(bones).find(b => re.test(b.name));
  const lUp = bone(/^(mixamorig:?)?LeftUpLeg$/i) ?? bone(/left.*(up.*leg|thigh)/i), rUp = bone(/^(mixamorig:?)?RightUpLeg$/i) ?? bone(/right.*(up.*leg|thigh)/i);
  const lFoot = bone(/^(mixamorig:?)?LeftFoot$/i) ?? bone(/left.*(foot|ankle)/i);
  if (!lUp || !rUp || !lFoot) throw new Error('Rig is missing the legs (have: ' + Object.keys(bones).join(',') + ')');
  const at = t => { mixer.stopAllAction(); walkAct.play(); mixer.setTime(t); stay(); pivot.rotation.y = 0; pivot.updateMatrixWorld(true); };
  // which way the body faces while walking (the clip can carry a turned body: RUN's walks are ~30 degrees off): the hips' right-to-left line
  // turned a quarter, averaged over the clip; every facing is corrected by it, so S faces the viewer and E faces right
  let fx = 0, fz = 0;
  for (let k = 0; k < 24; k++) { at(walk.duration * k / 24); const r = world(lUp).sub(world(rUp)); fx += -r.z; fz += r.x; }
  const yaw0 = Math.atan2(fx, fz);
  // one stride: the left foot's swing along the facing, its period by autocorrelation; the frames start at its furthest reach (heel strike)
  const N = 240, sig = [];
  for (let k = 0; k < N; k++) { at(walk.duration * k / N); sig.push(world(lFoot).sub(world(hips)).dot(new THREE.Vector3(Math.sin(yaw0), 0, Math.cos(yaw0)))); }
  const mean = sig.reduce((a, b) => a + b, 0) / N, c = sig.map(v => v - mean), corr = lag => { let s = 0; for (let k = 0; k + lag < N; k++) s += c[k] * c[k + lag]; return s / (N - lag); };
  // the first peak after the autocorrelation first goes negative (half a stride later)
  let L0 = 1; while (L0 < N / 2 && corr(L0) > 0) L0++;
  let lag = N, best = -Infinity;
  for (let L = L0; L < N - 4; L++) { const v = corr(L); if (v > best) { best = v; lag = L; } else if (best > 0 && v < best * 0.5) break; }
  const period = walk.duration * lag / N, start = walk.duration * sig.indexOf(Math.max(...sig.slice(0, lag))) / N;
  for (const d of o.ROWS) {
    // screen direction phi; on the ground a screen step is twice as long along the depth axis (2:1)
    const phi = o.SCREEN[d] * Math.PI / 180, yaw = Math.atan2(Math.cos(phi), 2 * Math.sin(phi)) - yaw0;
    for (let f = 0; f <= o.WALK; f++) {
      mixer.stopAllAction();
      if (f === 0 && idleAct) { idleAct.play(); mixer.setTime(0); }
      else { walkAct.play(); mixer.setTime(f === 0 ? start : (start + ((f - 1) / o.WALK) * period) % walk.duration); }
      stay(); pivot.rotation.y = yaw; pivot.updateMatrixWorld(true);
      renderer.render(scene, cam); frames.push(canvas.toDataURL('image/png'));
    }
  }
  return { frames, bones: Object.keys(bones).length, walk: walk.name + ' ' + walk.duration.toFixed(2) + 's, stride ' + period.toFixed(2) + 's, body turned ' + (yaw0 * 180 / Math.PI).toFixed(0) + ' deg', idle: idleClip ? idleClip.name : 'walk frame 0', height: h, period };
};
window.ready = true;
</script></body></html>`;

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } }), problems = [];
  page.on('pageerror', e => problems.push(e.message));
  // three.js from TrickOrTreat's node_modules (read only): no CDN, no dev server
  await page.route('http://people3d.local/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (!url.pathname.startsWith('/three/')) return route.fulfill({ status: 404, body: '' });
    const file = path.join(tot, 'node_modules', url.pathname);
    return route.fulfill({ contentType: file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', body: await fs.readFile(file) });
  });
  await page.goto('http://people3d.local/');
  await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
  const out = await page.evaluate(([w, i, o]) => window.render(w, i, o), [await b64(walkFile), idleFile ? await b64(idleFile) : null, { FW, FH, AY, SS, ART_PPM, HEIGHT, WALK, ROWS, SCREEN }]);
  if (problems.length) throw new Error(problems.join('\n'));
  const PER = WALK + 1, clear = { r: 0, g: 0, b: 0, alpha: 0 }, png = url => Buffer.from(url.split(',')[1], 'base64'), cells = [];
  for (let i = 0; i < out.frames.length; i++) {
    const frame = await sharp(png(out.frames[i])).resize(FW, FH, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // a dark 2 px rim around the whole person, like the hand-painted sprites it stands next to
    const ink = Buffer.alloc(frame.data.length);
    for (let p = 0; p < frame.data.length; p += 4) { ink[p] = 20; ink[p + 1] = 12; ink[p + 2] = 18; ink[p + 3] = frame.data[p + 3] > 90 ? 255 : 0; }
    const rim = await sharp(ink, { raw: frame.info }).blur(1.2).linear([1, 1, 1, 3.2], [0, 0, 0, 0]).png().toBuffer();
    cells.push({ input: await sharp({ create: { width: FW, height: FH, channels: 4, background: clear } }).composite([{ input: rim }, { input: await sharp(frame.data, { raw: frame.info }).png().toBuffer() }]).png().toBuffer(), left: (i % PER) * FW, top: Math.floor(i / PER) * FH });
  }
  await sharp({ create: { width: PER * FW, height: ROWS.length * FH, channels: 4, background: clear } }).composite(cells).webp({ quality: 92, alphaQuality: 100, effort: 6 }).toFile(path.join(dir, 'sheet.webp'));
  const walkSecs = out.period;
  await fs.writeFile(path.join(dir, 'sheet.json'), JSON.stringify({ id: `person:3d:${id}`, name: `${id} (3D template)`, size: 'adult', heightMetres: HEIGHT, frameWidth: FW, frameHeight: FH, anchor: { x: AX, y: AY },
    directions: ROWS, frames: ['idle', ...Array.from({ length: WALK }, (_, k) => `walk${k + 1}`)], walkFps: Math.round(WALK / (walkSecs || 1) * 10) / 10, mirrored: {}, source: `art/people3d/${id}`, clips: { walk: out.walk, idle: out.idle } }, null, 2) + '\n');
  // the preview: every frame on a grass-coloured ground with its row and column, for the owner
  const label = (t, w) => Buffer.from(`<svg width="${w}" height="18"><text x="3" y="13" font-size="12" fill="#fff" font-family="monospace">${t}</text></svg>`);
  await sharp({ create: { width: PER * FW, height: ROWS.length * FH, channels: 4, background: { r: 64, g: 76, b: 40, alpha: 1 } } })
    .composite([...cells, ...ROWS.flatMap((d, r) => Array.from({ length: PER }, (_, f) => ({ input: label(`${d} ${f ? 'walk' + f : 'idle'}`, FW), left: f * FW, top: r * FH })))]).png().toFile(path.join(dir, 'preview.png'));
  console.log(`${id}: ${out.frames.length} frames (${out.bones} bones; walk ${out.walk}; idle ${out.idle}; model ${out.height.toFixed(2)} units tall) -> art/people3d/${id}/sheet.webp, preview.png`);
} finally { await browser.close(); }
