// The old use layouts (Phase 3 step 5c to 2026-10-24): houses, shops, public car parks, civic buildings and industrial yards laid out at
// runtime from the lot's seed. Since P20 / T064 the game draws every built lot from a preset (compose.ts); these layouts are kept only for
// the presets' freeze script (scripts/assets/freeze-lot-presets.ts, P20 T063), which runs them once to write src/game/lots/lot-presets.json.
// Nothing in the game imports this file. Pure TS, no DOM; the lot frame and the checks are compose-core.ts's.
import type { LotPatch } from '../ground-protocol';
import { mulberry } from '../iso';
import { LU, LV } from './town';
import {
  AISLE, BARN, BAY, BAY_DEPTH, BOARDED, BUSHES, Build, CHAIN, CIVIC, CLUTTER, DEAD_TREES, DRIVE_GAP, DRIVE_W, FLOWERS, GARAGE_FRONT, GARAGE_REAR,
  HOUSE_FRONT, HOUSE_REAR, HOUSE_RUNDOWN, NOSE, PICKUPS, PUMPKINS, SCHOOL_SIGNS, SCRAP, SHED, SHOP_FRONT, SHOP_REAR, SIDE_YARD, SPOOKY, STOP_IN,
  STORY_KIT, TOWERS, TRAILERS, TREES, VENUE, WHEEL, WORKS, clamp, isCarPark, mix, pick, plain, specFit, withVariations,
  type ComposeState, type LotGeom, type Patch, type Placed,
} from './compose-core';

/** the house and its yard: a drive on one side (a garage beside the house when the lot is wide enough), a front walk,
 *  bushes against the house, a story for the yard, fences and the bins at the kerb */
