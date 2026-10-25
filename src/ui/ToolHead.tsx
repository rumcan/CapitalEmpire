// A tool panel's header (plan P23 4.3's anatomy, which every tool panel follows): the icon, the title, a one-line purpose, and the
// header's actions on the right (the Holes panel's ↶ ↷).
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function ToolHead({ icon, title, desc, children }: { icon: IconName; title: string; desc: string; children?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start gap-3">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--gold-line)] bg-black/30"><Icon name={icon} size={30} /></div>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-xl font-bold leading-tight">{title}</h2>
        <div className="sub-line mt-0.5 leading-snug">{desc}</div>
      </div>
      {children && <div className="flex shrink-0 items-center gap-1">{children}</div>}
    </div>
  );
}
