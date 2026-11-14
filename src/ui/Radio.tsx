// J11 (#1270): the music radio's control, in the top bar's right-hand group beside Settings: one pill, its left half the play and pause key (a first-time player
// turns the music on with one click), its right half a small drop for the details: the track and who made it, Previous, Play / Pause, Next, and the Music volume
// with its mute (the same settings as Settings' own Music row). The radio is OFF until the player turns it on and nothing is downloaded before (game/sound/radio.ts).
// The pictures are the owner's painted icons (src/ui/Icon.tsx); RADIO_PIC is the one place a different picture goes: the painted radio tiles (radio, radio-off,
// boombox, headphones in src/assets/ui/tiles/, shown with ActionTile) arrive with PR #1264 (J8): swap them in there.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { radio } from '../game/sound/radio';
import { Icon, type IconName } from './Icon';
import { VolumeRow } from './SoundSettings';

/** the radio's pictures, each one name: the pill's key (playing or not), Previous, Next. Left to swap for the painted tiles of PR #1264 (radio, radio-off) */
const RADIO_PIC: { key: (playing: boolean) => IconName; prev: IconName; next: IconName; more: IconName } = { key: playing => (playing ? 'pause' : 'play'), prev: 'rewind', next: 'skip', more: 'down' };

export function useRadio() { return useSyncExternalStore(fn => radio.subscribe(fn), () => radio.get(), () => radio.get()); }

export function RadioPill() {
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
      <div className={`glass flex items-center gap-0.5 p-1 ${v.on ? 'ring-1 ring-amber-300/50' : ''}`}>
        <button type="button" className={`chip ${v.on ? 'chip-on' : ''}`} aria-pressed={v.on} aria-label={v.on ? 'Turn the radio off' : 'Turn the radio on'} data-testid="radio-play" data-sound="none"
          data-tip={v.on ? `The radio is on: ${t ? `${t.title}, ${t.artist}` : ''}. Click to turn it off` : 'The radio: music for your club. Off until you turn it on'} onClick={() => radio.toggle()}>
          <Icon name={RADIO_PIC.key(v.on && v.playing)} size={16} /><span>Radio</span>
        </button>
        <button type="button" className="btn-icon !px-1" aria-expanded={open} aria-label="Radio: the track, volume and more" data-testid="radio-more" data-tip="The track, next and the music volume" onClick={() => setOpen(o => !o)}>
          <Icon name={RADIO_PIC.more} size={16} />
        </button>
      </div>
      {open && (
        <div className="glass absolute right-0 top-full z-30 mt-2 flex w-72 max-w-[calc(100vw-1.5rem)] flex-col gap-1 p-3 text-sm" data-testid="radio-card">
          <div className="flex items-baseline justify-between gap-2">
            <span className="label-caps">Fairway Radio</span>
            <span className="text-[12px] text-slate-400" role="status" data-testid="radio-status">{status}</span>
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
              <Icon name={RADIO_PIC.key(v.on && v.playing)} size={22} />
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