function res(B: Build, st: ComposeState) {
  const { W, D, r, rear, flip } = B, up = st.level === LV.UPGRADED, DW = 1.6;   // DW: the drive's width
  const hs = specFit(B, rear ? HOUSE_REAR : st.decline >= 2 ? HOUSE_RUNDOWN : HOUSE_FRONT, W - DW - DRIVE_GAP - SIDE_YARD, D - 3.5, { flip });
  if (!hs) return;
  const hw = 2 * B.ea(hs), hd = 2 * B.eb(hs);
  const sb = Math.min(3 + 1.5 * r(), Math.max(1.5, D - hd - 2.5));
  const L = r() < 0.5;
  const gs = B.spec(rear ? pick(r, GARAGE_REAR) : pick(r, GARAGE_FRONT), { flip });
  const gw = gs ? 2 * B.ea(gs) : 0, gd = gs ? 2 * B.eb(gs) : 0;
  // the house band: beside the drive (L: the drive is at a = 0), a gap from the drive and the side yard on the far side; the garage between them when it fits
  const bA0 = L ? DW + DRIVE_GAP : SIDE_YARD, bA1 = L ? W - SIDE_YARD : W - DW - DRIVE_GAP;
  const garage = !!gs && bA1 - bA0 - gw >= hw + 0.2 && r() < 0.8;
  let hA0 = bA0, hA1 = bA1, gA0 = 0, gA1 = 0;
  if (garage) { if (L) { gA0 = bA0; gA1 = bA0 + gw; hA0 = gA1; } else { gA1 = bA1; gA0 = gA1 - gw; hA1 = gA0; } }
  const ca = (hA0 + hA1) / 2;
  B.at(hs, ca, sb + B.eb(hs));
  if (garage && gs) B.at(gs, (gA0 + gA1) / 2, sb + 1 + B.eb(gs));
  const dA0 = L ? 0 : W - DW, dA1 = dA0 + DW, dB = garage ? sb + 1 + gd : sb + hd;
  B.pave('drive', dA0, 0, dA1, dB, 'paving');
  B.pave('walk', ca - 0.3, 0, ca + 0.3, sb, 'paving');
  const story = ['family', 'retired', 'worker', 'party', 'mechanic', 'neglected'][Math.floor(r() * 6)];
  // the cars in the drive (none for neglected: a junk car in the yard instead): one, and a second of the other model for a worker's story or an
  // upgraded lot, only if it fits fully on the drive. A worker's first car is the old pickup (the eight-way pack has none). model: 0 or 1 of the pack, 2 the pickup
  let slot = 0.4, model = -1;
  const put = (type: number, end: number): boolean => {
    const len = B.carLen(false);
    if (slot + len > end || !B.parked(dA0 + DW / 2, slot + len / 2, false, type)) return false;
    slot += len + 1.2; return true;
  };
  if (story !== 'neglected') {
    if (story === 'worker') { const v = B.vehicle(PICKUPS, dA0 + DW / 2, slot); if (v) { model = 2; slot += v.span + 1.2; } }
    else { const t = Math.floor(r() * 2); if (put(t, Infinity)) model = t; }
    if ((story === 'worker' || up) && model >= 0) put(model === 2 ? Math.floor(r() * 2) : 1 - model, dB - 0.3);
  }
  const bk = sb + hd + 1, neg = story === 'neglected';   // the back yard starts behind the house
  // the porch: pumpkins either side of the walk (most houses: it is October), and for some a Halloween display in the front yard
  if (story !== 'neglected' && r() < 0.8) for (const sx of [-1, 1]) if (r() < 0.8) B.put(pick(r, PUMPKINS), ca + sx * (0.75 + 0.3 * r()), sb - 0.45);
  if (story !== 'neglected' && r() < 0.35) B.scatter(SPOOKY, 0.9, 1.0, W - 0.9, Math.max(1.2, sb - 1.2), 2 + Math.floor(r() * 2));
  if (story === 'family') {
    B.put('expansion:trampoline', W / 2, bk + 2.2);
    if (W >= 11) B.put('gen:back-swingset', W - 3, D - 3.2);
    B.put('expansion:doghouse', 1.4, D - 2.4);
    B.put('gen:kids-bikes', ca + 1.2, 1.4);
    B.put('expansion:basketball-hoop', dA1 + 0.3, sb - 0.8);
  } else if (story === 'retired') {
    B.put('expansion:birdhouse-post', 1.0, bk + 1.5);
    B.put('world:bench', W / 2, bk + 1.2);
    B.bed(1.2, Math.max(bk + 0.4, D - 3.6), Math.min(W - 1.2, 5.2), D - 1.4);
  } else if (story === 'party') {
    if (up || r() < 0.7) B.put('expansion:aboveground-pool', W / 2, bk + 2.5);
    B.put('expansion:barbecue', W - 1.4, bk + 1.2);
    B.put('expansion:lawn-chair', W / 2 + 1.6, bk + 0.8);
    B.put('gen:cooler-lawnchairs', W / 2 - 1.6, bk + 0.8);
  } else if (story === 'mechanic') {
    B.scatter(SCRAP, 0.8, bk, W - 0.8, D - 0.8, 4);
  } else if (story === 'neglected') {
    B.put('expansion:junk-car', W / 2, D - 2.6);
    B.put('expansion:appliance-pile', 1.4, bk + 0.8);
    B.put(pick(r, DEAD_TREES), W - 1.4, bk + 1.2, { plant: true });
  } else if (r() < 0.5) B.bed(W - 4.6, Math.max(bk + 0.4, D - 3.4), W - 1.2, D - 1.4);
  // the ground: leaf drifts in the yards (it is autumn), worn grass where the kids and the dog play, an oil stain on the drive,
  // litter and mud when neglected, pinecones and twigs under the trees
  B.marksIn('leaves', 0.8, 0.8, W - 0.8, sb - 0.4, 1 + Math.floor(r() * 2));
  B.marksIn('leaves', 0.8, bk, W - 0.8, D - 0.8, 1 + Math.floor(r() * 2));
  if (story === 'family') { B.mark('worn', W / 2, bk + 2.2, 1.4); B.mark('worn', 1.6, D - 2.0); }
  if (story !== 'retired' && r() < 0.6) B.mark('stain', dA0 + DW / 2, 1.2 + r() * 2, 0.8);
  if (neg) { B.marksIn('litter', 0.8, 0.8, W - 0.8, D - 0.8, 2 + Math.floor(r() * 2)); B.mark('worn', W / 2, D - 2.6, 1.5); B.mark('rubbish', 1.4, bk + 2); }
  if (r() < 0.5) B.mark('woods', r() < 0.5 ? 1.2 : W - 1.2, D - 1.6);
  // the story's own kit along the back yard, then the trees in the back corners and by the side
  const kit = STORY_KIT[story] ?? [];
  kit.forEach((id, i) => B.put(id, 1.4 + ((i + 0.5) / kit.length) * (W - 2.8), bk + 0.9 + r() * Math.max(0.2, D - bk - 2.4)));
  B.put(pick(r, TREES), 0.9, D - 1.2, { plant: true });
  B.put(pick(r, TREES), W - 0.9, D - 1.2, { plant: true });
  if (story !== 'neglected') B.put(pick(r, TREES), W - 0.8, sb + 2.5, { plant: true });
  if (r() < 0.25) B.put('expansion:satellite-dish', ca + hw / 2 + 0.6, bk - 0.4);
  // the kerb by the drive: the bins, the mailbox and (autumn) leaf bags; a hydrant on some lots
  const bx = L ? DW + 0.5 : W - DW - 0.5, sx = L ? 1 : -1;
  B.put('gen:trash-cans-row', bx, -0.35, { street: true });
  B.put('world:mailbox', bx + sx * 0.9, -0.35, { street: true });
  if (r() < 0.5) B.put('expansion:leaf-bags', bx + sx * 2.1, -0.4, { street: true });
  if (r() < 0.15) B.put('world:hydrant', L ? W - 0.6 : 0.6, -0.4, { street: true });
  // plants: a flower bed in the front yard, packed against the house front and sides
  // (neglected yards keep the same lines at half the density, and run to weeds)
  const dense = neg ? 2 : 1;
  B.cap = (neg ? 16 : 24 + Math.floor(r() * 14)) + (up ? 6 : 0);
  if (!neg) for (let a = 0.9; a <= W - 0.9; a += 1.1) B.put(pick(r, FLOWERS), a, 0.8, { plant: true });
  for (let a = ca - hw / 2 - 0.6; a <= ca + hw / 2 + 0.6; a += dense) B.put(pick(r, neg ? BUSHES : FLOWERS.concat(BUSHES)), a, sb - 0.8, { plant: true });
  for (const sx of [-1, 1]) for (let b = sb + 0.8; b <= sb + 2 * hd - 0.5; b += 1.2 * dense) B.put(pick(r, BUSHES), ca + sx * (hw / 2 + 0.7), b, { plant: true });
  // the rest of the back and front yards in beds, last in order: the cap decides how many of these stay
  for (let b = bk + 0.6; b <= D - 1.2; b += 1.4) for (let a = 1.6; a <= W - 1.4; a += 1.4) B.put(pick(r, BUSHES), a, b, { plant: true });
  for (let b = 0.8; b <= sb - 0.6; b += 1.4) for (let a = 0.8; a <= W - 0.8; a += 1.4) B.put(pick(r, BUSHES), a, b, { plant: true });
}

