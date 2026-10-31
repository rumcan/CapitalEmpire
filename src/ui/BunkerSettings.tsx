// The bunker's own part of its look (My looks with the bunker in hand: one card edits everything a bunker wears; the owner, 2026-10-31:
// "two different texture editors ... consolidate into one single component"): its depth and walls and the 3D bake's edge soil and cut wall
// pictures, saved with the rest of the look (look-settings.ts BUNKER_LOOK_KEYS). The sand's texture, size, angle and exposure, the Border,
// Round off and Shadow are the look's own controls above it. And Pick bunker: click a bunker to open its look.
import { useEffect, useId, useRef, useState } from 'react';
import type { Game } from '../game/engine';
import { BUNKER_SETTING_FIELDS, BUNKER_TEXTURE_SLOTS, type BunkerSettingField, type BunkerSettingKey, type BunkerTextureSlotInfo } from '../game/ext/bunker-look/settings';
import { bunkerSettingsOfLook, type BunkerLookFields, type BunkerLookKey } from '../game/ext/bunker-look/look-settings';
import { bunkerTexture, bunkerTextureGroups, ownTextures } from '../game/ext/bunker-look/texture-library';
import { addOwnTexture, removeOwnTexture } from '../game/ext/bunker-look/uploads';
import type { BunkerTextureEntry } from '../game/ext/bunker-look/stage-materials';

const fieldOf = (key: BunkerSettingKey) => BUNKER_SETTING_FIELDS.find(field => field.key === key)!;
/** the bunker's shape, as the card lays it out */
const SHAPE_FIELDS = (['depth', 'wall', 'wallLow', 'slope'] as const).map(fieldOf);
/** the pictures the look picks (the sand is the look's own texture; the grass round it is the course's Border) */
const PICTURE_SLOTS = BUNKER_TEXTURE_SLOTS.filter(slot => slot.slot === 'soil' || slot.slot === 'wall');
const displayNumber = (value: number) => Number(value.toFixed(3)).toString();
const fieldLabel = (field: BunkerSettingField) => field.key === 'depth' ? 'Floor depth' : field.key === 'wall' ? 'Wall height (green side)' : field.key === 'wallLow' ? 'Wall height (no green behind)' : field.key === 'textureScale' ? 'All pictures’ scale' : field.label;

/** A local draft survives game updates and commits only after the player finishes typing. */
function NumberControl({ field, value, scope, onChange }: {
  field: Readonly<BunkerSettingField>;
  value: number;
  scope: string;
  onChange(value: number): void;
}) {
  const id = useId(), focused = useRef(false), dirty = useRef(false);
  const scale = field.displayScale, displayed = value * scale;
  const [draft, setDraft] = useState(() => displayNumber(displayed));
  useEffect(() => { if (!focused.current) setDraft(displayNumber(displayed)); }, [displayed]);
  const label = fieldLabel(field), unit = field.unit === 'x' ? '×' : field.unit;
  const min = field.min * scale, max = field.max * scale, step = field.step * scale;
  const accessibleLabel = `${scope} ${label.toLowerCase()}${unit ? ` (${unit})` : ''}`;
  const finish = () => {
    focused.current = false;
    if (dirty.current && draft.trim() !== '' && Number.isFinite(Number(draft))) {
      const next = Math.min(max, Math.max(min, Number(draft)));
      onChange(next / scale);
      setDraft(displayNumber(next));
    } else setDraft(displayNumber(displayed));
    dirty.current = false;
  };
  return (
    <div className="mt-2.5">
      <label htmlFor={`${id}-number`} className="flex items-center justify-between gap-2 text-xs">
        <span>{label}</span><span className="sub-line">{unit}</span>
      </label>
      <div className="mt-1 flex flex-nowrap items-center gap-2">
        <input type="range" min={min} max={max} step={step} value={displayed}
          aria-label={`${accessibleLabel} slider`} aria-valuetext={`${displayNumber(displayed)} ${unit}`.trim()}
          onChange={event => onChange(Number(event.target.value) / scale)}
          className="min-w-0 flex-1 disabled:opacity-40" />
        <input id={`${id}-number`} type="number" inputMode="decimal" min={min} max={max} step={step}
          aria-label={accessibleLabel} value={draft}
          onFocus={() => { focused.current = true; }}
          onChange={event => { dirty.current = true; setDraft(event.target.value); }}
          onBlur={finish}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
            if (event.key === 'Escape') {
              event.preventDefault(); dirty.current = false; setDraft(displayNumber(displayed)); event.currentTarget.blur();
            }
          }}
          style={{ borderColor: 'var(--line)', background: 'var(--panel-2)', color: 'var(--ink)' }}
          className="w-20 rounded-lg border px-1.5 py-1 text-right text-xs disabled:opacity-40" />
      </div>
      {field.key === 'depth' && <p className="sub-line mt-0.5">Below the cut wall</p>}
      {field.key === 'wall' && <p className="sub-line mt-0.5">Where the green is right behind it</p>}
    </div>
  );
}

