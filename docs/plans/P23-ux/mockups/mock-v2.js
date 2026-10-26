// P23 v2 mockup helpers (a classic script, so the pages open from file://). The game's iso projection, so overlays sit on the real
// map tiles of each background (cameras-v2.js), small SVG builders, and v2's screen chrome: today's top bar less the All tools chip
// (P1-B), the Phase 1 rail with locked tools in place (P1-E), the pointer and the surface disc with its mark (P1-C).
// Units: tiles of 2 m; 1 m course cells are half a tile. ?w=1366 renders the laptop size (its own backgrounds and cameras).
(function () {
  const M = {};
  const q = new URLSearchParams(location.search);
  M.W = +(q.get('w') || 1600); M.H = M.W === 1366 ? 768 : 900; M.small = M.W < 1500;
  document.documentElement.style.setProperty('--W', M.W + 'px'); document.documentElement.style.setProperty('--H', M.H + 'px');
  M.cams = (window.CAMS || {})[M.W] || {};
  M.cam = (name) => M.cams[name];
  /** screen px of tile (x, y) for camera c (engine.ts: cssW/2 + ((x - y) * 64 - cam.X) * z, cssH/2 + ((x + y) * 32 - cam.Y) * z) */
  M.iso = (c) => (x, y) => [c.w / 2 + ((x - y) * 64 - c.X) * c.z, c.h / 2 + ((x + y) * 32 - c.Y) * c.z];
  M.tileOf = (c) => (sx, sy) => { const a = ((sx - c.w / 2) / c.z + c.X) / 64, b = ((sy - c.h / 2) / c.z + c.Y) / 32; return [(a + b) / 2, (b - a) / 2]; };
  const f = (v) => v.toFixed(1);
  M.poly = (P, pts) => 'M' + pts.map(p => P(p[0], p[1]).map(f).join(' ')).join(' L') + ' Z';
  M.line = (P, pts) => 'M' + pts.map(p => P(p[0], p[1]).map(f).join(' ')).join(' L');
  M.rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  M.circle = (cx, cy, r, n = 48) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]);
  /** 1 m cells (integer cell indices i, j: tiles [i/2, i/2 + 0.5)) as one fill path and their outer edges */
  M.cells = (P, cells) => {
    let fill = ''; const edges = new Map();
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
  /** the 1 m half-grid lines inside a tile box, alpha a (every second line, on the 2 m grid, a touch stronger), clipped by the caller */
  M.grid = (P, x0, y0, x1, y1, color, a) => {
    let s = '';
    for (let x = Math.ceil(x0 * 2) / 2; x <= x1; x += 0.5) { const p = P(x, y0), r = P(x, y1); s += `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(r[0])}" y2="${f(r[1])}" stroke="rgba(${color},${(Number.isInteger(x) ? a : a * 0.6).toFixed(3)})" stroke-width="1"/>`; }
    for (let y = Math.ceil(y0 * 2) / 2; y <= y1; y += 0.5) { const p = P(x0, y), r = P(x1, y); s += `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(r[0])}" y2="${f(r[1])}" stroke="rgba(${color},${(Number.isInteger(y) ? a : a * 0.6).toFixed(3)})" stroke-width="1"/>`; }
    return s;
  };
  /** the half grid as a spotlight round tile (cx, cy): short segments whose alpha falls with distance */
  M.spot = (P, cx, cy, r, color = '255,250,230', a0 = 0.5) => {
    let out = '';
    const x0 = Math.floor((cx - r) * 2) / 2, x1 = Math.ceil((cx + r) * 2) / 2, y0 = Math.floor((cy - r) * 2) / 2, y1 = Math.ceil((cy + r) * 2) / 2;
    for (let x = x0; x <= x1; x += 0.5) for (let y = y0; y < y1; y += 0.5) {
      const d = Math.hypot(x - cx, y + 0.25 - cy); if (d > r) continue;
      const a = a0 * Math.pow(1 - d / r, 1.3) * (Number.isInteger(x) ? 1 : 0.6), p = P(x, y), w = P(x, y + 0.5);
      out += `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(w[0])}" y2="${f(w[1])}" stroke="rgba(${color},${a.toFixed(3)})" stroke-width="1"/>`;
    }
    for (let y = y0; y <= y1; y += 0.5) for (let x = x0; x < x1; x += 0.5) {
      const d = Math.hypot(x + 0.25 - cx, y - cy); if (d > r) continue;
      const a = a0 * Math.pow(1 - d / r, 1.3) * (Number.isInteger(y) ? 1 : 0.6), p = P(x, y), w = P(x + 0.5, y);
      out += `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(w[0])}" y2="${f(w[1])}" stroke="rgba(${color},${a.toFixed(3)})" stroke-width="1"/>`;
    }
    return out;
  };
  M.svg = (el, s) => el.insertAdjacentHTML('beforeend', s);
  M.html = (el, s) => el.insertAdjacentHTML('beforeend', s);

  // ---- surface marks (D4.2): a mark per surface that survives 40 px and colour blindness ----
  M.mark = (surf, size = 40) => {
    const s = size, c = s / 2;
    const m = {
      fairway: `<path d="M${-s * 0.1} ${s * 0.75} L${s * 0.75} ${-s * 0.1} M${s * 0.15} ${s * 1.0} L${s * 1.0} ${s * 0.15} M${-s * 0.35} ${s * 0.5} L${s * 0.5} ${-s * 0.35}" stroke="rgba(255,255,230,0.55)" stroke-width="${s * 0.12}"/>`,
      green: `<line x1="${c - 2}" y1="${s * 0.22}" x2="${c - 2}" y2="${s * 0.78}" stroke="#fff" stroke-width="${Math.max(1.6, s * 0.05)}"/><path d="M${c - 1} ${s * 0.22} l${s * 0.3} ${s * 0.1} l${-s * 0.3} ${s * 0.12} z" fill="#e23b2e"/><ellipse cx="${c - 2}" cy="${s * 0.78}" rx="${s * 0.09}" ry="${s * 0.04}" fill="#1a2a12"/>`,
      tee: `<circle cx="${s * 0.36}" cy="${s * 0.55}" r="${s * 0.08}" fill="#fff" stroke="#333" stroke-width="1"/><circle cx="${s * 0.64}" cy="${s * 0.55}" r="${s * 0.08}" fill="#fff" stroke="#333" stroke-width="1"/>`,
      rough: `<path d="M${s * 0.25} ${s * 0.7} l${s * 0.05} ${-s * 0.2} M${s * 0.32} ${s * 0.7} l${s * 0.02} ${-s * 0.24} M${s * 0.4} ${s * 0.7} l${-s * 0.03} ${-s * 0.2} M${s * 0.58} ${s * 0.55} l${s * 0.05} ${-s * 0.2} M${s * 0.65} ${s * 0.55} l${s * 0.02} ${-s * 0.24} M${s * 0.72} ${s * 0.55} l${-s * 0.03} ${-s * 0.2}" stroke="rgba(255,248,210,0.85)" stroke-width="${Math.max(1.4, s * 0.045)}" stroke-linecap="round"/>`,
      bunker: `<path d="M${s * 0.18} ${s * 0.42} q${s * 0.32} ${s * 0.12} ${s * 0.64} 0 M${s * 0.18} ${s * 0.56} q${s * 0.32} ${s * 0.12} ${s * 0.64} 0 M${s * 0.18} ${s * 0.7} q${s * 0.32} ${s * 0.12} ${s * 0.64} 0" stroke="rgba(120,90,50,0.75)" stroke-width="${Math.max(1.2, s * 0.04)}" fill="none"/>`,
      water: `<path d="M${s * 0.2} ${s * 0.45} q${s * 0.15} ${-s * 0.1} ${s * 0.3} 0 t${s * 0.3} 0 M${s * 0.2} ${s * 0.62} q${s * 0.15} ${-s * 0.1} ${s * 0.3} 0 t${s * 0.3} 0" stroke="rgba(200,230,255,0.8)" stroke-width="${Math.max(1.4, s * 0.045)}" fill="none"/>`,
    }[surf] || '';
    return `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">${m}</svg>`;
  };
  /** a panel swatch: the real look as a disc, its mark, its name and key */
  M.swatch = (surf, name, key, on = false) => `<div class="sw${on ? ' on' : ''}"><span class="n">${key}</span><div class="d" style="background-image:url(tex2/${surf}.webp)">${M.mark(surf, 40)}</div>${name}</div>`;
  const glyph = (k) => `<span class="glyph" style="grid-template-columns:repeat(${k},4px)">${'<i></i>'.repeat(k * k)}</span>`;
  M.sizes = (on) => [1, 2, 3, 4].map(k => `<span class="size${on === k ? ' on' : ''}">${glyph(k)}${k === 1 ? '1' : `${k}×${k}`}</span>`).join('');

  // ---- the pointer and the disc (T108 chip, P1-C: only the disc rides beside the pointer) ----
  M.pointer = (root, x, y, disc) => {
    root.insertAdjacentHTML('beforeend', `<svg class="cursor" style="left:${x}px;top:${y}px" viewBox="0 0 22 30"><path d="M1 1 L1 22 L6.5 16.8 L10.2 25.5 L13.6 24 L10 15.6 L17.5 15.6 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`);
    if (!disc) return;
    const cx = x + 16, cy = y + 20;
    root.insertAdjacentHTML('beforeend', `<div style="position:absolute;left:${cx}px;top:${cy}px;width:40px;height:34px">
      <div style="position:absolute;left:6px;top:18px;width:40px;height:16px;border-radius:50%;background:rgba(0,0,0,.35);filter:blur(3px)"></div>
      <div style="position:absolute;left:0;top:9px;width:40px;height:22px;border-radius:50%;background:${disc.wall || '#3c4a22'}"></div>
      <div style="position:absolute;left:0;top:3px;width:40px;height:22px;border-radius:50%;overflow:hidden;background:url(tex2/${disc.surf}.webp) center/64px;box-shadow:inset 5px -4px 6px rgba(0,0,0,.28),inset -4px 3px 5px rgba(255,245,210,.32)">
        <div style="position:absolute;left:0;top:-9px;transform:scaleY(.55);transform-origin:50% 50%">${M.mark(disc.surf, 40)}</div></div></div>`);
    if (disc.text) root.insertAdjacentHTML('beforeend', `<div class="tag${disc.bad ? ' bad' : ''}" style="left:${cx + 46}px;top:${cy + 4}px">${disc.text}${disc.l2 ? `<span class="l2">${disc.l2}</span>` : ''}</div>`);
  };

  // ---- the top bar: today's (Phase 1 only moves All tools into Settings, P1-B) ----
  M.topbar = (root, o = {}) => {
    const m = o.money || '$600,000', month = o.month || 'Sep 1984', left2 = o.monthSub || '12 months to season end';
    const I = (n, s = 20) => `<img src="../../../../src/assets/ui/icons/${n}.webp" style="width:${s}px;height:${s}px;display:block">`;
    root.insertAdjacentHTML('beforeend', `
      <div class="topbar">
        <div class="glass tb">
          <div class="row">${I('leaf', 34)}${M.small ? '' : '<div class="logo"><div class="t">Maple Falls</div><div class="s">Town builder</div></div>'}</div>
          <div class="vsep"></div>
          <div><div class="caps" style="letter-spacing:.12em">Tier</div><div style="font-weight:700">T1</div><div class="dim" style="font-size:11.5px">Maple Falls Club Championship</div></div>
          <div><div class="caps" style="letter-spacing:.12em">Month</div><div style="font-weight:700">${month}</div><div class="dim" style="font-size:11.5px">${left2}</div></div>
          <span class="pill" style="padding:5px 10px">${I('trophy', 15)}Course</span>
          <div class="money"><div class="l">Treasury</div><div class="v">${m}</div></div>
        </div>
        <div class="grow"></div>
        <div class="glass tb" style="gap:5px;padding:0 9px">
          <span class="ibtn">${I('pause')}</span><span class="speed on">1×</span><span class="speed">2×</span><span class="speed">4×</span><span class="speed">8×</span><span class="speed">20×</span><span class="ibtn" style="width:32px">${I('skip', 16)}</span>
        </div>
        <div class="glass tb" style="gap:5px;padding:0 8px"><span class="ibtn">${I('zoom-out')}</span><span class="ibtn">${I('zoom-in')}</span></div>
        <div class="row" style="gap:5px"><span class="ibtn glass" style="border-radius:12px">${I('layers')}</span><span class="ibtn glass" style="border-radius:12px">${I('chart')}</span><span class="ibtn glass" style="border-radius:12px">${I('fullscreen')}</span><span class="pill glass" style="padding:8px 11px">Grass</span><span class="ibtn glass" style="border-radius:12px">${I('gear')}</span><span class="ibtn glass" style="border-radius:12px">${I('help')}</span></div>
      </div>`);
  };

  // ---- the Phase 1 rail: the Course group as three tools, locked tools in place (stage 1, 2 or 3), today's keys ----
  M.rail = (root, o = {}) => {
    const st = o.stage ?? 3, on = o.active || 'holes', nw = o.newIds || [], h = M.H < 800 ? 52 : 58;
    const locked = st === 1 ? ['roads', 'junction', 'transport', 'paint'] : st === 2 ? ['roads', 'junction', 'transport'] : [];
    const it = (id, icon, label, key, title) => `<div class="it${on === id ? ' on' : ''}${locked.includes(id) ? ' lock' : ''}" style="height:${h}px" title="${title || ''}"><img src="../../../../src/assets/ui/icons/${icon}.webp">${label}${key ? `<span class="k">${key}</span>` : ''}${nw.includes(id) ? '<span class="new">NEW</span>' : ''}</div>`;
    root.insertAdjacentHTML('beforeend', `<div class="glass rail" style="top:${o.top || 80}px;left:${o.left ?? 12}px">
      ${it('select', 'compass', 'Select', 'V')}
      <div class="grp">Course</div>
      ${it('holes', 'trophy', 'Holes', 'C')}${it('paths', 'sidewalk', 'Paths', '')}${it('buildings', 'buildings', 'Buildings', '')}
      <div class="grp">Town</div>
      ${it('roads', 'road', 'Roads', 'R', 'Unlocks with the tour\'s invitation')}${it('junction', 'junction', 'Junctions', 'J')}${it('transport', 'bus', 'Transport', '')}
      <div class="sep"></div>
      ${it('paint', 'terrain', 'Paint', 'A', 'Unlocks with your first hole')}${it('bulldoze', 'bulldozer', 'Bulldoze', 'X')}
    </div>`);
  };
  M.minimap = (root, bg) => root.insertAdjacentHTML('beforeend', `<div class="glass minimap" style="background:#34431c url(${bg}) center/cover;filter:saturate(.8) brightness(.85)"></div>`);
  window.MOCK = M;
})();
