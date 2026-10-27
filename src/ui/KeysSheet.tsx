// Help › Keys (T202, #529): the Keys sheet (keymap.ts keySheet), opened from the top bar's ? (its Keys tab), and with ? or F1. Laid out as the
// menus are: the rail (the number keys open its groups) and the keys that work anywhere, Course and Town with their tools' keys and a tool's
// keys in hand, then the camera, the speed and the views; in the lot lab its own keys under their heading. A locked tool or group is dimmed with its
// lock's reason. The cards wrap into columns (never a sideways scroll: the owner's rule); a long sheet scrolls vertically.
import { LockMark } from './Rail';
import { KEY_PARTS, type KeySection } from './keymap';

export function KeysSheet({ sections }: { sections: KeySection[] }) {
  return (
    <div className="keys-sheet" data-testid="keys-sheet">
      {KEY_PARTS.map(({ part, heading }) => {
        const list = sections.filter(s => s.part === part); if (!list.length) return null;
        return (
          <section key={part} className="keys-part" aria-label={heading || 'The rail and anywhere'} data-keys-part={part}>
            {heading && <h3 className="keys-heading">{heading}</h3>}
            <div className="keys-grid">
              {list.map(s => (
                <div key={s.id} className={`keys-card ${s.why ? 'keys-card-locked' : ''}`} data-keys-section={s.id} {...(s.why ? { 'aria-disabled': true } : {})}>
                  <div className="keys-title">{s.why && <LockMark />} {s.title}</div>
                  {s.why && <div className="keys-why">{s.why}</div>}
                  <dl className="keys-rows">
                    {s.rows.map((r, i) => (
                      <div key={i} className={`keys-row ${r.why ? 'keys-row-locked' : ''}`} data-key-row={r.keys} {...(r.tool ? { 'data-key-tool': r.tool } : {})} {...(r.why ? { 'aria-disabled': true } : {})}>
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
