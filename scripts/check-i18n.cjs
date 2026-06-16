#!/usr/bin/env node
/**
 * i18n consistency check.
 *
 * Fails (exit 1) when:
 *   - a key defined in one locale is missing from another (locales must match), or
 *   - a key referenced in code via t('key') is missing from the `en` dictionary
 *     (those silently fall back to the raw key string at runtime).
 *
 * Run locally with `npm run check:i18n`; runs in CI on every PR.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const I18N_FILE = path.join(ROOT, 'src/lib/i18n.tsx');
const LOCALES = ['en', 'he', 'fr'];

const src = fs.readFileSync(I18N_FILE, 'utf8');

// Locate each locale object block: `  en: {` … up to the next locale (or EOF).
function localeBounds(text) {
  const marks = LOCALES.map((loc) => {
    const m = text.match(new RegExp('\\n  ' + loc + ': \\{'));
    if (!m) throw new Error(`Could not find locale block "${loc}" in i18n.tsx`);
    return { loc, start: m.index };
  }).sort((a, b) => a.start - b.start);
  const bounds = {};
  marks.forEach((mk, i) => {
    bounds[mk.loc] = [mk.start, i + 1 < marks.length ? marks[i + 1].start : text.length];
  });
  return bounds;
}

const bounds = localeBounds(src);
const keyDef = /^\s{4,}([A-Za-z0-9_]+):\s/gm;
const localeKeys = {};
for (const loc of LOCALES) {
  const [s, e] = bounds[loc];
  const block = src.slice(s, e);
  const keys = new Set();
  let m;
  while ((m = keyDef.exec(block)) !== null) keys.add(m[1]);
  localeKeys[loc] = keys;
}

// Keys referenced in code as t('literal') / t("literal").
const used = new Set();
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue;
    const txt = fs.readFileSync(full, 'utf8');
    const re = /\bt\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(txt)) !== null) used.add(m[1]);
  }
}
walk(path.join(ROOT, 'src'));

const problems = [];

// 1) Locale parity.
const en = localeKeys.en;
for (const loc of LOCALES) {
  if (loc === 'en') continue;
  const missing = [...en].filter((k) => !localeKeys[loc].has(k)).sort();
  const extra = [...localeKeys[loc]].filter((k) => !en.has(k)).sort();
  if (missing.length) problems.push(`In en but MISSING in ${loc} (${missing.length}): ${missing.join(', ')}`);
  if (extra.length) problems.push(`In ${loc} but MISSING in en (${extra.length}): ${extra.join(', ')}`);
}

// 2) Used-in-code keys must exist in en.
const missingFromEn = [...used].filter((k) => !en.has(k)).sort();
if (missingFromEn.length) {
  problems.push(`Used in code but MISSING from en (${missingFromEn.length}): ${missingFromEn.join(', ')}`);
}

if (problems.length) {
  console.error('✗ i18n check failed:\n');
  for (const p of problems) console.error('  - ' + p + '\n');
  process.exit(1);
}

console.log(`✓ i18n check passed — ${en.size} keys, all locales (${LOCALES.join(', ')}) in sync.`);
