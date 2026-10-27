// The night's controls (gear menu): when it is night, the moonlight and every light type's size and strength (src/game/night-light.ts,
// TrickOrTreat's town-builder night). Each change applies at once and is remembered.
import type { Game } from '../game/engine';
import { LIGHT_TYPES, NIGHT_DEFAULT, type LightKey, type NightSettings } from '../game/night-light';

const hour = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;

function Row({ label, value, min, max, step, show, set, title }: { label: string; value: number; min: number; max: number; step: number; show: string; set: (v: number) => void; title?: string }) {
  return (
    <label className="flex items-center gap-2 px-2 py-1 text-xs" title={title}>
      <span className="w-24 shrink-0">{label}</span>
      <input type="range" className="min-w-0 flex-1" min={min} max={max} step={step} value={value} onChange={e => set(+e.target.value)} />
      <span className="w-12 text-right tabular-nums">{show}</span>
    </label>
  );
}

export function NightPanel({ game, bump }: { game: Game; bump: () => void }) {
  const n = game.night, set = (v: Partial<NightSettings>) => { game.setNight(v); bump(); };
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="flex flex-col border-t border-white/10 pt-1">
      {game.golfMode && (<>
        {/* the town day (LEAD.md M1): the town's own day between and around the tournaments, with its morning and evening rush hours */}
        <Row label="Town day" value={game.townDay.minutes} min={0.5} max={30} step={0.5} show={`${game.townDay.minutes} min`} set={v => { game.setTownDay({ minutes: v }); bump(); }} title="How long one town day lasts at 1x (real minutes): the commute out in the morning and home in the evening, and the night, follow it; the season's months keep their own pace" />
        <Row label="Town traffic" value={game.townDay.traffic} min={0} max={4} step={0.05} show={`${Math.round(game.townDay.traffic * 100)}%`} set={v => { game.setTownDay({ traffic: v }); bump(); }} title="How many trips the town's residents make a day (100% = the game's rate)" />
      </>)}
      <label className="flex items-center gap-2 px-2 py-2 text-sm" title="TrickOrTreat's night: blue moonlight, and the colour back in pools round every lamp, porch, shop window and lit window">
        <span className="w-16 shrink-0">Night</span>
        <select className="min-w-0 flex-1 rounded bg-black/40 px-1 py-0.5" value={n.mode} onChange={e => set({ mode: e.target.value as NightSettings['mode'] })}>
          <option value="clock">By the clock</option>
          <option value="on">Always night</option>
          <option value="off">Never</option>
        </select>
      </label>
      {n.mode === 'clock' && (<>
        <Row label="Night every" value={n.every} min={1} max={14} step={1} show={n.every === 1 ? 'day' : `${n.every} days`} set={v => set({ every: v })} title="How often the night comes: on one game day in this many (the days between stay light). Skip night in the top bar skips one." />
        <Row label="Dusk from" value={n.dusk} min={0} max={24} step={0.5} show={hour(n.dusk)} set={v => set({ dusk: v })} title="It starts to get dark" />
        <Row label="Night from" value={n.night} min={0} max={24} step={0.5} show={hour(n.night)} set={v => set({ night: v })} title="Full night" />
        <Row label="Dawn from" value={n.dawn} min={0} max={24} step={0.5} show={hour(n.dawn)} set={v => set({ dawn: v })} title="It starts to get light" />
        <Row label="Day from" value={n.day} min={0} max={24} step={0.5} show={hour(n.day)} set={v => set({ day: v })} title="Full day" />
      </>)}
      <details className="px-2 py-1 text-xs">
        <summary className="cursor-pointer py-1">Moonlight and lights</summary>
        <label className="flex items-center gap-2 py-1">
          <span className="w-24 shrink-0">Moon colour</span>
          <input type="color" value={n.tint} onChange={e => set({ tint: e.target.value })} />
        </label>
        <Row label="Moonlight" value={n.strength} min={0} max={1} step={0.01} show={pct(n.strength)} set={v => set({ strength: v })} title="How much of the moon colour" />
        <Row label="Grey" value={n.desat} min={0} max={1} step={0.01} show={pct(n.desat)} set={v => set({ desat: v })} title="How much colour the night takes out" />
        <Row label="Dark" value={n.dark} min={0} max={1} step={0.01} show={pct(n.dark)} set={v => set({ dark: v })} />
        <Row label="Soft edge" value={n.feather} min={0.02} max={0.98} step={0.01} show={pct(n.feather)} set={v => set({ feather: v })} title="How soft the light pools' edges are" />
        <Row label="Warmth" value={n.warmth} min={0} max={1} step={0.01} show={pct(n.warmth)} set={v => set({ warmth: v })} title="The warm colour inside the pools" />
        <Row label="Window size" value={n.glowSize} min={0} max={6} step={0.1} show={`${n.glowSize.toFixed(1)}x`} set={v => set({ glowSize: v })} title="The lit windows' glow, times the painted glow" />
        <Row label="Window light" value={n.glowStrength} min={0} max={1} step={0.01} show={pct(n.glowStrength)} set={v => set({ glowStrength: v })} />
        {LIGHT_TYPES.map(t => {
          const k: LightKey = t.key, v = n.types[k];
          return (
            <div key={k} className="mt-1 border-t border-white/5 pt-1">
              <div className="px-2 py-0.5 text-[12px] opacity-80">{t.label}</div>
              <Row label="Size" value={v.r} min={0} max={20} step={0.1} show={`${v.r.toFixed(1)} m`} set={r => set({ types: { ...n.types, [k]: { ...v, r } } })} />
              <Row label="Strength" value={v.i} min={0} max={1} step={0.01} show={pct(v.i)} set={i => set({ types: { ...n.types, [k]: { ...v, i } } })} />
            </div>
          );
        })}
        <button className="btn mt-2 w-full" onClick={() => set({ ...NIGHT_DEFAULT, mode: n.mode })}>The builder's night</button>
      </details>
      {/* T215 (#561, phase 1): the street lamps' reflection pools as the camera specular, a test of the look (lamp-reflect.ts); not remembered.
          T199 (#517): the same switch and knobs light the swamp's pools with a cool sky glint (swamp.ts), strongest by day */}
      <details className="px-2 py-1 text-xs">
        <summary className="cursor-pointer py-1">Lamp reflections and swamp glint (test)</summary>
        <label className="flex items-center gap-2 py-1" title="On: the lamps' reflection pools on the road, and the sky's glint on the swamp's pools, show whole in the middle of the screen and fade out toward its edges. Off: the pools baked into the road as before, and no glint">
          <input type="checkbox" checked={game.specCam} onChange={e => { game.specCam = e.target.checked; bump(); }} />
          <span>Follow the camera</span>
        </label>
        <Row label="Inner" value={game.spec.inner} min={0} max={2} step={0.01} show={game.spec.inner.toFixed(2)} set={v => { game.setSpec({ inner: v }); bump(); }} title="Within this distance from the screen's centre (over half the screen's width) the reflection is whole" />
        <Row label="Outer" value={game.spec.outer} min={0.01} max={3} step={0.01} show={game.spec.outer.toFixed(2)} set={v => { game.setSpec({ outer: v }); bump(); }} title="Past this distance from the screen's centre the reflection is gone" />
        <Row label="Strength" value={game.spec.strength} min={0} max={3} step={0.01} show={pct(game.spec.strength)} set={v => { game.setSpec({ strength: v }); bump(); }} />
        <Row label="By day" value={game.spec.day} min={0} max={1} step={0.01} show={pct(game.spec.day)} set={v => { game.setSpec({ day: v }); bump(); }} title="The share of the strength by day; after dusk the night takes it to the whole" />
      </details>
    </div>
  );
}
