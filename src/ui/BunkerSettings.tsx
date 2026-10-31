import { useEffect, useId, useRef, useState } from 'react';
import type { Game } from '../game/engine';
import { BUNKER_SETTING_FIELDS, BUNKER_TEXTURE_SLOTS, type BunkerSettingField, type BunkerSettings, type BunkerTextureSlotInfo } from '../game/ext/bunker-look/settings';
import { bunkerTexture, bunkerTextureGroups } from '../game/ext/bunker-look/texture-library';
import type { BunkerTextureEntry } from '../game/ext/bunker-look/stage-materials';

const FIELDS = BUNKER_SETTING_FIELDS.filter(field => !field.hidden);
const PRIMARY = FIELDS.filter(field => field.key === 'depth' || field.key === 'wall');
const SHAPE = FIELDS.filter(field => field.group === 'shape' && field.key !== 'depth' && field.key !== 'wall');
const OVERALL = FIELDS.filter(field => field.key === 'textureScale');
const fieldOf = (key: string) => FIELDS.find(field => field.key === key);
const TEXTURE_GROUPS = bunkerTextureGroups();
const displayNumber = (value: number) => Number(value.toFixed(3)).toString();
const fieldLabel = (field: BunkerSettingField) => field.key === 'depth' ? 'Floor depth' : field.key === 'wall' ? 'Wall height' : field.label;

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
function TextureSlotControl({ slot, settings, scope, onChange }: {
  slot: Readonly<BunkerTextureSlotInfo>;
  settings: Readonly<BunkerSettings>;
  scope: string;
  onChange(change: Partial<BunkerSettings>): void;
}) {
  const id = useId(), entry = bunkerTexture(slot.slot, settings[slot.key]), scale = fieldOf(slot.scale);
  const known = entry.id === settings[slot.key];
  return (
    <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--line)' }} data-bunker-texture={slot.slot}>
      <label htmlFor={`${id}-texture`} className="text-xs font-semibold">{slot.label}</label>
      <div className="mt-1 flex flex-nowrap items-center gap-2">
        <TextureSwatch entry={entry} />
        <select id={`${id}-texture`} value={entry.id} aria-label={`${scope} ${slot.label.toLowerCase()} texture`}
          onChange={event => onChange({ [slot.key]: event.target.value })}
          style={{ borderColor: 'var(--line)', background: 'var(--panel-2)', color: 'var(--ink)' }}
          className="min-w-0 flex-1 rounded-lg border px-1.5 py-1 text-xs disabled:opacity-40">
          {TEXTURE_GROUPS.map(({ group, entries }) => (
            <optgroup key={group} label={group}>
              {entries.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      {!known && <p className="sub-line mt-0.5">{`Saved texture "${settings[slot.key]}" is not here; drawing the default.`}</p>}
      {scale && <NumberControl field={scale} value={settings[scale.key]} scope={scope} onChange={value => onChange({ [scale.key]: value })} />}
    </div>
  );
}

/** A short entry under the existing surfaces; the controls open beside the tool panel. */
export function BunkerSettingsEntry({ game, open = false, onOpen }: {
  game: Game;
  open?: boolean;
  onOpen?: (open: boolean) => void;
}) {
  if (!game.golfMode || !game.courseGrid || !game.bunkers) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" data-bunker-entry>
      <button type="button" className={`chip ${open ? 'chip-on' : ''}`} aria-expanded={open}
        aria-controls="bunker-settings-card" onClick={() => onOpen?.(!open)}>Bunker settings <span aria-hidden>▸</span></button>
      <button type="button" className="chip" onClick={() => { onOpen?.(false); game.armBunkerPick(); }}>Pick bunker</button>
    </div>
  );
}

/** The whole connected bunker is the selection, independent of hole ownership and chunk boundaries. */
export function BunkerSettingsCard({ game, onClose }: { game: Game; onClose: () => void }) {
  const controller = game.bunkers, selected = controller.selection;
  const [scope, setScope] = useState<'defaults' | 'selected'>(() => selected ? 'selected' : 'defaults');
  useEffect(() => {
    if (selected) setScope('selected');
    else setScope('defaults');
  }, [selected?.id, game.bunkerSelectionSerial]);
  const editingSelected = scope === 'selected' && selected !== null;
  const settings = editingSelected ? selected.settings : controller.defaults;
  const inherited = editingSelected && selected.mode === 'default';
  const scopeLabel = editingSelected ? 'Selected bunker' : 'Global bunker default';
  const update = (change: Partial<BunkerSettings>) => {
    if (editingSelected) controller.setSelectedSettings(change);
    else controller.setDefaults(change);
  };
  const controls = (fields: typeof FIELDS) => fields.map(field => (
    <NumberControl key={field.key} field={field} value={settings[field.key]} scope={scopeLabel}
      onChange={value => update({ [field.key]: value })} />
  ));
  return (
    <section id="bunker-settings-card" className="bunker-settings-card glass tp w-[330px] max-h-[calc(var(--vh-ui,100vh)-var(--hud-top,5.75rem)-8.25rem)] overflow-y-auto p-3"
      data-card="bunkers" aria-label="Bunker settings">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold">Bunker settings</h2>
        <button type="button" className="round-btn" aria-label="Close Bunker settings" title="Close (Esc)" onClick={onClose}>×</button>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Bunker settings scope">
        <button type="button" className={`chip ${!editingSelected ? 'chip-on' : ''}`} aria-pressed={!editingSelected}
          onClick={() => setScope('defaults')}>Global defaults</button>
        <button type="button" className={`chip ${editingSelected ? 'chip-on' : ''} disabled:opacity-40`}
          disabled={!selected} aria-pressed={editingSelected} onClick={() => setScope('selected')}>Selected bunker</button>
      </div>
      {editingSelected ? (
        <>
          <p className="sub-line mt-2">{`${selected.cells.length.toLocaleString()} m². Changes apply to the whole connected bunker.`}</p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Selected bunker settings mode">
            <button type="button" className={`chip ${inherited ? 'chip-on' : ''}`} aria-pressed={inherited}
              onClick={() => controller.setMode('default')}>Default</button>
            <button type="button" className={`chip ${!inherited ? 'chip-on' : ''}`} aria-pressed={!inherited}
              onClick={() => controller.setMode('custom')}>Custom</button>
          </div>
          {inherited && <p className="sub-line mt-1.5">Follows global defaults. Choose Custom to edit this bunker.</p>}
        </>
      ) : <p className="sub-line mt-2">Used by new bunkers and every bunker set to Default.</p>}
      <fieldset key={editingSelected ? `selected-${selected.id}` : 'defaults'} disabled={inherited} className="min-w-0">
        <legend className="sr-only">{scopeLabel} appearance controls</legend>
        {controls(PRIMARY)}
        <details className="mt-3">
          <summary className="sub-head cursor-pointer select-none">Shape and edges</summary>
          {controls(SHAPE)}
        </details>
        <details className="mt-3">
          <summary className="sub-head cursor-pointer select-none">Materials</summary>
          <p className="sub-line mt-1.5">Swap any bunker picture for another texture and scale each one. New pictures dropped into the bunker texture folder show under Added textures.</p>
          {controls(OVERALL)}
          {BUNKER_TEXTURE_SLOTS.map(slot => <TextureSlotControl key={slot.slot} slot={slot} settings={settings} scope={scopeLabel} onChange={update} />)}
        </details>
      </fieldset>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button type="button" className="chip" onClick={() => { onClose(); game.armBunkerPick(); }}>Pick bunker</button>
        {!selected && <span className="sub-line">Click any bunker to set its own appearance.</span>}
      </div>
    </section>
  );
}
