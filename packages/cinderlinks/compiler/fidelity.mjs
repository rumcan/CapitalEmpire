// Fidelity's compiler, the part Cinderlinks needs, in Node (a port of `compile` and `check` from fidelity.ps1, kept beside it).
// A distilled BRS (.md / .fd.md) is read as a tree of parts:
//   ## id Title          a part (### a sub-part, and so on down to ######)
//   R: text              a requirement
//   File: name           a file the part writes
//   Check: text          a text that file must contain (belongs to the File: line above it)
//   ````lang file=name   the part's code for that file, up to the closing fence (the same run of backticks)
//   From: / Link:        where the original lives / a file or folder taken from it as it is
// Compiling joins every part's code per file, in the order the file gives it (a part's own code, then its sub-parts': the same as reading order),
// writes a stub for a File: with no code anywhere, and then runs the checks. The output is byte for byte what fidelity.ps1 writes.
//   node fidelity.mjs compile <file.md> --out <dir>
//   node fidelity.mjs check   <file.md> --out <dir>
// Or from another script: import { compileText } from './fidelity.mjs'.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function holon(id, rung, title) { return { id, rung, title, requires: [], files: [], checks: [], code: [], links: [], children: [] }; }

export function readBrs(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();   // (as .NET's ReadAllLines: a final line break ends the last line, it does not start a new one)
  const root = holon('app', 1, ''); root.from = '';
  const stack = [root]; let cur = root, fence = null, fenceFile = null, fenceLang = null, buf = null;
  for (const l of lines) {
    if (fence) {                                                   // inside a code block: everything up to the matching fence is code
      if (l.trim() === fence) { cur.code.push({ file: fenceFile, lang: fenceLang, text: buf.join('\n') }); fence = null; continue; }
      buf.push(l); continue;
    }
    let m = /^(`{3,})(\w*)\s+file=(\S+)\s*$/.exec(l);
    if (m) { fence = m[1]; fenceLang = m[2]; fenceFile = m[3]; buf = []; continue; }
    m = /^(#{2,6})\s+([\w.-]+)\s+(.*)$/.exec(l);
    if (m) {
      const rung = m[1].length;
      while (stack.length > 1 && stack[stack.length - 1].rung >= rung) stack.pop();
      const parent = stack[stack.length - 1], id = parent.id === 'app' ? m[2] : parent.id + '.' + m[2];
      cur = holon(id, rung, m[3].trim()); parent.children.push(cur); stack.push(cur); continue;
    }
    if ((m = /^From:\s*(.*)$/.exec(l))) { root.from = m[1].trim(); continue; }
    if ((m = /^Link:\s*(.*)$/.exec(l))) { cur.links.push(m[1].trim()); continue; }
    if ((m = /^R:\s*(.*)$/.exec(l))) { cur.requires.push(m[1]); continue; }
    if ((m = /^File:\s*(.*)$/.exec(l))) { cur.files.push(m[1].trim()); continue; }
    if ((m = /^Check:\s*(.*)$/.exec(l))) { cur.checks.push({ file: cur.files[cur.files.length - 1], text: m[1].trim() }); continue; }
  }
  if (fence) throw new Error('a code block for ' + fenceFile + ' is never closed (no ' + fence + ' line after it)');
  return root;
}

function commentFor(file, text) {
  if (/\.(js|ts|css)$/.test(file)) return '/* ' + text + ' */';
  if (/\.(html|md)$/.test(file)) return '<!-- ' + text + ' -->';
  if (/\.(cmd|bat)$/.test(file)) return text.split('\n').map((s) => 'rem ' + s).join('\r\n');
  return text.split('\n').map((s) => '# ' + s).join('\n');
}

export function writeProgram(root, outDir) {
  const files = new Map(), stubs = [], links = []; let holons = 0, fragments = 0;
  (function visit(h) {
    for (const c of h.code) { if (!files.has(c.file)) files.set(c.file, []); files.get(c.file).push(c.text); fragments++; }
    for (const f of h.files) if (!h.code.some((c) => c.file === f)) stubs.push({ holon: h.id, file: f, requires: h.requires });
    links.push(...h.links); holons++;
    for (const c of h.children) visit(c);
  })(root);
  fs.mkdirSync(outDir, { recursive: true });
  for (const k of links) {                                         // folders linked (a junction, nothing copied), single files copied, from the original
    const src = path.join(root.from, k), dst = path.join(outDir, k);
    if (fs.existsSync(dst)) continue;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (fs.existsSync(src) && fs.statSync(src).isDirectory()) fs.symlinkSync(path.resolve(src), dst, 'junction');
    else if (fs.existsSync(src)) fs.copyFileSync(src, dst);
    else console.warn('Link: ' + k + ' is not in the original (' + src + ')');
  }
  let written = 0, bytes = 0;
  for (const [f, parts] of files) {
    const p = path.join(outDir, f), t = parts.join('\n');
    fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t, 'utf8'); written++; bytes += Buffer.byteLength(t, 'utf8');
  }
  for (const s of stubs) {
    const p = path.join(outDir, s.file);
    if (fs.existsSync(p)) continue;
    const note = "distilled: part '" + s.holon + "' has requirements but no code yet:\n" + s.requires.map((r) => ' - ' + r).join('\n');
    fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, commentFor(s.file, note) + '\n', 'utf8'); written++;
  }
  return { holons, fragments, files: written, stubs: stubs.length, links: links.length, bytes };
}

export function testProgram(root, outDir) {
  let passed = 0; const failures = [];
  (function visit(h) {
    for (const c of h.checks) {
      const p = path.join(outDir, c.file || '');
      if (c.file && fs.existsSync(p) && fs.readFileSync(p, 'utf8').includes(c.text)) passed++; else failures.push(h.id + ': ' + c.file + " lacks '" + c.text + "'");
    }
    for (const k of h.children) visit(k);
  })(root);
  return { passed, failed: failures.length, failures };
}

// compile a BRS given as text into outDir; throws when a check fails
export function compileText(text, outDir, name = 'the BRS') {
  const t0 = Date.now(), root = readBrs(text), r = writeProgram(root, outDir), c = testProgram(root, outDir);
  const report = `read ${name}  ->  ${r.holons} parts  ->  ${r.files} files (${r.bytes.toLocaleString('en')} bytes) in ${Date.now() - t0} ms; code fragments ${r.fragments}, stubs ${r.stubs}; checks: ${c.passed} passed, ${c.failed} failed`;
  if (c.failed) { const e = new Error(report + '\n' + c.failures.map((f) => '  FAIL ' + f).join('\n')); e.report = report; throw e; }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [cmd, file] = process.argv.slice(2), k = process.argv.indexOf('--out'), out = k > 0 ? process.argv[k + 1] : null;
  if (!['compile', 'check'].includes(cmd) || !file || !out) { console.error('usage: node fidelity.mjs compile|check <file.md> --out <dir>'); process.exit(2); }
  const text = fs.readFileSync(file, 'utf8');
  if (cmd === 'compile') { try { console.log(compileText(text, out, path.basename(file))); } catch (e) { console.error(e.message); process.exit(1); } }
  else { const c = testProgram(readBrs(text), out); console.log(`checks: ${c.passed} passed, ${c.failed} failed`); for (const f of c.failures) console.log('  FAIL ' + f); process.exit(c.failed ? 1 : 0); }
}
