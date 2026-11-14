// J11 (#1270): the sound rows of Settings (App.tsx's gear menu, under the Text size): the effects' volume with its mute, and one mute for everything (F8).
// The settings are the sound core's (game/sound/core.ts): kept in this browser, and the same ones the radio's volume and mute use. Every control is a real
// button or slider, so the keyboard reaches them (Tab, arrows).
import { useSyncExternalStore, type ReactNode } from 'react';
import { sound } from '../game/sound/core';
import { MUTE_KEY } from '../game/sound/ui-hook';

/** the sound settings now, and a re-render when they change */
export function useSoundPrefs() { return useSyncExternalStore(fn => sound.subscribe(fn), () => sound.get(), () => sound.get()); }

/** one volume row: its name, a slider (0 to 100%, in steps of 5) and a mute button; the slider keeps its place while muted */
export function VolumeRow({ label, kind, tip }: { label: string; kind: 'music' | 'sfx'; tip: string }) {
  const p = useSoundPrefs(), v = kind === 'music' ? p.music : p.sfx, muted = p.muted || (kind === 'music' ? p.musicMuted : p.sfxMuted);
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-sm" data-testid={`sound-${kind}`} data-tip={tip}>
      <label className="flex min-w-0 flex-1 items-center gap-2">
        <span className="w-14 shrink-0">{label}</span>
        <input type="range" className="min-w-0 flex-1" min={0} max={1} step={0.05} value={v} aria-label={`${label} volume`} data-testid={`sound-${kind}-slider`}
          onChange={e => sound.setVolume(kind, +e.target.value)} />
        <span className="w-9 shrink-0 text-right tabular-nums">{Math.round(v * 100)}%</span>
      </label>
      <button type="button" className={`chip shrink-0 ${muted ? 'chip-on' : ''}`} aria-pressed={muted} aria-label={`Mute the ${label.toLowerCase()}`} data-testid={`sound-${kind}-mute`}
        onClick={() => { if (p.muted) sound.setMuted('all', false); /* (everything was muted: the button lifts that, and leaves this kind's own mute as it was) */ else if (kind === 'music') sound.setMuted('music', !p.musicMuted); else sound.setMuted('sfx', !p.sfxMuted); }}>Mute</button>
    </div>
  );
}

/** the Settings rows: the effects and the mute-everything switch (more rows are added by the radio and the voice: see Settings' own list) */
export function SoundSettings({ children }: { children?: ReactNode }) {
  const p = useSoundPrefs();
  return (
    <div role="group" aria-label="Sound" data-testid="settings-sound">
      <VolumeRow label="Effects" kind="sfx" tip="The volume of the clicks, the coins and the golf sounds. Kept in this browser" />
      {children}
      <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm" data-tip={`Silence everything: the music and the effects. ${MUTE_KEY} does the same from the keyboard`}>
        <input type="checkbox" checked={p.muted} data-testid="sound-mute-all" onChange={e => sound.setMuted('all', e.target.checked)} />
        Mute all sound ({MUTE_KEY})
      </label>
    </div>
  );
}
