## golfart CapitalEmpire's golfers (T450)
The people of the course can be drawn as CapitalEmpire's own rendered golfers (art/golfers/<id>: `sheet` idle and walk, `golf_drive` 12 frames, `golf_putt` 8 frames; a row for each of eight directions, S SW W NW N NE E SE, frames across) instead of the voxel figure.
R: In host mode the player is the golfer of his player card and every other golfer is the one the manager view shows (the dress's `art`, protocol3p.ts); a caddie, a person with no art and anyone in a cart seat keep the voxel figure.
R: Without a host the style menu has a Golfer choice: the voxel figure or one of the golfers; the choice is kept in the browser.
R: A golfer's art is as tall as the voxel figure at the same scale; all of a golfer's clips share one scale; the direction row follows the facing the camera sees (a sixteenth turns 22.5 degrees).
R: The art is lit by the time of day (its colours times the sun's colour against the day's; at night the moon's, between its light and its shade) and casts the same shadow as the voxel figure. The glow pass (the floodlights' pools, a lantern) then lights it like everything else on the picture, so a golfer in a floodlit pool is lit and one in the dark is dark (#1200).
R: Nothing stalls: the pictures load in the background; a frame is made from them only when it is needed, a few milliseconds of it a step at most, and until it is made the nearest frame already made (or the voxel figure) stands in.
R: J5b: while a golfer's art is still loading he is not drawn at all (never the voxel figure in his place); only art that failed to load gives the voxel figure. The picture and its frame table are fetched side by side.
File: game.js
Check: function golferPic(
Check: function artFrame(
Check: GOLFART_IDS = [

````js file=game.js

// ---- CapitalEmpire's golfers (T450): the rendered golfer art (copied by build.mjs into golfart/<id>/) in place of the voxel figure.
const GOLFART_IDS = ['golf_am_m1', 'golf_am_m2', 'golf_am_m3', 'golf_am_w1', 'golf_pro_m1', 'golf_pro_m2', 'golf_pro_m3', 'golf_pro_m4', 'golf_pro_w1', 'golf_pro_w2'];   // (look3p.ts GOLFER_ART_IDS: the test keeps them the same)
const GOLFART_CLIPS = ['sheet', 'golf_drive', 'golf_putt'], GA_AWAY = 12, GA_ALPHA = 110, GA_MS = 3, GA_CACHE = 900;   // (AWAY: the facing, in sixteenths as the camera sees, of a golfer turned away from it; ALPHA: the least alpha drawn; MS: the ms a step may spend making frames)
const gaAtlas = new Map(), gaSpr = new Map(), gaVoxH = new Map(), gaWarmQ = [];
let gaSolo = '', gaHost = '', gaFrame = -1, gaSpent = 0, gaCanvas = null, gaCtx = null;
try { const g0 = localStorage.getItem('cinderlinks.golfer'); if (g0 && GOLFART_IDS.includes(g0)) gaSolo = g0; } catch (e) { /* not kept */ }
function artIdOf(d) { return d && typeof d.art === 'string' && GOLFART_IDS.includes(d.art) ? d.art : ''; }   // a dress's golfer art, or none
function gaName(id) { const m = /^golf_(am|pro)_([mw])(\d)$/.exec(id); return m ? (m[1] === 'pro' ? 'Pro ' : 'Amateur ') + (m[2] === 'w' ? 'woman ' : 'man ') + m[3] : id; }
// which frame of which clip a pose shows: walk, the sheet's frames 1..8; standing, its frame 0; a full swing, golf_drive's twelve (0..3 the backswing by how
// far the club is back, 4 and 5 the downswing, 6 the strike, 7..11 the follow-through by how far through it is); a putt, golf_putt's eight (0..3 back, 4 the
// strike, 4..7 through). al: the club's angle (the sculpture's, -2 at the top of the backswing, up to 2.2 at the finish); released: the club is on its way down
function artFrame(pose, ph, al, released, putt) {
  if (pose === 'a') return [putt ? 'golf_putt' : 'golf_drive', 0];   // (J5b: at address: the swing's first frame, the club at the ball)
  if (pose === 'w') return ['sheet', 1 + (((ph | 0) % 8) + 8) % 8];
  if (pose !== 's') return ['sheet', 0];
  const t = Math.min(1, Math.max(0, -al / 2));
  if (putt) return ['golf_putt', al < 0 ? (released ? 3 : Math.round(t * 3)) : 4 + Math.round(Math.min(1, al / 2.2) * 3)];
  return ['golf_drive', al < 0 ? (released ? (t > 0.5 ? 4 : 5) : Math.round(t * 3)) : 6 + Math.round(Math.min(1, al / 2.2) * 5)];
}
function artRow(fa) { const k = ((Math.round((fa - GA_AWAY) / 2) % 8) + 8) % 8; return (k + 4) % 8; }   // the sheet's row for a facing: turned away (fa 12) is N, row 4; a sixteenth turns him clockwise
function gaLoad(id, clip) {   // a clip's picture and its frame table, fetched once, in the background, side by side (J5b: the picture no longer waits for the table)
  const key = id + '/' + clip; let a = gaAtlas.get(key); if (a) return a;
  a = { img: null, meta: null, ready: false, bad: false, personH: 0, got: 0 }; gaAtlas.set(key, a);
  if (typeof Image === 'undefined' || typeof fetch !== 'function') { a.bad = true; return a; }   // (the harness: no pictures, the voxel figure)
  const both = () => { if (++a.got < 2 || a.bad) return; a.ready = true; if (clip === 'sheet') gaMeasure(a); };
  a.img = new Image(); a.img.onload = both; a.img.onerror = () => { a.bad = true; };   // (no art: the voxel figure)
  a.img.src = 'golfart/' + id + '/' + clip + '.webp';
  fetch('golfart/' + id + '/' + clip + '.json').then((r) => r.json()).then((m) => { a.meta = m; both(); }).catch(() => { a.bad = true; });
  return a;
}
// J5b: until a golfer's art is ready he is not drawn at all (GA_NONE, a sculpture with no pixels): never the voxel figure in his place. Only art that
// failed to load (or a page with no pictures: the harness) gives the voxel figure. gaReady: the player's three clips are in (or failed).
let GA_NONE = null;
function gaNone() { if (!GA_NONE) { GA_NONE = sculpt(1, 1, 0, 0); sDone(GA_NONE, 0); GA_NONE.art = true; GA_NONE.none = true; } return GA_NONE; }
function gaBad(id) { return GOLFART_CLIPS.some((c) => gaLoad(id, c).bad); }
function gaReady(id) { if (!id) return true; return GOLFART_CLIPS.every((c) => { const a = gaLoad(id, c); return a.bad || (a.ready && (c !== 'sheet' || a.personH > 0)); }); }
function gaCan(w, h) {
  if (!gaCanvas) { gaCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas'); gaCtx = gaCanvas.getContext('2d', { willReadFrequently: true }); }
  gaCanvas.width = w; gaCanvas.height = h; gaCtx.clearRect(0, 0, w, h); return gaCtx;
}
function gaMeasure(a) {   // the person's height on the sheet: from the top of his head in the idle frame facing the viewer to the anchor (his feet)
  const m = a.meta, fw = m.frameWidth, fh = m.frameHeight, c = gaCan(fw, fh); c.drawImage(a.img, 0, 0, fw, fh, 0, 0, fw, fh);
  const d = c.getImageData(0, 0, fw, fh).data; let top = fh;
  for (let y = 0; y < fh && top === fh; y++) for (let x = 0; x < fw; x++) if (d[(y * fw + x) * 4 + 3] > 100) { top = y; break; }
  a.personH = Math.max(1, m.anchor.y - top);
}
function gaVoxel(K) {   // the voxel golfer's height at scale K, in sprite pixels (feet to the top of his cap)
  let h = gaVoxH.get(K); if (h) return h;
  const S = golferSprite(GA_AWAY, 'i', 0, K); let top = -1;
  for (let y = 0; y < S.h; y++) if (S.x1[y] >= S.x0[y]) { top = y; break; }
  h = Math.max(1, S.ay - top); gaVoxH.set(K, h); return h;
}
function gaTint() { const T = TOD[tmode], d = TOD[0].sun, s = tmode >= 3 ? T.sun.map((v, i) => T.sh[i] + (v - T.sh[i]) * 0.7) : T.sun; return [Math.min(1.15, s[0] / d[0]), Math.min(1.15, s[1] / d[1]), Math.min(1.15, s[2] / d[2])]; }   // the light of the hour against the day's
function gaKey(id, clip, row, f, K) { return id + clip + row + '_' + f + '_' + K + '_' + tmode; }
function gaMake(id, clip, row, f, K) {   // one frame as a sculpture: the art scaled to the voxel figure's height, lit by the hour; null when it cannot be made yet
  const a = gaLoad(id, clip), s0 = gaLoad(id, 'sheet'); if (!a.ready || !s0.ready || !s0.personH) return null;
  if (frame !== gaFrame) { gaFrame = frame; gaSpent = 0; }
  if (gaSpent >= (coverOn ? 12 : GA_MS)) return null;   // (J5b: more a step behind the loading cover)
  const t0 = performance.now(), m = a.meta, fw = m.frameWidth, fh = m.frameHeight, sc = gaVoxel(K) / s0.personH;
  const w = Math.max(2, Math.ceil(fw * sc)), h = Math.max(2, Math.ceil(fh * sc)), c = gaCan(w, h);
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(a.img, f * fw, row * fh, fw, fh, 0, 0, w, h);
  const d = c.getImageData(0, 0, w, h).data, T = gaTint(), S = sculpt(w, h, Math.round(m.anchor.x * sc), Math.round(m.anchor.y * sc));
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] < GA_ALPHA) continue;
    const r = Math.min(255, Math.round(d[i * 4] * T[0])), g = Math.min(255, Math.round(d[i * 4 + 1] * T[1])), b = Math.min(255, Math.round(d[i * 4 + 2] * T[2]));
    S.px[i] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;   // (the light byte 255: the art's own colours, as the hour has lit them)
  }
  sDone(S, 0); S.wind = null; S.art = true;
  if (gaSpr.size > GA_CACHE) gaSpr.clear();
  gaSpr.set(gaKey(id, clip, row, f, K), S); gaSpent += performance.now() - t0;
  return S;
}
// a golfer's frame: made if this step may still make one; else the nearest frame of the clip already made, else his standing frame, else null (the voxel figure)
function artSprite(id, fa, pose, ph, K, al, released, putt) {
  const [clip, f] = artFrame(pose, ph, al, released, putt), row = artRow(fa);
  const S = gaSpr.get(gaKey(id, clip, row, f, K)) || gaMake(id, clip, row, f, K); if (S) return S;
  for (let k = 1; k < 12; k++) for (const g of [f - k, f + k]) { const N = gaSpr.get(gaKey(id, clip, row, g, K)); if (N) return N; }
  return gaSpr.get(gaKey(id, 'sheet', row, 0, K)) || null;
}
function gaWarm(id, row, K) {   // the frames he will need next, made a few milliseconds a step in the background: his swing, his putt and his walk in the way he faces
  const k = id + row + K + '_' + tmode; if (gaWarmQ.k === k) return; gaWarmQ.length = 0; gaWarmQ.k = k;
  for (const [clip, n] of [['golf_drive', 12], ['golf_putt', 8], ['sheet', 9]]) for (let f = 0; f < n; f++) gaWarmQ.push([id, clip, row, f, K]);
}
function gaPump() { while (gaWarmQ.length) { const q = gaWarmQ[0]; if (!gaSpr.get(gaKey(q[0], q[1], q[2], q[3], q[4]))) { if (!gaMake(q[0], q[1], q[2], q[3], q[4])) return; } gaWarmQ.shift(); } }
function gaPlayerId() { return HOST ? gaHost : gaSolo; }
// the player's picture (render): his golfer art when he has one and it is ready, the voxel figure in the cart and until then
function golferPic(fa, pose, ph, K) {
  const id = gaPlayerId();
  if (id && pose !== 'c') {
    for (const c of GOLFART_CLIPS) gaLoad(id, c);
    const released = player.swing >= 0 || !!(HP && HP.sw && HP.sw.rel), S = artSprite(id, fa, pose, ph, K, player.al, released, pose === 'a' ? addressPutt() : puttNow());   // (J5d: waiting at the ball, the stance by its ground)
    gaWarm(id, artRow(fa), K); gaPump();
    if (S) return S;
    if (!gaBad(id)) return gaNone();   // (J5b: his art is still coming: nothing, not the voxel figure)
  }
  return pose === 'a' ? golferSprite(fa, 's', 0, K) : golferSprite(fa, pose, ph, K);   // (J5b: the voxel figure at address: his swing pose, the club at the ball)
}
// another golfer's picture (actorsList): his art when ready, else null (the voxel figure in his clothes)
function actorArt(r, fa, ps, K) {
  if (!r.art) return null;
  for (const c of GOLFART_CLIPS) gaLoad(r.art, c);
  return artSprite(r.art, fa, ps[0], ps[1], K, ps[0] === 's' ? ps[1] * 0.2 : 0, false, r.doing === 'putt') || (gaBad(r.art) ? null : gaNone());   // (J5b: nothing until his art is ready)
}
// the style menu's Golfer column (without a host: in host mode he is the golfer of his player card)
function golferCol() {
  const b = (id, name) => '<button type="button" data-kind="g" data-id="' + id + '"' + ((gaSolo || 'voxel') === id ? ' class="on"' : '') + '>' + name + '</button>';
  return '<div class="grp"><i>Golfer</i>' + b('voxel', 'Cinderlinks') + GOLFART_IDS.map((id) => b(id, gaName(id))).join('') + '</div>';
}
function golferPick(id) {
  gaSolo = GOLFART_IDS.includes(id) ? id : '';
  try { localStorage.setItem('cinderlinks.golfer', gaSolo); } catch (e) { /* not kept */ }
  if (gaSolo) for (const c of GOLFART_CLIPS) gaLoad(gaSolo, c);
}
if (gaSolo) for (const c of GOLFART_CLIPS) gaLoad(gaSolo, c);
````
