// Pure, deterministic subway simulation. Coordinates are tiles (2 m); movement and time are metres and seconds.

/** A subway station position in map tiles. */
export interface StationDef { id: number; x: number; y: number; name?: string }
/** An ordered set of stations and its train service. */
export interface LineDef { id: number; stations: number[]; trains: number; loop?: boolean }
/** A group of fans delivered to a station, retaining its originating tag. */
export interface Arrival { station: number; fans: number; tag: number }
/** The interpolated position and current passenger load of a train. */
export interface TrainView { line: number; x: number; y: number; dir: number; load: number }
/** Reused renderer-facing train positions and per-station queue totals. */
export interface SubwayView { trains: TrainView[]; queues: { station: number; fans: number }[] }
/** Debug state of one train: its block (track section + direction), distance along it (m), and whether it owns the block. */
export interface TrainState { line: number; track: number; dir: 1 | -1; dist: number; owned: boolean; inside: boolean; station: number; queued: boolean }

/** Build price of one station, in dollars. */
export const STATION_COST = 40_000;
/** Tunnel build price per tile of length, in dollars. */
export const TUNNEL_COST_PER_TILE = 900;
/** Build price of one train, in dollars. */
export const TRAIN_COST = 25_000;
/** Fraction of total build cost charged per game day (1,440 sim seconds). */
export const UPKEEP_RATE = 0.01;
const MPT = 2, CRUISE = 20, ACCEL = 1, CAPACITY = 600, BOARD_RATE = 10, MIN_DWELL = 20, TRANSFER_WALK = 60;
/** Longest internal time step (s): step(dt) is split into equal sub-steps no longer than this, so motion does not depend on dt. */
const SUBSTEP = 0.1;

type Group = { from: number; to: number; tag: number; count: number; walk: number; wait: number; initial: boolean };
type Track = { a: number; b: number; length: number; ax: number; ay: number; bx: number; by: number };
/** `owned` = the train holds its block (track + dir) and is moving; a train at a platform is never owned. `queued` = FCFS sequence while waiting for a block (0 = not waiting). */
type Train = { line: number; track: number; dir: 1 | -1; dist: number; speed: number; dwell: number; at: number; groups: Group[]; load: number; owned: boolean; queued: number };
/** `owners[block]` is the one train inside that block (block = track * 2 + (dir > 0 ? 0 : 1)), or null. */
type RuntimeLine = { def: LineDef; tracks: Track[]; trains: Train[]; owners: (Train | null)[] };

