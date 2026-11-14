## gallery Galleries and their reactions (T429)
On a tournament day the host's actors list carries the galleries (CapitalEmpire's `play/gallery3p.ts`): each spot with spectators as a `gallery` actor, with each fan where the manager view stands or seats him (an arc round a tee, a ring round a green, the seats of a grandstand) and the point they all face.
R: A fan is the golfer sculpture in his own clothes without a club, standing (or sitting on a grandstand's seat, at its height), turned to what the gallery watches. Ten sets of clothes go round the crowd. A few fans look about now and then.
R: Within 70 m a fan is his sculpture (drawn small further off, from its shrunk copies); out to 220 m a figure of two pixels; beyond that the crowd is not drawn.
R: When a putt drops near a gallery its fans jump and clap, and applause rises; a short putt that misses draws a groan.
R: A crowd's sculptures are made a few a frame, as the golfers' are.
File: game.js
Check: function galleriesIn(
Check: function drawGallery(
Check: function galleryReact(

````js file=game.js

// ---- galleries (T429). galleriesIn keeps the galleries of an actors list (actorsIn calls it); galleryList (from actorsList) puts each crowd in view into
// render's list at its own distance; drawGallery draws its fans far to near. galleryReact (parts/09-hud.md hostRest) makes them cheer or groan.
const galleries = new Map();           // id -> { id, x, y, fans: Float32Array (x, y, height), look: Uint8Array, th: Float32Array, n, seated, cheer, dl, order }
const GAL_NEAR = 70, GAL_FAR = 220, GAL_CHEER = 150, GAL_REACH = 80, FAN_LOOKS = 10;
const FAN_DRESS = [['#c8323a', '#2a3550', '#f6f6f2'], ['#f2f2ee', '#5a5f6a', '#1f2a44'], ['#2f5fae', '#d8cfb4', '#f6f6f2'], ['#f2c94c', '#1e1e24', '#c8323a'], ['#2f8a4e', '#d8cfb4', '#2a2a2e'],
  ['#e87aa8', '#f0f0ea', '#f6f6f2'], ['#5ab8d8', '#2a3550', '#2f5fae'], ['#e8803a', '#6e5a3c', '#f6f6f2'], ['#7a4fa0', '#d8cfb4', '#1f2a44'], ['#9aa4b2', '#1e1e24', '#c8323a']];
const FAN_SKIN = ['#f1c9a4', '#e2b48a', '#c48d62', '#9a6544', '#6e4430'], FAN_HAIR = ['#2c1a12', '#5a3a22', '#a8743c', '#8a8a8a'];
const FAN_L = FAN_DRESS.map((d, k) => lookOf({ shirt: d[0], trousers: d[1], cap: d[2], skin: FAN_SKIN[(k * 3) % 5], hair: FAN_HAIR[k % 4] }));
const FAN_MARK = 0x03fe01;             // the club's steel while a fan is made (a colour nothing else is): its pixels are taken out after
function noClub(S) {   // a fan's sculpture without the club: the marked pixels (and their darkened rim) emptied, the rows' ends found again
  const w = S.w, px = S.px;
  for (let i = 0; i < px.length; i++) { const c = px[i]; if (!c) continue; const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255; if (r <= 3 && b <= 4 && g >= 90) px[i] = 0; }
  for (let y = 0; y < S.h; y++) { let a = w, b = -1; for (let x = 0; x < w; x++) if (px[y * w + x]) { if (x < a) a = x; b = x; } S.x0[y] = a; S.x1[y] = b; }
  S.mip = null; return S;
}
const fanSpr = new Map();
function fanSprite(k, fa, seated, K) {   // fan clothes k, facing fa (as the camera sees him), standing or seated; null when this frame may make no more
  const key = k + (seated ? 'c' : 'i') + fa + (TOD[tmode].glow > 0 ? 'L' : '') + 'k' + K;
  let S = fanSpr.get(key); if (S) return S;
  if (frame !== actFrame) { actFrame = frame; actMade = 0; }
  if (actMade >= ACT_MAKE) return null;
  actMade++;
  const keep = STEELR.slice(); STEELR.fill(FAN_MARK);
  try { S = noClub(mkGolferLook(fa / 16 * 6.2832, seated ? 'c' : 'i', 0, false, K, FAN_L[k])); } finally { STEELR.set(keep); }
  if (fanSpr.size >= ACT_CACHE) { let n = 0; for (const q of fanSpr.keys()) { fanSpr.delete(q); if (++n >= ACT_CACHE / 5) break; } }
  fanSpr.set(key, S);
  return S;
}
function galleriesIn(m, S) {   // the galleries of an actors list (the whole list each time: one missing has gone)
  const seen = new Set();
  for (const a of m.actors) {
    if (!a || a.role !== 'gallery' || !Array.isArray(a.fans) || !a.fans.length || !Array.isArray(a.at)) continue;
    let g = galleries.get(a.id);
    if (!g) { g = { id: a.id, x: 0, y: 0, fans: null, look: null, th: null, n: 0, seated: false, cheer: -1e9, dl: { k: K_ACTOR, d: 0, a: null }, order: null, dd: null }; g.dl.a = g; galleries.set(a.id, g); }
    const n = a.fans.length, F = new Float32Array(n * 3), L = new Uint8Array(n), T = new Float32Array(n), fx = Array.isArray(a.focus) ? a.focus[0] * S : a.at[0] * S, fy = Array.isArray(a.focus) ? a.focus[1] * S : a.at[1] * S - 1;
    for (let k = 0; k < n; k++) { const f = a.fans[k]; F[k * 3] = f[0] * S; F[k * 3 + 1] = f[1] * S; F[k * 3 + 2] = +f[2] || 0; L[k] = (Math.imul(a.id + 7, 2654435761) ^ Math.imul(k + 1, 40503)) >>> 0 & 0xffff; L[k] %= FAN_LOOKS; T[k] = Math.atan2(fy - F[k * 3 + 1], fx - F[k * 3]); }
    if (a.seated && standTurnFans(F, n, a.at[0] * S, a.at[1] * S)) for (let k = 0; k < n; k++) T[k] = Math.atan2(fy - F[k * 3 + 1], fx - F[k * 3]);   // (on a stand the view turned: turned with it, parts/08h-dress.md)
    g.x = a.at[0] * S; g.y = a.at[1] * S; g.fans = F; g.look = L; g.th = T; g.n = n; g.seated = !!a.seated; g.role = 'gallery'; g.order = new Uint16Array(n); g.dd = new Float32Array(n);
    seen.add(a.id);
  }
  for (const id of galleries.keys()) if (!seen.has(id)) galleries.delete(id);
}
function galleryList(tanH) {   // each frame (from actorsList): every crowd in view joins render's list at its point's distance
  for (const g of galleries.values()) {
    const ex = g.x - camX, ey = g.y - camY, d = ex * FX + ey * FY;
    if (d < -20 || d > GAL_FAR + 20 || Math.abs(ex * RX + ey * RY) > tanH * Math.max(1, d) + 30) continue;
    g.dl.d = Math.max(0.5, d); dlist.push(g.dl);
  }
}
function drawGallery(g, d0) {   // a crowd: its fans far to near; near ones as sculptures, further ones as two pixels
  const F = g.fans, n = g.n, O = g.order, D = g.dd, cheer = frame - g.cheer < GAL_CHEER, yaw = Math.round(camYaw * 16 / 6.2832), H = TOD[tmode].haze;
  for (let k = 0; k < n; k++) { O[k] = k; D[k] = (F[k * 3] - camX) * FX + (F[k * 3 + 1] - camY) * FY; }
  O.sort((a, b) => D[b] - D[a]);
  for (let q = 0; q < n; q++) {
    const k = O[q], d = D[k]; if (d < 1 || d > GAL_FAR) continue;
    const x = F[k * 3], y = F[k * 3 + 1], z = F[k * 3 + 2];
    project(x, y, groundH(x, y) + z, PJ); if (PJ.s <= 0 || PJ.x < -40 || PJ.x > VW + 40) continue;
    const hz = d > 50 ? farHaze(d) : 0, L = FAN_L[g.look[k]];
    let S = null, K = GK;
    if (d < GAL_NEAR) {
      let fa = ((Math.round(g.th[k] / 6.2832 * 16) - yaw) % 16 + 16) % 16;
      if (k % 6 === 0 && !cheer) fa = (fa + (((frame + k * 37) >> 7) & 1 ? 1 : 15)) % 16;   // (a few look about)
      K = golferK(DS / d); S = fanSprite(g.look[k], fa, g.seated, K);
    }
    const hop = cheer ? Math.round(Math.abs(Math.sin((frame - g.cheer) * 0.32 + k * 1.7)) * (g.seated ? 2 : 4) * Math.min(1.5, PJ.s * 2)) : 0;
    if (S) blit(S, PJ.x, PJ.y - hop, PJ.s / K, PJ.d * 100 - (g.seated ? 40 : 0), 0, 0, false, hz);
    else { const a = lit(tone(L.trou, 0.6)), b = lit(tone(L.shirt, 0.7)); plotZ(PJ.x, PJ.y - 1 - hop, d, hz > 0 ? hazed(a, hz, H) : a); plotZ(PJ.x, PJ.y - 2 - hop, d, hz > 0 ? hazed(b, hz, H) : b); }
  }
}
function galleryReact(m) {   // a stroke has come to rest (hostRest): a holed putt (or any holed shot) near a crowd makes it cheer; a short putt that misses, groan
  if (!m || !galleries.size) return;
  const S = typeof hostS === 'function' ? hostS() : 1, rx = m.rest[0] * S, ry = m.rest[1] * S;
  const near = [...galleries.values()].filter((g) => Math.hypot(g.x - rx, g.y - ry) < GAL_REACH);
  if (!near.length) return;
  if (m.holed) { for (const g of near) g.cheer = frame; sndApplause(Math.min(1, near.reduce((a, g) => a + g.n, 0) / 120)); }
  else if (m.club === 'putter' && Math.hypot(hole.pin.x - rx, hole.pin.y - ry) < 3) sndGroan();
}
function sndApplause(v) {   // claps, many and loose, over a wash of noise
  if (sndMsg('applause', { p: v })) return;   // (host mode: the host plays it)
  hiss('bandpass', 1500, 1100, 0.5, 2.8, 0.16 * (0.4 + v), 0.25);
  for (let k = 0; k < 46; k++) hiss('bandpass', 1500 + Math.random() * 1400, 1200, 2, 0.05, (0.04 + Math.random() * 0.05) * (0.4 + v), 0.003, k * 0.055 + Math.random() * 0.05);
}
function sndGroan() { if (sndMsg('groan')) return; thump(210, 130, 1.1, 0.18); hiss('lowpass', 520, 260, 0.7, 1.2, 0.16, 0.2); }
````