/** the planted island of a car park with a middle double row: one tile between the two middle rows (bushes on it, no wheel stops) */
const ISLAND = 1;
/** a natural car park in the lot-frame rectangle [a0,a1] x [b0,b1] (b0 the street side, b1 the back). The far row of bays is flush against b1 and,
 *  when the rectangle is 2 * BAY_DEPTH + AISLE deep or more, the near row is flush against b0; the aisle is all the space between the two rows.
 *  When that gap is at least 2 * AISLE + 2 * BAY_DEPTH + ISLAND, two middle rows back to back (the island between them, bushes, no wheel stops)
 *  are centred in it, leaving two aisles. Bays are BAY wide, with lines from each row's outer edge (a middle row: its aisle edge) to the aisle
 *  (the island); a wheel stop 0.35 in from each outer edge; a car in fill of the bays (seeded), its nose 0.15 short of its stop (centre NOSE short) along its heading
 *  (the middle rows stop at the island). drive: an entrance (no bay on its columns), paved from the street to the street-side aisle, with a street
 *  sign at its mouth. Returns the bay count. */
function parkingArea(B: Build, a0: number, b0: number, a1: number, b1: number, drive: { a0: number; a1: number } | null, fill: number): number {
  const BP = BAY_DEPTH, H = b1 - b0;
  if (H < BP + AISLE) return 0;
  const two = H >= 2 * BP + AISLE, g0 = two ? b0 + BP : b0, g1 = b1 - BP, c = (g0 + g1) / 2;
  const island = two && g1 - g0 >= 2 * AISLE + 2 * BP + ISLAND;
  // a row: the edge its lines start at, the edge they end at (the aisle), its stop, and its heading (away from the road: +n)
  type Row = { e0: number; e1: number; stop: number; away: boolean; wheel: boolean };
  const rows: Row[] = [{ e0: b1, e1: g1, stop: b1 - STOP_IN, away: true, wheel: true }];
  if (two) rows.push({ e0: b0, e1: g0, stop: b0 + STOP_IN, away: false, wheel: true });
  if (island) {
    rows.push({ e0: c - ISLAND / 2 - BP, e1: c - ISLAND / 2, stop: c - ISLAND / 2, away: true, wheel: false });
    rows.push({ e0: c + ISLAND / 2 + BP, e1: c + ISLAND / 2, stop: c + ISLAND / 2, away: false, wheel: false });
  }
  const segs: [number, number][] = drive ? [[a0, drive.a0], [drive.a1, a1]] : [[a0, a1]], wflip = Math.abs(B.u.x) < Math.abs(B.u.y);
  const low: number[] = [], high: number[] = [];
  let bays = 0;
  for (const row of rows) {
    const into = (row.e0 + row.e1) / 2 < c ? low : high, cen = row.stop + (row.away ? -NOSE : NOSE);
    for (const [s0, s1] of segs) {
      const n = Math.floor((s1 - s0) / BAY + 1e-9);
      if (n < 1) continue;
      const t0 = Math.floor(B.r() * 2);   // seeded: neighbouring bays take different models
      for (let k = 0; k <= n; k++) { const p = B.P(s0 + k * BAY, row.e0), q = B.P(s0 + k * BAY, row.e1); into.push(p.x, p.y, q.x, q.y); }
      for (let k = 0; k < n; k++) {
        const a = s0 + (k + 0.5) * BAY;
        if (row.wheel) B.put(WHEEL, a, row.stop, { flip: wflip });
        bays++;
        if (B.r() < fill) B.parked(a, cen, row.away, (t0 + k) % 2);
      }
    }
  }
  // the asphalt: split around the island (a yard, so its bushes stand on it), each part with its own lines
  const Q = (lo: number, hi: number) => B.quad(clamp(a0, 0, B.W), clamp(lo, 0, B.D), clamp(a1, 0, B.W), clamp(hi, 0, B.D)), ln = (l: number[]) => (l.length ? l : undefined);
  if (island) {
    B.patches.push({ kind: 'lot', tex: 'asphalt', quad: Q(b0, c - ISLAND / 2), lines: ln(low) });
    B.patches.push({ kind: 'yard', tex: 'grass', quad: Q(c - ISLAND / 2, c + ISLAND / 2) });
    B.patches.push({ kind: 'lot', tex: 'asphalt', quad: Q(c + ISLAND / 2, b1), lines: ln(high) });
    for (const [s0, s1] of segs) for (let a = s0 + 0.6; a <= s1 - 0.6; a += 1.4) B.put(pick(B.r, BUSHES), a, c, { plant: true });
  } else B.patches.push({ kind: 'lot', tex: 'asphalt', quad: Q(b0, b1), lines: ln(low.concat(high)) });
  // the entrance: its mouth at the street, its end at the street-side aisle
  if (drive) { B.pave('drive', drive.a0, 0, drive.a1, (g0 + (island ? c - ISLAND / 2 - BP : g1)) / 2, 'asphalt');
    // a pay boom across the drive just inside the lot line (looks only: the lots take no fees); the gate art's arm runs along X
    B.put('ce:parking-entry', (drive.a0 + drive.a1) / 2, 0.8, { flip: Math.abs(B.u.y) > Math.abs(B.u.x), paved: true }); }
  return bays;
}

