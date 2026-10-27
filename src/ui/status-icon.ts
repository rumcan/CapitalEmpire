// Status not by colour alone (T180, P23-UX D8.1): every status the UI tints green, amber or red also carries a mark, the same marks the hole
// card uses (✓ ready, ✗ refused or failing, ! needs attention, ◔ growing, ▲ up, ▼ down). Pure: the kinds, their marks and words, and the
// small rules that pick a kind (a trend, a price against the treasury).

export type StatusKind = 'ok' | 'fail' | 'warn' | 'growing' | 'up' | 'down' | 'info';

/** each kind's mark */
export const STATUS_ICON: Readonly<Record<StatusKind, string>> = { ok: '✓', fail: '✗', warn: '!', growing: '◔', up: '▲', down: '▼', info: 'i' };
/** each kind's word, for screen readers (the mark itself is hidden from them) */
export const STATUS_WORD: Readonly<Record<StatusKind, string>> = { ok: 'ok', fail: 'not possible', warn: 'needs attention', growing: 'growing', up: 'up', down: 'down', info: 'note' };

/** a kind's mark */
export function statusIcon(k: StatusKind): string { return STATUS_ICON[k]; }

/** a change's kind: up when it rose, down when it fell, null when it held (within eps) */
export function trendKind(delta: number, eps = 0): 'up' | 'down' | null {
  if (!Number.isFinite(delta) || Math.abs(delta) <= eps) return null;
  return delta > 0 ? 'up' : 'down';
}

/** a price against what you have: ok when you can pay it, fail when you cannot */
export function affordKind(cost: number, have: number): 'ok' | 'fail' { return cost <= have ? 'ok' : 'fail'; }

/** a balance: warn when it is below zero (you are in debt), else null (no mark) */
export function balanceKind(money: number): 'warn' | null { return money < 0 ? 'warn' : null; }

/** a mark and a space before a text, or the text alone when there is no kind */
export function withIcon(k: StatusKind | null, text: string): string { return k ? `${STATUS_ICON[k]} ${text}` : text; }
