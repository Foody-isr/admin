#!/usr/bin/env node
// Regenerates src/lib/google-fonts-catalog.json from Google's public font
// metadata (no API key). Run `npm run fonts:catalog` whenever the catalog
// should pick up newly published Google Fonts families.
//
// Output entry shape (short keys keep the lazy-loaded chunk small):
//   { f: family, c: category, w: weights, h: supportsHebrew, p: popularity }

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const METADATA_URL = 'https://fonts.google.com/metadata/fonts';
const OUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'src', 'lib', 'google-fonts-catalog.json',
);

const CATEGORY_MAP = {
  'Sans Serif': 'sans',
  'Serif': 'serif',
  'Display': 'display',
  'Handwriting': 'handwriting',
  'Monospace': 'mono',
};

const res = await fetch(METADATA_URL);
if (!res.ok) throw new Error(`Google Fonts metadata fetch failed: ${res.status}`);
let raw = await res.text();
// The endpoint prefixes its JSON with an XSSI guard line.
if (raw.startsWith(")]}'")) raw = raw.slice(raw.indexOf('\n') + 1);
const { familyMetadataList } = JSON.parse(raw);

const entries = familyMetadataList
  .map((fam) => {
    const weights = Object.keys(fam.fonts ?? {})
      .filter((k) => !k.endsWith('i'))
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (weights.length === 0) return null;
    return {
      f: fam.family,
      c: CATEGORY_MAP[fam.category] ?? 'display',
      w: weights,
      h: (fam.subsets ?? []).includes('hebrew'),
      p: fam.popularity ?? 9999,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.p - b.p);

await writeFile(OUT_PATH, JSON.stringify(entries));
console.log(`Wrote ${entries.length} families to ${path.relative(process.cwd(), OUT_PATH)}`);
