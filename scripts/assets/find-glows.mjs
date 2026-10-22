// The lit spots painted into a sprite (amber windows, porch and street lamps, lanterns, pumpkin faces, neon, headlights): TrickOrTreat's
// scripts/town-builder/find-glows.mjs, ported to run on a picture in memory, so sprites the builder never scanned (its recoloured and
// regenerated variations) get their windows too, without writing to TrickOrTreat (read only). The game's night (src/game/night-light.ts)
// puts the painted colour back round each glow: [{x, y, r}] in game px at scale 1 from the sprite's top left.
import sharp from 'sharp';

const CELL = 6; // file pixels per analysis cell
// only things that really give off light are scanned: buildings, vehicles (headlights), lamps, lanterns, pumpkins, stands
const SHINES = /^(Houses|Shops & services|Landmarks & venues|House backs|House rear & side views|Vehicles|More houses|Landmarks|Derelict town)$/;
const SHINE_ID = /^(world:(streetlamp|vending|candy_stand|pumpkin_d|schoolbus|drivein_screen|drivein_marquee|snack_bar|gazebo)|ref:building-drive-in-screen|town:traffic_light|ref:halloween-(lantern|pumpkin-cluster)|town:(phone_booth|bus_stop)|gen:inflatable-pumpkin|expansion:(firepit|blowmold-ghost|homemade-ufo|treehouse|camper|pop-up-caravan|glasshouse|rocket-playfort|mobile-home)|ref:halloween-hay-bales)$/;
/** does this sprite shine at night (by its category, or its id) */
export const shines = (id, cat) => SHINES.test(cat ?? '') || SHINE_ID.test(id) || /^variation:(world-house|gen-house|gen-back|ref-building|town-)/.test(id);

// a lit pixel: bright, warm, yellow-orange (lamplight), or saturated neon pink/cyan; leaves and brick are too dark
function lit(r, g, b, car, screen, leafy) {
  if (leafy) { const lum = 0.3 * r + 0.59 * g + 0.11 * b; return lum > 200 && r > 235 && g > 185 && b < g * 0.8; }
  const max = Math.max(r, g, b), min = Math.min(r, g, b), lum = 0.3 * r + 0.59 * g + 0.11 * b;
  if (screen && lum > 135) return true; // the drive-in's lit screen
  if (car) return lum > 232 && r > 225 && g > 205 && b > 120 && b <= r + 5; // vehicles: only the bright lamps, not a yellow or cream body
  if (max > 235 && g < 110 && r > 220) return true; // red signal / tail light glow
  if (max > 200 && g > 170 && b > 200 && r < 140) return true; // cyan / blue neon
  if (lum > 165 && r > 200 && g > 140 && b < g * 0.82 && r - b > 70) return true; // amber / yellow window light
  if (max > 220 && max - min > 110 && lum > 120 && r > 200 && b > 170 && g < 150) return true; // pink neon
  return false;
}

/** the lit spots of a sprite's picture (buf: any image sharp reads; w: the sprite's width in game px), biggest first, at most 48 */
export async function findGlows(buf, { id, w, cat }) {
  const car = cat === 'Vehicles' || id === 'world:schoolbus', screen = /drive-in-screen|drivein_screen/.test(id), leafy = /^expansion:treehouse$/.test(id);
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, gw = Math.ceil(W / CELL), gh = Math.ceil(H / CELL), cells = new Float32Array(gw * gh);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; if (data[o + 3] < 160) continue; if (lit(data[o], data[o + 1], data[o + 2], car, screen, leafy)) cells[Math.floor(y / CELL) * gw + Math.floor(x / CELL)]++; }
  const on = new Uint8Array(gw * gh); for (let i = 0; i < gw * gh; i++) on[i] = cells[i] >= CELL * CELL * 0.18 ? 1 : 0;
  // connected clusters of lit cells
  const seen = new Uint8Array(gw * gh), glows = [], k = w / W; // game px per file px
  for (let i = 0; i < gw * gh; i++) {
    if (!on[i] || seen[i]) continue;
    const q = [i]; seen[i] = 1; let sx = 0, sy = 0, cnt = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    while (q.length) {
      const c = q.pop(), cx = c % gw, cy = Math.floor(c / gw); sx += cx; sy += cy; cnt++; x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const a = cx + dx, b = cy + dy; if (a < 0 || b < 0 || a >= gw || b >= gh) continue; const j = b * gw + a; if (on[j] && !seen[j]) { seen[j] = 1; q.push(j); } }
    }
    const r = Math.max(x1 - x0 + 1, y1 - y0 + 1) * CELL * k / 2;
    if (car && r > 7) continue; // a headlight is small: a big patch on a car is paintwork
    if (car && (sy / cnt + 0.5) * CELL < H * 0.55) continue; // lamps sit low on a vehicle: bright spots up top are roof and glass highlights
    glows.push({ x: +((sx / cnt + 0.5) * CELL * k).toFixed(1), y: +((sy / cnt + 0.5) * CELL * k).toFixed(1), r: +Math.max(3, r).toFixed(1), a: cnt });
  }
  glows.sort((a, b) => b.a - a.a);
  return glows.slice(0, 48).map(({ a, ...g }) => g);
}
