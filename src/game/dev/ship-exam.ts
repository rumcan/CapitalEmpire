// T173 (#406; P25): Ship model with its exam. Before the lot lab ships its live model (live-model.ts) as the next lot model, it renders the exam:
// a few lots of each use group (two of each state, the smallest and the largest of the exam's: lots/lot-exam.ts) composed as the game composes
// them, first with the latest shipped model, then with the live one, each shot from the game's own canvas (dev/lot-exam.ts capture), laid out as
// a before/after sheet (per lot: the latest left, the live right) and shown in the lab over everything. "Ship" there posts the model and the sheet
// (a JPEG): the dev server writes v<N>.json, v<N>.exam.jpg and the index (dev-save.ts shipPlan); "Cancel" ships nothing. Dev builds only.
import type { Game } from '../engine';
import { addLotModel, lotPresets } from '../lots/compose';
import { LATEST } from '../lots/lot-models';
import { EXAM_STATES, examLots, type ExamLot } from '../lots/lot-exam';
import type { makeExam } from './lot-exam';
import { BTN, GO, btn, el } from './lot-lab-ui';

/** the version the live model is shown as while its exam renders (in memory only) */
export const LIVE_V = 901;
/** the groups in the sheet, their names, and its lots: per group and state the smallest and the largest of the exam's */
const GROUPS = [['res', 'Houses'], ['com', 'Shops and offices'], ['ind', 'Industry'], ['open', 'Car parks, civic and tour']] as const;
export function shipLots(all: readonly ExamLot[]): ExamLot[] {
  const out: ExamLot[] = [];
  for (const [g] of GROUPS) for (const s of EXAM_STATES) {
    const row = all.filter(l => (l.group ?? 'res') === g && l.state === s).sort((a, b) => a.w * a.d - b.w * b.d || a.i - b.i);
    if (row.length) out.push(row[0]!); if (row.length > 1) out.push(row[row.length - 1]!);
  }
  return out;
}
/** the sheet: a cell's size, the pairs a row, the header and a group's title (px) */
const CW = 270, CH = 214, PER_ROW = 3, HEAD = 64, TITLE = 30, GAP = 10, LABEL = 18;
type Exam = ReturnType<typeof makeExam>;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
/** renders the exam, shows the sheet, ships on the owner's word: the version shipped, or null */
export async function shipWithExam(o: { exam: Exam; game: Game; say(m: string): void }, data: Record<string, unknown>, from: string): Promise<number | null> {
  const lots = shipLots(examLots(lotPresets())), cells = new Map<string, HTMLCanvasElement>(), models = [String(LATEST), String(LIVE_V)];
  addLotModel(LIVE_V, data);
  o.exam.pick(lots.map(l => l.i));
  const rows = o.exam.rows(), total = rows.flat().length * models.length;
  let done = 0;
  for (const m of models) {
    o.exam.model(m);
    for (let k = 0; k < rows.length; k++) {
      o.exam.stage(k); await wait(2600);
      for (const i of rows[k]!) {
        const rect = o.exam.focus(i); if (!rect) continue;
        await wait(450);
        cells.set(`${m}|${i}`, await o.exam.capture(rect));
        o.say(`the exam: ${++done} of ${total} lots shot (${m === String(LIVE_V) ? 'the live model' : `v${LATEST}`})`);
      }
    }
  }
  o.exam.done();
  const sheet = drawSheet(lots, cells, models);
  return confirmShip(sheet, data, from, o.say);
}
/** the before/after sheet (see the file head) */
function drawSheet(lots: readonly ExamLot[], cells: ReadonlyMap<string, HTMLCanvasElement>, models: readonly string[]): HTMLCanvasElement {
  const pairW = 2 * CW + 6, W = PER_ROW * pairW + (PER_ROW + 1) * GAP + 6 * GAP;
  const sections = GROUPS.map(([g, name]) => ({ name, lots: lots.filter(l => (l.group ?? 'res') === g) })).filter(s => s.lots.length);
  const H = HEAD + sections.reduce((t, s) => t + TITLE + Math.ceil(s.lots.length / PER_ROW) * (CH + LABEL + GAP), 0) + GAP;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  x.fillStyle = '#0c121c'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#e5e7eb'; x.font = '700 22px system-ui,sans-serif'; x.fillText(`Lot model exam: v${LATEST} (shipped, left of each pair) against the live model (right) · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, GAP, 30);
  x.font = '13px system-ui,sans-serif'; x.fillStyle = '#94a3b8'; x.fillText('each lot composed as the game composes it; two lots of each state per group, the smallest and the largest of the exam', GAP, 52);
  let y = HEAD;
  for (const s of sections) {
    x.fillStyle = '#fbbf24'; x.font = '700 17px system-ui,sans-serif'; x.fillText(s.name, GAP, y + 21); y += TITLE;
    s.lots.forEach((l, k) => {
      const col = k % PER_ROW, row = Math.floor(k / PER_ROW), px = GAP + col * (pairW + GAP + 3 * GAP), py = y + row * (CH + LABEL + GAP);
      models.forEach((m, j) => {
        const cell = cells.get(`${m}|${l.i}`), cx = px + j * (CW + 6);
        x.fillStyle = '#111827'; x.fillRect(cx, py, CW, CH);
        if (cell) { const k2 = Math.min(CW / cell.width, CH / cell.height), w = cell.width * k2, h = cell.height * k2; x.drawImage(cell, cx + (CW - w) / 2, py + (CH - h) / 2, w, h); }
        x.strokeStyle = j ? '#7c3aed' : '#334155'; x.lineWidth = 2; x.strokeRect(cx + 1, py + 1, CW - 2, CH - 2);
      });
      x.fillStyle = '#cbd5e1'; x.font = '12px system-ui,sans-serif'; x.fillText(`#${l.i} ${l.use ?? 'res'} · ${l.state} · ${l.w}×${l.d} · road ${l.road}`, px, py + CH + 13);
    });
    y += Math.ceil(s.lots.length / PER_ROW) * (CH + LABEL + GAP);
  }
  return c;
}
/** the sheet shown over the lab: Ship posts the model and its sheet (the dev server writes vN, its exam picture and the index), Cancel ships nothing */
function confirmShip(sheet: HTMLCanvasElement, data: Record<string, unknown>, from: string, say: (m: string) => void): Promise<number | null> {
  return new Promise(resolve => {
    const jpeg = sheet.toDataURL('image/jpeg', 0.82), next = LATEST + 1;
    const wrap = el('div', 'position:fixed;inset:0;z-index:90;background:rgba(6,9,16,.94);display:flex;flex-direction:column;font:13px system-ui,sans-serif;color:#e5e7eb');
    wrap.dataset.shipExam = '1';
    const bar = el('div', 'display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid #334155');
    const img = document.createElement('img'); img.src = jpeg; img.style.cssText = 'display:block;max-width:100%;margin:0 auto';
    const view = el('div', 'flex:1;overflow:auto;padding:10px'); view.append(img);
    const close = (v: number | null) => { wrap.remove(); resolve(v); };
    const ship = btn(`Ship as v${next}`, GO, () => {
      ship.textContent = 'shipping…';
      void fetch('/__dev/lot-model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data, from, exam: jpeg }) })
        .then(async r => { if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); close(((await r.json()) as { version: number }).version); })
        .catch(e => { say(`the model was not shipped: ${String(e)}`); close(null); });
    }, `writes lot model v${next}, its exam picture (lot-models/v${next}.exam.jpg) and the index: new towns compose their lots with it`);
    bar.append(el('b', 'font-size:15px', `Ship lot model v${next}?`), el('span', 'opacity:.75', 'the latest shipped model on the left of each pair, the live one (what ships) on the right'), el('span', 'flex:1'),
      ship, btn('Cancel', BTN, () => { say('not shipped'); close(null); }, 'ships nothing'), btn('Save the sheet only', BTN, () => { const a = document.createElement('a'); a.href = jpeg; a.download = `lot-model-exam-live.jpg`; a.click(); }, 'downloads the sheet (ships nothing)'));
    wrap.append(bar, view);
    document.body.append(wrap);
  });
}
