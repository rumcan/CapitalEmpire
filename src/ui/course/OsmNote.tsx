// T340 (#967): the course card's note for a course built from map data: its name (with where it comes from), place, holes and par, and the credit the
// data's licence asks for ("© OpenStreetMap contributors"). Nothing for an ordinary game.
import type { Game } from '../../game/engine';

export function OsmNote({ game }: { game: Game }) {
  const o = game.osmGame();
  if (!o) return null;
  return (
    <div className="mt-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs leading-snug" data-testid="osm-note">
      <div className="font-semibold text-sky-200">{o.name} <span className="font-normal text-slate-400">(from map data)</span></div>
      <div className="text-slate-300">{o.place ? `${o.place} · ` : ''}{o.holes} holes · par {o.par}{o.mappedPar !== o.par ? ` (${o.mappedPar} on the real course: the game works par out from each hole's length)` : ''}</div>
      <div className="mt-0.5 text-[11px] text-slate-400" title={o.licence}>{o.credit || '© OpenStreetMap contributors'}</div>
    </div>
  );
}
