import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkContract, hash } from './check-help-contract.mjs';
function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'foody-contract-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const write=(file,value)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),typeof value==='string'?value:JSON.stringify(value));};
 const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe',encoding:'utf8'}).trim();
 git('init','-q');git('config','user.email','test@example.invalid');git('config','user.name','Fixture');
 write('src/app/example/page.tsx','export default function Page(){return null;}');
 const article={audience:'public',translations:{}};
 for(const lang of ['en','fr','he']) {const file=`src/content/help/${lang}/example/guide.mdx`;write(file,`guide ${lang}`);article.translations[lang]={path:file,sha256:hash(`guide ${lang}`)};}
 const release={schemaVersion:1,revision:'test',features:[{id:'example',article:'example/guide',audience:'public',operations:['do']}],articles:{'example/guide':article}};
 const contract={schemaVersion:1,service:'fixture',documentationRevision:'test',sources:{'src/app/example/page.tsx':{sha256:hash(fs.readFileSync(path.join(root,'src/app/example/page.tsx'))),features:['example']}},surfaces:[{kind:'next-page',features:['example']}],articles:release.articles};
 const save=()=>{write('docs/help/catalog/release.json',release);write('docs/help/contract.json',contract);};save();git('add','.');git('commit','-qm','fixture baseline');const base=git('rev-parse','HEAD');
 return {root,write,contract,release,base,save,git};
}
test('reviewed footprint and all three translations pass',t=>{const f=fixture(t);assert.deepEqual(checkContract(f.root,f.root,f.base),[]);});
test('a new screen cannot silently enter coverage',t=>{const f=fixture(t);f.write('src/app/new/page.tsx','new screen');assert.ok(checkContract(f.root,f.root,f.base).some(e=>e.includes('not inventoried')));});
test('editing reviewed bytes invalidates the review',t=>{const f=fixture(t);f.write('src/app/example/page.tsx','changed');assert.ok(checkContract(f.root,f.root,f.base).some(e=>e.includes('after documentation review')));});
test('deleting a source requires an inventory update',t=>{const f=fixture(t);fs.unlinkSync(path.join(f.root,'src/app/example/page.tsx'));assert.ok(checkContract(f.root,f.root,f.base).some(e=>e.includes('deleted source')));});
test('an unstaged tracked deletion still requires translated procedures after inventory removal',t=>{
 const f=fixture(t);
 fs.unlinkSync(path.join(f.root,'src/app/example/page.tsx'));
 delete f.contract.sources['src/app/example/page.tsx'];f.save();
 const errors=checkContract(f.root,f.root,f.base);
 assert.equal(errors.filter(e=>e.includes('guide update')).length,3);
 assert.equal(errors.filter(e=>e.includes('not inventoried')).length,0);
 for(const lang of ['en','fr','he']) {
  const tr=f.release.articles['example/guide'].translations[lang],text=`removed screen guide ${lang}`;
  f.write(tr.path,text);tr.sha256=hash(text);
 }
 f.save();assert.deepEqual(checkContract(f.root,f.root,f.base),[]);
});
test('a missing or stale translation fails',t=>{const f=fixture(t);fs.unlinkSync(path.join(f.root,f.release.articles['example/guide'].translations.he.path));assert.ok(checkContract(f.root,f.root,f.base).some(e=>e.includes('he translation')));});
test('refreshing only source hashes cannot waive three-language updates',t=>{const f=fixture(t);f.write('src/app/example/page.tsx','changed');f.contract.sources['src/app/example/page.tsx'].sha256=hash('changed');f.save();assert.equal(checkContract(f.root,f.root,f.base).filter(e=>e.includes('guide update')).length,3);});
test('all three authored procedure updates resolve a behavior change',t=>{const f=fixture(t);f.write('src/app/example/page.tsx','changed');f.contract.sources['src/app/example/page.tsx'].sha256=hash('changed');for(const lang of ['en','fr','he']){const tr=f.release.articles['example/guide'].translations[lang];f.write(tr.path,`changed guide ${lang}`);tr.sha256=hash(`changed guide ${lang}`);}f.save();assert.deepEqual(checkContract(f.root,f.root,f.base),[]);});
test('exact no-user-impact explanations are accepted and later edits invalidate them',t=>{const f=fixture(t);f.write('src/app/example/page.tsx','format only');f.contract.sources['src/app/example/page.tsx'].sha256=hash('format only');f.write('docs/help/reviews/format.json',{files:[{path:'src/app/example/page.tsx',sha256:hash('format only'),disposition:'no-user-impact',reason:'Whitespace-only formatting preserves the rendered page and every available user action.'}]});f.save();assert.deepEqual(checkContract(f.root,f.root,f.base),[]);f.write('src/app/example/page.tsx','new action');assert.ok(checkContract(f.root,f.root,f.base).length);});
test('invalid comparison refs fail closed',t=>{const f=fixture(t);assert.ok(checkContract(f.root,f.root,'does-not-exist').some(e=>e.includes('base does not exist')));});

test('local-only applications can validate without a Git repository',t=>{const f=fixture(t);fs.rmSync(path.join(f.root,'.git'),{recursive:true,force:true});assert.deepEqual(checkContract(f.root,f.root),[]);});

