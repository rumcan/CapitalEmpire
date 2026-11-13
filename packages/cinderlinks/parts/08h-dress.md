## dress Tournament dress: tents and grandstands (T429)
The course's event buildings (CapitalEmpire's features: `use` 'tent' for the food, drink, merchandise, hospitality, media and first-aid tents, 'stand' for a grandstand) are drawn as what they are, not as houses.
R: A tent is a marquee: a peaked canvas roof in stripes of white and its colour, a scalloped valance hanging from the eaves all round, on a pole at each corner and halfway along the long sides; open below.
R: A grandstand is a bank of rows stepping up from its front (the +d side, where CapitalEmpire's seats face) to its back: each row a seat deck in the seats' colour and a grey riser, solid ends, a back wall and a rail along the top.
R: A grandstand faces the nearest green or tee (within 250 m): the manager game's stands come unturned, all facing south, so the view turns each about its middle, and the fans seated on it turn with it.
R: A hole scoreboard is a framed board on two legs: a dark green panel in a light frame, a cream header, and rows of marks under it (a position, a name, a score in red or cream, drawn as strokes, not letters), turned like a grandstand to the nearest green or tee; plain green at the back.
R: Both are flat faces lit by the one sun, as the other buildings are, and cast the same shadow.
File: game.js
Check: function dressFaces(
Check: function faceStand(
Check: function standTurnFans(
Check: function boardFaces(

````js file=game.js

// ---- tournament dress (T429): a tent's and a grandstand's faces, for buildFaces (parts/08c-features.md) to draw. P(a, f, z): a point in the building's own
// frame (a across, f along, metres; z height) in the world; N: a normal the same way; add(points, normal, colour, detail rank); mul: a colour shaded
const DRESS_CANVAS = [246, 244, 236], DRESS_POLE = [214, 214, 220], DRESS_RISER = [150, 152, 160], DRESS_SEAT = [52, 92, 158], DRESS_END = [196, 198, 204];
function dressFaces(B, P, N, add, mul, zm) {   // (P and N are rebound for a stand: see below)
  const hw = B.w / 2, hd = B.d / 2;
  if (B.use === 'board') { boardFaces(B, P, N, add, zm); return; }
  if (B.use === 'tent') {
    const ze = zm + Math.min(2.6, B.h * 0.6), zr = zm + Math.max(B.h, 3.4), pole = 0.07, band = B.rc;
    const posts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [0, -hd], [0, hd]];
    for (const [a, f] of posts) for (const [da, df, na, nf] of [[-1, -1, 0, -1], [1, -1, 1, 0], [1, 1, 0, 1], [-1, 1, -1, 0]]) {   // the poles: thin square posts
      const a0 = a + da * pole, f0 = f + df * pole, a1 = a + (na === 0 ? -da : da) * pole, f1 = f + (nf === 0 ? -df : df) * pole;
      add([P(a0, f0, zm), P(a1, f1, zm), P(a1, f1, ze), P(a0, f0, ze)], N(na, nf, 0), DRESS_POLE, 3);
    }
    // the roof: four sloping faces up to a ridge along the long side, each cut into stripes of canvas and colour
    const along = B.w >= B.d, L = along ? hw : hd, D = along ? hd : hw, R = Math.max(0.3, L - D * 0.8), Q = along ? P : (a, f, z) => P(f, a, z), QN = along ? N : (a, f, z) => N(f, a, z);
    const nS = Math.max(4, Math.round(L * 2 / 1.1));
    for (const sg of [-1, 1]) {   // the two long sides, striped across
      const sl = Math.hypot(zr - ze, D), n = QN(0, sg * (zr - ze) / sl, D / sl);
      for (let k = 0; k < nS; k++) {
        const u0 = -L + 2 * L * k / nS, u1 = -L + 2 * L * (k + 1) / nS, r0 = Math.max(-R, Math.min(R, u0)), r1 = Math.max(-R, Math.min(R, u1));
        add([Q(u0, sg * D, ze), Q(u1, sg * D, ze), Q(r1, 0, zr), Q(r0, 0, zr)], n, k & 1 ? band : DRESS_CANVAS);
      }
    }
    for (const sg of [-1, 1]) {   // the two ends, in two stripes each
      const sl = Math.hypot(zr - ze, L - R), n = QN(sg * (zr - ze) / sl, 0, (L - R) / sl);
      add([Q(sg * L, -D, ze), Q(sg * L, 0, ze), Q(sg * R, 0, zr)], n, band); add([Q(sg * L, 0, ze), Q(sg * L, D, ze), Q(sg * R, 0, zr)], n, DRESS_CANVAS);
    }
    // the valance: a band hanging under the eaves all round, scalloped (a deeper tab every metre)
    const vz = 0.32, sides = [[-L, -D, L, -D, 0, -1], [L, -D, L, D, 1, 0], [L, D, -L, D, 0, 1], [-L, D, -L, -D, -1, 0]];
    for (const [a0, f0, a1, f1, na, nf] of sides) {
      const len = Math.hypot(a1 - a0, f1 - f0), m = Math.max(2, Math.round(len)), n = QN(na, nf, 0);
      for (let k = 0; k < m; k++) {
        const t0 = k / m, t1 = (k + 1) / m, x0 = a0 + (a1 - a0) * t0 + na * 0.02, y0 = f0 + (f1 - f0) * t0 + nf * 0.02, x1 = a0 + (a1 - a0) * t1 + na * 0.02, y1 = f0 + (f1 - f0) * t1 + nf * 0.02, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
        add([Q(x0, y0, ze - vz), Q(x1, y1, ze - vz), Q(x1, y1, ze + 0.02), Q(x0, y0, ze + 0.02)], n, k & 1 ? DRESS_CANVAS : band, 2);
        add([Q(x0, y0, ze - vz), Q(xm, ym, ze - vz - 0.16), Q(x1, y1, ze - vz)], n, k & 1 ? DRESS_CANVAS : band, 2);
      }
    }
    return;
  }
  // a grandstand: rows rising from the front to the back. Its front is the building's +d side (CapitalEmpire's seating faces +y unturned: event-seating.ts
  // proposedSeating's front), so the rows are laid out mirrored: f below runs from the front (+hd) back (-hd)
  { const P0 = P, N0 = N; P = (a, f, z) => P0(a, -f, z); N = (a, f, z) => N0(a, -f, z); }
  const rows = Math.max(3, Math.min(14, Math.round(B.d / 0.9))), step = B.d / rows, rise = Math.max(0.3, Math.min(0.5, (B.h - 0.6) / rows)), seat = mul(B.wall, 1)[0] > 200 && mul(B.wall, 1)[1] > 190 ? DRESS_SEAT : B.wall;
  for (let i = 0; i < rows; i++) {
    const f0 = -hd + i * step, f1 = f0 + step, zt = zm + 0.45 + i * rise, zl = i ? zm + 0.45 + (i - 1) * rise : zm;
    add([P(-hw, f0, zl), P(hw, f0, zl), P(hw, f0, zt), P(-hw, f0, zt)], N(0, -1, 0), DRESS_RISER);                          // the riser
    add([P(-hw, f0, zt), P(hw, f0, zt), P(hw, f1, zt), P(-hw, f1, zt)], N(0, 0, 1), i & 1 ? mul(seat, 0.86) : seat);      // the deck the seats are on
    add([P(-hw, f0 + 0.05, zt + 0.02), P(hw, f0 + 0.05, zt + 0.02), P(hw, f0 + 0.05, zt + 0.42), P(-hw, f0 + 0.05, zt + 0.42)], N(0, -1, 0), mul(seat, 0.7), 4);   // the seat backs' row
    for (const sg of [-1, 1]) add([P(sg * hw, f0, zm), P(sg * hw, f1, zm), P(sg * hw, f1, zt), P(sg * hw, f0, zt)], N(sg, 0, 0), DRESS_END);   // the ends, stepped
  }
  const ztop = zm + 0.45 + (rows - 1) * rise;
  add([P(hw, hd, zm), P(-hw, hd, zm), P(-hw, hd, ztop + 1), P(hw, hd, ztop + 1)], N(0, 1, 0), DRESS_END);                    // the back wall, up to the rail
  add([P(-hw, hd - 0.05, ztop + 0.95), P(hw, hd - 0.05, ztop + 0.95), P(hw, hd - 0.05, ztop + 1.05), P(-hw, hd - 0.05, ztop + 1.05)], N(0, -1, 0), DRESS_POLE, 3);   // the rail
}

// a grandstand turned to face the nearest green or tee (its front, the +d side, toward it); rot0 keeps the turn it came with
function faceStand(B) {
  B.rot0 = B.rot; if (!course || !Array.isArray(course.holes)) return;
  let best = 250 * 250, tx = 0, ty = 0;
  for (const h of course.holes) for (const p of [h.pin, h.line]) { if (!p) continue; const dx = p[0] - B.x, dy = p[1] - B.y, d = dx * dx + dy * dy; if (d < best) { best = d; tx = dx; ty = dy; } }
  if (best < 250 * 250) B.rot = Math.atan2(-tx, ty);
}
// the seated fans of a gallery on a stand faceStand turned: turned with it about its middle (in place); false when the gallery is on no turned stand
function standTurnFans(F, n, gx, gy) {
  if (!feats || !feats.builds) return false;
  for (const B of feats.builds) {
    if (B.use !== 'stand' || B.rot0 === undefined || B.rot === B.rot0) continue;
    const c0 = Math.cos(B.rot0), s0 = Math.sin(B.rot0), dx = gx - B.x, dy = gy - B.y, a = dx * c0 + dy * s0, f = -dx * s0 + dy * c0;
    if (Math.abs(a) > B.w / 2 + 2 || Math.abs(f) > B.d / 2 + 2) continue;
    const t = B.rot - B.rot0, c = Math.cos(t), s = Math.sin(t);
    for (let k = 0; k < n; k++) { const x = F[k * 3] - B.x, y = F[k * 3 + 1] - B.y; F[k * 3] = B.x + x * c - y * s; F[k * 3 + 1] = B.y + x * s + y * c; }
    return true;
  }
  return false;
}

// a hole scoreboard (CapitalEmpire's 'Hole scoreboard', the engine's board structures): a framed board on two legs, its front (+d) to the green, rows of marks
const BOARD_FACE = [30, 78, 54], BOARD_BACK = [40, 92, 64], BOARD_FRAME = [236, 228, 200], BOARD_LEG = [70, 74, 80], BOARD_CREAM = [242, 232, 196], BOARD_RED = [214, 56, 48];
function boardFaces(B, P, N, add, zm) {
  const hw = Math.min(B.w / 2, 2.2) * 0.95, t = 0.08, zb = zm + 1.3, zt = zm + Math.max(3.1, Math.min(4.6, B.h * 0.9)), lg = hw * 0.72, pole = 0.07;
  for (const sa of [-1, 1]) for (const [da, df, na, nf] of [[-1, -1, 0, -1], [1, -1, 1, 0], [1, 1, 0, 1], [-1, 1, -1, 0]]) {   // the legs: square posts from the ground up behind the board
    const a = sa * lg, a0 = a + da * pole, f0 = -t - pole + df * pole, a1 = a + (na === 0 ? -da : da) * pole, f1 = -t - pole + (nf === 0 ? -df : df) * pole;
    add([P(a0, f0, zm), P(a1, f1, zm), P(a1, f1, zt - 0.2), P(a0, f0, zt - 0.2)], N(na, nf, 0), BOARD_LEG, 3);
  }
  const R = (a0, a1, z0, z1, f, col, bias) => add([P(a0, f, z0), P(a1, f, z0), P(a1, f, z1), P(a0, f, z1)], N(0, f < 0 ? -1 : 1, 0), col, bias);
  R(-hw, hw, zb, zt, t, BOARD_FACE, 0); R(hw, -hw, zb, zt, -t, BOARD_BACK, 0);                                               // the panel, front and back
  add([P(-hw, -t, zt), P(hw, -t, zt), P(hw, t, zt), P(-hw, t, zt)], N(0, 0, 1), BOARD_FRAME, 0);                              // its top
  for (const sa of [-1, 1]) add([P(sa * hw, -t, zb), P(sa * hw, t, zb), P(sa * hw, t, zt), P(sa * hw, -t, zt)], N(sa, 0, 0), BOARD_FRAME, 0);   // its ends
  const fw = 0.1, ff = t + 0.01;                                                                                               // the frame, standing a little proud
  R(-hw, hw, zt - fw, zt, ff, BOARD_FRAME, 5); R(-hw, hw, zb, zb + fw, ff, BOARD_FRAME, 5); R(-hw, -hw + fw, zb, zt, ff, BOARD_FRAME, 5); R(hw - fw, hw, zb, zt, ff, BOARD_FRAME, 5);
  const x0 = -hw + fw + 0.12, x1 = hw - fw - 0.12, hz = zt - fw - 0.08;
  R(x0, x1, hz - 0.2, hz, ff + 0.01, BOARD_CREAM, 8);                                                                          // the header
  const rows = Math.max(3, Math.min(8, Math.floor((hz - 0.3 - zb - fw) / 0.26))), rh = (hz - 0.3 - zb - fw) / rows;
  for (let i = 0; i < rows; i++) {                                                                                             // a row: its position, a name, a score
    const z1 = hz - 0.3 - i * rh, z0 = z1 - Math.min(0.11, rh * 0.5), hsh = ((B.x * 7 + B.y * 13 + i * 31) | 0) >>> 0, nl = 0.45 + (hsh % 7) / 7 * (x1 - x0 - 1.2) * 0.6;
    R(x0, x0 + 0.12, z0, z1, ff + 0.01, BOARD_CREAM, 11);
    R(x0 + 0.25, x0 + 0.25 + nl, z0, z1, ff + 0.01, BOARD_CREAM, 8);
    R(x1 - 0.1 - (hsh % 3) * 0.06, x1, z0, z1, ff + 0.01, i < 3 ? BOARD_RED : BOARD_CREAM, 11);
  }
}
````
