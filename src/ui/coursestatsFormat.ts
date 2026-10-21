// Pure formatting helpers for the course stats panel (src/ui/CourseStatsPanel.tsx), apart from the component so node tests can import them.

/** format a dollar amount as currency string */
export function formatCurrency(amount: number): string {
  const rounded = Math.round(amount);
  const abs = Math.abs(rounded);
  const str = abs.toLocaleString('en-US');
  return rounded < 0 ? `-$${str}` : `$${str}`;
}

/** format metres and yards for hole length display */
export function formatHoleLength(m: number, yd: number): string {
  return `${Math.round(m)} m (${Math.round(yd)} yd)`;
}

/** text color class for par tag */
export function parColorClass(par: number): string {
  return par === 3 ? 'text-sky-400' : par === 5 ? 'text-amber-400' : 'text-emerald-400';
}

/** badge background and text color classes for course quality score (0..100) */
export function qualityBadgeClass(score: number): { bg: string; text: string } {
  if (score >= 85) return { bg: 'bg-emerald-500/20 border-emerald-500/40', text: 'text-emerald-300' };
  if (score >= 60) return { bg: 'bg-amber-500/20 border-amber-500/40', text: 'text-amber-300' };
  return { bg: 'bg-rose-500/20 border-rose-500/40', text: 'text-rose-300' };
}