/** The picture itself (a crop shows only its part of the atlas). */
function TextureSwatch({ entry }: { entry: BunkerTextureEntry }) {
  const [x, y, w, h] = entry.crop ?? [0, 0, 1, 1];
  return (
    <span aria-hidden className="inline-block h-9 w-9 shrink-0 rounded-md border"
      style={{ borderColor: 'var(--line)', backgroundImage: `url("${entry.url}")`, backgroundRepeat: 'no-repeat',
        backgroundSize: `${100 / w}% ${100 / h}%`, backgroundPosition: `${w < 1 ? (x / (1 - w)) * 100 : 0}% ${h < 1 ? (y / (1 - h)) * 100 : 0}%` }} />
  );
}

/** One swappable bunker picture: which texture it draws, and its own scale. */
/** A picture slot: the texture (any bunker pack picture, ground photo or added picture) and its scale. */
function PictureControl({ slot, value, scale, scope, onChange }: {
  slot: Readonly<BunkerTextureSlotInfo>;
  value: string;
  scale: number;
  scope: string;
  onChange(change: BunkerLookFields): void;
}) {
  const id = useId(), entry = bunkerTexture(slot.slot, value), field = fieldOf(slot.scale);
  return (
    <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--line)' }} data-bunker-texture={slot.slot}>
      <label htmlFor={`${id}-texture`} className="text-xs font-semibold">{slot.label}</label>
      <div className="mt-1 flex flex-nowrap items-center gap-2">
        <TextureSwatch entry={entry} />
        <select id={`${id}-texture`} value={entry.id} aria-label={`${scope} ${slot.label.toLowerCase()} texture`}
          onChange={event => onChange({ [slot.key]: event.target.value })}
          style={{ borderColor: 'var(--line)', background: 'var(--panel-2)', color: 'var(--ink)' }}
          className="min-w-0 flex-1 rounded-lg border px-1.5 py-1 text-xs">
          {bunkerTextureGroups().map(({ group, entries }) => (
            <optgroup key={group} label={group}>
              {entries.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <NumberControl field={field} value={scale} scope={scope} onChange={v => onChange({ [slot.scale]: v } as BunkerLookFields)} />
    </div>
  );
}

/** My looks' bunker part (shown under the look's own controls with the bunker in hand): the depth and walls, and the bake's pictures, for
 *  whoever the card edits (a hole, the property, a facility, the course default); every change re-bakes that owner's bunkers. */
export function BunkerLookShape({ game }: { game: Game }) {
  const p = game.paint, st = p.style, now = bunkerSettingsOfLook(st), scope = 'Bunker';
  const set = (change: BunkerLookFields) => p.setStyle({ bunker: { ...(st.bunker ?? {}), ...change } });
  const number = (key: BunkerLookKey & BunkerSettingKey) => <NumberControl key={key} field={fieldOf(key)} value={now[key]} scope={scope} onChange={v => set({ [key]: v })} />;
  return (
    <div data-bunker-look>
      <details className="mt-3" open>
        <summary className="sub-head cursor-pointer select-none">Depth and walls</summary>
        {SHAPE_FIELDS.map(field => number(field.key as BunkerLookKey & BunkerSettingKey))}
      </details>
      <OwnTextures game={game} now={now} set={set} />
      <details className="mt-3">
        <summary className="sub-head cursor-pointer select-none">Soil and wall pictures</summary>
        <p className="sub-line mt-1.5">The 3D bunker's edge soil and cut wall. New pictures dropped into the bunker texture folder show under Added textures.</p>
        {number('textureScale')}
        {PICTURE_SLOTS.map(slot => <PictureControl key={slot.slot} slot={slot} value={now[slot.key]} scale={now[slot.scale]} scope={scope} onChange={set} />)}
      </details>
    </div>
  );
}

/** Your textures (the owner, 2026-10-31: "add an upload your own texture button"): upload a picture from disk (kept in this browser), then put
 *  it on the sand, the edge soil or the cut wall of the bunkers this look is for; the soil and wall pickers list it too. */
function OwnTextures({ game, now, set }: { game: Game; now: ReturnType<typeof bunkerSettingsOfLook>; set(change: BunkerLookFields): void }) {
  const pick = useRef<HTMLInputElement>(null), [note, setNote] = useState('');
  const upload = async (file: File | undefined) => {
    if (!file) return; setNote('Uploading…');
    try { const id = await addOwnTexture(file); setNote(''); set({ sandTex: id }); } catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
    game.emit();
  };
  const slots = [['sandTex', 'Sand'], ['soilTex', 'Soil'], ['wallTex', 'Wall']] as const;
  return (
    <details className="mt-3" open data-own-textures>
      <summary className="sub-head cursor-pointer select-none">Your textures</summary>
      <p className="sub-line mt-1.5">A picture from your computer (PNG, JPEG or WebP), kept in this browser. It goes on the sand when you upload it; put it on the soil or the wall too, or take it off again.</p>
      <input ref={pick} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Your texture file" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void upload(f); }} />
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button type="button" className="chip" onClick={() => pick.current?.click()} data-upload-texture>Upload your own texture</button>
        {note && <span className="sub-line" role="status">{note}</span>}
      </div>
      {ownTextures().map(entry => (
        <div key={entry.id} className="mt-2 flex items-center gap-1.5" data-own-texture={entry.id}>
          <TextureSwatch entry={entry} />
          <span className="min-w-0 flex-1 truncate text-xs" title={entry.label}>{entry.label}</span>
          {slots.map(([key, name]) => (
            <button key={key} type="button" className={`chip ${now[key] === entry.id ? 'chip-on' : ''}`} aria-pressed={now[key] === entry.id}
              title={now[key] === entry.id ? `Take it off the ${name.toLowerCase()}` : `Put it on the ${name.toLowerCase()}`}
              onClick={() => set({ [key]: now[key] === entry.id ? undefined : entry.id })}>{name}</button>
          ))}
          <button type="button" className="round-btn" aria-label={`Remove ${entry.label}`} title="Remove it from this browser" onClick={() => { void removeOwnTexture(entry.id).then(() => game.emit()); }}>×</button>
        </div>
      ))}
    </details>
  );
}

/** Bunker look and Pick bunker (the brushes' panel, the bunker in hand): the bunkers' look card (sand, edges, depth and walls, pictures), and
 *  the next click on a bunker opens the look of that bunker's hole */
export function BunkerPickEntry({ game, looks = false, onLooks }: { game: Game; looks?: boolean; onLooks?: (open: boolean) => void }) {
  if (!game.golfMode || !game.courseGrid || !game.bunkers) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" data-bunker-entry>
      <button type="button" className={`chip ${looks ? 'chip-on' : ''}`} aria-pressed={looks} title="The bunkers' look on this hole: sand, edges, depth and walls, and the soil and wall pictures" onClick={() => { game.paint.closeGrass(); onLooks?.(!looks); }} data-bunker-look>Bunker look ▸</button>
      <button type="button" className="chip" title="Click a bunker on the map: its look opens (the bunkers of its hole wear it)" onClick={() => game.armBunkerPick()}>Pick bunker</button>
    </div>
  );
}
