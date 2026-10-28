// The welcome card of a new range game (plan P22 2.8, T095): once per game, over the range at street zoom. It names the road the range stands
// on and says what the game is; its button follows P24's ramp: Open the range while New hole waits (the range card is the ramp's first step),
// Build the first hole once New hole is open (Course on New hole, the camera on the tee ring). The clock never stops for it.
import { RAMP_TAKINGS } from '../../game/ext/progressive-ui';
import { Icon } from '../Icon';

/** the card over the map (centred, like the season card) */
export function WelcomeCard({ road, newHole, guide = false, onGo, onClose }: { road: string; newHole: boolean; /** T239: the guided build's card runs (its button shows its first step) */ guide?: boolean; onGo: () => void; onClose: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
      <div className="pointer-events-auto w-[420px] max-w-full space-y-3 rounded-2xl border border-white/10 bg-slate-950/90 p-5 text-slate-200 shadow-2xl backdrop-blur" data-testid="welcome-card">
        <div className="flex items-start justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">Founding season · Welcome</div>
          <button className="btn-icon -mr-2 -mt-2" onClick={onClose} title="Close" aria-label="Close"><Icon name="close" size={18} /></button>
        </div>
        <div className="font-display text-xl font-bold leading-tight text-[var(--gold-hi)]">Your driving range on {road}</div>
        <p className="text-sm text-slate-300">Drivers stop to hit a bucket. Build a course behind it, and a town will grow around you.</p>
        {guide ? <p className="text-xs text-slate-400">It is a bare start: dirt for the car park, no greens, no paths. The guide in the corner walks you through building it, step by step.</p>
          : !newHole && <p className="text-xs text-slate-400">Grow the range first: its upgrades open the practice area, and New hole opens when it takes ${RAMP_TAKINGS.toLocaleString('en-US')} in a season, or in season 2.</p>}
        <button className="btn-gold w-full py-2 text-sm" onClick={onGo} data-testid="welcome-go"><Icon name={guide ? 'income' : newHole ? 'pin' : 'income'} size={18} />{guide ? 'Show me the first step' : newHole ? 'Build the first hole' : 'Open the range'}</button>
      </div>
    </div>
  );
}
