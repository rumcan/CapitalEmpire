// J11 (#1270): the sound rows of Settings (App.tsx's gear menu, under the Text size): the music's and the effects' volume, each with its mute, the tutorial voice's switch (only when
// voice files are shipped) and one mute for everything (F8). The settings are the sound core's (game/sound/core.ts): kept in this browser, and the same ones the radio's volume and
// mute use. Every control is a real button or slider, so the keyboard reaches them (Tab, arrows). The rows wear J8's painted tiles (headphones, bell, the covered radio).
import { useSyncExternalStore, type ReactNode } from 'react';
import { sound } from '../game/sound/core';
import { MUTE_KEY } from '../game/sound/ui-hook';
import { TRACKS } from '../game/sound/radio';
import { voice } from '../game/sound/voice';
import { ActionTile, TILE_SMALL } from './ActionTile';
import type { ToolTile } from './tool-tiles';

/** the sound settings now, and a re-render when they change */
export function useSoundPrefs() { return useSyncExternalStore(fn => sound.subscribe(fn), () => sound.get(), () => sound.get()); }

/** one volume row: its name, a slider (0 to 100%, in steps of 5) and a mute button; the slider keeps its place while muted. With a tile (Settings) the row is two lines (the tile, the name,
 *  the percent and Mute; the slider the full width under them); without one (the radio's card) it is one */
export function VolumeRow({ label, kind, tip, tile }: { label: string; kind: 'music' | 'sfx'; tip: string; tile?: ToolTile }) {
  const p = useSoundPrefs(), v = kind === 'music' ? p.music : p.sfx, muted = p.muted || (kind === 'music' ? p.musicMuted : p.sfxMuted);
  const slider = <input type="range" className={tile ? 'mt-1 w-full' : 'min-w-0 flex-1'} min={0} max={1} step={0.05} value={v} aria-label={`${label} volume`} data-testid={`sound-${kind}-slider`}
    onChange={e => sound.setVolume(kind, +e.target.value)} />;
  const pct = <span className="w-9 shrink-0 text-right tabular-nums">{Math.round(v * 100)}%</span>;
  const mute = (
    <button type="button" className={`chip shrink-0 ${muted ? 'chip-on' : ''}`} aria-pressed={muted} aria-label={`Mute the ${label.toLowerCase()}`} data-testid={`sound-${kind}-mute`}
      onClick={() => { if (p.muted) sound.setMuted('all', false); /* (everything was muted: the button lifts that, and leaves this kind's own mute as it was) */ else if (kind === 'music') sound.setMuted('music', !p.musicMuted); else sound.setMuted('sfx', !p.sfxMuted); }}>Mute</button>
  );
  return tile ? (
    <div className="px-2 py-1.5 text-sm" data-testid={`sound-${kind}`} data-tip={tip}>
      <div className="flex items-center gap-2"><ActionTile tile={tile} size={TILE_SMALL + 4} /><span className="flex-1">{label}</span>{pct}{mute}</div>
      {slider}
    </div>
  ) : (
    <div className="flex items-center gap-2 px-2 py-1.5 text-sm" data-testid={`sound-${kind}`} data-tip={tip}>
      <label className="flex min-w-0 flex-1 items-center gap-2"><span className="w-14 shrink-0">{label}</span>{slider}{pct}</label>
      {mute}
    </div>
  );
}

/** the Settings rows: the music, the effects, the voice, and the mute-everything switch */
export function SoundSettings({ children }: { children?: ReactNode }) {
  const p = useSoundPrefs();
  return (
    <div role="group" aria-label="Sound" data-testid="settings-sound">
      {TRACKS.length > 0 && <VolumeRow label="Music" kind="music" tile="headphones" tip="The volume of the radio. The radio itself is at the bottom left, beside the minimap, and off until you turn it on. Kept in this browser" />}
      <VolumeRow label="Effects" kind="sfx" tile="bell" tip="The volume of the clicks, the coins and the golf sounds. Kept in this browser" />
      {voice.available() && (
        <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm" data-tip="A voice reads each tutorial step aloud when it opens, at the effects' volume. The words are always on the card">
          <input type="checkbox" checked={p.voice} data-testid="sound-voice" onChange={e => sound.setVoice(e.target.checked)} />
          Tutorial voice
        </label>
      )}
      {children}
      <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm" data-tip={`Silence everything: the music and the effects. ${MUTE_KEY} does the same from the keyboard`}>
        <input type="checkbox" checked={p.muted} data-testid="sound-mute-all" onChange={e => sound.setMuted('all', e.target.checked)} />
        <ActionTile tile="radio-off" size={TILE_SMALL + 4} />Mute all sound ({MUTE_KEY})
      </label>
    </div>
  );
}
