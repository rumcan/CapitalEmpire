/** Authored golf-event seating geometry. All local coordinates and bench-top heights are metres; map coordinates are tiles of 2 m. */
export interface SeatPoint { x: number; y: number }
/** One continuous bank of seats. Split a row at an aisle; rows may have different orientations around a horseshoe. */
export interface AuthoredSeatRow {
  start: SeatPoint; step: SeatPoint; seats: number; seatHeightMetres: number; front?: SeatPoint;
}
/** A layout belongs to an accepted physical facility identity. Draft layouts never unlock new facility art. */
export interface AuthoredSeating {
  review: 'draft' | 'approved'; front: SeatPoint; rows: readonly AuthoredSeatRow[]; entries: readonly SeatPoint[];
  /** Optional measured art calibration for bench elevation; default is the game's 32 world px/m. */ verticalPixelsPerMetre?: number;
}
/** Prepared placement: five floats per seat (tile x/y, bench-top metres, facing vector x/y), and entry points in tiles. */
export interface PlacedSeating { seats: Float64Array; entries: readonly SeatPoint[]; count: number; reviewed: boolean; verticalPixelsPerMetre: number }

/** Vertical lift aligning source-rendered hips with a bench (world px). The people renderer uses 160-wide frames at 128 px/m, camera 30°;
 *  imported frame width provides its actual scale. Bench height uses the game's independent world-height scale (normally 32 px/m). */
export function seatLiftWorldPixels(benchMetres: number, characterSeatMetres: number, characterFrameWidth = 80, pixelsPerMetre = 32): number {
  const hipPixels = characterSeatMetres * characterFrameWidth * (128 / 160) * Math.cos(Math.PI / 6);
  return benchMetres * pixelsPerMetre - hipPixels;
}

/** Count of authored seats, with malformed counts excluded rather than rounded into accepted capacity. */
export function authoredSeatCount(layout: AuthoredSeating): number {
  return layout.rows.reduce((n, r) => n + (Number.isSafeInteger(r.seats) && r.seats > 0 ? r.seats : 0), 0);
}

/** Validation of real row/entry data against catalogue capacity and optional physical footprint (metres). */
export function seatingProblems(layout: AuthoredSeating | undefined, expected: number, footprint?: { width: number; depth: number }): string[] {
  if (!layout) return ['Seating layout is not yet available'];
  const problems: string[] = [], point = (p: SeatPoint | undefined) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
  if (layout.review !== 'approved') problems.push('Seating layout is awaiting review');
  if (layout.verticalPixelsPerMetre !== undefined && (!Number.isFinite(layout.verticalPixelsPerMetre) || layout.verticalPixelsPerMetre <= 0)) problems.push('Bench height calibration is invalid');
  if (!Array.isArray(layout.rows) || !layout.rows.length) return [...problems, 'No seat rows are defined'];
  if (!point(layout.front) || Math.hypot(layout.front.x, layout.front.y) < 1e-6) problems.push('Seat-facing direction is missing');
  if (authoredSeatCount(layout) !== expected) problems.push(`Seat rows must contain exactly ${expected} places`);
  if (!Array.isArray(layout.entries) || !layout.entries.length || layout.entries.some(p => !point(p))) problems.push('An entry anchor is required');
  for (const row of layout.rows) {
    if (!point(row.start) || !point(row.step) || Math.hypot(row.step.x, row.step.y) < 0.3 || !Number.isSafeInteger(row.seats) || row.seats <= 0
      || !Number.isFinite(row.seatHeightMetres) || row.seatHeightMetres < 0) { problems.push('A seat row is malformed'); continue; }
    if (row.front && (!point(row.front) || Math.hypot(row.front.x, row.front.y) < 1e-6)) problems.push('A seat bank has no facing direction');
    if (footprint) for (const at of [row.start, { x: row.start.x + row.step.x * (row.seats - 1), y: row.start.y + row.step.y * (row.seats - 1) }]) {
      if (Math.abs(at.x) > footprint.width / 2 || Math.abs(at.y) > footprint.depth / 2) { problems.push('A seat row is outside the facility footprint'); break; }
    }
  }
  return [...new Set(problems)];
}

/** Rotate a physical local point into world tile coordinates, around a structure centre; nothing rotates a finished sprite bitmap. */
export function eventAnchor(point: SeatPoint, headingDegrees: number, centre: SeatPoint): SeatPoint {
  const a = headingDegrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: centre.x + (point.x * c - point.y * s) / 2, y: centre.y + (point.x * s + point.y * c) / 2 };
}

/** Prepare all rows and entry points once when a facility changes; rendering reads typed arrays without per-frame allocation. */
export function placeSeating(layout: AuthoredSeating, headingDegrees: number, centre: SeatPoint): PlacedSeating {
  const count = authoredSeatCount(layout), seats = new Float64Array(count * 5), a = headingDegrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  let at = 0;
  for (const row of layout.rows) {
    const f = row.front ?? layout.front, len = Math.hypot(f.x, f.y), fx = (f.x * c - f.y * s) / len, fy = (f.x * s + f.y * c) / len;
    for (let i = 0; i < row.seats; i++) {
      const x = row.start.x + row.step.x * i, y = row.start.y + row.step.y * i;
      seats[at++] = centre.x + (x * c - y * s) / 2; seats[at++] = centre.y + (x * s + y * c) / 2;
      seats[at++] = row.seatHeightMetres; seats[at++] = fx; seats[at++] = fy;
    }
  }
  return { seats, entries: layout.entries.map(p => eventAnchor(p, headingDegrees, centre)), count, reviewed: layout.review === 'approved', verticalPixelsPerMetre: layout.verticalPixelsPerMetre ?? 32 };
}

/** Planned simple row geometry for new facilities. It is draft until measured against every accepted image. */
export function proposedSeating(columns: number, rows: number, tiered = false): AuthoredSeating {
  const bank: AuthoredSeatRow[] = [];
  for (let row = 0; row < rows; row++) bank.push({ start: { x: -(columns - 1) * 0.325, y: (rows - 1) * 0.45 - row * 0.9 }, step: { x: 0.65, y: 0 }, seats: columns, seatHeightMetres: 0.45 + (tiered ? row * 0.35 : 0) });
  return { review: 'draft', front: { x: 0, y: 1 }, rows: bank, entries: [{ x: -(columns - 1) * 0.325 - 0.8, y: (rows - 1) * 0.45 + 0.8 }] };
}

/** Legacy seating estimate from real catalogue dimensions, used only until old artwork gains reviewed rows. Never unlocks new facilities. */
export function legacySeating(capacity: number, widthMetres: number, depthMetres: number): AuthoredSeating {
  const columns = Math.max(1, Math.floor((widthMetres - 1.5) / 0.65)), count = Math.ceil(capacity / columns), rows: AuthoredSeatRow[] = [];
  const gap = count > 1 ? Math.min(0.85, (depthMetres - 1) / (count - 1)) : 0;
  for (let row = 0, left = capacity; left > 0; row++) {
    const seats = Math.min(columns, left); left -= seats;
    rows.push({ start: { x: -(seats - 1) * 0.325, y: (count - 1) * gap / 2 - row * gap }, step: { x: 0.65, y: 0 }, seats, seatHeightMetres: 0.45 + row * 0.35 });
  }
  return { review: 'draft', front: { x: 0, y: 1 }, rows, entries: [{ x: -widthMetres / 2, y: depthMetres / 2 }] };
}
