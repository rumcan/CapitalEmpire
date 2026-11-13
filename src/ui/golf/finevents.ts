// Tiny window events that let any part of the game open the money cards or report a money moment without importing the cards (jam ticket J3).
export const money = (n: number): string => (n < 0 ? '-$' : '$') + Math.round(Math.abs(Number.isFinite(n) ? n : 0)).toLocaleString('en-US');
export const signed = (n: number): string => (n >= 0 ? '+' : '-') + '$' + Math.round(Math.abs(Number.isFinite(n) ? n : 0)).toLocaleString('en-US');

const fire = (name: string, detail?: unknown): void => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name, { detail })); };
/** open the full statement of the latest month */
export const openStatement = (): void => fire('finlit:statement');
/** open the report card (the grade so far, or the final one) */
export const openReportCard = (): void => fire('finlit:reportcard');
/** report a moment that only the game's own rules can see (e.g. 'priceLoss': a price raise lost customers) */
export const noteMoment = (id: string): void => fire('finlit:moment', id);

export function onFinlit<T = unknown>(name: 'statement' | 'reportcard' | 'moment', cb: (detail: T) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const h = (e: Event) => cb((e as CustomEvent).detail as T);
  window.addEventListener('finlit:' + name, h);
  return () => window.removeEventListener('finlit:' + name, h);
}
