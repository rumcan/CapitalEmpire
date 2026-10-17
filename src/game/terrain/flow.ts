/** 8-neighbour offsets (dx, dy) on the height grid */
const DX = [-1, 0, 1, -1, 1, -1, 0, 1], DY = [-1, -1, -1, 0, 0, 1, 1, 1];

/** Barnes priority-flood with epsilon: a filled copy of h (n x n) where every cell drains to the border */
export function priorityFlood(h: Float32Array, n: number): Float32Array {
  const N = n * n;
  const f = new Float32Array(h);
  const vis = new Uint8Array(N);
  const heap = new Int32Array(N);
  let size = 0;
  const push = (c: number) => {
    let k = size++;
    while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[c]) break; heap[k] = heap[p]; k = p; }
    heap[k] = c;
  };
  const pop = (): number => {
    const top = heap[0], last = heap[--size];
    let k = 0;
    while (true) {
      let c = 2 * k + 1;
      if (c >= size) break;
      if (c + 1 < size && f[heap[c + 1]] < f[heap[c]]) c++;
      if (f[heap[c]] >= f[last]) break;
      heap[k] = heap[c]; k = c;
    }
    if (size > 0) heap[k] = last;
    return top;
  };
  const seed = (c: number) => { if (!vis[c]) { vis[c] = 1; push(c); } };
  for (let i = 0; i < n; i++) { seed(i); seed((n - 1) * n + i); seed(i * n); seed(i * n + n - 1); }
  while (size > 0) {
    const c = pop(), x = c % n, y = (c - x) / n;
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const nb = ny * n + nx;
      if (vis[nb]) continue;
      vis[nb] = 1; f[nb] = Math.max(h[nb], f[c] + 1e-3); push(nb);
    }
  }
  return f;
}

/** steepest-descent 8-neighbour per cell (drop / distance), or -1 for border cells and pits */
export function flowDirs(f: Float32Array, n: number): Int32Array {
  const dir = new Int32Array(n * n).fill(-1);
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const c = y * n + x;
    let bd = 0, bn = -1;
    for (let d = 0; d < 8; d++) {
      const nb = (y + DY[d]) * n + x + DX[d];
      const drop = (f[c] - f[nb]) / (DX[d] && DY[d] ? Math.SQRT2 : 1);
      if (drop > bd) { bd = drop; bn = nb; }
    }
    dir[c] = bn;
  }
  return dir;
}

/** flow accumulation: each cell contributes 1, passed down dir from the highest filled cell to the lowest */
export function flowAccum(dir: Int32Array, n: number, f: Float32Array): Float32Array {
  const N = n * n;
  const acc = new Float32Array(N).fill(1);
  const order = new Int32Array(N);
  for (let i = 0; i < N; i++) order[i] = i;
  order.sort((a, b) => f[b] - f[a]);
  for (let k = 0; k < N; k++) { const c = order[k], d = dir[c]; if (d >= 0) acc[d] += acc[c]; }
  return acc;
}

/** the cells visited following dir from start until the border (start and the border cell included) */
export function traceDown(dir: Int32Array, start: number): number[] {
  const out = [start];
  let c = start;
  while (dir[c] >= 0 && out.length <= dir.length) { c = dir[c]; out.push(c); }
  return out;
}
