// J11 (#1270): the music radio's control, at the bottom left beside the minimap and the club's name (ui/Minimap.tsx): one small pill, its left half the painted radio (lit when the
// music plays, under its cloth when it is off: the play and pause key, so a first-time player turns the music on with one click), its right half a drop for the details: the track
// and who made it, Previous, Play / Pause, Next, and the Music volume with its mute (the same settings as Settings' own Music row). It opens upward and to the left (over the map, never over the rail or the minimap, and clear of the cards at the right), and the
// top bar (J8's one row at the largest Text size) is untouched. The radio is OFF until the player turns it on and nothing is downloaded before
// (game/sound/radio.ts). The pictures are the owner's painted ones: the radio tiles of J8 (src/assets/ui/tiles: radio, radio-off, boombox) with the icon set's play, pause,
// rewind and skip for the transport keys; RADIO_PIC is the one place a different picture goes.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { radio } from '../game/sound/radio';
import { ActionTile, TILE_ROW } from './ActionTile';
import { Icon, type IconName } from './Icon';
import type { ToolTile } from './tool-tiles';
import { VolumeRow } from './SoundSettings';

/** the radio's pictures: the pill's key (on or off), the card's header, and the transport keys (the icon set's) */
const RADIO_PIC: { key: (on: boolean) => ToolTile; head: ToolTile; play: (playing: boolean) => IconName; prev: IconName; next: IconName; more: IconName } =
  { key: on => (on ? 'radio' : 'radio-off'), head: 'boombox', play: playing => (playing ? 'pause' : 'play'), prev: 'rewind', next: 'skip', more: 'up' };

export function useRadio() { return useSyncExternalStore(fn => radio.subscribe(fn), () => radio.get(), () => radio.get()); }

export function RadioPill({ up = true }: { up?: boolean }) {
  const v = useRadio(), [open, setOpen] = useState(false), box = useRef<HTMLDivElement>(null);
  // the card closes on a press outside it and on Escape (and Escape stops there: the game's own Escape does not also fire)
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setOpen(false); } };
    window.addEventListener('pointerdown', away, true); window.addEventListener('keydown', esc, true);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', esc, true); };
  }, [open]);
  const status = v.error ? 'The music could not load' : !v.on ? 'Off' : v.playing ? 'Playing' : 'Starting…';
  const t = v.track;
  return (
    <div ref={box} className="relative" data-testid="radio" role="group" aria-label="Radio">
      <div className={`glass flex items-center gap-0.5 p-1 ${v.on ? 'ring-1 ring-amber-300/60' : ''}`}>
        <button type="button" className={`rounded-lg p-0.5 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${v.on ? 'bg-amber-300/10' : ''}`} aria-pressed={v.on}
          aria-label={v.on ? 'Turn the radio off' : 'Turn the radio on'} data-testid="radio-play" data-sound="none"
          data-tip={v.on ? `The radio is on${t ? `: ${t.title}, ${t.artist}` : ''}. Click to turn it off` : 'The radio: music for your club. Off until you turn it on'} onClick={() => radio.toggle()}>
          <ActionTile tile={RADIO_PIC.key(v.on)} size={TILE_ROW} />
        </button>
        <button type="button" className="btn-icon !px-1" aria-expanded={open} aria-label="Radio: the track, volume and more" data-testid="radio-more" data-tip="The track, next and the music volume" onClick={() => setOpen(o => !o)}>
          <Icon name={RADIO_PIC.more} size={16} className={open ? 'rotate-180' : ''} />
        </button>
      </div>
      {open && (
        <div className={`glass absolute right-0 z-30 flex w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-1 p-3 text-sm ${up ? 'bottom-full mb-2' : 'top-full mt-2'}`} data-testid="radio-card">
          <div className="flex items-center gap-2.5">
            <ActionTile tile={RADIO_PIC.head} size={TILE_ROW} />
            <div className="min-w-0 flex-1">
              <div className="label-caps">Fairway Radio</div>
              <div className="text-[12px] text-slate-400" role="status" data-testid="radio-status">{status}</div>
            </div>
          </div>
          {t ? (
            <div className="min-w-0" data-testid="radio-track">
              <div className="truncate font-semibold text-white" title={t.title}>{t.title}</div>
              <div className="truncate text-[12px] text-slate-300" title={`${t.artist}, ${t.licence}`}>{t.artist} · CC0</div>
              <div className="text-[12px] text-slate-500">Track {v.index + 1} of {v.count}</div>
            </div>
          ) : <div className="text-[12px] text-slate-400">No music is installed.</div>}
          <div className="mt-1 flex items-center justify-center gap-2">
            <button type="button" className="btn-icon" aria-label="Previous track" data-testid="radio-prev" data-tip="Previous track" onClick={() => radio.prev()}><Icon name={RADIO_PIC.prev} size={20} /></button>
            <button type="button" className={`btn-icon ${v.on ? 'on' : ''}`} aria-label={v.on ? 'Pause the radio' : 'Play the radio'} data-testid="radio-card-play" data-sound="none" onClick={() => radio.toggle()}>
              <Icon name={RADIO_PIC.play(v.on && v.playing)} size={22} />
            </button>
            <button type="button" className="btn-icon" aria-label="Next track" data-testid="radio-next" data-tip="Next track" onClick={() => radio.next()}><Icon name={RADIO_PIC.next} size={20} /></button>
          </div>
          <VolumeRow label="Music" kind="music" tip="The music's volume. Kept in this browser" />
          <div className="text-[11px] leading-snug text-slate-500">Free CC0 music from OpenGameArt: no credit is owed, and it is listed in the game's credits.</div>
        </div>
      )}
    </div>
  );
}
