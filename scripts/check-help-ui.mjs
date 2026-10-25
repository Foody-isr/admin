import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const normalized = value => value.normalize('NFKC').replaceAll('*', '').toLowerCase();

/** Checks reviewed guide claims against translations and the actual Admin route/editor sources. */
export function checkUIEvidence(documentationRoot, adminRoot) {
  const errors = [];
  const manifest = JSON.parse(fs.readFileSync(path.join(documentationRoot, 'docs/help/ui-evidence.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.repository !== 'Foody-isr/admin' || !/^[a-f0-9]{40}$/.test(manifest.ref)) return ['Invalid immutable Admin UI evidence reference.'];
  if (!manifest.guides?.length || !manifest.observations?.length) return ['Missing reviewed UI claims.'];
  for (const guide of manifest.guides) {
    if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(guide.article)) { errors.push('Invalid guide reference.'); continue; }
    for (const lang of ['fr', 'he', 'en']) {
      const file = path.join(documentationRoot, 'src/content/help', lang, guide.article + '.mdx');
      if (!fs.existsSync(file)) { errors.push(guide.article + ': missing ' + lang); continue; }
      const text = normalized(fs.readFileSync(file, 'utf8'));
      if (!guide.required?.[lang]?.length) errors.push(guide.article + ': missing ' + lang + ' UI claim review.');
      for (const value of guide.required?.[lang] || []) if (!text.includes(normalized(value))) errors.push(guide.article + ': ' + lang + ' missing reviewed UI wording: ' + value);
      for (const value of guide.forbidden?.[lang] || []) if (text.includes(normalized(value))) errors.push(guide.article + ': ' + lang + ' describes obsolete UI: ' + value);
    }
  }
  if (adminRoot) for (const observation of manifest.observations) {
    if (!observation.source.startsWith('src/') || observation.source.split('/').includes('..')) { errors.push('Invalid UI source path.'); continue; }
    const file = path.join(adminRoot, observation.source);
    if (!fs.existsSync(file)) { errors.push(observation.id + ': current UI source missing.'); continue; }
    const source = fs.readFileSync(file, 'utf8');
    for (const value of observation.required || []) if (!source.includes(value)) errors.push(observation.id + ': UI changed; review guide and evidence: ' + value);
    for (const value of observation.forbidden || []) if (source.includes(value)) errors.push(observation.id + ': obsolete UI assertion no longer holds: ' + value);
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argument = name => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1]; };
  const errors = checkUIEvidence(path.resolve(argument('--documentation-root') || '.'), argument('--admin-root'));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('Current Admin UI claims and FR/HE/EN guide wording agree' + (argument('--admin-root') ? ' with route/editor sources.' : '.'));
}
