// Host copy of the supplied package/baker/core/terrain-field.js (left untouched): the distance query's buckets are a flat numeric grid,
// not a Map of "x,y" strings, so a new bunker's field builds in a fraction of the time (it was most of a first bake's ~0.8 s).
/** Smooth global signed-distance terrain. Positive means inside sand. */

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const endpointKey = point => `${point[0]},${point[1]}`;
const ordinarySegments = {
  1: [[0, 3]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]],
  6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]],
  11: [[1, 2]], 12: [[3, 1]], 13: [[0, 1]], 14: [[0, 3]],
};

function extractContours(grid) {
  const segments = [], adjacent = new Map(), positions = new Map();
  const vertex = (x, y) => x < 0 || y < 0 || x > grid.width || y > grid.height
    ? 0 : Number(grid.vertices[y][x] > 0.5);
  // A virtual outer grass ring also closes contours if the user paints a
  // vertex on the original grid boundary. Coordinates remain in grid units.
  for (let y = -1; y <= grid.height; y++) for (let x = -1; x <= grid.width; x++) {
    const within = x >= 0 && y >= 0 && x < grid.width && y < grid.height;
    const item = within ? grid.caseAt(x, y) : {
      mask: vertex(x, y) | vertex(x + 1, y) << 1 | vertex(x + 1, y + 1) << 2 | vertex(x, y + 1) << 3,
      variant: 'sand',
    };
    let connections = ordinarySegments[item.mask];
    if (item.mask === 5 || item.mask === 10) {
      const sandConnected = item.variant !== 'grass';
      connections = (item.mask === 5) === sandConnected ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
    }
    if (!connections) continue;
    // Integer half-grid coordinates give exact shared-edge endpoint keys.
    const points = [[x * 2 + 1, y * 2], [x * 2 + 2, y * 2 + 1],
                    [x * 2 + 1, y * 2 + 2], [x * 2, y * 2 + 1]];
    for (const [aIndex, bIndex] of connections) {
      const a = points[aIndex], b = points[bIndex], aKey = endpointKey(a), bKey = endpointKey(b);
      const id = segments.length;
      segments.push([aKey, bKey]); positions.set(aKey, a); positions.set(bKey, b);
      if (!adjacent.has(aKey)) adjacent.set(aKey, []);
      if (!adjacent.has(bKey)) adjacent.set(bKey, []);
      adjacent.get(aKey).push({id, other: bKey}); adjacent.get(bKey).push({id, other: aKey});
    }
  }
  const visited = new Uint8Array(segments.length), contours = [];
  for (let seed = 0; seed < segments.length; seed++) {
    if (visited[seed]) continue;
    const start = segments[seed][0];
    let current = start;
    const path = [];
    for (let step = 0; step <= segments.length; step++) {
      const point = positions.get(current); path.push([point[0] / 2, point[1] / 2]);
      const edge = adjacent.get(current)?.find(candidate => !visited[candidate.id]);
      if (!edge) throw new Error('Marching-squares outline contains an open contour.');
      visited[edge.id] = 1; current = edge.other;
      if (current === start) break;
      if (step === segments.length) throw new Error('Marching-squares contour did not close.');
    }
    if (path.length < 3) continue;
    let smooth = path;
    for (let pass = 0; pass < 3; pass++) {
      const next = [];
      for (let index = 0; index < smooth.length; index++) {
        const a = smooth[index], b = smooth[(index + 1) % smooth.length];
        next.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25],
                  [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
      }
      smooth = next;
    }
    smooth.push([...smooth[0]]); contours.push(smooth);
  }
  return contours;
}

function polygonMoments(path) {
  let twiceArea = 0, cx = 0, cy = 0;
  const count = path.length - 1;
  for (let index = 0; index < count; index++) {
    const a = path[index], b = path[index + 1], cross = a[0] * b[1] - b[0] * a[1];
    twiceArea += cross; cx += (a[0] + b[0]) * cross; cy += (a[1] + b[1]) * cross;
  }
  if (Math.abs(twiceArea) < 1e-10) {
    return {area: 0, center: [path.slice(0, -1).reduce((sum, p) => sum + p[0], 0) / count,
                             path.slice(0, -1).reduce((sum, p) => sum + p[1], 0) / count]};
  }
  return {area: twiceArea / 2, center: [cx / (3 * twiceArea), cy / (3 * twiceArea)]};
}

