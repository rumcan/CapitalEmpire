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

/** Build price of one station, in dollars. */
export const STATION_COST = 40_000;
/** Tunnel build price per tile of length, in dollars. */
export const TUNNEL_COST_PER_TILE = 900;
/** Build price of one train, in dollars. */
export const TRAIN_COST = 25_000;
/** Fraction of total build cost charged per game day (1,440 sim seconds). */
export const UPKEEP_RATE = 0.01;
const MPT = 2, CRUISE = 20, ACCEL = 1, CAPACITY = 600, BOARD_RATE = 10, MIN_DWELL = 20, TRANSFER_WALK = 60;

type Group = { from: number; to: number; tag: number; count: number; walk: number; wait: number; initial: boolean };
type Track = { a: number; b: number; length: number; ax: number; ay: number; bx: number; by: number };
type Train = { line: number; track: number; dir: 1 | -1; dist: number; speed: number; dwell: number; at: number; groups: Group[]; load: number };
type RuntimeLine = { def: LineDef; tracks: Track[]; trains: Train[]; total: number };

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
      const tracks: Track[] = []; let total = 0;
      for (let i = 0; i < ids.length - 1 + (def.loop ? 1 : 0); i++) {
        const a = this.stations[this.stationIndex.get(ids[i % ids.length])!]!, b = this.stations[this.stationIndex.get(ids[(i + 1) % ids.length])!]!;
        const length = Math.hypot(b.x - a.x, b.y - a.y) * MPT;
        tracks.push({ a: ids[i % ids.length]!, b: ids[(i + 1) % ids.length]!, length, ax: a.x, ay: a.y, bx: b.x, by: b.y }); total += length;
      }
      const runtime: RuntimeLine = { def, tracks, trains: [], total }; this.lines.push(runtime);
      const cycle = total * (def.loop ? 1 : 2);
      for (let k = 0; k < def.trains && cycle > 0; k++) runtime.trains.push(this.placeTrain(runtime, cycle * k / def.trains));
    }
    this.buildRoutes();
    this.dropped = 0;
    for (const line of this.lines) for (const train of line.trains) if (train.dist <= 1e-9) this.startAtStation(line, train, line.tracks[train.track]!.a);
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

  /** Advances trains and passenger counts by dt simulation seconds (normally 0.1 or 1). */
  step(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    for (const q of this.queues) for (const g of q) { if (g.walk > 0) g.walk = Math.max(0, g.walk - dt); else g.wait += dt; }
    // Stable per-line order resolves simultaneous departures: the first eligible train enters before later trains test the block.
    for (const line of this.lines) for (const t of line.trains) this.stepTrain(line, t, dt);
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
  private placeTrain(line: RuntimeLine, offset: number): Train {
    let dir: 1 | -1 = 1, rem = offset;
    if (!line.def.loop && rem >= line.total) { dir = -1; rem -= line.total; }
    if (dir > 0) {
      for (let i = 0; i < line.tracks.length; i++) { const tr = line.tracks[i]!; if (rem < tr.length || i === line.tracks.length - 1) return { line: line.def.id, track: i, dir, dist: Math.min(rem, tr.length), speed: 0, dwell: 0, at: tr.a, groups: [], load: 0 }; rem -= tr.length; }
    } else {
      for (let i = line.tracks.length - 1; i >= 0; i--) { const tr = line.tracks[i]!; if (rem < tr.length || i === 0) return { line: line.def.id, track: i, dir, dist: tr.length - Math.min(rem, tr.length), speed: 0, dwell: 0, at: tr.b, groups: [], load: 0 }; rem -= tr.length; }
    }
    return { line: line.def.id, track: 0, dir: 1, dist: 0, speed: 0, dwell: 0, at: line.tracks[0]!.a, groups: [], load: 0 };
  }
  private stepTrain(line: RuntimeLine, t: Train, dt: number): void {
    if (t.dwell > 0) { t.dwell = Math.max(0, t.dwell - dt); return; }
    let left = dt;
    while (left > 1e-9) {
      const tr = line.tracks[t.track]!;
      if ((t.dir > 0 && t.dist >= tr.length - 1e-6) || (t.dir < 0 && t.dist <= 1e-6)) {
        this.arriveAt(line, t, t.dir > 0 ? tr.b : tr.a); if (t.dwell > 0) break; continue;
      }
      if ((t.dir > 0 && t.dist <= 1e-6 || t.dir < 0 && t.dist >= tr.length - 1e-6) && this.blocked(line, t, t.track, t.dir)) { t.speed = 0; break; }
      const remaining = t.dir > 0 ? tr.length - t.dist : t.dist;
      const stopDist = this.stoppingDistance(t.speed);
      const accel = remaining <= stopDist + 1 ? -ACCEL : t.speed < CRUISE ? ACCEL : 0;
      const ns = Math.max(0, Math.min(CRUISE, t.speed + accel * left));
      const move = (t.speed + ns) * 0.5 * left;
      if (move >= remaining) { const used = t.speed + ns > 1e-9 ? Math.min(left, 2 * remaining / (t.speed + ns)) : left; t.dist = t.dir > 0 ? tr.length : 0; t.speed = Math.min(CRUISE, ns); left -= used; this.arriveAt(line, t, t.dir > 0 ? tr.b : tr.a); if (t.dwell > 0) break; }
      else { t.dist += t.dir * move; t.speed = ns; left = 0; }
    }
  }
  private stoppingDistance(v: number): number { return v * v / (2 * ACCEL); }
  private nextTrack(line: RuntimeLine, t: Train): { track: number; dir: 1 | -1 } {
    if (t.dir > 0) { if (t.track + 1 < line.tracks.length) return { track: t.track + 1, dir: 1 }; if (line.def.loop) return { track: 0, dir: 1 }; return { track: t.track, dir: -1 }; }
    if (t.track > 0) return { track: t.track - 1, dir: -1 }; if (line.def.loop) return { track: line.tracks.length - 1, dir: -1 }; return { track: t.track, dir: 1 };
  }
  private blocked(line: RuntimeLine, train: Train, track: number, dir: 1 | -1): boolean {
    const length = line.tracks[track]!.length;
    // Only a train physically inside the tunnel owns the block. Trains waiting at either
    // station boundary must not block each other, or a crowded terminal can deadlock.
    for (const other of line.trains) if (other !== train && other.track === track && other.dir === dir && other.dist > 1e-6 && other.dist < length - 1e-6) return true;
    return false;
  }
  private dispatchWaiting(station: number): void {
    const q = this.queues[this.stationIndex.get(station)!]!;
    for (const line of this.lines) for (const t of line.trains) {
      if (t.at !== station || t.dwell <= 0 || t.load >= CAPACITY) continue;
      const nextStation = t.dir > 0 ? line.tracks[t.track]!.b : line.tracks[t.track]!.a;
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
      t.dwell = Math.max(t.dwell, boarded / BOARD_RATE);
    }
  }

  private startAtStation(line: RuntimeLine, t: Train, station: number): void {
    t.at = station; t.dwell = MIN_DWELL;
    const next = line.tracks[t.track]!.b, q = this.queues[this.stationIndex.get(station)!]!;
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
    t.at = station; t.speed = 0;
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
    // Advance to the next physical section after this stop.
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
      const p = t.dir > 0 ? t.dist / tr.length : 1 - t.dist / tr.length;
      r.line = t.line; r.x = tr.ax + (tr.bx - tr.ax) * p; r.y = tr.ay + (tr.by - tr.ay) * p;
      r.dir = Math.atan2((t.dir > 0 ? tr.by - tr.ay : tr.ay - tr.by), (t.dir > 0 ? tr.bx - tr.ax : tr.ax - tr.bx)); r.load = t.load; n++;
    }
    trains.length = n;
    const qs = this.render.queues; let qi = 0;
    for (let i = 0; i < this.stations.length; i++) { let fans = 0; for (const g of this.queues[i]!) fans += g.count; const s = qs[qi] ?? (qs[qi] = { station: 0, fans: 0 }); s.station = this.stations[i]!.id; s.fans = fans; qi++; }
    qs.length = qi;
  }
}
