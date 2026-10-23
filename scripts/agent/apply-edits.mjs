// apply-edits.mjs <bundle.json> <repoRoot>: applies a bundle's "files" (new files only: refuses to overwrite) and "edits" ([{path, old, new}]: old must occur exactly once).
// Refuses absolute or escaping paths. All-or-nothing: edits are checked in memory first. If the target uses CRLF the edit text is converted to CRLF; if the exact text
// is not found, trailing spaces on each line of the edit are dropped (Gemini's markdown adds two) and it must then match exactly once.
import fs from 'node:fs'; import path from 'node:path';
const [bundle, dest] = process.argv.slice(2); const root = path.resolve(dest);
let b = JSON.parse(fs.readFileSync(bundle, 'utf8'));
if (Array.isArray(b)) b = { edits: b }; // a bare array of edits: an entry with old === '' creates a NEW file (refused if it exists)
const safe = p => { const out = path.resolve(root, p); if (path.isAbsolute(p) || !out.startsWith(root + path.sep)) throw new Error(`refused path ${p}`); return out; };
const writes = new Map();
for (const [p, c] of Object.entries(b.files ?? {})) { const out = safe(p); if (fs.existsSync(out)) throw new Error(`files[] would overwrite ${p}: use edits`); writes.set(out, c); }
const strip = t => t.split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n');
// accepted shapes: [{path, old, new}] or {path: [{search|old, replace|new}]}
const editList = Array.isArray(b.edits) ? b.edits : Object.entries(b.edits ?? {}).flatMap(([path, list]) => list.map(x => ({ path, old: x.old ?? x.search, new: x.new ?? x.replace })));
for (const e of editList) {
  if (e.old === '' && !(writes.has(safe(e.path))) && !fs.existsSync(safe(e.path))) { writes.set(safe(e.path), e.new); continue; }
  if (e.old === '') throw new Error('empty old on an existing file: ' + e.path);
  const out = safe(e.path); const cur = writes.get(out) ?? fs.readFileSync(out, 'utf8');
  const crlf = cur.includes('\r\n'); const fix = t => (crlf ? t.replace(/\r?\n/g, '\r\n') : t);
  let eo = fix(e.old), en = fix(e.new), n = cur.split(eo).length - 1;
  if (n === 0) { eo = fix(strip(e.old.replace(/\r\n/g, '\n'))); en = fix(strip(e.new.replace(/\r\n/g, '\n'))); n = cur.split(eo).length - 1; if (n === 1) console.log(`note: trailing spaces dropped in an edit to ${e.path}`); }
  if (n === 0) {
    // last resort: match line by line ignoring indentation and trailing spaces (Gemini shifts both); still exactly one match, and the replacement is re-indented to the file
    const nl = crlf ? '\r\n' : '\n', fl = cur.split(nl), ol = e.old.replace(/\r\n/g, '\n').split('\n').map(l => l.trim().replace(/\s+/g, ' ')); while (ol.length && !ol[ol.length - 1]) ol.pop();
    const at = []; for (let i = 0; i + ol.length <= fl.length; i++) { let ok = true; for (let j = 0; j < ol.length && ok; j++) ok = fl[i + j].trim().replace(/\s+/g, ' ') === ol[j]; if (ok) at.push(i); }
    if (at.length === 1) {
      const rawOld = e.old.replace(/\r\n/g, '\n').split('\n'), ind = l => l.length - l.trimStart().length, first = rawOld.findIndex(l => l.trim()), delta = ind(fl[at[0]]) - ind(rawOld[first]);
      const nw = e.new.replace(/\r\n/g, '\n').split('\n').map(l => l.trim() ? ' '.repeat(Math.max(0, ind(l) + delta)) + l.trim() : '');
      while (nw.length && !nw[nw.length - 1]) nw.pop();
      console.log(`note: indentation-insensitive match for an edit to ${e.path} (line ${at[0] + 1})`);
      writes.set(out, [...fl.slice(0, at[0]), ...nw, ...fl.slice(at[0] + ol.length)].join(nl)); continue;
    }
    n = at.length;
  }
  if (n !== 1) throw new Error(`edit in ${e.path}: old text occurs ${n} times (need exactly 1): ${JSON.stringify(eo.slice(0, 80))}`);
  writes.set(out, cur.replace(eo, () => en));
}
for (const [out, c] of writes) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, c); console.log('wrote', path.relative(root, out)); }
