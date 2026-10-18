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
 return {root,write,contract,release,base,save};
}
test('reviewed footprint and all three translations pass',t=>{const f=fixture(t);assert.deepEqual(checkContract(f.root,f.root,f.base),[]);});
test('a new screen cannot silently enter coverage',t=>{const f=fixture(t);f.write('src/app/new/page.tsx','new screen');assert.ok(checkContract(f.root,f.root,f.base).some(e=>e.includes('not inventoried')));});
test('editing reviewed bytes invalidates the review',t=>{const f=fixture(t);f.write('src/app/example/page.tsx','changed');assert.ok(checkContract(f.root,f.root,f.base).some(e=>e.includes('after documentation review')));});
test('deleting a source requires an inventory update',t=>{const f=fixture(t);fs.unlinkSync(path.join(f.root,'src/app/example/page.tsx'));assert.ok(checkContract(f.root,f.root,f.base).some(e=>e.includes('deleted source')));});
test('a missing or stale translation fails',t=>{const f=fixture(t);fs.unlinkSync(path.join(f.root,f.release.articles['example/guide'].translations.he.path));assert.ok(checkContract(f.root,f.root,f.base).some(e=>e.includes('he translation')));});
test('refreshing only source hashes cannot waive three-language updates',t=>{const f=fixture(t);f.write('src/app/example/page.tsx','changed');f.contract.sources['src/app/example/page.tsx'].sha256=hash('changed');f.save();assert.equal(checkContract(f.root,f.root,f.base).filter(e=>e.includes('guide update')).length,3);});
test('all three authored procedure updates resolve a behavior change',t=>{const f=fixture(t);f.write('src/app/example/page.tsx','changed');f.contract.sources['src/app/example/page.tsx'].sha256=hash('changed');for(const lang of ['en','fr','he']){const tr=f.release.articles['example/guide'].translations[lang];f.write(tr.path,`changed guide ${lang}`);tr.sha256=hash(`changed guide ${lang}`);}f.save();assert.deepEqual(checkContract(f.root,f.root,f.base),[]);});
test('exact no-user-impact explanations are accepted and later edits invalidate them',t=>{const f=fixture(t);f.write('src/app/example/page.tsx','format only');f.contract.sources['src/app/example/page.tsx'].sha256=hash('format only');f.write('docs/help/reviews/format.json',{files:[{path:'src/app/example/page.tsx',sha256:hash('format only'),disposition:'no-user-impact',reason:'Whitespace-only formatting preserves the rendered page and every available user action.'}]});f.save();assert.deepEqual(checkContract(f.root,f.root,f.base),[]);f.write('src/app/example/page.tsx','new action');assert.ok(checkContract(f.root,f.root,f.base).length);});
test('invalid comparison refs fail closed',t=>{const f=fixture(t);assert.ok(checkContract(f.root,f.root,'does-not-exist').some(e=>e.includes('base does not exist')));});

test('local-only applications can validate without a Git repository',t=>{const f=fixture(t);fs.rmSync(path.join(f.root,'.git'),{recursive:true,force:true});assert.deepEqual(checkContract(f.root,f.root),[]);});
