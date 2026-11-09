// The filter list of real golf course names (T378, #1034; the owner: "the course search should get a course names catalog. so first you find the name of the course in a
// filter list"): the first thing in the picker's Find a real course. The player types, the list narrows as they type (locally, over the catalogue's files as far as they
// have loaded: golf/osm/catalogue.ts), a row shows the name, the town and the country, and a row imports that course by its OpenStreetMap id. A country button opens a
// flyout beside the card, in two levels (the continents, each opening in place into its countries: not one long column of a hundred); the list scrolls inside its box with its count stuck at the top, and nothing scrolls sideways. This file is
// markup over what CoursePicker gives it (so tests render it with no network).
import { useEffect, useState, type KeyboardEvent, type ReactElement } from 'react';
import { Icon } from '../Icon';
import type { Grade } from '../../game/golf/osm/grade';
import type { CatalogueCountry, CatalogueEntry, CatalogueStatus, Filtered } from '../../game/golf/osm/catalogue';

const GRADE_STYLE: Record<Grade, string> = {
  full: 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200', partial: 'border-amber-300/50 bg-amber-300/15 text-amber-200', outline: 'border-slate-400/40 bg-slate-400/10 text-slate-300',
};
const GRADE_NAME: Record<Grade, string> = { full: 'Full', partial: 'Partial', outline: 'Outline only' };
/** the quality grade's chip (the preview's, the Downloaded list's, and a catalogue row's Full) */
export function GradeChip({ grade, id }: { grade: Grade; id?: string }) {
  return <span className={`shrink-0 rounded-full border px-2 py-[1px] text-[11px] font-semibold ${GRADE_STYLE[grade]}`} data-testid={id ?? 'find-grade'} data-grade={grade}>{GRADE_NAME[grade]}</span>;
}

const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
/** the row's second line: the town and the country, the course's rough size */
export const rowLine = (e: Pick<CatalogueEntry, 'place' | 'country' | 'w' | 'h'>): string => [[e.place, e.country].filter(Boolean).join(', '), e.w >= 50 && e.h >= 50 ? `${km(e.w)} x ${km(e.h)}` : ''].filter(Boolean).join(' · ');
const idOf = (id: string): string => id.replace('/', '-');

export interface CatalogueFinderProps {
  status: CatalogueStatus; summary: string;
  text: string; onText: (t: string) => void; onKey: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** the country button's words ("All countries", "South Africa (410)") and whether a country is chosen */ countryLabel: string; countryOn: boolean; flyoutOpen: boolean; onCountry: () => void;
  /** the filter's result (null until the catalogue's code has loaded) */ filtered: Filtered | null; active: number; onActive: (i: number) => void; onPick: (e: CatalogueEntry) => void;
  /** a picked course is being fetched, or the card is not ready: the rows cannot be pressed */ disabled?: boolean;
  onRetry?: () => void; credit: string;
}