/** a shop or venue with a car park beside it (two bays when the lot allows), a lamp at its corner, a front row by the door
 *  (bike rack, bin, bench, bushes along the shop front), a hvac unit at the side, a tree row along the side lot line and the
 *  bins at the back; a tour venue adds a second bench, a picnic table, a phone booth and a sign */
/** the front of a commercial building: this far back from the lot's street edge (tiles): its paved apron, a shop-front sidewalk with the benches */
const SHOP_FRONT_B = 1.4;
/** a commercial lot as one shop of a street front (a main street, a strip of shops): the building at the front of the lot, against the lot's
 *  lower world-coordinate side line like every lot of the street (as the fences', see fenceLayer), so neighbours line up along the sidewalk
 *  with only an alley between; at its owner scale, never shrunk (a lot that fits no building is a small car park); dealt from the street's
 *  own shuffled deck by the lot's slot along it, so neighbouring shops differ; the car park, bins and deliveries behind it */
function com(B: Build, st: ComposeState, tour: boolean) {
  const { W, D, r, rear, flip } = B;
  // a flipped shop is a plain one: when none is (the shop art is mostly lettering), the lot is a car park, as when no shop fits
  const pool = plain(st.decline >= 2 ? BOARDED : rear ? SHOP_REAR : tour ? VENUE : SHOP_FRONT, flip);
  const ok = pool.filter(id => { const [w, d] = B.fit(id, flip); return w <= W - 0.3 && d <= D - SHOP_FRONT_B - 1.2; });
  if (!ok.length) { park(B, st); return; }
  // the street's deck (seeded by the street line and its side), dealt by the slot along it
  const slot = Math.round((B.o.x * B.u.x + B.o.y * B.u.y) / W), street = Math.round(B.o.x * B.n.x + B.o.y * B.n.y);
  const deck = [...ok].sort(), dr = mulberry(mix(street, B.n.x + 2, B.n.y + 2, rear ? 1 : 0));
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(dr() * (i + 1)); [deck[i], deck[j]] = [deck[j]!, deck[i]!]; }
  // the shops that leave room for the drive beside them (its width and 0.3 clear of the shop), when any do
  const room = deck.filter(id => W - B.fit(id, flip)[0] - 0.3 >= DRIVE_W), dk = room.length && r() < 0.5 ? room : deck;
  const ss = B.spec(dk[((slot % dk.length) + dk.length) % dk.length]!, { flip });
  if (!ss) return;
  const sw = 2 * B.ea(ss), sd = 2 * B.eb(ss), low = B.u.x + B.u.y > 0, ca = low ? 0.15 + sw / 2 : W - 0.15 - sw / 2, back = SHOP_FRONT_B + sd;
  // the car park behind the shop, its entrance drive in the alley on the far side (flush with the far lot line): only when the shop leaves
  // the drive's width and the bays' depth (two rows, or one)
  const lotPark = W - sw - 0.3 >= DRIVE_W && D - 0.3 - (back + 0.8) >= BAY_DEPTH + AISLE, dA0 = low ? W - DRIVE_W : 0, dA1 = dA0 + DRIVE_W;
  B.at(ss, ca, SHOP_FRONT_B + sd / 2);
  // asphalt all over, the sidewalk's slabs on to the shop front (both patches carry uprights)
  B.pave('yard', 0, 0, W, D, 'asphalt');
  B.pave('yard', 0, 0, W, SHOP_FRONT_B, 'slabs');
  // the alley: the strip beside the building on the other side line (the neighbour's building stands across it), less the drive's side when there is one
  const al0 = low ? ca + sw / 2 : 0, al1 = low ? W : ca - sw / 2;
  const f0 = lotPark && !low ? dA1 : al0, f1 = lotPark && low ? dA0 : al1, alley = f1 - f0, am = (f0 + f1) / 2;
  if (!rear) {
    B.put('world:bench', ca - sw / 4, 0.5);
    B.put('world:trashcan', ca + sw / 4, 0.45);
    if (r() < 0.6) B.put('town:bike_rack', ca, 0.55);
    B.put('expansion:parking-meter', ca + sw / 2 - 0.4, -0.35, { street: true });
    // the shop door: pumpkins and mums for October, an ice freezer or milk crates out front
    if (r() < 0.7) { B.put(pick(r, PUMPKINS), ca - 0.6, SHOP_FRONT_B - 0.3); B.put(pick(r, PUMPKINS), ca + 0.5, SHOP_FRONT_B - 0.3); }
    if (alley >= 1.2) B.put(r() < 0.5 ? 'expansion:ice-freezer' : 'expansion:milk-crates', am, SHOP_FRONT_B + 0.4);
    if (r() < 0.3) B.put(pick(r, SPOOKY), am, 0.3);
  }
  // the lamp at the corner away from the drive's mouth
  B.put('world:streetlamp', lotPark ? (low ? 0.4 : W - 0.4) : low ? W - 0.4 : 0.4, -0.4, { street: true });
  if (r() < 0.4) B.put('world:hydrant', low ? 0.5 : W - 0.5, -0.4, { street: true });
  // the alley: bins, the hvac unit and the utility cabinet against the wall, litter
  if (alley >= 1.2) {
    B.put('town:dumpster', am, back - 0.8);
    B.put('expansion:hvac-unit', am, SHOP_FRONT_B + sd / 2);
    B.put('expansion:utility-cabinet', am, SHOP_FRONT_B + 1.2);
    B.mark('litter', am, back - 1.6); if (r() < 0.5) B.mark('rubbish', am, back - 2.4, 0.8);
  }
  // behind: the car park from 0.8 behind the back wall to the back line (across the full width), or a paved loading pad when the shop leaves
  // no room; the deliveries at the wall, trees and bushes on the back line
  const pb = back + 0.8;
  if (lotPark) { parkingArea(B, 0.3, pb, W - 0.3, D - 0.3, { a0: dA0, a1: dA1 }, 0.5); B.marksIn('stain', 0.3, pb, W - 0.3, D - 0.3, 1 + Math.floor(W / 4), 0.9); }
  else { B.pave('yard', 0.3, back + 0.2, W - 0.3, D - 0.3, 'concrete'); if (alley < 1.2) B.put('town:dumpster', ca, back + 0.8); }
  B.put('town:delivery_crates', ca - sw / 4, back + 0.6);
  B.put('expansion:bread-delivery-rack', ca + sw / 4, back + 0.6);
  if (r() < 0.5) B.put('expansion:shopping-cart', ca, back + 1.0);
  B.marksIn('leaves', 0.8, D - 1.6, W - 0.8, D - 0.6, 1);
  for (let a = 1; a <= W - 1; a += 1.6) B.put(pick(r, BUSHES), a, D - 0.6, { plant: true });
  if (r() < 0.6) B.put(pick(r, TREES), low ? W - 0.7 : 0.7, D - 0.8, { plant: true });
  if (tour) {
    B.put('town:picnic_table', am, back + 0.8);
    B.put('town:phone_booth', low ? W - 1.2 : 1.2, -0.4, { street: true });
    B.put('town:street_sign', ca, -0.6, { street: true });
  }
}

