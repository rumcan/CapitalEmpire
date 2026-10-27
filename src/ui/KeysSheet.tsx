// Help › Keys (T202, #529): the Keys sheet (keymap.ts keySheet), opened from the top bar's ? (its Keys tab), and with ? or F1. Laid out as the
// menus are: the Course and Town groups with their tools' keys, then a tool's keys in hand, the camera, the speed, the views and the keys that
// work anywhere; in the lot lab its own keys under their heading. A locked tool is dimmed with its lock's reason. Columns wrap (no sideways
// scroll: the owner's rule); a long sheet scrolls vertically.
import { LockMark } from './Rail';
import type { KeySection } from './keymap';

const HEADING: Record<KeySection['heading'], string> = { general: '', course: 'Course', town: 'Town', lab: 'Lot lab' };

export function KeysSheet({ sections }: { sections: KeySection[] }) {
  const order: KeySection['heading'][] = ['course', 'town', 'general', 'lab'];
  return (
    <div className="keys-sheet" data-testid="keys-sheet">
      {order.map(h => {
        const list = sections.filter(s => s.heading === h); if (!list.length) return null;
        return (
          <section key={h} className="keys-part" aria-label={HEADING[h] || 'Keys'}>
            {HEADING[h] && <h3 className="keys-heading">{HEADING[h]}</h3>}
            <div className="keys-grid">
              {list.map(s => (
                <div key={s.id} className="keys-card" data-keys-section={s.id}>
                  <div className="keys-title">{s.title}</div>
                  <dl className="keys-rows">
                    {s.rows.map((r, i) => (
                      <div key={i} className={`keys-row ${r.why ? 'keys-row-locked' : ''}`} data-key-row={r.keys}>
                        <dt><kbd className="keycap">{r.keys}</kbd></dt>
                        <dd>{r.why && <LockMark />}<span>{r.what}</span>{r.why && <span className="keys-why">{r.why}</span>}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
