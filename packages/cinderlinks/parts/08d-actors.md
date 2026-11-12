## actors Other people on the course (T424)
In host mode CapitalEmpire sends who else is on the course (`{ v: 1, t: 'actors', at, actors }`, its `play/actors3p.ts`): the other golfers of the owner's group and of the field, their caddies and their carts. The view keeps the list and draws each of them where the host has them, every frame.
R: A golfer or a caddie is the player's own golfer sculpture in his own clothes: his shirt, trousers, cap, skin and hair colours swap into the sculpture's materials while it is made, so the player's golfer is unchanged and every person is lit by the one sun. His build makes him a little taller or shorter.
R: A person is drawn in the pose the host says he is in: walking (the walk's step follows the ground he covers), standing or watching, addressing the ball (the backswing comes at the end of the address), swinging (from the strike to the finish) and putting (a short stroke). A golfer riding is drawn sitting in his cart.
R: A cart is the player's cart model drawn at another place and heading, with its riders in their own clothes; the player's cart is not touched.
R: Between two messages each one moves smoothly from where it was drawn to where the new message puts it, over the time the last two messages were apart; one that jumps far (a new hole) is put there at once.
R: Near ones cast their live shadow. Within 60 m a person is the full sculpture; out to 180 m the same sculpture drawn small (its shrunk copies); beyond that a figure of two pixels, its shirt over its trousers.
R: Sculptures are made when first needed (a few a frame) and kept by pose, facing and clothes; the player's golfer is the one the host does not send (the owner).
File: game.js
Check: function actorsIn(
Check: function actorsList(
Check: function drawActor(

````js file=game.js

// ---- actors (T424): the host's other people. actorsIn keeps the list a message brings; actorsList (called by render before it sorts what stands in
// view) places each, picks its sculpture and casts its shadow, and puts it in the list; drawActor draws it in its turn, far to near.
const K_ACTOR = 25;                    // the kind of an actor's entry in render's list (the others: 0..7 things, 20..24 the flag, golfer, ball, tee marks, cart)
const actors = new Map();              // id -> what is drawn of it
let grpOwner = -1, actLast = 0, actFrame = -1, actMade = 0, ACT_MAKE = 3, ACT_MS = 0;   // the last message's time; sculptures made this frame (at most ACT_MAKE); the ms spent (the harness reads it)
const ACT_SNAP = 60, ACT_NEAR = 60, ACT_FAR = 180, ACT_MAXD = 420, ACT_SHADOW = 30, ACT_CACHE = 600;
function shadeRamp(hex) {   // a '#rrggbb' as a ramp of five tones, dark to light, as the golfer's materials are
  const n = /^#[0-9a-f]{6}$/i.test(hex || '') ? parseInt(hex.slice(1), 16) : 0x808080, c = [n >> 16, (n >> 8) & 255, n & 255];
  return ramp([0.5, 0.68, 0.85, 1, 1.13].map((f) => '#' + c.map((v) => Math.min(255, Math.round(v * f)).toString(16).padStart(2, '0')).join('')));
}
const actLooks = new Map();
function lookOf(d) {   // a dress (shirt, trousers, cap, skin, hair) as the sculpture's ramps, made once a dress
  if (!d || typeof d !== 'object') return null;
  const key = [d.shirt, d.trousers, d.cap, d.skin, d.hair].join('');
  let L = actLooks.get(key);
  if (!L) { L = { key, shirt: shadeRamp(d.shirt), trou: shadeRamp(d.trousers), cap: shadeRamp(d.cap), skin: shadeRamp(d.skin), hair: shadeRamp(d.hair) }; actLooks.set(key, L); }
  return L;
}
// the golfer sculpture in other clothes: the look's ramps stand in for the materials while mkGolfer builds it, then the player's own are put back (so his
// golfer, and any sculpture made without a look, is exactly as before)
function mkGolferLook(theta, pose, ph, lamp, K, L) {
  if (!L) return mkGolfer(theta, pose, ph, lamp, K);
  const keep = GMAT.slice();
  GMAT[M_SKIN] = L.skin; GMAT[M_POLO] = L.shirt; GMAT[M_TROU] = L.trou; GMAT[M_CAP] = L.cap; GMAT[M_BRIM] = L.cap; GMAT[M_HAIR] = L.hair;
  try { return mkGolfer(theta, pose, ph, lamp, K); } finally { for (let i = 0; i < keep.length; i++) GMAT[i] = keep[i]; }
}
const actSpr = new Map();
function actorSprite(L, fa, pose, ph, K) {   // a person's sculpture by clothes, pose, facing (sixteenths, as the camera sees him) and scale; null when this frame may make no more
  const lamp = TOD[tmode].glow > 0, key = (L ? L.key : '-') + pose + fa + '_' + ph + (lamp ? 'L' : '') + 'k' + K;
  let S = actSpr.get(key); if (S) return S;
  if (frame !== actFrame) { actFrame = frame; actMade = 0; }
  if (actMade >= ACT_MAKE) return null;
  actMade++;
  S = mkGolferLook(fa / 16 * 6.2832, pose, pose === 's' ? ph * 0.2 : ph, lamp, K, L);
  if (actSpr.size >= ACT_CACHE) { let n = 0; for (const k of actSpr.keys()) { actSpr.delete(k); if (++n >= ACT_CACHE / 5) break; } }   // (the oldest fifth goes)
  actSpr.set(key, S);
  return S;
}
const wrapA = (a) => a - Math.round(a / 6.2832) * 6.2832;
function actorsIn(m) {   // a host's 'actors' message: the whole list (one missing from it has left)
  if (!m || !Array.isArray(m.actors)) return;
  const now = performance.now(), dur = actLast > 0 ? clamp(now - actLast, 60, 2500) : 0, S = course && course.S > 0 ? course.S : 1, seen = new Set();
  actLast = now; galleriesIn(m, S);   // (T429: the galleries: parts/08f-gallery.md)
  for (const a of m.actors) {
    if (a && a.owner) grpOwner = a.id;
    if (!a || a.owner || a.role === 'gallery' || !Array.isArray(a.at)) continue;   // (the owner is the player's golfer; galleries are T429)
    const x = +a.at[0] * S, y = +a.at[1] * S; if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const th = Number.isFinite(a.heading) ? a.heading * Math.PI / 180 : NaN, ph = clamp(+a.phase || 0, 0, 1), doing = a.role === 'cart' ? 'cart' : a.doing || 'stand';
    let r = actors.get(a.id);
    if (!r) { r = { id: a.id, role: a.role, x0: x, y0: y, x1: x, y1: y, th0: 0, th1: 0, t0: now, dur: 0, ph0: ph, ph1: ph, doing, cx: x, cy: y, cth: 0, cph: ph, walk: 0, px: x, py: y,
      sf: 0, sr: 0, zc: groundH(x, y), L: null, build: 1, riders: [], S: null, K: GK, dl: { k: K_ACTOR, d: 0, a: null } }; r.dl.a = r; actors.set(a.id, r);
      const t0 = Number.isFinite(th) ? th : 0; r.th0 = r.th1 = r.cth = t0; }
    else {
      actorAt(r, now); r.x0 = r.cx; r.y0 = r.cy; r.th0 = r.cth; r.ph0 = doing === r.doing ? r.cph : ph;
      if (Math.hypot(x - r.cx, y - r.cy) > ACT_SNAP) { r.x0 = r.px = x; r.y0 = r.py = y; }   // (a jump: a new hole, a cart's hop)
    }
    r.x1 = x; r.y1 = y; r.th1 = Number.isFinite(th) ? r.th0 + wrapA(th - r.th0) : r.th0; r.ph1 = ph; r.t0 = now; r.dur = dur; r.doing = doing; r.role = a.role;
    r.L = lookOf(a.dress); r.build = a.dress && a.dress.build >= 0.8 && a.dress.build <= 1.2 ? +a.dress.build : 1; r.riders = Array.isArray(a.riders) ? a.riders : [];
    seen.add(a.id);
  }
  for (const id of actors.keys()) if (!seen.has(id)) actors.delete(id);
}
function actorAt(r, now) {   // where it is drawn now: on its way from the last message's place to this one's (T425: in a played round, at the play's minute: groupAt)
  if (groupAt(r, now)) return;
  const u = r.dur > 0 ? clamp((now - r.t0) / r.dur, 0, 1) : 1;
  r.cx = r.x0 + (r.x1 - r.x0) * u; r.cy = r.y0 + (r.y1 - r.y0) * u; r.cth = r.th0 + (r.th1 - r.th0) * u; r.cph = r.ph0 + (r.ph1 - r.ph0) * u;
}
function actorPose(r, far) {   // [pose, step] of mkGolfer for what it is doing (a swing's step is a fifth of a radian of the swing angle, as the player's)
  const p = r.cph, sw = (al) => { let k = Math.round(al / 0.2); if (far) k &= ~1; return ['s', k]; };
  switch (r.doing) {
    case 'walk': return ['w', far ? Math.floor(r.walk) % 8 & 6 : Math.floor(r.walk) % 8];
    case 'address': return sw(p < 0.55 ? 0 : p < 0.9 ? -2 * (p - 0.55) / 0.35 : -2 + 2 * (p - 0.9) / 0.1);   // stood to the ball, then the backswing and down to the strike
    case 'swing': return sw(2.2 * p);                                                                        // from the strike to the finish
    case 'putt': return sw(p < 0.4 ? 0 : p < 0.55 ? -0.5 * (p - 0.4) / 0.15 : p < 0.625 ? -0.5 + 0.5 * (p - 0.55) / 0.075 : 0.6 * (p - 0.625) / 0.375);
    case 'ride': return ['c', 0];
    default: return ['i', 0];
  }
}
const faOf = (th) => ((Math.round(th / 6.2832 * 16) - Math.round(camYaw * 16 / 6.2832)) % 16 + 16) % 16;   // a world heading as the facing the camera sees
function actorsList() {   // render's hook: every actor in view joins its list (with its sculpture picked and its shadow cast, before anything stands on the ground)
  const t = performance.now(), tanH = (VW / 2 + 120) / FOC;
  groupList(t, tanH);   // (T425: the group's balls and markers)
  if (galleries.size) galleryList(tanH);   // (T429: the crowds)
  if (!actors.size) { ACT_MS += performance.now() - t; return; }
  for (const r of actors.values()) {
    actorAt(r, t); if (r.hidden) continue;
    const mx = r.cx - r.px, my = r.cy - r.py, mv = Math.hypot(mx, my); r.px = r.cx; r.py = r.cy;
    if (r.doing === 'walk') r.walk += mv / 0.18;   // (eight steps to a stride of 1.44 m: his feet keep to the ground he covers)
    if (r.doing === 'ride') continue;   // (in his cart: drawn with it)
    const ex = r.cx - camX, ey = r.cy - camY, d = ex * FX + ey * FY;
    if (d < 1 || d > ACT_MAXD || Math.abs(ex * RX + ey * RY) > tanH * d + 6) continue;
    r.S = null;
    if (r.role !== 'cart' && d <= ACT_FAR) {
      const K = golferK(DS / d), ps = actorPose(r, d > ACT_NEAR), fa = faOf(r.cth);
      if (ps[0] === 's') { const fx = Math.cos(r.cth), fy = Math.sin(r.cth); r.dx = r.cx - fx * 0.6 + fy * 0.2; r.dy = r.cy - fy * 0.6 - fx * 0.2; }   // (at a stroke he stands back from his ball and a little to its side, as the player does)
      else { r.dx = r.cx; r.dy = r.cy; }
      r.K = K; r.S = actorSprite(r.L, fa, ps[0], ps[1], K) || actSpr.get((r.L ? r.L.key : '-') + 'i' + fa + '_0' + (TOD[tmode].glow > 0 ? 'L' : '') + 'k' + K) || null;   // (not made yet: standing, if that one is)
      if (r.S && d < ACT_SHADOW) { if (d < 15) castSprite(r.S, r.dx, r.dy, K / r.build); else castSprite(r.S.mip || mipOf(r.S), r.dx, r.dy, K / 2 / r.build); }
    }
    r.dl.d = d; dlist.push(r.dl);
  }
  ACT_MS += performance.now() - t;
}
function actorDots(r, d, cols) {   // far off: a figure of a few pixels (top to bottom), hazed into the air
  project(r.cx, r.cy, groundH(r.cx, r.cy), PJ); if (PJ.s <= 0) return;
  const hz = farHaze(d), H = TOD[tmode].haze;
  for (let k = 0; k < cols.length; k++) { const c = cols[k]; if (!c) continue; const o = hz > 0 ? hazed(c[1], hz, H) : c[1]; plotZ(PJ.x + c[0], PJ.y - 1 - c[2], d, o); }
}
const CART_DOTS = [];
function drawActor(r, d) {   // render's hook: one actor, in its turn far to near
  const t = performance.now();
  if (r.role === 'cart') drawActorCart(r, d);
  else if (r.role === 'gallery') drawGallery(r, d);
  else if (r.role === 'ball') drawGroupBall(r, d);
  else if (r.S) { project(r.dx, r.dy, groundH(r.dx, r.dy), PJ); if (PJ.s > 0) blit(r.S, PJ.x, PJ.y, PJ.s / r.K * r.build, PJ.d * 100, 0, 0, false, d > 50 ? farHaze(d) : 0); }
  else if (r.L) actorDots(r, d, [[0, lit(tone(r.L.trou, 0.6)), 0], [0, lit(tone(r.L.shirt, 0.7)), 1]]);
  else actorDots(r, d, [[0, lit(tone(TROW, 0.6)), 0], [0, lit(tone(CAPR, 0.7)), 1]]);
  ACT_MS += performance.now() - t;
}
// another cart: the player's cart model (drawCart) drawn at this one's place and heading, with its riders; the player's cart is put back as it was
function drawActorCart(r, d) {
  if (d > 128) { const w = lit(tone(CARTW, 0.7)), g = lit(tone(CARTG, 0.5)); CART_DOTS.length = 0; CART_DOTS.push([0, w, 0], [1, w, 0], [0, g, 1], [1, g, 1]); actorDots(r, d, CART_DOTS); return; }
  const rid = r.riders.map((id) => actors.get(id)).filter(Boolean), keep = [cart.x, cart.y, cart.th, cart.steer, cart.sf, cart.sr, cart.zc], gk = golfK;
  cart.x = r.cx; cart.y = r.cy; cart.th = r.cth; cart.steer = 0; cart.sf = r.sf; cart.sr = r.sr; cart.zc = r.zc;
  try {
    golfK = GK; const fa = faOf(r.cth), seat = (q) => q ? actorSprite(q.L, fa, 'c', 0, GK) || actSpr.get((q.L ? q.L.key : '-') + 'c' + fa + '_0' + (TOD[tmode].glow > 0 ? 'L' : '') + 'k' + GK) : null;
    drawCart(seat(rid[0]), TOD[tmode].glow);
    r.sf = cart.sf; r.sr = cart.sr; r.zc = cart.zc;
    const S2 = seat(rid[1]);
    if (S2) {   // the second rider: the seat's other side (drawCart seats the driver at -12 across, -12 along)
      const hx = Math.cos(cart.th), hy = Math.sin(cart.th), rx = -hy, ry = hx, K = 1 / PPM, a = 12, f = -12;
      project(cart.x + (a * rx + f * hx) * K, cart.y + (a * ry + f * hy) * K, cart.zc + f * cart.sf + a * cart.sr, PJ);
      if (PJ.s > 0) { blitW = 1 / PJ.d; blit(S2, PJ.x, PJ.y, PJ.s / GK, PJ.d * 100 - 80, 0, 0, false, 0); blitW = 0; }
    }
  } finally { cart.x = keep[0]; cart.y = keep[1]; cart.th = keep[2]; cart.steer = keep[3]; cart.sf = keep[4]; cart.sr = keep[5]; cart.zc = keep[6]; golfK = gk; }
}
````