/** a public car park: no building. A verge strip (1 tile) along the frontage with a row of bushes (a hedge's 1.6-tile footprint does not fit), an
 *  entrance drive (DRIVE_W) on one side from the street to the aisle, and the rest of the lot laid out by parkingArea. Cars in the bays: 40-80%
 *  seeded, 70-100% upgraded, 30% at decline 1, 10% at decline 2, none at decline 3. A sign at the drive mouth. */
function park(B: Build, st: ComposeState) {
  const { W, D, r } = B, STRIP = 1;
  const L = r() < 0.5, dA0 = L ? 0 : W - DRIVE_W, dA1 = dA0 + DRIVE_W;
  const pA0 = L ? dA1 : 0, pA1 = L ? W : dA0;
  if (pA1 - pA0 < BAY) return;
  for (let a = pA0 + 0.8; a <= pA1 - 0.6; a += 1.4) B.put(pick(r, BUSHES), a, STRIP / 2, { plant: true });
  const share = st.level === LV.UPGRADED ? 0.7 + 0.3 * r() : 0.4 + 0.4 * r();
  const fill = st.decline >= 3 ? 0 : st.decline === 2 ? 0.1 : st.decline === 1 ? 0.3 : share;
  const bays = parkingArea(B, pA0, STRIP, pA1, D, { a0: dA0, a1: dA1 }, fill);
  B.put('expansion:parking-meter', pA0 + 0.6, -0.35, { street: true });
  // oil stains in the bays, wheel wear on the drive, the odd bit of litter
  B.marksIn('stain', pA0, STRIP, pA1, D, Math.max(1, Math.floor(bays / 2)), 0.9);
  B.mark('town:wheel_wear', dA0 + DRIVE_W / 2, 1.2 + r() * Math.max(0, D - 3)); B.mark('litter', pA0 + r() * (pA1 - pA0), D - 1.2);
}