function uniformLoop(path) {
  const cumulative = [0];
  for (let index = 1; index < path.length; index++) {
    cumulative.push(cumulative[index - 1] + Math.hypot(path[index][0] - path[index - 1][0],
                                                    path[index][1] - path[index - 1][1]));
  }
  const perimeter = cumulative[cumulative.length - 1];
  if (perimeter < 1e-8) return null;
  const count = Math.max(16, Math.min(4096, Math.ceil(perimeter / .06))), points = [];
  let segment = 0;
  for (let index = 0; index < count; index++) {
    const distance = perimeter * index / count;
    while (segment < path.length - 2 && cumulative[segment + 1] < distance) segment++;
    const length = cumulative[segment + 1] - cumulative[segment];
    const t = length ? (distance - cumulative[segment]) / length : 0;
    const a = path[segment], b = path[segment + 1];
    points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return {points, perimeter, step: perimeter / count};
}

function selfIntersects(path) {
  const count = path.length - 1;
  const orientation = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  for (let i = 0; i < count; i++) for (let j = i + 2; j < count; j++) {
    if (i === 0 && j === count - 1) continue;
    const a = path[i], b = path[i + 1], c = path[j], d = path[j + 1];
    if (Math.max(a[0], b[0]) <= Math.min(c[0], d[0]) || Math.max(c[0], d[0]) <= Math.min(a[0], b[0])
        || Math.max(a[1], b[1]) <= Math.min(c[1], d[1]) || Math.max(c[1], d[1]) <= Math.min(a[1], b[1])) continue;
    if (orientation(a, b, c) * orientation(a, b, d) < -1e-16
        && orientation(c, d, a) * orientation(c, d, b) < -1e-16) return true;
  }
  return false;
}

function roundContour(path, roundness) {
  if (roundness <= 0) return path;
  const original = polygonMoments(path), loop = uniformLoop(path);
  if (!loop || Math.abs(original.area) < 1e-8) return path;
  // Limit smoothing on tiny islands/holes and retry more gently if a narrow
  // concavity folds. Closed-loop orientation and each component are retained.
  let sigma = Math.min(roundness * 1.2, loop.perimeter / 12);
  for (let attempt = 0; attempt < 4; attempt++, sigma *= .5) {
    const count = loop.points.length, radius = Math.min(Math.floor(count / 2), Math.ceil(3 * sigma / loop.step));
    const weights = [], smoothed = [];
    let total = 0;
    for (let offset = -radius; offset <= radius; offset++) {
      const weight = Math.exp(-.5 * (offset * loop.step / sigma) ** 2);
      weights.push(weight); total += weight;
    }
    for (let index = 0; index < count; index++) {
      let x = 0, y = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const point = loop.points[(index + offset + count) % count], weight = weights[offset + radius];
        x += point[0] * weight; y += point[1] * weight;
      }
      smoothed.push([x / total, y / total]);
    }
    smoothed.push([...smoothed[0]]);
    const result = polygonMoments(smoothed);
    if (result.area * original.area <= 0 || Math.abs(result.area) < 1e-8) continue;
    const scale = Math.min(1.4, Math.sqrt(Math.abs(original.area / result.area)));
    const adjusted = smoothed.map(point => [original.center[0] + (point[0] - result.center[0]) * scale,
                                            original.center[1] + (point[1] - result.center[1]) * scale]);
    if (!selfIntersects(adjusted)) return adjusted;
  }
  return path;
}

