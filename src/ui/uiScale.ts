// The UI scale (plan P23-UX 6.2 P2-7, T179): Settings' 90 / 100 / 110 / 125% for the UI layer only (the map is drawn on its canvas at its own
// size). Stored per browser (localStorage, every access in try/catch: a private window or blocked storage falls back to 100%) and applied at
// boot as the CSS variable --ui-scale, which index.css's .ui-root rule zooms the UI layer by. Pure but for applyUiScale's document access.

/** the scales Settings offers */
export const UI_SCALES = [0.9, 1, 1.1, 1.25] as const;
/** the localStorage key */
export const UI_SCALE_KEY = 'capitalempire.uiScale';

/** the offered scale nearest to v (100% for anything that is not a finite number) */
export function clampUiScale(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 1;
  return UI_SCALES.reduce<number>((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), 1);
}
/** the stored scale (100% when there is none, it is bad, or storage throws) */
export function loadUiScale(store?: Pick<Storage, 'getItem'> | null): number {
  try { const s = store === undefined ? globalThis.localStorage : store; const v = s?.getItem(UI_SCALE_KEY); return v == null ? 1 : clampUiScale(v); } catch { return 1; }
}
/** stores the scale (nothing when storage throws); returns the scale stored */
export function saveUiScale(v: number, store?: Pick<Storage, 'setItem'> | null): number {
  const s = clampUiScale(v);
  try { (store === undefined ? globalThis.localStorage : store)?.setItem(UI_SCALE_KEY, String(s)); } catch { /* storage may be unavailable */ }
  return s;
}
/** sets the UI layer's scale (the CSS variable --ui-scale on the document) */
export function applyUiScale(v: number): number {
  const s = clampUiScale(v);
  if (typeof document !== 'undefined') document.documentElement.style.setProperty('--ui-scale', String(s));
  return s;
}
/** the scale in force (the CSS variable; 100% without one) */
export function currentUiScale(): number {
  if (typeof document === 'undefined') return 1;
  return clampUiScale(document.documentElement.style.getPropertyValue('--ui-scale') || 1);
}