export function CatalogueFinder(p: CatalogueFinderProps): ReactElement {
  const f = p.filtered, searching = !!f && (f.words.length > 0 || p.countryOn);
  const unreadable = p.status === 'failed';
  // the arrow keys move the active row: keep it in view inside the list's own scroll
  useEffect(() => { document.querySelector('[data-testid="cat-list"] [data-active]')?.scrollIntoView?.({ block: 'nearest' }); }, [p.active, f?.rows]);
  return (
    <div className="space-y-1" data-testid="cat-finder">
      <div className="text-xs text-slate-400">Find a real course <span className="text-slate-500">(real golf courses of OpenStreetMap: type a name or a town)</span></div>
      <div className="flex gap-1.5">
        <input className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white" value={p.text} maxLength={80} placeholder="Type part of a course's name or its town" autoFocus autoComplete="off" spellCheck={false}
          onChange={e => p.onText(e.target.value)} onKeyDown={p.onKey} disabled={p.disabled} data-testid="cat-input" aria-label="Filter the golf course names" aria-controls="cat-list" />
        <button className={`chip shrink-0 ${p.countryOn ? '!border-amber-300 !text-amber-200' : ''}`} onClick={p.onCountry} aria-expanded={p.flyoutOpen} aria-haspopup="menu" title="Only the courses of one country" data-testid="cat-country">{p.countryLabel} ›</button>
      </div>
      <div className={`text-[11px] ${unreadable ? 'text-amber-200' : 'text-slate-500'}`} data-testid="cat-status" role="status">
        {p.summary}
        {p.onRetry && (unreadable || /could not be read/.test(p.summary)) && <> <button className="underline hover:text-white" onClick={p.onRetry} data-testid="cat-retry">Try again</button></>}
      </div>
      {searching && f ? (
        <div className="max-h-64 overflow-y-auto overflow-x-hidden rounded-lg border border-white/10 bg-slate-900/60" id="cat-list" role="listbox" aria-label="Golf courses that match" data-testid="cat-list">
          <div className="sticky top-0 z-[2] border-b border-white/10 bg-slate-900 px-2 py-1 text-[11px] text-slate-400" data-testid="cat-count">
            {f.matched.toLocaleString('en-US')} golf course{f.matched === 1 ? '' : 's'}{f.words.length ? ` match "${p.text.trim()}"` : ' in this country'}{f.matched > f.rows.length ? ` · the best ${f.rows.length} are listed: type more to narrow them` : ''}
          </div>
          {f.rows.length === 0 && <div className="px-2 py-2 text-xs text-slate-400" data-testid="cat-none">No course in the list matches that{p.status === 'loading' ? ' yet (the list is still loading)' : ''}. It may be spelled differently, or not named on the map: search the map by name below.</div>}
          {f.rows.map((e, i) => (
            <button key={e.id} role="option" aria-selected={i === p.active} disabled={p.disabled} onClick={() => p.onPick(e)} onMouseEnter={() => p.onActive(i)}
              className={`flex w-full items-start gap-2 border-b border-white/5 px-2 py-1 text-left text-xs disabled:opacity-50 ${i === p.active ? 'bg-amber-300/10' : 'hover:bg-white/5'}`}
              title={`Import ${e.name} by its OpenStreetMap id (${e.id}): one request to the map servers`} data-testid={`cat-row-${idOf(e.id)}`} data-active={i === p.active || undefined}>
              <span className="min-w-0 flex-1">
                <span className="block break-words font-semibold text-white">{e.name}</span>
                <span className="block break-words text-slate-400">{rowLine(e)}</span>
              </span>
              {e.full && <span title={`The map numbers ${e.holes} holes: the preview confirms the grade`}><GradeChip grade="full" id={`cat-full-${idOf(e.id)}`} /></span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-white/10 px-2 py-1.5 text-xs text-slate-500" data-testid="cat-hint">
          Type any part of a course's name or of its town ("wing", "country club pretoria"), or choose a country. Capitals and accents do not matter. Pick a course and it is fetched by its OpenStreetMap id.
        </div>
      )}
      <div className="text-[10px] leading-tight text-slate-500" data-testid="cat-credit">{p.credit}</div>
    </div>
  );
}

/** a continent of the countries flyout: its code, name, number of courses and its countries */
export interface FlyoutContinent { id: string; name: string; n: number; countries: CatalogueCountry[] }

/** the countries flyout, in two levels (a hundred countries are not one long column): it opens beside the picker, one narrow column (so it fits beside the Who card and the picker
 *  on a screen of 1366 px, where a second column would wrap below them out of sight), with All countries, the player's own country and the continents; a continent opens
 *  in place, its countries under it, each with its number of courses, one continent at a time. The title is stuck at the top and the column scrolls up and down alone */
export function CountryFlyout({ continents, cc, total, prefer, startOpen, onPick, onClose }: {
  continents: FlyoutContinent[]; cc: string; total: number;
  /** the player's own country (from the browser's languages): a row of its own at the top */ prefer?: string;
  /** the continent open at the start (default: the one the chosen country is in) */ startOpen?: string;
  onPick: (cc: string) => void; onClose: () => void;
}): ReactElement {
  const own = prefer ? continents.flatMap(k => k.countries).find(c => c.cc === prefer) : undefined;
  const [open, setOpen] = useState<string | null>(startOpen ?? continents.find(k => k.countries.some(c => c.cc === cc))?.id ?? null);
  const row = (on: boolean) => `flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-xs ${on ? 'bg-amber-300/15 text-amber-100' : 'hover:bg-white/10'}`;
  return (
    <div className="pointer-events-auto max-h-[calc(100vh-2rem)] w-[250px] max-w-full space-y-0.5 overflow-y-auto overflow-x-hidden rounded-2xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur" role="menu" data-testid="cat-countries">
      <div className="win-head win-head-slate flex items-center justify-between gap-2">
        <div className="font-display text-base font-bold leading-tight text-[var(--gold-hi)]">Country</div>
        <button className="btn-icon" onClick={onClose} title="Close" aria-label="Close the country list" data-testid="cat-countries-close"><Icon name="close" size={16} /></button>
      </div>
      <button role="menuitem" className={row(!cc)} onClick={() => onPick('')} data-testid="cat-country-all"><span className="font-semibold text-white">All countries</span><span className="text-slate-400">{total.toLocaleString('en-US')}</span></button>
      {own && <button role="menuitem" className={row(cc === own.cc)} onClick={() => onPick(own.cc)} data-testid={`cat-country-${own.cc}`}><span className="min-w-0 truncate">{own.country} <span className="text-slate-500">(your region)</span></span><span className="shrink-0 text-slate-400">{own.n.toLocaleString('en-US')}</span></button>}
      <div className="px-2 pt-1 text-[10px] uppercase tracking-wide text-slate-500">Continents</div>
      {continents.map(k => (
        <div key={k.id}>
          <button role="menuitem" aria-haspopup="menu" aria-expanded={k.id === open} className={row(k.id === open)} onClick={() => setOpen(o => (o === k.id ? null : k.id))} data-testid={`cat-continent-${k.id}`}>
            <span className="font-semibold text-white">{k.name}</span><span className="shrink-0 text-slate-400">{k.countries.length} · {k.n.toLocaleString('en-US')} {k.id === open ? '⌄' : '›'}</span>
          </button>
          {k.id === open && (
            <div className="ml-2 space-y-0.5 border-l border-white/10 pl-1" role="menu" data-testid="cat-continent-countries">
              {k.countries.map(c => (
                <button key={c.cc} role="menuitem" className={row(c.cc === cc)} onClick={() => onPick(c.cc)} data-testid={c.cc === prefer ? `cat-country-${c.cc}-in-list` : `cat-country-${c.cc}`}>
                  <span className="min-w-0 truncate">{c.country}</span><span className="shrink-0 text-slate-400">{c.n.toLocaleString('en-US')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
