// The Staff card (T214, #559; docs/plans/P26.md 5.2): the club's own staff on T269's one wage book. One section per building (the pro's office:
// the head pro and the membership secretary; each teaching hut: its teaching pro); a filled row has the person's stand-in picture, name, wage and
// this season's work, and Let go with an inline confirm (no modal); an open row has Hire with its wage, or the reason it is locked. The foot: the
// season's wages and what the staff brought in. 340 px wide, scrolling up and down only (the owner's rule: no sideways scrollbar).
import { useState } from 'react';
import type { StaffCardView, StaffRow } from '../../game/golf/pros';
import type { ClubRole } from '../../game/golf/staff';
import { practicePath } from '../../game/golf/menu-path';
import { GOLFER_BASE, GOLFER_CLIPS, GOLFER_FRAMES, GOLFER_PEOPLE, LIBRARY, SPECTATOR_BASE, SPECTATOR_CLIPS, SPECTATOR_FRAMES, SPECTATOR_PEOPLE, WALK_DIRS } from '../../game/library';
import { Icon } from '../Icon';
import { Thumb } from '../Thumb';
import { money } from './money';
/** each role's stand-in picture (P26 3.5: the head pro golf_pro_m2, the teaching pro golf_pro_w1, the secretary spec_w_older_cardigan) */
const ART: Record<ClubRole, string> = { head: 'golfer:golf_pro_m2', teach: 'golfer:golf_pro_w1', sec: 'spectator:spec_w_older_cardigan' };
/** the stand-in's idle frame facing you (the engine's crowd frames: base + (person x directions + row) x frames + frame) */
function artOf(r: ClubRole) {
  const g = ART[r].startsWith('golfer:'), i = (g ? GOLFER_PEOPLE : SPECTATOR_PEOPLE).findIndex(p => p.id === ART[r]); if (i < 0) return undefined;
  return LIBRARY[g ? GOLFER_BASE + i * WALK_DIRS.length * GOLFER_FRAMES + GOLFER_CLIPS.idle.start : SPECTATOR_BASE + i * WALK_DIRS.length * SPECTATOR_FRAMES + SPECTATOR_CLIPS.idle.start];
}
const WHAT: Record<ClubRole, string> = {
  head: 'Sells memberships (+2.5% of the pool a month), keeps members (churn -0.8%), gives the members their lessons when no teaching pro does',
  teach: "Gives lessons at the hut's place: 15% of the range's golfers, 8% of a green's; and the members' lessons",
  sec: 'Sells memberships (+2% of the pool a month) and keeps members (churn -0.4%)',
};

export function StaffCard({ view, right, onClose, onHire, onLetGo }: { view: StaffCardView; right: string; onClose: () => void; onHire: (role: ClubRole, at: number | null) => void; onLetGo: (k: number) => void }) {
  const [ask, setAsk] = useState<number | null>(null);
  return (
    <div className={`pointer-events-auto absolute ${right} top-[var(--hud-top,6rem)] z-20 max-h-[calc(var(--vh-ui,100vh)-var(--hud-top,6rem)-4.5rem)] w-[340px] space-y-2 overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur`} data-testid="staff-card">
      <div className="win-head win-head-slate flex items-center justify-between">
        <div>
          <div className="font-semibold text-amber-200">Staff · <span data-testid="staff-wages">{money(view.wages)}</span> a month</div>
          <div className="text-[12px] text-slate-400">Paid as each month begins, with the grounds crew</div>
        </div>
        <button className="btn-icon" onClick={onClose} title="Close" data-testid="staff-close"><Icon name="close" size={18} /></button>
      </div>
      {!view.built && <p className="rounded-lg bg-white/5 px-2 py-1.5 text-xs text-slate-300" data-testid="staff-empty">Build the pro's office (Course › Buildings) for a head pro and a secretary, and a teaching hut ({practicePath('›')}) for a teaching pro.</p>}
      {view.sections.map(sec => (
        <div key={sec.key} className="space-y-1" data-testid={`staff-sec-${sec.key}`}>
          <div className="text-[12px] uppercase text-slate-400">{sec.title}</div>
          <div className="space-y-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs">
            {sec.rows.map(r => <Row key={r.key} r={r} ask={ask} setAsk={setAsk} onHire={onHire} onLetGo={onLetGo} />)}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs" data-testid="staff-foot" title="This season: the staff's wages so far, and what they brought in (lessons, and the first month's dues of the members they sold)">
        <span className="text-slate-400">This season</span>
        <span>wages <span className="text-rose-300">{money(view.season.wages)}</span> · they brought in <span className="text-emerald-300">{money(view.season.brought)}</span></span>
      </div>
    </div>
  );
}

function Row({ r, ask, setAsk, onHire, onLetGo }: { r: StaffRow; ask: number | null; setAsk: (k: number | null) => void; onHire: (role: ClubRole, at: number | null) => void; onLetGo: (k: number) => void }) {
  const art = artOf(r.role), h = r.hire;
  return (
    <div className="flex items-center gap-2" data-testid={`staff-row-${r.key}`} title={WHAT[r.role]}>
      <div className="relative grid h-10 w-9 shrink-0 place-items-center overflow-hidden rounded bg-black/30">{art && <Thumb it={art} size={36} />}</div>
      {h ? (ask === h.k ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" data-testid="staff-confirm">
          <span className="text-amber-200">Let {h.name.split(' ')[0]} go? One month's wage, {money(r.wage)}</span>
          <button className="chip" onClick={() => { setAsk(null); onLetGo(h.k); }} data-testid="staff-yes">Yes</button>
          <button className="chip" onClick={() => setAsk(null)} data-testid="staff-no">No</button>
        </div>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <div className="truncate"><span className="font-semibold text-white">{h.name}</span> · {r.title}</div>
            <div className="truncate text-[11px] text-slate-400">{money(r.wage)} a month · {h.work}</div>
          </div>
          <button className="chip shrink-0" onClick={() => setAsk(h.k)} data-testid="staff-letgo">Let go</button>
        </>
      )) : (
        <>
          <div className="min-w-0 flex-1">
            <div className="truncate">{`Hire a ${r.title}`} · <span className="text-amber-200">{money(r.wage)} a month</span></div>
            {r.why && <div className="text-[11px] text-slate-400" data-testid="staff-why">{r.why}</div>}
          </div>
          <button className="chip chip-on shrink-0 disabled:cursor-not-allowed disabled:opacity-40" disabled={!!r.why} onClick={() => onHire(r.role, r.at)} data-testid="staff-hire">Hire</button>
        </>
      )}
    </div>
  );
}