/** a civic building (or a back view) on the left of a paved forecourt: a tree row, benches and planters, a lamp pair and a bus stop
 *  at the entrance, one car bay at the side, shrubs at the front and back */
function civic(B: Build, st: ComposeState) {
  const { W, D, r, rear, flip } = B;
  const cs = specFit(B, rear ? SHOP_REAR : CIVIC, W - 3.2, D - 6, { flip });
  if (!cs) return;
  const ea = B.ea(cs), eb = B.eb(cs), sb = 3 + 1.5 * r(), cx = 0.3 + ea, cw = 2 * ea;
  B.at(cs, cx, sb + eb);
  B.pave('yard', 0.3, 0, cw + 0.6, sb, 'paving');
  for (let a = 0.8; a <= cw + 0.2; a += 2) B.put(pick(r, TREES), a, 0.7, { plant: true });
  B.put('town:planter_square', cx - 1.2, sb - 0.6);
  B.put('town:planter_square', cx + 1.2, sb - 0.6);
  B.put('world:streetlamp', cx - 1.2, -0.4, { street: true });
  B.put('world:streetlamp', cx + 1.2, -0.4, { street: true });
  B.put('town:bus_stop', cw + 1.2, -0.5, { street: true });
  B.put('world:bench', cx - ea - 0.2, sb - 0.6);
  B.put('world:bench', cx + ea + 0.2, sb - 0.6);
  B.carPark(cw + 0.6, W - 0.3);
  B.put('town:bike_rack', 0.9, sb - 1.0);
  B.put(pick(r, TREES), 0.6, D - 0.6, { plant: true });
  B.put(pick(r, TREES), W - 0.6, D - 0.6, { plant: true });
  for (let a = 1.4; a <= W - 1.4; a += 1.4) B.put(pick(r, BUSHES), a, D - 0.9, { plant: true });
  if (st.decline >= 1) B.put(pick(r, BUSHES), W / 2, sb + 2 * eb + 1, { plant: true });
  B.put('world:trashcan', cx + 2.2, sb - 0.5);
  B.put(pick(r, SCHOOL_SIGNS), W - 0.5, -0.4, { street: true });
  if (r() < 0.6) B.put('ref:halloween-hay-bales', cx + ea - 0.6, sb - 1.6);
  for (let b = sb + 0.8; b <= D - 1.5; b += 1.6) B.put(pick(r, FLOWERS), 0.8, b, { plant: true });
  B.marksIn('leaves', 0.8, sb + 2 * eb + 0.6, W - 0.8, D - 0.8, 2); if (r() < 0.5) B.mark('litter', cx + 1.4, sb - 1.2, 0.8);
}

