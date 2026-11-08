// T340 (#967): the course card's note for a course built from map data: its name (with where it comes from), place, holes and par, and the credit the
// data's licence asks for ("© OpenStreetMap contributors"). Nothing for an ordinary game.
import type { Game } from '../../game/engine';

export function OsmNote({ game }: { game: Game }) {
  const o = game.osmGame();
  if (!o) return null;
  const land = game.landInfo();
  return (
    <div className="mt-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs leading-snug" data-testid="osm-note">
      <div className="font-semibold text-sky-200">{o.name} <span className="font-normal text-slate-400">(from map data)</span></div>
      <div className="text-slate-300">{o.place ? `${o.place} · ` : ''}{o.holes} holes · par {o.par}{o.mappedPar !== o.par ? ` (${o.mappedPar} on the real course: the game works par out from each hole's length)` : ''}</div>
      {o.derived && <div className="mt-0.5 text-[11px] text-amber-200/80" data-testid="osm-derived">The map has no hole lines: these holes were worked out from its fairways, greens and tees (a guess).</div>}
      {o.scale !== undefined && o.scale < 1 && <div className="mt-0.5 text-[11px] text-amber-200/80" data-testid="osm-scaled">Scaled to {Math.round(o.scale * 100)}% to fit the 2 km map (the holes are that much shorter).</div>}
      {land
        ? <div className="mt-0.5 text-[11px] text-slate-300" data-testid="osm-land" title={land.credit}>Real ground height ({land.label}): {land.reliefM} m of rise across the land. The greens, tees and ponds sit level; the greens keep the game's own gentle tilt.</div>
        : <div className="mt-0.5 text-[11px] text-slate-500" data-testid="osm-flat">Flat ground: this game has no elevation data kept with it.</div>}
      <div className="mt-0.5 text-[11px] text-slate-400" title={o.licence}>{o.credit || '© OpenStreetMap contributors'}</div>
    </div>
  );
}
