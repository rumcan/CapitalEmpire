// P23 mockup helpers (a classic script, so the pages open from file://): the game's iso projection, so overlays sit on the real map tiles
// of each background (the camera saved when the background was captured: bg/bg3.json), and small SVG builders. Units: tiles of 2 m;
// 1 m course cells are half a tile.
(function () {
  const M = {};
  /** screen px of tile (x, y) for a camera { X, Y, z, w, h } (engine.ts: cssW/2 + ((x - y) * 64 - cam.X) * z, cssH/2 + ((x + y) * 32 - cam.Y) * z) */
  M.iso = (cam) => (x, y) => [cam.w / 2 + ((x - y) * 64 - cam.X) * cam.z, cam.h / 2 + ((x + y) * 32 - cam.Y) * cam.z];
  /** tile of screen px (sx, sy) */
  M.tileOf = (cam) => (sx, sy) => { const a = ((sx - cam.w / 2) / cam.z + cam.X) / 64, b = ((sy - cam.h / 2) / cam.z + cam.Y) / 32; return [(a + b) / 2, (b - a) / 2]; };
  const f = (v) => v.toFixed(1);
  /** an SVG path for a closed polygon of tile points */
  M.poly = (P, pts) => 'M' + pts.map(p => P(p[0], p[1]).map(f).join(' ')).join(' L') + ' Z';
  /** an SVG path for an open polyline of tile points */
  M.line = (P, pts) => 'M' + pts.map(p => P(p[0], p[1]).map(f).join(' ')).join(' L');
  /** a tile-space circle of radius r tiles as a polygon (it projects to the iso ellipse) */
  M.circle = (cx, cy, r, n = 48) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]);
  /** a wobbly blob (tile space): radius r with a seeded low swell, for organic greens and bunkers */
  M.blob = (cx, cy, rx, ry, rot = 0, seed = 1, n = 64, amp = 0.08) => Array.from({ length: n }, (_, i) => {
    const t = (i / n) * 2 * Math.PI, w = 1 + amp * Math.sin(3 * t + seed) + amp * 0.6 * Math.sin(5 * t + seed * 2.3);
    const x = rx * w * Math.cos(t), y = ry * w * Math.sin(t), c = Math.cos(rot), s = Math.sin(rot);
    return [cx + x * c - y * s, cy + x * s + y * c];
  });
  /** the cells (1 m: integer cell indices i, j covering tiles [i/2, i/2 + 0.5)) as one fill path and their outer edges as a stroke path */
  M.cells = (P, cells) => {
    let fill = '', edges = new Map();
    const key = (a, b) => (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1])) ? `${a}|${b}` : `${b}|${a}`;
    for (const [i, j] of cells) {
      const x0 = i / 2, y0 = j / 2, x1 = x0 + 0.5, y1 = y0 + 0.5, c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      fill += M.poly(P, c) + ' ';
      for (let k = 0; k < 4; k++) { const a = c[k], b = c[(k + 1) % 4], kk = key(a, b); edges.set(kk, edges.has(kk) ? null : [a, b]); }
    }
    let stroke = '';
    for (const e of edges.values()) if (e) stroke += 'M' + P(...e[0]).map(f).join(' ') + ' L' + P(...e[1]).map(f).join(' ') + ' ';
    return { fill, stroke };
  };
  /** the half grid (1 m lines) inside radius r tiles around tile (cx, cy), each line's alpha falling with distance: an SVG group string */
  M.halfGrid = (P, cx, cy, r, color = '255,255,255', a0 = 0.5) => {
    let out = '';
    const x0 = Math.floor((cx - r) * 2) / 2, x1 = Math.ceil((cx + r) * 2) / 2, y0 = Math.floor((cy - r) * 2) / 2, y1 = Math.ceil((cy + r) * 2) / 2;
    for (let x = x0; x <= x1; x += 0.5) for (let y = y0; y < y1; y += 0.5) {
      // short segments so each can fade on its own
      const d = Math.hypot(x - cx, y + 0.25 - cy); if (d > r) continue;
      const a = a0 * Math.pow(1 - d / r, 1.3) * (Number.isInteger(x) ? 1 : 0.6);
      const p = P(x, y), q = P(x, y + 0.5); out += `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}" stroke="rgba(${color},${a.toFixed(3)})" stroke-width="1"/>`;
    }
    for (let y = y0; y <= y1; y += 0.5) for (let x = x0; x < x1; x += 0.5) {
      const d = Math.hypot(x + 0.25 - cx, y - cy); if (d > r) continue;
      const a = a0 * Math.pow(1 - d / r, 1.3) * (Number.isInteger(y) ? 1 : 0.6);
      const p = P(x, y), q = P(x + 0.5, y); out += `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}" stroke="rgba(${color},${a.toFixed(3)})" stroke-width="1"/>`;
    }
    return out;
  };
  /** centripetal-ish Catmull-Rom through tile points, sampled every `step` tiles: [x, y, s (tiles along)] */
  M.spline = (pts, step = 0.5) => {
    const P = [pts[0], ...pts, pts[pts.length - 1]], out = [];
    let s = 0, prev = null;
    for (let i = 1; i < P.length - 2; i++) {
      const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2], L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), n = Math.max(2, Math.ceil(L / step));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
        const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
        if (prev) s += Math.hypot(x - prev[0], y - prev[1]);
        out.push([x, y, s]); prev = [x, y];
      }
    }
    const e = pts[pts.length - 1]; s += Math.hypot(e[0] - prev[0], e[1] - prev[1]); out.push([e[0], e[1], s]);
    return out;
  };
  /** a band of half width hw(s) tiles either side of a sampled line, from s0 to s1: a closed polygon */
  M.band = (line, hw, s0 = 0, s1 = Infinity) => {
    const L = [], R = [];
    for (let i = 0; i < line.length; i++) {
      const [x, y, s] = line[i]; if (s < s0 || s > s1) continue;
      const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d, ny = dx / d, w = hw(s);
      L.push([x + nx * w, y + ny * w]); R.push([x - nx * w, y - ny * w]);
    }
    return [...L, ...R.reverse()];
  };
  /** the point and normal at distance s along a sampled line */
  M.at = (line, s) => { let i = line.findIndex(p => p[2] >= s); if (i < 1) i = 1; const a = line[i - 1], b = line[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return { x: b[0], y: b[1], nx: -(b[1] - a[1]) / d, ny: (b[0] - a[0]) / d }; };
  /** appends an SVG string to the overlay */
  M.svg = (el, s) => { el.insertAdjacentHTML('beforeend', s); };
  /** places an absolutely positioned element at screen px */
  M.place = (el, x, y) => { el.style.left = x + 'px'; el.style.top = y + 'px'; };
  /** the screen chrome shared by the mockups: the top bar (season and tour chip, money, time, View, settings, help) and the rail of the
   *  proposed groups. o: { stage: 1 | 2 | 3, active: rail id, season: { big, small, done, of }, money, newIds: [rail ids flagged New] } */
  M.chrome = (root, o) => {
    const stage = o.stage ?? 3, on = (id) => (o.active === id ? ' on' : ''), nw = (id) => ((o.newIds || []).includes(id) ? '<span class="new">NEW</span>' : '');
    const it = (id, icon, label, key) => `<div class="it${on(id)}"><img src="../../../../src/assets/ui/icons/${icon}.webp">${label}${(o.newIds || []).includes(id) ? '' : `<span class="k">${key}</span>`}${nw(id)}</div>`;
    const s = o.season || { big: 'Founding season', small: 'Sep 1984 · 11 months to season end', done: 0, of: 9 };
    root.insertAdjacentHTML('beforeend', `
      <div class="topbar">
        <div class="glass tb">
          <div class="logo"><img src="../../../../src/assets/ui/icons/leaf.webp" style="width:34px;height:34px"><div><div class="t">Maple Falls</div><div class="s">${o.place || 'Golf club'}</div></div></div>
          <div class="vsep"></div>
          <div class="season"><img src="../../../../src/assets/ui/icons/calendar.webp" style="width:22px;height:22px"><div><div class="big">${s.big}</div><div class="small">${s.small}</div></div>
            <div style="margin-left:6px"><div class="small" style="text-align:right;margin-bottom:3px">${s.done} of ${s.of} holes</div><div class="prog"><i style="width:${Math.round(100 * s.done / s.of)}%"></i></div></div></div>
          <div class="vsep"></div>
          <div class="money"><div class="l">Money</div><div class="v">${o.money || '$600,000'}</div></div>
        </div>
        <div class="grow"></div>
        <div class="glass tb" style="gap:6px;padding:0 10px">
          <div class="ibtn"><img class="ico" src="../../../../src/assets/ui/icons/pause.webp"></div>
          <span class="speed on">1×</span><span class="speed">2×</span><span class="speed">4×</span><span class="speed">8×</span>
          <span class="next"><img class="ico" src="../../../../src/assets/ui/icons/skip.webp" style="width:16px;height:16px">Next season</span>
        </div>
        <div class="glass tb" style="gap:6px;padding:0 10px">
          <span class="viewmenu"><img class="ico" src="../../../../src/assets/ui/icons/layers.webp" style="width:18px;height:18px">View ▾</span>
          <div class="ibtn"><img class="ico" src="../../../../src/assets/ui/icons/gear.webp"></div>
          <div class="ibtn"><img class="ico" src="../../../../src/assets/ui/icons/help.webp"></div>
        </div>
      </div>
      <div class="glass rail">
        ${it('select', 'compass', 'Select', 'V')}
        <div class="sep"></div><div class="grp">Course</div>
        ${it('holes', 'trophy', 'Holes', 'C')}
        ${it('paths', 'sidewalk', 'Paths', 'P')}
        ${it('buildings', 'buildings', 'Buildings', 'B')}
        ${stage >= 2 ? it('landscape', 'forest', 'Landscape', 'L') : ''}
        ${stage >= 3 ? `<div class="sep"></div><div class="grp">Town</div>${it('roads', 'road', 'Roads', 'R')}${it('transport', 'bus', 'Transport', 'T')}` : ''}
        <div class="sep"></div>
        ${it('remove', 'bulldozer', 'Remove', 'X')}
      </div>`);
  };
  /** the cursor: an arrow pointer at (x, y) and, beside it lower right, T108's surface chip and its label */
  M.pointer = (root, x, y, chip) => {
    root.insertAdjacentHTML('beforeend', `<svg class="cursor" style="left:${x}px;top:${y}px" viewBox="0 0 22 30"><path d="M1 1 L1 22 L6.5 16.8 L10.2 25.5 L13.6 24 L10 15.6 L17.5 15.6 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`);
    if (!chip) return;
    const cx = x + 18, cy = y + 20;
    root.insertAdjacentHTML('beforeend', `<div class="chip3d" style="left:${cx}px;top:${cy}px"><div class="shadow"></div><div class="wall" style="background:${chip.wall || '#5b4a32'}"></div><div class="top" style="background-image:url(tex/${chip.tex}.webp)"></div></div>
      <div class="tag${chip.bad ? ' bad' : ''}" style="left:${cx - 6}px;top:${cy + 44}px">${chip.l1}${chip.l2 ? `<span class="l2">${chip.l2}</span>` : ''}</div>`);
  };
  window.MOCK = M;
})();