function makeDistanceQuery(contours) {
  const segments = [];
  let minBX = Infinity, minBY = Infinity, maxBX = -Infinity, maxBY = -Infinity;
  for (const contour of contours) for (let index = 1; index < contour.length; index++) {
    const a = contour[index - 1], b = contour[index], dx = b[0] - a[0], dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) continue;
    const segment = {ax: a[0], ay: a[1], dx, dy, inverseLength: 1 / lengthSquared,
                     minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]),
                     minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1])};
    segments.push(segment);
    minBX = Math.min(minBX, Math.floor(segment.minX)); minBY = Math.min(minBY, Math.floor(segment.minY));
    maxBX = Math.max(maxBX, Math.floor(segment.maxX)); maxBY = Math.max(maxBY, Math.floor(segment.maxY));
  }
  // Host: one bucket per grid unit in a flat array (row-major from minBX, minBY)
  const bucketW = segments.length ? maxBX - minBX + 1 : 0, buckets = Array.from({length: segments.length ? bucketW * (maxBY - minBY + 1) : 0}, () => null);
  segments.forEach((segment, id) => {
    for (let by = Math.floor(segment.minY); by <= Math.floor(segment.maxY); by++) {
      for (let bx = Math.floor(segment.minX); bx <= Math.floor(segment.maxX); bx++) {
        const key = (by - minBY) * bucketW + bx - minBX; (buckets[key] ??= []).push(id);
      }
    }
  });
  // Host: each bucket's chessboard distance (in buckets) to the nearest bucket holding a segment, so a query starts its ring search there
  const bucketH = buckets.length / (bucketW || 1), near = new Uint16Array(buckets.length).fill(65535);
  buckets.forEach((ids, i) => { if (ids) near[i] = 0; });
  const relax = (i, j) => { if (near[j] + 1 < near[i]) near[i] = near[j] + 1; };
  for (let y = 0; y < bucketH; y++) for (let x = 0; x < bucketW; x++) {
    const i = y * bucketW + x;
    if (x > 0) relax(i, i - 1);
    if (y > 0) { relax(i, i - bucketW); if (x > 0) relax(i, i - bucketW - 1); if (x + 1 < bucketW) relax(i, i - bucketW + 1); }
  }
  for (let y = bucketH - 1; y >= 0; y--) for (let x = bucketW - 1; x >= 0; x--) {
    const i = y * bucketW + x;
    if (x + 1 < bucketW) relax(i, i + 1);
    if (y + 1 < bucketH) { relax(i, i + bucketW); if (x + 1 < bucketW) relax(i, i + bucketW + 1); if (x > 0) relax(i, i + bucketW - 1); }
  }
  const seen = new Uint32Array(segments.length); let visit = 0;
  const distanceAt = (x, y) => {
    if (!segments.length) return 8;
    visit++; if (visit === 0xffffffff) {seen.fill(0); visit = 1;}
    const centerX = Math.floor(x), centerY = Math.floor(y);
    let nearestSquared = 64;
    const checkBucket = (bx, by) => {
      if (bx < minBX || bx > maxBX || by < minBY || by > maxBY) return;
      const ids = buckets[(by - minBY) * bucketW + bx - minBX]; if (!ids) return;
      for (const id of ids) {
        if (seen[id] === visit) continue; seen[id] = visit;
        const s = segments[id];
        const boxX = Math.max(s.minX - x, 0, x - s.maxX), boxY = Math.max(s.minY - y, 0, y - s.maxY);
        if (boxX * boxX + boxY * boxY >= nearestSquared) continue;
        const t = clamp(((x - s.ax) * s.dx + (y - s.ay) * s.dy) * s.inverseLength, 0, 1);
        const px = x - s.ax - t * s.dx, py = y - s.ay - t * s.dy;
        nearestSquared = Math.min(nearestSquared, px * px + py * py);
      }
    };
    // Host: no segment lies in the rings nearer than the bucket's chessboard distance (outside the grid, its distance to the grid)
    const outX = Math.max(minBX - centerX, centerX - maxBX, 0), outY = Math.max(minBY - centerY, centerY - maxBY, 0);
    const first = outX || outY ? Math.max(outX, outY) : near[(centerY - minBY) * bucketW + centerX - minBX];
    for (let radius = Math.max(0, first - 1); radius <= 9; radius++) {
      const left = centerX - radius, right = centerX + radius, top = centerY - radius, bottom = centerY + radius;
      for (let bx = left; bx <= right; bx++) {checkBucket(bx, top); if (bottom !== top) checkBucket(bx, bottom);}
      for (let by = top + 1; by < bottom; by++) {checkBucket(left, by); if (right !== left) checkBucket(right, by);}
      const unsearchedDistance = Math.min(x - left, right + 1 - x, y - top, bottom + 1 - y);
      if (nearestSquared <= unsearchedDistance * unsearchedDistance) break;
    }
    return Math.sqrt(nearestSquared);
  };
  return {segments, distanceAt};
}

