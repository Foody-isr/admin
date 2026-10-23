import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
/** Digests the exact reviewed bytes. */
export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
/** Defines the application footprint, excluding generated code and tests. */
export const isSource = file => /^(?:src|app|components|lib|services|store|internal|config|cmd|ios\/Runner|ios\/AppIntents|android\/app\/src)\//.test(file)
 && /\.(?:tsx?|jsx?|mjs|css|go|dart|swift|kt|json|arb)$/.test(file)
 && !/(?:^|\/)(?:__tests__|test|tests|node_modules|build|Pods|\.dart_tool|generated|l10n\/app_localizations[^/]*)(?:\/|$)|(?:\.test|\.spec|_test|\.g|\.freezed)\./.test(file);
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function sourceFiles(root) {
 let top;
 try { top=git(root,'rev-parse','--show-toplevel'); } catch { /* Local-only application. */ }
 if(top===path.resolve(root)) return [...new Set((git(root,'ls-files')+'\n'+git(root,'ls-files','--others','--exclude-standard')).split('\n').filter(isSource))];
 const walk=(directory='')=>fs.readdirSync(path.join(root,directory),{withFileTypes:true}).flatMap(item=>{
  if(item.name.startsWith('.')||['node_modules','Pods','build','vendor'].includes(item.name))return [];
  const file=path.posix.join(directory,item.name);
  return item.isDirectory()?walk(file):item.isFile()&&isSource(file)?[file]:[];
 });
 return walk();
}

/** Checks the exact reviewed source footprint, all translations and behavior-change evidence. */
export function checkContract(root, docsRoot, base) {
 const errors = [];
 const contract = read(path.join(root, 'docs/help/contract.json'));
 const release = read(path.join(docsRoot, 'docs/help/catalog/release.json'));
 if (contract.schemaVersion !== 1 || release.schemaVersion !== 1) errors.push('Unsupported help contract schema.');
 if (contract.documentationRevision !== release.revision) errors.push('Documentation release differs from the reviewed contract.');
 if (release.features.some(f => !f.operations?.length)) errors.push('A feature has no documented operations.');
 for (const [id, article] of Object.entries(release.articles)) for (const lang of ['en','fr','he']) {
  const translation = article.translations?.[lang];
  if (!translation || !/^(src\/content\/help\/|docs\/help\/internal\/)/.test(translation.path) || translation.path.includes('..')) { errors.push(`${id}: missing/invalid ${lang} translation.`); continue; }
  const file = path.join(docsRoot, translation.path);
  if (!fs.existsSync(file) || hash(fs.readFileSync(file)) !== translation.sha256) errors.push(`${id}: ${lang} translation is stale.`);
 }
 const files = sourceFiles(root);
 for (const file of files) {
  const expected = contract.sources[file];
  if (!expected) { errors.push(`${file}: new source is not inventoried.`); continue; }
  if (!fs.existsSync(path.join(root,file)) || hash(fs.readFileSync(path.join(root,file))) !== expected.sha256) errors.push(`${file}: source changed after documentation review.`);
  if (!expected.features.length) errors.push(`${file}: source has no feature or explicit technical classification.`);
  for (const feature of expected.features) if (!release.features.some(f => f.id === feature)) errors.push(`${file}: unknown feature ${feature}.`);
 }
 for (const file of Object.keys(contract.sources)) if (!files.includes(file) || !fs.existsSync(path.join(root,file))) errors.push(`${file}: deleted source remains in the inventory.`);
 if (!contract.surfaces.length || contract.surfaces.some(s => !s.features.length)) errors.push('Source surface classification is incomplete.');
 let previous;
 if (base) {
  try { previous = JSON.parse(git(root,'show',`${base}:docs/help/contract.json`)); }
  catch (error) {
   // Only bootstrap may lack a contract. Invalid refs/JSON must fail closed.
   try { git(root,'cat-file','-e',`${base}^{commit}`); } catch { errors.push('Help comparison base does not exist.'); }
   try { git(root,'cat-file','-e',`${base}:docs/help/contract.json`); errors.push('Base help contract is invalid.'); } catch { /* First installation. */ }
  }
 }
 if (previous) {
  const changed = [...new Set([...Object.keys(previous.sources), ...Object.keys(contract.sources)])].filter(file => previous.sources[file]?.sha256 !== contract.sources[file]?.sha256);
  const reviewsDir = path.join(root,'docs/help/reviews');
  const reviews = fs.existsSync(reviewsDir) ? fs.readdirSync(reviewsDir).filter(f => f.endsWith('.json')).flatMap(file => { const r=read(path.join(reviewsDir,file)); return Array.isArray(r.files) ? r.files.map(f => ({...f,reason:f.reason || r.reason})) : []; }) : [];
  for (const file of changed) {
   const source = contract.sources[file] || previous.sources[file];
   const currentHash = contract.sources[file]?.sha256 || 'deleted';
   const exactReviews = reviews.filter(r => r.path===file && r.sha256===currentHash && r.disposition==='no-user-impact' && typeof r.reason==='string' && r.reason.trim().length>=50);
   // Legacy reviews cover the whole file. An explicit scope, even invalid or
   // empty, must never fall back to that broader exemption.
   if (exactReviews.some(r => !Object.hasOwn(r,'features'))) continue;
   const reviewedFeatures = new Set(exactReviews.filter(r =>
    Array.isArray(r.features) && r.features.length>0 && new Set(r.features).size===r.features.length &&
    r.features.every(id => typeof id==='string' && source.features.includes(id) && release.features.some(f => f.id===id)) &&
    typeof r.baseSha256==='string' && /^[a-f0-9]{64}$/.test(r.baseSha256) && r.baseSha256===previous.sources[file]?.sha256
   ).flatMap(r => r.features));
   const publicFeatures = source.features.filter(id => release.features.find(f => f.id===id)?.audience==='public');
   const affected = publicFeatures.length ? publicFeatures : source.features;
   for (const featureId of affected) {
    if (reviewedFeatures.has(featureId)) continue;
    const feature = release.features.find(f=>f.id===featureId);
    const article = release.articles[feature?.article];
    if (!article) {errors.push(`${file}: missing guide for ${featureId}.`);continue;}
    for (const lang of ['en','fr','he']) if (article.translations[lang].sha256 === previous.articles?.[feature.article]?.translations?.[lang]?.sha256) errors.push(`${file}: ${featureId} changed without a ${lang} guide update or exact no-user-impact review.`);
   }
  }
 }
 if (contract.service==='foodyserver') {
  const embedded=path.join(root,'internal/support/corpus.json');
  const canonical=path.join(docsRoot,'docs/help/catalog/public-corpus.json');
  if (!fs.existsSync(embedded)||hash(fs.readFileSync(embedded))!==hash(fs.readFileSync(canonical))) errors.push('Embedded AI corpus differs from the published public documentation.');
 }
 return errors;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const argument = name => {const at=process.argv.indexOf(name);return at<0?undefined:process.argv[at+1];};
 const root=process.cwd(), docsRoot=path.resolve(argument('--documentation-root') || root);
 const errors=checkContract(root,docsRoot,argument('--base'));
 if(errors.length){console.error(errors.join('\n'));process.exit(1);}
 console.log('Help contract: source hashes, feature coverage, FR/HE/EN guides and corpus agree.');
}