function sharedFixture(t) {
 const f=fixture(t), source='src/app/example/page.tsx';
 const ids=['pos-behavior','google-account-setup','delivery-dispatch'];
 f.release.features=[];f.release.articles={};
 for(const id of ids) {
  const article={audience:'public',translations:{}};
  for(const lang of ['en','fr','he']) {
   const file=`src/content/help/${lang}/shared/${id}.mdx`, text=`${id} guide ${lang}`;
   f.write(file,text);article.translations[lang]={path:file,sha256:hash(text)};
  }
  f.release.features.push({id,article:`shared/${id}`,audience:'public',operations:['do']});
  f.release.articles[`shared/${id}`]=article;
 }
 f.contract.articles=f.release.articles;f.contract.sources[source].features=ids;
 f.save();f.git('add','.');f.git('commit','-qm','shared feature baseline');f.base=f.git('rev-parse','HEAD');
 f.baseSha256=f.contract.sources[source].sha256;
 f.write(source,'new POS translation');f.contract.sources[source].sha256=hash('new POS translation');f.save();
 return f;
}
function scopedReview(f, extra={}) {
 f.write('docs/help/reviews/shared.json',{files:[{
  path:'src/app/example/page.tsx',sha256:f.contract.sources['src/app/example/page.tsx'].sha256,
  baseSha256:f.baseSha256,features:['google-account-setup','delivery-dispatch'],
  disposition:'no-user-impact',reason:'Only POS customer prompt translations change; the reviewed Google and delivery controls retain their exact behavior.',...extra,
 }]});
}
test('a scoped shared-file review exempts only the named feature',t=>{
 const f=sharedFixture(t);scopedReview(f,{features:['google-account-setup']});
 const errors=checkContract(f.root,f.root,f.base);
 assert.equal(errors.filter(e=>e.includes('pos-behavior changed')).length,3);
 assert.equal(errors.filter(e=>e.includes('delivery-dispatch changed')).length,3);
 assert.equal(errors.filter(e=>e.includes('google-account-setup changed')).length,0);
});
test('unreviewed POS behavior still requires all three translated guide updates',t=>{
 const f=sharedFixture(t);scopedReview(f);
 assert.equal(checkContract(f.root,f.root,f.base).filter(e=>e.includes('guide update')).length,3);
 for(const lang of ['en','fr']) {
  const tr=f.release.articles['shared/pos-behavior'].translations[lang],text=`updated POS guide ${lang}`;
  f.write(tr.path,text);tr.sha256=hash(text);
 }
 f.save();const errors=checkContract(f.root,f.root,f.base);
 assert.equal(errors.length,1);assert.ok(errors[0].includes('he guide update'));
 const tr=f.release.articles['shared/pos-behavior'].translations.he;
 f.write(tr.path,'updated POS guide he');tr.sha256=hash('updated POS guide he');f.save();
 assert.deepEqual(checkContract(f.root,f.root,f.base),[]);
});
test('invalid scoped reviews never become whole-file exemptions',async t=>{
 const invalid=[
  ['empty scope',{features:[]}],['duplicate scope',{features:['google-account-setup','google-account-setup']}],
  ['unknown scope',{features:['not-a-feature']}],['mixed unknown scope',{features:['google-account-setup','not-a-feature']}],
  ['string scope',{features:'google-account-setup'}],['null scope',{features:null}],
  ['stale current hash',{sha256:hash('older bytes')}],['stale base hash',{baseSha256:hash('another baseline')}],
  ['missing base hash',{baseSha256:undefined}],['null base hash',{baseSha256:null}],
  ['short reason',{reason:'No impact'}],
 ];
 for(const [name,overrides] of invalid)await t.test(name,st=>{
  const f=sharedFixture(st);scopedReview(f,overrides);
  assert.equal(checkContract(f.root,f.root,f.base).filter(e=>e.includes('guide update')).length,9);
 });
});
test('scope must be classified on the reviewed file, not merely in the release',t=>{
 const f=sharedFixture(t);f.contract.sources['src/app/example/page.tsx'].features=['pos-behavior'];f.save();
 scopedReview(f,{features:['google-account-setup']});
 assert.equal(checkContract(f.root,f.root,f.base).filter(e=>e.includes('pos-behavior changed')).length,3);
});
test('a scoped review cannot cover bytes changed after its approval',t=>{
 const f=sharedFixture(t);scopedReview(f);
 f.write('src/app/example/page.tsx','changed Google and POS controls');
 f.contract.sources['src/app/example/page.tsx'].sha256=hash('changed Google and POS controls');f.save();
 assert.equal(checkContract(f.root,f.root,f.base).filter(e=>e.includes('guide update')).length,9);
});
test('a scoped review cannot exempt a newly inventoried source without a baseline',t=>{
 const f=sharedFixture(t),source='src/app/new/page.tsx';
 f.write(source,'new POS screen');
 f.contract.sources[source]={sha256:hash('new POS screen'),features:['pos-behavior']};
 f.save();
 f.write('docs/help/reviews/new-source.json',{files:[{
  path:source,sha256:hash('new POS screen'),baseSha256:f.baseSha256,features:['pos-behavior'],
  disposition:'no-user-impact',reason:'A new screen has no reviewed baseline, so copying another file baseline must not waive its translated procedure updates.',
 }]});
 assert.equal(checkContract(f.root,f.root,f.base).filter(e=>e.startsWith(source+':')&&e.includes('guide update')).length,3);
});