/**
 * RGBA8 data: high/low bytes of round((clamp(d,-8,8)+8)/16*65535).
 * Texture values are sampled at texel centers; sample() uses the same mapping.
 * Returned CPU distances are cached/clamped to the same [-8,8] field range.
 * Contours are closed arrays of [x,y], including the repeated first point.
 * options.roundness: 0 retains the three Chaikin passes; 1 additionally applies
 * broad cyclic Gaussian rounding (sigma up to 1.2 grid units), preserving each
 * loop's signed area/centroid where the maximum correction scale of 1.4 permits.
 * guideVertices is a copy of the unchanged original binary guide rows.
 */
export function buildTerrain(grid, resolution = 384, options = {}) {
  if (!grid || !(grid.width > 0) || !(grid.height > 0) || typeof grid.caseAt !== 'function') {
    throw new TypeError('buildTerrain requires a vertex grid with width, height, vertices and caseAt.');
  }
  const width = grid.width, height = grid.height;
  const texWidth = Math.max(2, Math.round(resolution)), texHeight = Math.max(2, Math.round(texWidth * height / width));
  const roundness = clamp(Number.isFinite(Number(options.roundness)) ? Number(options.roundness) : 0, 0, 1);
  const contours = options.contours ? options.contours.map(path=>path.map(point=>[...point])) : extractContours(grid).map(path => roundContour(path, roundness));
  const {segments, distanceAt} = makeDistanceQuery(contours);
  const cached = new Float32Array(texWidth * texHeight), data = new Uint8Array(texWidth * texHeight * 4);
  for (let ty = 0; ty < texHeight; ty++) {
    const y = (ty + .5) / texHeight * height;
    // Even-odd scanline crossings support all disconnected components and holes.
    const intersections = [];
    for (const s of segments) {
      const endY = s.ay + s.dy;
      if ((s.ay > y) !== (endY > y)) intersections.push(s.ax + (y - s.ay) * s.dx / s.dy);
    }
    intersections.sort((a, b) => a - b);
    let crossing = 0, inside = false;
    for (let tx = 0; tx < texWidth; tx++) {
      const x = (tx + .5) / texWidth * width;
      while (crossing < intersections.length && intersections[crossing] <= x) {inside = !inside; crossing++;}
      const distance = distanceAt(x, y) * (inside ? 1 : -1), index = ty * texWidth + tx;
      cached[index] = clamp(distance, -8, 8);
      const encoded = Math.round((clamp(distance, -8, 8) + 8) / 16 * 65535), offset = index * 4;
      data[offset] = encoded >> 8; data[offset + 1] = encoded & 255; data[offset + 2] = 0; data[offset + 3] = 255;
    }
  }
  const sample = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return -8;
    const outsideX = Math.max(0, -x, x - width), outsideY = Math.max(0, -y, y - height);
    const fx = clamp(x / width * texWidth - .5, 0, texWidth - 1), fy = clamp(y / height * texHeight - .5, 0, texHeight - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, texWidth - 1), y1 = Math.min(y0 + 1, texHeight - 1);
    const u = fx - x0, v = fy - y0;
    const a = cached[y0 * texWidth + x0] * (1 - u) + cached[y0 * texWidth + x1] * u;
    const b = cached[y1 * texWidth + x0] * (1 - u) + cached[y1 * texWidth + x1] * u;
    const distance = a * (1 - v) + b * v;
    return outsideX || outsideY ? -Math.min(8, Math.hypot(outsideX, outsideY, Math.max(.001, -distance))) : distance;
  };
  return {width, height, texWidth, texHeight, data, contours, sample, roundness,
          guideVertices: grid.vertices.map(row => [...row])};
}