/** a yard of gravel with a shed at the back, a second shed or trailer, a chain-link fence with a gate gap at the front,
 *  3-5 scrapyard clusters of 3-5 items against the side fences and the shed, a pickup and a van, a utility pole and weeds along the fence */
function ind(B: Build, st: ComposeState) {
  const { W, D, r, flip } = B;
  B.pave('yard', 0.4, 0.4, W - 0.4, D - 0.4, 'gravel');
  const shed = st.decline >= 2 ? withVariations(['expansion:abandoned-workshop']) : W >= 12 ? [...SHED, ...BARN, ...WORKS] : [...SHED, ...WORKS];
  const sh = specFit(B, shed, W - 0.8, D - 3, { flip });
  const shB = D - (sh ? B.eb(sh) : 1.5) - 0.9;
  if (sh) B.at(sh, W / 2, shB);
  const tr = specFit(B, TRAILERS, W - 2.4, 4.5, { flip });
  if (tr) B.at(tr, B.ea(tr) + 0.8, 3 + B.eb(tr));
  // a big works yard: sometimes a water tower, silo or windmill in the front corner away from the trailer
  if (W >= 12 && st.decline < 2 && r() < 0.35) { const tw = specFit(B, TOWERS, 3.5, 3.5, { flip }); if (tw) B.at(tw, W - 0.8 - B.ea(tw), 1.5 + B.eb(tw)); }
  B.run(CHAIN, 0.4, 0.4, W - 0.4, 0.4, [0.35, 0.65]);
  B.run(CHAIN, 0.4, 0.4, 0.4, D - 0.4);
  B.run(CHAIN, W - 0.4, 0.4, W - 0.4, D - 0.4);
  B.run(CHAIN, 0.4, D - 0.4, W - 0.4, D - 0.4);
  B.vehicle(PICKUPS, W / 2 + 1.5, 1.2);
  B.vehicle(PICKUPS, W / 2 - 1.5, 1.2);
  B.put('town:utility_pole', 0.5, -0.5, { street: true });
  const k = 3 + Math.floor(r() * 3);
  for (let i = 0; i < k; i++) {
    // the last cluster stands in front of the shed, the others against the side fences
    const last = i === k - 1 && sh, ca = last ? W / 2 : i % 2 ? W - 1.3 : 1.3, cb = last ? shB - 1.6 : 3 + r() * Math.max(0, D - 8);
    const m = 3 + Math.floor(r() * 3);
    for (let j = 0; j < m; j++) B.put(pick(r, CLUTTER), ca + (r() - 0.5) * 2.4, cb + (r() - 0.5) * 2.4);
  }
  for (let b = 2; b <= D - 1.5; b += 3) B.put(pick(r, BUSHES), 0.9, b, { plant: true });
  // tyre tracks in the mud from the gate, oil and gravel spilt, rubbish by the shed
  B.mark('mud', W / 2, 2.5, 1.2); B.mark('mud', W / 2 + (r() - 0.5) * 3, D / 2, 1.2);
  B.marksIn('stain', 1, 1, W - 1, D - 1, 2); B.marksIn('gravel', 1, 1, W - 1, D - 1, 2); B.mark('rubbish', W - 1.6, D - 2.4);
}


