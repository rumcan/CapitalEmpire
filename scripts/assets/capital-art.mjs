// Local generated artwork delivered with Capital Empire. Dimensions and ground anchors
// are initial integration defaults; Sprite Studio can refine them without changing masters.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './source.mjs';

/** Generated business, vegetation and material previews in native game display pixels. */
export function capitalItems() {
  const out = {};
  for (const [pack, cat] of [['businesses/capital-v1', 'Capital businesses'], ['vegetation/trees-v2', 'Capital vegetation'], ['ground/grass-v1', 'Grass materials']]) {
    const dir = path.join(ROOT, 'src/assets', pack), manifest = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifest)) continue;
    for (const m of JSON.parse(fs.readFileSync(manifest, 'utf8')).items) {
      const grass = cat === 'Grass materials', tree = cat === 'Capital vegetation';
      const car = /^(bus|taxi|golf-cart)-(se|sw)$/.test(m.id);
      const decor = grass || /(?:pin-|bag-|bench-|patio-|mower|dock-|bass-boat|footbridge|practice-net)/.test(m.id);
      const width = grass ? 512 : tree ? (/birch/.test(m.id) ? 300 : 420) : car ? 300 : decor ? 220 : m.id === 'stadium' ? 1600 : 700;
      const scale = width / m.width, w = width, h = m.height * scale;
      const id = 'capital:' + (grass ? 'grass-' : '') + m.id;
      const ax = m.anchor ? m.anchor.x * scale : w / 2;
      const ay = m.anchor ? m.anchor.y * scale : grass ? h / 2 : tree ? h - 4 * scale : Math.max(h * 0.55, h - w / 4);
      const footprint = grass ? 2 : tree ? 0.8 : car ? 1.5 : decor ? 1 : w / 128;
      out[id] = { name: m.name || m.id.replaceAll('-', ' '), cat, src: path.join(dir, m.file), w, h, ax, ay,
        boxes: [{ hx: footprint, hy: footprint * (car ? 0.45 : 0.75), dx: 0, dy: 0 }],
        kind: tree ? 'tree' : car ? 'car' : decor ? 'decor' : 'building', solid: grass ? 0 : 2, big: !tree && !decor, door: !tree && !car && !decor };
    }
  }
  return out;
}
