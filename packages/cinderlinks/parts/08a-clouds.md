## clouds Pixel-art clouds
The clouds are drawn the way a pixel artist draws them (after Raymond Schlitter's Pixelblog on texture and landscapes), not grown from noise: a few deliberate shapes in a few flat tones. One design, many variations by seed.
R: A cloud's shape is a heap of balls of many sizes on a low, level underside: a few big billows, lumps on their upper outlines, smaller lumps on those, a lump or two bulging from a face, a loose wisp off an end. No two neighbours are the same size; the outline is lumps on lumps, never a row of half circles.
R: It is lit as one solid from above and a little to the right, and the light is cut into four flat tones with hard edges, no gradients and no noise: the shade gathers under every billow and deepens toward the base, the boundary between light and shade is one bumpy line of arcs across the whole cloud, and the white highlight sits as caps on the lumps that stand highest.
R: A big billow's face stays calm; only the lumps that bulge from it break it with an arc of shade beneath. Detail gathers at the outline and under the billows, with calm areas between, never an even busy texture.
R: The underside is never a ruled line: it is a row of shallow bellies of uneven widths and depths, darkest of all, and it curls up toward the cloud's two ends.
R: No stray pixels: a pixel that touches none of its own tone is given its neighbours' tone, and a single pixel sticking out of the outline is removed. No outline is drawn.
R: Far clouds (low, near the horizon) are small, flat and use two tones only: things far away take fewer colours and less contrast.
R: The sky is composed, not filled: big clouds high up, middling ones below, a row of small ones over the mountains, in loose groups with open sky between. No cloud touches another or sits over another: the sky has no depth to explain it, so one would seem to ride on the other's head. Each keeps clear sky all round it.
R: Variation comes from the seed alone: how many puffs, how wide, how tall, which are heaped, where the curls sit. The same seed always gives the same cloud.
File: game.js
Check: function pxCloud(
Check: function pixelClouds(

````js file=game.js

// ---- pixel-art clouds (tones in the cloud buffer: 1 highlight, 2 pale body (far clouds), 3 body, 4 shade, 5 deep shade)
// A cloud is a heap of balls of many sizes: a few big billows, lumps on their upper outlines, smaller lumps on those, and a few lumps bulging from the faces.
// The balls are lit as one solid from above and a little to the right, and the light is cut into flat tones: so the shadow gathers under every billow, the
// boundary between light and shade is one bumpy line of arcs across the whole cloud, and the highlight sits as caps on the lumps that stand highest.
const CBW = 460, CBH = 230, CLBOT = new Float32Array(CBW), CLT = new Uint8Array(CBW * CBH), CLZ = new Float32Array(CBW * CBH), CLL = new Float32Array(CBW * CBH);
function pxCloud(cl, cx, baseY, sc, seed, far, boxes) {   // false: it would touch a cloud already there (nothing is drawn)
  const R = mulberry32(seed), ox = CBW >> 1, oy = CBH - 16, balls = [];
  const n = far ? 2 + ((R() * 3) | 0) : 3 + ((R() * 4) | 0), span = sc * (far ? 26 + R() * 30 : 36 + R() * 62);   // (the billows overlap into one mass)
  let top = 1;
  for (let i = 0; i < n; i++) {                                      // the big billows: a hump, each a different size from its neighbour
    const t = n > 1 ? i / (n - 1) : 0.5, hump = 0.36 + 0.64 * Math.sin(Math.PI * (0.1 + 0.8 * t)), r = Math.max(4, sc * (far ? 9 + R() * 4 : 17 + R() * 13) * hump * (i & 1 ? 0.74 : 1.08));
    const b = { x: (t - 0.5) * span + (R() - 0.5) * r * 0.3, y: -r * (far ? 0.3 + R() * 0.2 : 0.2 + 0.45 * hump * R() + 0.12 * hump), r, z: 0 }; balls.push(b);   // (the end billows lie low: the cloud tapers to its ends)
    const lumps = far ? 1 + ((R() * 2) | 0) : 3 + ((R() * 3) | 0);     // lumps on its upper outline, of uneven sizes
    for (let k = 0; k < lumps; k++) {
      const a = -Math.PI * (0.12 + 0.76 * (k + R() * 0.8) / lumps), lr = r * (0.3 + R() * 0.28), lx = b.x + Math.cos(a) * (r - lr * 0.35), ly = b.y + Math.sin(a) * (r - lr * 0.35);
      balls.push({ x: lx, y: ly, r: lr, z: 0 });
      if (!far && lr > 6 && R() < 0.7) { const a2 = a + (R() - 0.5) * 1.2, sr = lr * (0.38 + R() * 0.2); balls.push({ x: lx + Math.cos(a2) * (lr - sr * 0.3), y: ly + Math.sin(a2) * (lr - sr * 0.3), r: sr, z: 0 }); }   // a small lump on the lump
    }
    if (!far && r > 12) for (let k = 0, m = 1 + ((R() * 2) | 0); k < m; k++) {   // a lump bulging from its face (it stands a little toward the eye)
      const fr = r * (0.3 + R() * 0.2), fx = b.x + (R() - 0.5) * r * 0.9, fy = b.y + (R() - 0.65) * r * 0.6, dd = (fx - b.x) * (fx - b.x) + (fy - b.y) * (fy - b.y);
      balls.push({ x: fx, y: fy, r: fr, z: Math.sqrt(Math.max(0, r * r - dd)) - fr * 0.55 });
    }
  }
  if (!far) for (let k = 0, m = (R() * 3) | 0; k < m; k++) { const r = sc * (3.5 + R() * 3.5), sd = R() < 0.5 ? -1 : 1, wx = sd * (span * 0.5 + sc * (22 + R() * 20)); balls.push({ x: wx, y: -r * 0.35, r, z: 0 }, { x: wx + sd * r * 1.1, y: -r * 0.2, r: r * 0.62, z: 0 }, { x: wx - sd * r * 0.9, y: -r * 0.25, r: r * 0.7, z: 0 }); }   // a small loose cloudlet or two off its ends, on the same flat base
  let bx0 = 1e9, bx1 = -1e9; for (const b of balls) { if (b.x - b.r < bx0) bx0 = b.x - b.r; if (b.x + b.r > bx1) bx1 = b.x + b.r; if (b.y - b.r < top) top = b.y - b.r; }
  if (boxes) {                                                      // clear sky all round it, or it is not drawn here
    const w = bx1 - bx0, xc = cx + (bx0 + bx1) * 0.5, y0 = baseY + top, y1 = baseY + 7 * sc, mg = far ? 12 : 34;
    for (const B of boxes) { const m = Math.max(mg, B.mg), dx = Math.abs(((xc - B.xc) % SKW + SKW * 1.5) % SKW - SKW * 0.5); if (dx < (w + B.w) * 0.5 + m * 1.3 && y0 < B.y1 + m && y1 > B.y0 - m) return false; }
    boxes.push({ xc, w, y0, y1, mg });
  }
  CLBOT.fill(0);                                                    // the underside: shallow bellies of uneven widths and depths, curling up to the two ends
  { const xm = (bx0 + bx1) * 0.5, hw = (bx1 - bx0) * 0.5 || 1; let x = bx0 - 4;
    while (x < bx1 + 4) { const w = sc * (far ? 7 + R() * 9 : 10 + R() * 20), dep = sc * (far ? 0.8 + R() * 1.6 : R() < 0.3 ? 4 + R() * 3 : 1.2 + R() * 2.6);
      for (let xi = Math.floor(x); xi < x + w; xi++) { const X = xi + ox; if (X < 0 || X >= CBW) continue; const s = Math.sin(Math.PI * (xi - x) / w), v = dep * Math.sqrt(s > 0 ? s : 0); if (v > CLBOT[X]) CLBOT[X] = v; }
      x += w * (0.72 + R() * 0.2); }
    for (let X = 0; X < CBW; X++) { const t = Math.abs(X - ox - xm) / hw; if (t > 0.55) { const e = (t - 0.55) / 0.45; CLBOT[X] -= e * e * sc * (far ? 4 : 9); } } }
  CLT.fill(0); CLZ.fill(-1);
  for (const b of balls) {                                            // every ball drawn as a ball: the nearest surface wins, and keeps how it faces the light
    const r = b.r, x0 = Math.floor(b.x - r), x1 = Math.ceil(b.x + r), y0 = Math.floor(b.y - r), y1 = Math.ceil(b.y + r);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x - b.x, dy = y - b.y, d2 = dx * dx + dy * dy; if (d2 > r * r) continue;
      const X = x + ox, Y = y + oy; if (X < 0 || X >= CBW || Y < 0 || Y >= CBH || y > CLBOT[X]) continue;
      const zs = Math.sqrt(r * r - d2), z = b.z + zs, k = Y * CBW + X; if (z <= CLZ[k]) continue;
      CLZ[k] = z; CLL[k] = (dx * 0.36 - dy * 0.74 + zs * 0.57) / r;   // (the light: from above, a little right, a little toward the eye)
    }
  }
  const H = -top || 1;
  for (let Y = 0; Y < CBH; Y++) for (let X = 0; X < CBW; X++) {        // the light cut into flat tones; the whole form is darker toward its base
    const k = Y * CBW + X; if (CLZ[k] < 0) continue;
    const up = Y > oy ? 0 : (oy - Y) / H, L = 0.6 * CLL[k] + 0.4 * (0.12 + 0.88 * up) - (Y > oy ? 0.1 : 0);
    CLT[k] = far ? (L > 0.5 ? 2 : 3) : L > 0.76 ? 1 : L > 0.5 ? 3 : L > 0.3 ? 4 : 5;
  }
  for (let pass = 0; pass < 3; pass++) for (let Y = 1; Y < CBH - 1; Y++) for (let X = 1; X < CBW - 1; X++) {   // no stray pixels, no one-pixel spurs
    const k = Y * CBW + X, v = CLT[k]; if (!v) continue;
    const a = CLT[k - 1], b = CLT[k + 1], c = CLT[k - CBW], d = CLT[k + CBW], fill = (a ? 1 : 0) + (b ? 1 : 0) + (c ? 1 : 0) + (d ? 1 : 0);
    if (fill <= 1) { CLT[k] = 0; continue; }
    const same = (a === v ? 1 : 0) + (b === v ? 1 : 0) + (c === v ? 1 : 0) + (d === v ? 1 : 0);
    if (same === 0 || (same === 1 && fill === 4 && pass < 2)) CLT[k] = a && a === b ? a : c && c === d ? c : a && a !== v ? a : b && b !== v ? b : c && c !== v ? c : d || v;   // alone, or a spur one pixel wide, among another tone
  }
  const W = SKW - 1;
  for (let Y = 0; Y < CBH; Y++) { const sy = baseY + Y - oy; if (sy < 0 || sy >= SKH) continue; for (let X = 0; X < CBW; X++) { const v = CLT[Y * CBW + X]; if (v) cl[sy * SKW + ((cx + X - ox) & W)] = v; } }
  return true;
}
function pixelClouds(cl) {   // the whole sky's clouds, composed: big ones high up, middling ones below, a far row over the mountains; loose groups, open sky between, none touching
  const R = mulberry32(90817), boxes = [];
  for (let i = 0; i < 9; i++) for (let t = 0; t < 14; t++) { const g = (R() * 7) | 0; if (pxCloud(cl, Math.round(g * SKW / 7 + (R() - 0.5) * 380 + 180), SH - Math.round(176 + R() * 130), 1.35 + R() * 0.7, 9000 + i * 41, false, boxes)) break; }
  for (let i = 0; i < 18; i++) for (let t = 0; t < 14; t++) { const g = (R() * 9) | 0; if (pxCloud(cl, Math.round(g * SKW / 9 + (R() - 0.5) * 300), SH - Math.round(118 + R() * 52), 0.85 + R() * 0.5, 8000 + i * 37, false, boxes)) break; }
  for (let i = 0; i < 30; i++) for (let t = 0; t < 6; t++) { if (pxCloud(cl, Math.round((i + R() * 0.8) * SKW / 30), SH - Math.round(100 + R() * 34), 0.55 + R() * 0.3, 7000 + i * 31, true, boxes)) break; }
}
````
