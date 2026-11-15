// The jam's two documents as PDFs: docs/jam/gdd.html and docs/jam/budget.html printed by the installed Chrome (playwright-core, headless), the
// way the first PDFs were made by hand (Chrome's print, A4, the pages' own @page margins). Nothing to install.
// Usage: node scripts/jam/make-pdfs.mjs [outDir]   (default F:/ClaudeTemp/jam; writes golf-manager-2026-gdd.pdf and golf-manager-2026-budget.pdf)
import { chromium } from 'playwright-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, statSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = resolve(process.argv[2] ?? 'F:/ClaudeTemp/jam');
mkdirSync(out, { recursive: true });
const docs = [['gdd.html', 'golf-manager-2026-gdd.pdf'], ['budget.html', 'golf-manager-2026-budget.pdf']];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  for (const [src, pdf] of docs) {
    await page.goto(pathToFileURL(join(root, 'docs', 'jam', src)).href, { waitUntil: 'load' });
    const path = join(out, pdf);
    await page.pdf({ path, format: 'A4', preferCSSPageSize: true, printBackground: true });
    console.log(`${pdf}: ${(statSync(path).size / 1024).toFixed(0)} KB`);
  }
} finally { await browser.close(); }
