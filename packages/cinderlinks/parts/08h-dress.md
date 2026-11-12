## dress Tournament dress: tents and grandstands (T429)
The course's event buildings (CapitalEmpire's features: `use` 'tent' for the food, drink, merchandise, hospitality, media and first-aid tents, 'stand' for a grandstand) are drawn as what they are, not as houses.
R: A tent is a marquee: a peaked canvas roof in stripes of white and its colour, a scalloped valance hanging from the eaves all round, on a pole at each corner and halfway along the long sides; open below.
R: A grandstand is a bank of rows stepping up from its front (the +d side, where CapitalEmpire's seats face) to its back: each row a seat deck in the seats' colour and a grey riser, solid ends, a back wall and a rail along the top.
R: Both are flat faces lit by the one sun, as the other buildings are, and cast the same shadow.
File: game.js
Check: function dressFaces(

````js file=game.js

// ---- tournament dress (T429): a tent's and a grandstand's faces, for buildFaces (parts/08c-features.md) to draw. P(a, f, z): a point in the building's own
// frame (a across, f along, metres; z height) in the world; N: a normal the same way; add(points, normal, colour, detail rank); mul: a colour shaded
const DRESS_CANVAS = [246, 244, 236], DRESS_POLE = [214, 214, 220], DRESS_RISER = [150, 152, 160], DRESS_SEAT = [52, 92, 158], DRESS_END = [196, 198, 204];
function dressFaces(B, P, N, add, mul, zm) {   // (P and N are rebound for a stand: see below)
  const hw = B.w / 2, hd = B.d / 2;
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
````
