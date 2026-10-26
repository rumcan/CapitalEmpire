// The vector shadows' draft run (T142, dev only: ?shadows=draft): every library picture the game draws as itself (shadow-draft-items.ts),
// drafted from its atlas pixels (mip 0) by shadow-draft.ts with its hand hints (shadow-hints.json). window.__shadowDraft = { ready, shapes,
// stats } for scripts/dev/draft-shadows.mjs, which writes src/game/shadow-shapes.json. &only=<id,id> drafts just those (and logs them).
import { ATLAS_PAGES, LIBRARY } from '../library';
import { CAST, castShear } from '../cast-shadow';
import type { VectorShadow } from '../shadow-vector';
import { DRAFT_SOLID, draftShadow, type DraftHint } from './shadow-draft';
import { draftItems, draftKindOf, hintOf } from './shadow-draft-items';

/** library: every library id (T164: draft-shadows.mjs drops the file's entries for pictures the library no longer has) */
interface DraftState { ready: boolean; shapes: Record<string, VectorShadow>; stats: Record<string, number>; library: string[]; error?: string; done: number; total: number }
const W = window as unknown as { __shadowDraft: DraftState };

export async function startShadowDraft(root: HTMLElement) {
  const q = new URLSearchParams(location.search), only = q.get('only')?.split(',');
  const st: DraftState = W.__shadowDraft = { ready: false, shapes: {}, stats: {}, library: LIBRARY.map(i => i.id), done: 0, total: 0 };
  root.textContent = 'drafting shadows...';
  try {
    const items = draftItems().filter(i => !only || only.includes(LIBRARY[i]!.id));
    st.total = items.length;
    const shear = castShear(CAST), byPage = new Map<number, number[]>();
    for (const i of items) { const p = LIBRARY[i]!.tex[0]; let l = byPage.get(p); if (!l) byPage.set(p, l = []); l.push(i); }
    const seen = new Map<string, { mask: Uint8Array; n: number; id: string }[]>(), out: Record<string, VectorShadow> = {};
    for (const [page, list] of [...byPage].sort((a, b) => a[0] - b[0])) {
      const bmp = await createImageBitmap(await (await fetch(ATLAS_PAGES[page]![0]!)).blob()), cv = new OffscreenCanvas(bmp.width, bmp.height), g = cv.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(bmp, 0, 0); const PW = bmp.width, PH = bmp.height; bmp.close();
      for (const i of list) {
        const it = LIBRARY[i]!, [, u0, v0, u1, v1] = it.tex, qd = it.quad;
        const px0 = Math.floor(Math.min(u0, u1) * PW), py0 = Math.floor(v0 * PH), pw = Math.max(1, Math.round(Math.abs(u1 - u0) * PW)), ph = Math.max(1, Math.round((v1 - v0) * PH));
        let rgba = g.getImageData(px0, py0, pw, ph).data as Uint8ClampedArray;
        // a picture stored mirrored in the atlas (u0 > u1) is drawn unmirrored: read it back the right way round
        if (u0 > u1) { const m = new Uint8ClampedArray(rgba.length); for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) for (let c = 0; c < 4; c++) m[(y * pw + x) * 4 + c] = rgba[(y * pw + pw - 1 - x) * 4 + c]!; rgba = m; st.stats.mirrored = (st.stats.mirrored ?? 0) + 1; }
        const rx = (qd[2] - qd[0]) / pw, ry = (qd[3] - qd[1]) / ph;
        const hint: DraftHint = hintOf(it.id);
        // the same silhouette (97% of its opaque pixels shared), place and hints as a picture already drafted: share its shapes (a variation
        // set's recoloured pictures)
        const sig = `${pw}x${ph}@${(qd[0] - it.ax).toFixed(1)},${(qd[1] - it.ay).toFixed(1)},${rx.toFixed(4)},${ry.toFixed(4)}:${draftKindOf(it)}:${JSON.stringify(hint)}`;
        const mask = new Uint8Array(pw * ph); let n = 0; for (let k = 0; k < mask.length; k++) if (rgba[k * 4 + 3]! >= DRAFT_SOLID) { mask[k] = 1; n++; }
        const twins = seen.get(sig) ?? [], twin = twins.find(t => { let both = 0; for (let k = 0; k < mask.length; k++) both += mask[k]! & t.mask[k]!; return both >= 0.97 * Math.max(n, t.n); });
        if (twin) { out[it.id] = { same: twin.id }; st.stats.same = (st.stats.same ?? 0) + 1; st.done++; continue; }
        const d = draftShadow({ rgba, w: pw, h: ph, x0: qd[0] + 0.5 * rx - it.ax, y0: qd[1] + 0.5 * ry - it.ay, rx, ry }, draftKindOf(it), shear, hint);
        out[it.id] = d ?? { n: 'no opaque pixels' };
        twins.push({ mask, n, id: it.id }); seen.set(sig, twins);
        st.stats[draftKindOf(it)] = (st.stats[draftKindOf(it)] ?? 0) + 1; if (Object.keys(hint).length) st.stats.hinted = (st.stats.hinted ?? 0) + 1;
        st.done++;
        if (only) console.log('[draft]', it.id, JSON.stringify(out[it.id]));
      }
      root.textContent = `drafting shadows... ${st.done} / ${st.total}`;
    }
    st.shapes = out; st.ready = true; root.textContent = `drafted ${st.done} pictures`;
  } catch (e) { st.error = String((e as Error)?.stack ?? e); root.textContent = st.error; }
}