/** Returns the one-time cost of stations, unique line tunnels, and trains. */
export function buildCost(stations: StationDef[], lines: LineDef[]): number {
  const byId = new Map<number, StationDef>(); for (const s of stations) byId.set(s.id, s);
  let length = 0, trains = 0;
  for (const l of lines) {
    trains += Math.max(0, Math.floor(l.trains));
    for (let i = 0; i + 1 < l.stations.length + (l.loop ? 1 : 0); i++) {
      const a = byId.get(l.stations[i % l.stations.length]), b = byId.get(l.stations[(i + 1) % l.stations.length]);
      if (a && b) length += Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  return stations.length * STATION_COST + length * TUNNEL_COST_PER_TILE + trains * TRAIN_COST;
}

/** Block index of a track section travelled in a direction. */
function blockIndex(track: number, dir: number): number { return track * 2 + (dir > 0 ? 0 : 1); }

/** Deterministic underground train and count-based passenger simulation. */
export class Subway {
  private stations: StationDef[] = [];
  private stationIndex = new Map<number, number>();
  private lines: RuntimeLine[] = [];
  private queues: Group[][] = [];
  private routes = new Map<string, number>();
  private arrivals: Arrival[] = [];
  private render: SubwayView = { trains: [], queues: [] };
  private carried = 0; private dropped = 0; private waitSum = 0; private waitCount = 0;
  private seq = 0;

  /** Creates a deterministic network; current operations need no random choices. */
  constructor(_seed = 1) {}

  /** Replaces the network, preserving valid waiting groups; riders on trains are re-queued at their train's last station, and groups without a remaining route are counted as dropped. */
  setNetwork(stations: StationDef[], lines: LineDef[]): void {
    const retained: Group[] = [];
    for (let i = 0; i < this.queues.length; i++) for (const g of this.queues[i]!) if (g.count > 0) retained.push(g);
    for (const l of this.lines) for (const t of l.trains) for (const g of t.groups) if (g.count > 0) { g.from = t.at; retained.push(g); }
    this.stations = stations.map(s => ({ ...s })); this.stationIndex.clear();
    for (let i = 0; i < this.stations.length; i++) this.stationIndex.set(this.stations[i]!.id, i);
    this.queues = Array.from({ length: this.stations.length }, () => []); this.routes.clear(); this.lines = [];
    for (const def0 of lines) {
      const ids = def0.stations.filter(id => this.stationIndex.has(id));
      if (ids.length < 2) continue;
      const def: LineDef = { ...def0, stations: ids, trains: Math.max(0, Math.floor(def0.trains)), loop: !!def0.loop };
      const tracks: Track[] = [];
      for (let i = 0; i < ids.length - 1 + (def.loop ? 1 : 0); i++) {
        const a = this.stations[this.stationIndex.get(ids[i % ids.length])!]!, b = this.stations[this.stationIndex.get(ids[(i + 1) % ids.length])!]!;
        const length = Math.hypot(b.x - a.x, b.y - a.y) * MPT;
        tracks.push({ a: ids[i % ids.length]!, b: ids[(i + 1) % ids.length]!, length, ax: a.x, ay: a.y, bx: b.x, by: b.y });
      }
      const runtime: RuntimeLine = { def, tracks, trains: [], owners: new Array<Train | null>(tracks.length * 2).fill(null) };
      this.lines.push(runtime);
      this.placeTrains(runtime);
    }
    this.buildRoutes();
    this.dropped = 0;
    for (const line of this.lines) for (const train of line.trains) this.startAtStation(line, train, train.at);
    for (const g of retained) {
      if (!this.stationIndex.has(g.from) || !this.stationIndex.has(g.to) || !this.hasRoute(g.from, g.to)) { this.dropped += g.count; continue; }
      const ix = this.stationIndex.get(g.from)!; this.queues[ix]!.push(g);
    }
    this.carried = 0; this.waitSum = 0; this.waitCount = 0;
    this.refreshView();
  }

  /** Adds fans to a destination queue and returns the accepted count (zero when no route exists). */
  board(from: number, to: number, fans: number, tag: number): number {
    const n = Math.max(0, Math.floor(fans));
    const fi = this.stationIndex.get(from), ti = this.stationIndex.get(to);
    if (!n || fi === undefined || ti === undefined || from === to || !this.hasRoute(from, to)) return 0;
    const q = this.queues[fi]!;
    let group: Group | undefined;
    for (const g of q) if (g.to === to && g.tag === tag && g.walk <= 0) { g.count += n; group = g; break; }
    if (!group) { group = { from, to, tag, count: n, walk: 0, wait: 0, initial: true }; q.push(group); }
    this.dispatchWaiting(from);
    return n;
  }

  /** Advances trains and passenger counts by dt simulation seconds (normally 0.1 or 1); internally split into sub-steps of at most 0.1 s. */
  step(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    const n = Math.max(1, Math.ceil(dt / SUBSTEP - 1e-9)), h = dt / n;
    for (let s = 0; s < n; s++) this.advance(h);
    this.refreshView();
  }

  /** Copies and clears deliveries into the caller's reusable array. */
  takeArrivals(out: Arrival[]): Arrival[] {
    out.length = 0;
    for (const a of this.arrivals) { const same = out.find(x => x.station === a.station && x.tag === a.tag); if (same) same.fans += a.fans; else out.push({ ...a }); }
    this.arrivals.length = 0; return out;
  }

  /** Returns the reused current train/queue view. */
  view(): SubwayView { return this.render; }
  /** Returns delivered fans, dropped fans and the mean initial queue wait, in seconds. */
  stats(): { carried: number; dropped: number; meanWait: number } { return { carried: this.carried, dropped: this.dropped, meanWait: this.waitCount ? this.waitSum / this.waitCount : 0 }; }
  /** Debug hook for tests: every train's block and state (allocates; not for the per-step path). */
  occupancy(): TrainState[] {
    const out: TrainState[] = [];
    for (const line of this.lines) for (const t of line.trains) {
      const length = line.tracks[t.track]!.length;
      out.push({ line: t.line, track: t.track, dir: t.dir, dist: t.dist, owned: t.owned, inside: t.dist > 1e-6 && t.dist < length - 1e-6, station: t.at, queued: t.queued > 0 });
    }
    return out;
  }

  private hasRoute(from: number, to: number): boolean { return this.routes.has(`${from}|${to}`); }
  private buildRoutes(): void {
    // Lexicographic Dijkstra over (station, line): transfers dominate time, then time chooses the best path.
    this.routes.clear();
    const ids = this.stations.map(s => s.id);
    for (const from of ids) {
      const states: { station: number; line: number; transfers: number; time: number; first: number; done: boolean }[] = [];
      const byKey = new Map<string, number>();
      for (let li = 0; li < this.lines.length; li++) for (const station of this.lines[li]!.def.stations) {
        const key = `${station}|${li}`; byKey.set(key, states.length);
        states.push({ station, line: li, transfers: Infinity, time: Infinity, first: -1, done: false });
      }
      for (let li = 0; li < this.lines.length; li++) { const ix = byKey.get(`${from}|${li}`); if (ix !== undefined) { states[ix]!.transfers = 0; states[ix]!.time = 0; } }
      let bestTransfers = Infinity, bestTime = Infinity, bestHop = -1;
      for (let iter = 0; iter < states.length; iter++) {
        let pick = -1;
        for (let i = 0; i < states.length; i++) { const s = states[i]!; if (s.done || !Number.isFinite(s.time)) continue;
          if (pick < 0 || s.transfers < states[pick]!.transfers || (s.transfers === states[pick]!.transfers && s.time < states[pick]!.time)) pick = i;
        }
        if (pick < 0) break;
        const cur = states[pick]!; cur.done = true;
        const line = this.lines[cur.line]!, def = line.def, at = def.stations.indexOf(cur.station), n = def.stations.length;
        const relax = (station: number, distance: number): void => {
          const ix = byKey.get(`${station}|${cur.line}`); if (ix === undefined) return;
          const target = states[ix]!, tr = cur.transfers, time = cur.time + distance / CRUISE + MIN_DWELL;
          const first = cur.first < 0 ? station : cur.first;
          if (tr < target.transfers || (tr === target.transfers && time < target.time)) { target.transfers = tr; target.time = time; target.first = first; }
        };
        const relaxTransfer = (lineIndex: number): void => {
          if (lineIndex === cur.line) return;
          const ix = byKey.get(`${cur.station}|${lineIndex}`); if (ix === undefined) return;
          const target = states[ix]!, tr = cur.transfers + 1, time = cur.time + TRANSFER_WALK;
          if (tr < target.transfers || (tr === target.transfers && time < target.time)) { target.transfers = tr; target.time = time; target.first = cur.first; }
        };
        if (def.loop) {
          const next = (at + 1) % n; relax(def.stations[next]!, line.tracks[at]!.length);
        } else {
          if (at + 1 < n) relax(def.stations[at + 1]!, line.tracks[at]!.length);
          if (at > 0) relax(def.stations[at - 1]!, line.tracks[at - 1]!.length);
        }
        for (let li = 0; li < this.lines.length; li++) if (li !== cur.line) relaxTransfer(li);
      }
      for (const to of ids) if (to !== from) {
        bestTransfers = Infinity; bestTime = Infinity; bestHop = -1;
        for (const state of states) if (state.station === to && state.first >= 0 && (state.transfers < bestTransfers || (state.transfers === bestTransfers && state.time < bestTime))) {
          bestTransfers = state.transfers; bestTime = state.time; bestHop = state.first;
        }
        if (bestHop >= 0) this.routes.set(`${from}|${to}`, bestHop);
      }
    }
  }
  /** Starts a line's trains dwelling at the platforms where their blocks begin, spread evenly over the block cycle; extra trains share a platform and queue for their block. No two trains start inside one block. */
  private placeTrains(line: RuntimeLine): void {
    const T = line.tracks.length, order: number[] = [];
    for (let i = 0; i < T; i++) order.push(blockIndex(i, 1));
    if (!line.def.loop) for (let i = T - 1; i >= 0; i--) order.push(blockIndex(i, -1));
    const n = line.def.trains;
    for (let k = 0; k < n; k++) {
      const b = order[Math.floor(k * order.length / n)]!, track = b >> 1, dir: 1 | -1 = b & 1 ? -1 : 1, tr = line.tracks[track]!;
      line.trains.push({ line: line.def.id, track, dir, dist: dir > 0 ? 0 : tr.length, speed: 0, dwell: MIN_DWELL, at: dir > 0 ? tr.a : tr.b, groups: [], load: 0, owned: false, queued: 0 });
    }
  }
  /** Advances one sub-step of h seconds: waiting counters, then every train in fixed line and train order. */
  private advance(h: number): void {
    for (const q of this.queues) for (const g of q) { if (g.walk > 0) g.walk = Math.max(0, g.walk - h); else g.wait += h; }
    for (const line of this.lines) for (const t of line.trains) this.stepTrain(line, t, h);
  }
  private stoppingDistance(v: number): number { return v * v / (2 * ACCEL); }
  private nextTrack(line: RuntimeLine, t: Train): { track: number; dir: 1 | -1 } {
    if (t.dir > 0) { if (t.track + 1 < line.tracks.length) return { track: t.track + 1, dir: 1 }; if (line.def.loop) return { track: 0, dir: 1 }; return { track: t.track, dir: -1 }; }
    if (t.track > 0) return { track: t.track - 1, dir: -1 }; if (line.def.loop) return { track: line.tracks.length - 1, dir: -1 }; return { track: t.track, dir: 1 };
  }
  /** The station a train at a platform is heading to on its current block. */
  private headingTo(line: RuntimeLine, t: Train): number { const tr = line.tracks[t.track]!; return t.dir > 0 ? tr.b : tr.a; }
  private stepTrain(line: RuntimeLine, t: Train, dt: number): void {
    let left = dt;
    while (left > 1e-9) {
      if (!t.owned) {
        // At a platform: dwell first, then take the block if it is free, otherwise queue for it.
        if (t.dwell > 0) { const used = Math.min(t.dwell, left); t.dwell -= used; left -= used; continue; }
        if (!this.acquire(line, t)) return;
      }
      const tr = line.tracks[t.track]!;
      const remaining = t.dir > 0 ? tr.length - t.dist : t.dist;
      if (remaining <= 1e-6) { this.arriveAt(line, t, t.dir > 0 ? tr.b : tr.a); continue; }
      const stopDist = this.stoppingDistance(t.speed);
      const accel = t.speed <= 0 ? ACCEL : remaining <= stopDist + t.speed * left ? -ACCEL : t.speed < CRUISE ? ACCEL : 0;
      const ns = Math.max(0, Math.min(CRUISE, t.speed + accel * left));
      const move = (t.speed + ns) * 0.5 * left;
      if (move >= remaining) {
        const used = t.speed + ns > 1e-9 ? Math.min(left, 2 * remaining / (t.speed + ns)) : left;
        t.dist = t.dir > 0 ? tr.length : 0; t.speed = ns; left -= used;
        this.arriveAt(line, t, t.dir > 0 ? tr.b : tr.a);
      } else { t.dist += t.dir * move; t.speed = ns; left = 0; }
    }
  }
  /** Takes the train's block when no train owns it; otherwise the train waits at its platform in FCFS order. */
  private acquire(line: RuntimeLine, t: Train): boolean {
    const b = blockIndex(t.track, t.dir);
    if (line.owners[b]) { if (!t.queued) t.queued = ++this.seq; return false; }
    line.owners[b] = t; t.owned = true; t.queued = 0; return true;
  }
  /** Frees the train's block at its far station and hands it straight to the earliest-queued train waiting for that block. */
  private release(line: RuntimeLine, t: Train): void {
    const b = blockIndex(t.track, t.dir);
    if (line.owners[b] === t) line.owners[b] = null;
    t.owned = false;
    let next: Train | undefined;
    for (const other of line.trains) if (!other.owned && other.queued > 0 && blockIndex(other.track, other.dir) === b && (!next || other.queued < next.queued)) next = other;
    if (next) { line.owners[b] = next; next.owned = true; next.queued = 0; }
  }
  private dispatchWaiting(station: number): void {
    const q = this.queues[this.stationIndex.get(station)!]!;
    for (const line of this.lines) for (const t of line.trains) {
      if (t.at !== station || t.owned || t.load >= CAPACITY) continue;
      const nextStation = this.headingTo(line, t);
      let boarded = 0;
      for (let i = 0; i < q.length && t.load < CAPACITY;) {
        const g = q[i]!;
        if (g.walk <= 0 && this.routes.get(`${station}|${g.to}`) === nextStation) {
          const take = Math.min(g.count, CAPACITY - t.load); g.count -= take; t.load += take; boarded += take;
          if (g.initial) { this.waitSum += g.wait * take; this.waitCount += take; }
          t.groups.push({ from: station, to: g.to, tag: g.tag, count: take, walk: 0, wait: 0, initial: g.initial });
          if (!g.count) { q.splice(i, 1); continue; }
        }
        i++;
      }
      // A queued train boards while it waits for its block; it never gains dwell, so a queued train always has a busy block.
      if (!t.queued) t.dwell = Math.max(t.dwell, boarded / BOARD_RATE);
    }
  }

  private startAtStation(line: RuntimeLine, t: Train, station: number): void {
    t.at = station; t.dwell = MIN_DWELL;
    const next = this.headingTo(line, t), q = this.queues[this.stationIndex.get(station)!]!;
    for (let i = 0; i < q.length && t.load < CAPACITY;) {
      const g = q[i]!;
      if (g.walk <= 0 && this.routes.get(`${station}|${g.to}`) === next) {
        const take = Math.min(g.count, CAPACITY - t.load); g.count -= take; t.load += take;
        if (g.initial) { this.waitSum += g.wait * take; this.waitCount += take; }
        t.groups.push({ from: station, to: g.to, tag: g.tag, count: take, walk: 0, wait: 0, initial: g.initial });
        if (!g.count) { q.splice(i, 1); continue; }
      }
      i++;
    }
  }

  private arriveAt(line: RuntimeLine, t: Train, station: number): void {
    this.release(line, t);
    t.at = station; t.speed = 0; t.queued = 0;
    // Alight delivered groups, or change them into a transfer walk at this station.
    const track = line.tracks[t.track]!;
    let nextStation: number;
    if (t.dir > 0) nextStation = t.track + 1 < line.tracks.length ? line.tracks[t.track + 1]!.b : line.def.loop ? line.tracks[0]!.b : track.a;
    else nextStation = t.track > 0 ? line.tracks[t.track - 1]!.a : line.def.loop ? line.tracks[line.tracks.length - 1]!.a : track.b;
    let w = 0, alighted = 0;
    for (const g of t.groups) {
      if (g.to === station) { this.addArrival(station, g.count, g.tag); this.carried += g.count; alighted += g.count; }
      else if (this.routes.get(`${station}|${g.to}`) !== nextStation) { g.from = station; g.walk = TRANSFER_WALK; g.wait = 0; g.initial = false; this.queues[this.stationIndex.get(station)!]!.push(g); alighted += g.count; }
      else t.groups[w++] = g;
    }
    t.groups.length = w; t.load = 0; for (const g of t.groups) t.load += g.count;
    const next = this.nextTrack(line, t), stationNext = next.dir > 0 ? line.tracks[next.track]!.b : line.tracks[next.track]!.a;
    let boarded = 0;
    const q = this.queues[this.stationIndex.get(station)!]!;
    for (let i = 0; i < q.length;) {
      const g = q[i]!;
      if (g.count <= 0) { q.splice(i, 1); continue; }
      if (g.walk <= 0 && this.routes.get(`${station}|${g.to}`) === stationNext && t.load < CAPACITY) {
        const take = Math.min(g.count, CAPACITY - t.load); g.count -= take; boarded += take; t.load += take;
        if (g.initial) { this.waitSum += g.wait * take; this.waitCount += take; }
        if (take > 0) { const rider: Group = { from: station, to: g.to, tag: g.tag, count: take, walk: 0, wait: 0, initial: g.initial }; t.groups.push(rider); }
        if (!g.count) { q.splice(i, 1); continue; }
      }
      i++;
    }
    const duration = Math.max(MIN_DWELL, (alighted + boarded) / BOARD_RATE);
    t.dwell = duration;
    // Advance to the next physical section after this stop; the train still has to take that block to leave.
    if (t.dir > 0) {
      if (t.track + 1 < line.tracks.length) { t.track++; t.dist = 0; }
      else if (line.def.loop) { t.track = 0; t.dist = 0; }
      else { t.dir = -1; t.dist = line.tracks[t.track]!.length; }
    } else {
      if (t.track > 0) { t.track--; t.dist = line.tracks[t.track]!.length; }
      else if (line.def.loop) { t.track = line.tracks.length - 1; t.dist = line.tracks[t.track]!.length; }
      else { t.dir = 1; t.dist = 0; }
    }
  }
  private addArrival(station: number, fans: number, tag: number): void {
    for (const a of this.arrivals) if (a.station === station && a.tag === tag) { a.fans += fans; return; }
    this.arrivals.push({ station, fans, tag });
  }
  private refreshView(): void {
    const trains = this.render.trains; let n = 0;
    for (const line of this.lines) for (const t of line.trains) {
      const tr = line.tracks[t.track]!, r = trains[n] ?? (trains[n] = { line: 0, x: 0, y: 0, dir: 0, load: 0 });
      const f = tr.length > 0 ? t.dist / tr.length : 0, p = t.dir > 0 ? f : 1 - f;
      r.line = t.line; r.x = tr.ax + (tr.bx - tr.ax) * p; r.y = tr.ay + (tr.by - tr.ay) * p;
      r.dir = Math.atan2((t.dir > 0 ? tr.by - tr.ay : tr.ay - tr.by), (t.dir > 0 ? tr.bx - tr.ax : tr.ax - tr.bx)); r.load = t.load; n++;
    }
    trains.length = n;
    const qs = this.render.queues; let qi = 0;
    for (let i = 0; i < this.stations.length; i++) { let fans = 0; for (const g of this.queues[i]!) fans += g.count; const s = qs[qi] ?? (qs[qi] = { station: 0, fans: 0 }); s.station = this.stations[i]!.id; s.fans = fans; qi++; }
    qs.length = qi;
  }
}