/** the layout of a built lot's use alone, for the lot presets' freeze (scripts/assets/freeze-lot-presets.ts, P20 T063): the props done() keeps
 *  (street items flagged) and the ground patches with their kind (world tiles), no fence layer, boundary or decline touches; the public car
 *  park when isCarPark. null for a lot that is not built or upgraded, or of no use */
export function layoutOfUse(lot: LotGeom, st: ComposeState): { props: Placed[]; patches: { kind: Patch['kind']; tex: LotPatch['tex']; pts: number[]; lines?: number[] }[] } | null {
  if (st.level < LV.BUILT || st.use === LU.NONE) return null;
  const B = new Build(lot, mulberry(mix(st.seed, st.use, st.level, st.decline)));
  B.noCars = st.decline >= 3;
  if (st.use === LU.RES) res(B, st);
  else if (st.use === LU.COM) { if (isCarPark(st)) park(B, st); else com(B, st, false); }
  else if (st.use === LU.TOUR) com(B, st, true);
  else if (st.use === LU.IND) ind(B, st);
  else civic(B, st);
  const { props } = B.done();
  return { props, patches: B.patches.map(p => ({ kind: p.kind, tex: p.tex, pts: p.quad.slice(), ...(p.lines ? { lines: p.lines.slice() } : {}) })) };
}

