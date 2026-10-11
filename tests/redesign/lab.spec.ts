import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
import type { Draft, DraftPayload, RecipeVersion } from '../../src/app/[restaurantId]/kitchen/lab/types';

function payload(manual=true):DraftPayload {
  return {creation_mode:manual?'manual':'ai',has_existing_recipe:true,menu_item:{name_primary:manual?'Recette démo':'Création démo',name_he:'מתכון לדוגמה'},components:[{kind:'stock_existing',stock_item_id:'1',name_primary:'Tomates de saison',qty:250,unit:'g',waste_pct:0,cost_per_unit:16,line_cost:4,cost_status:'verified',available_units:['g','kg','Pièce']}],recipe_steps:[{order:1,instruction_primary:'Préparer les tomates · להכין',instruction_he:''}],cost_summary:{total_estimated_cost:4,verified_cost:4,estimated_cost:0,unknown_cost_count:0,cost_status:'verified',selling_price:48,target_pct:.35,food_cost_pct:4/48,verdict:'ok',contribution_margin:44,margin_pct:44/48},brief:{objective:manual?'document_recipe':'refresh_menu',stock_policy:'prefer_existing',creativity:45},context:{currency:'ILS',average_price:40,min_price:20,max_price:80},creative:{rationale:'Une recette de démonstration pour vérifier l’interface.'},metrics:{stock_reuse_pct:100,menu_fit_score:82,operational_score:90,complexity_score:10,prep_count:0,ingredient_count:1,recommendations:[]},revision:1};
}
async function installLab(page:Page,options:{locale?:string;theme?:string;readOnly?:boolean;empty?:boolean}={}) {
 const fixtureOptions={permissions:options.readOnly?['kitchen.view']:undefined,unitLibrary:true};
 const fixture=createFixture(fixtureOptions);
 const drafts:Draft[]=[{id:11,restaurant_id:1,dish_name:'Recette démo',menu_item_id:1,status:'ready',payload:payload(),chat_history:[],created_at:'2026-10-01T10:00:00Z',updated_at:'2026-10-01T10:00:00Z'},{id:12,restaurant_id:1,dish_name:'Création démo',status:'ready',payload:payload(false),chat_history:[{role:'assistant',content:'Conversation déjà enregistrée.',timestamp:'2026-10-01T10:00:00Z'}],created_at:'2026-10-01T10:00:00Z',updated_at:'2026-10-01T10:00:00Z'}];
 if(options.empty)drafts.length=0;
 const writes:{path:string;body:any;restaurant:number;method:string}[]=[];
 const versions:RecipeVersion[]=[{id:71,restaurant_id:1,menu_item_id:1,version:1,objective:'document_recipe',change_summary:'Version de démonstration',payload:payload(),food_cost:4,selling_price:48,cost_status:'verified',created_by_id:1,created_at:'2026-09-30T10:00:00Z'}];
 const faults={patch:0,list:0,get:0,target:0,targetSave:0,restoreList:0,restorePatch:0,refine:0,commitLost:0,discard:0,generate:0,images:0,parse:0,patchDelay:0,parseDelay:0};
 let target=.275;let imageId=1;let inFlight=0;let maxInFlight=0;
 await page.addInitScript(({locale,theme})=>{localStorage.setItem('foody_restaurant_token','isolated-ui-fixture');localStorage.setItem('foody_restaurant_user',JSON.stringify({id:1,full_name:'Équipe démo',role:'owner',email:'demo@foody.test'}));localStorage.setItem('foody_restaurant_ids','[1,2]');localStorage.setItem('foody-admin-locale',locale);localStorage.setItem('foody_admin_theme',theme);},{locale:options.locale??'fr',theme:options.theme??'light'});
 await page.route('**/api/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method(),body=req.postDataJSON()??{},restaurant=Number(req.headers()['x-restaurant-id'])||1;
  const send=(json:unknown,status=200)=>route.fulfill({status,json});
  const fail=()=>send({error:'Échec synthétique du Lab'},503);
  const consume=(key:keyof typeof faults)=>{if(faults[key]>0){faults[key]--;return true;}return false;};
  if(path.startsWith('/api/v1/lab/')||path==='/api/v1/restaurants/settings/food-cost-target'){
   if(method!=='GET')writes.push({path,body,restaurant,method});
   if(path.endsWith('/food-cost-target')){if(method==='GET'){if(consume('target'))return fail();return send({food_cost_target_pct:target});}if(consume('targetSave'))return fail();target=body.food_cost_target_pct;return send({food_cost_target_pct:target});}
   if(path==='/api/v1/lab/drafts'){if(consume('list'))return fail();return send(drafts.filter(d=>d.restaurant_id===restaurant&&['ready','generating','error'].includes(d.status)));}
   if(path.endsWith('/drafts/manual')){const next={...drafts[0],id:20,restaurant_id:restaurant,dish_name:'Recette ouverte',menu_item_id:body.menu_item_id,status:'ready' as const,payload:payload(),created_at:'2026-10-01T10:00:00Z',updated_at:'2026-10-01T10:00:00Z'};drafts.push(next);return send(next);}
   if(path.endsWith('/drafts/generate')){if(consume('generate'))return fail();const next={id:21,restaurant_id:restaurant,dish_name:body.dish_names?.[0]??'Article proposé',status:'generating' as const,created_at:'2026-10-01T10:00:00Z',updated_at:'2026-10-01T10:00:00Z'};drafts.push(next);return send({drafts:[next]});}
   if(path.includes('/versions')){if(path.endsWith('/restore')){faults.patch+=faults.restorePatch;faults.restorePatch=0;const restored=structuredClone(versions[0].payload);restored.components[0].qty=100;return send(restored);}if(consume('restoreList'))return fail();return send({versions});}
   const draft=drafts.find(d=>d.id===Number(path.split('/')[5])&&d.restaurant_id===restaurant);if(!draft)return send({error:'Draft not found'},404);
   if(path.endsWith('/refine')){if(consume('refine'))return fail();return send({assistant_message:'Quantité ajustée.',patches:[{op:'set_qty',path:'components[0]',new_qty:180}]});}
   if(path.endsWith('/images/generate')){if(consume('images'))return fail();return send({generation_id:imageId++,image_b64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',rendered_prompt:'Fixture',recipe_revision:draft.payload!.revision});}
   if(path.endsWith('/images/confirm')){draft.payload!.selected_image_url='/brand/foody-symbol.svg';return send({image_url:draft.payload!.selected_image_url,recipe_revision:draft.payload!.revision});}
   if(path.endsWith('/import-text')){if(faults.parseDelay)await new Promise(resolve=>setTimeout(resolve,faults.parseDelay));if(consume('parse'))return fail();return send({components:[{kind:'stock_existing',stock_item_id:'2',name_primary:'Tahini',qty:20,unit:'g',cost_status:'verified',line_cost:.72}],recipe_steps:[],entries:[{source:'Tahini 20 g',name:'Tahini',kind:'stock',status:'matched',quantity:20,unit:'g'}],warnings:[],summary:{component_count:1,preparation_count:0,ingredient_count:1,matched_count:1,new_count:0,step_count:0}});}
   if(path.endsWith('/commit')){draft.status='committed';if(consume('commitLost'))return fail();return send({menu_item_id:'1',created:{stock_items:[],prep_items:[]},linked:{stock_items:['1'],prep_items:[]}});}
   if(method==='PATCH'){inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);try{if(faults.patchDelay)await new Promise(resolve=>setTimeout(resolve,faults.patchDelay));if(consume('patch'))return fail();if(!body.components?.length || body.components.some((component:any)=>component.qty<=0))return send({error:'Invalid recipe quantity'},400);if(draft.status!=='ready')return send({error:'Draft not editable'},409);const canonical=structuredClone(body) as DraftPayload;canonical.revision++;draft.payload=canonical;return send(canonical);}finally{inFlight--;}}
   if(method==='DELETE'){if(consume('discard'))return fail();draft.status='discarded';return route.fulfill({status:204});}
   if(consume('get'))return fail();return send(draft);
  }
  const result=fixture.response(req.url(),method,body,restaurant);return send(result.json??{},result.status??200);
 });
 await page.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.fallback():route.abort());
 return {drafts,writes,faults,versions,fixture,get maxInFlight(){return maxInFlight;}};
}
async function open(page:Page,name='Recette démo'){await page.goto('/1/kitchen/lab');await page.getByRole('button',{name:new RegExp(name)}).click();await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();}
const qty=(page:Page)=>page.getByRole('spinbutton',{name:'Qté · Tomates de saison',exact:true});
const patches=(state:Awaited<ReturnType<typeof installLab>>)=>state.writes.filter(w=>w.method==='PATCH');

for(const locale of ['fr','he'])test(`lab manual review and keyboard ingredient library ${locale}`,async({page},info)=>{
 await page.setViewportSize({width:locale==='fr'?375:1440,height:950});const state=await installLab(page,{locale,theme:locale==='he'?'dark':'light'});await open(page);
 await page.getByRole('button',{name:locale==='fr'?'Ajouter':'הוספה',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await dialog.getByRole('tab').first().focus();await page.keyboard.press(locale==='he'?'ArrowLeft':'ArrowRight');await expect(dialog.getByRole('tab').nth(1)).toHaveAttribute('aria-selected','true');await page.screenshot({path:info.outputPath(`lab-library-${locale}.png`)});await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await page.screenshot({path:info.outputPath(`lab-manual-${locale}.png`)});expect(state.writes).toHaveLength(0);expect(state.fixture.unhandled).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test('lab serializes rapid autosaves and commits the final canonical draft',async({page})=>{
 const state=await installLab(page);state.faults.patchDelay=900;await open(page);await qty(page).fill('300');await expect.poll(()=>patches(state).length).toBe(1);await qty(page).fill('450');await page.getByRole('button',{name:'Enregistrer cette fiche recette',exact:true}).last().click();await page.getByRole('alertdialog').getByRole('button',{name:'Enregistrer la recette',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Recette enregistrée dans l’article.'})).toBeVisible();expect(state.maxInFlight).toBe(1);expect(patches(state).map(w=>w.body.components[0].qty)).toEqual([300,450]);expect(patches(state).map(w=>w.body.revision)).toEqual([1,2]);expect(state.writes.find(w=>w.path.endsWith('/commit'))?.body.components[0].qty).toBe(450);
});

test('lab failed autosave preserves input and retries before leaving the draft',async({page})=>{
 const state=await installLab(page);state.faults.patch=2;await open(page);await qty(page).fill('125');await expect(page.locator('main [role=alert]').filter({hasText:'Échec synthétique'})).toBeVisible();await expect(qty(page)).toHaveValue('125');await page.getByRole('button',{name:'Retour à mes créations',exact:true}).click();await expect(page.getByRole('alertdialog')).toContainText('ne sont pas enregistrés');await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Coûts à jour'})).toBeVisible();await page.getByRole('button',{name:'Retour à mes créations',exact:true}).click();await page.getByRole('button',{name:/Création démo/}).click();await expect(page.getByRole('heading',{name:'Création démo',exact:true})).toBeVisible();expect(state.drafts[0].payload!.components[0].qty).toBe(125);expect(state.drafts[1].payload!.components[0].qty).toBe(250);
});

test('lab reconciles a lost commit response without patching or committing again',async({page})=>{
 const state=await installLab(page);state.faults.commitLost=1;await open(page);await page.getByRole('button',{name:'Enregistrer cette fiche recette',exact:true}).last().click();await page.getByRole('alertdialog').getByRole('button',{name:'Enregistrer la recette',exact:true}).click();await expect(page.locator('main [role=alert]').filter({hasText:'Vérifiez l’état'})).toBeVisible();await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Recette enregistrée'})).toBeVisible();expect(state.writes.filter(w=>w.path.endsWith('/commit'))).toHaveLength(1);expect(patches(state)).toHaveLength(0);
});

test('lab queue and draft failures have independent retry states',async({page})=>{
 const state=await installLab(page);state.faults.list=100;await page.goto('/1/kitchen/lab');await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');state.faults.list=0;await page.getByRole('button',{name:'Réessayer',exact:true}).click();state.faults.get=100;await page.getByRole('button',{name:/Recette démo/}).click();await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');state.faults.get=0;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(qty(page)).toBeVisible();expect(state.writes).toHaveLength(0);
});

test('lab target keeps its historical value and reverts a failed immediate update',async({page})=>{
 const state=await installLab(page);state.faults.targetSave=1;await page.goto('/1/kitchen/lab');const select=page.getByRole('combobox',{name:'Coût alimentaire cible'});await expect(select).toHaveValue('0.275');await select.selectOption('0.3');await expect(select).toHaveValue('0.275');await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');await select.selectOption('0.4');await expect(select).toHaveValue('0.4');expect(state.writes.at(-1)?.body).toEqual({food_cost_target_pct:.4});
});

test('lab target load failure does not display an invented 35 percent',async({page})=>{
 const state=await installLab(page);state.faults.target=100;await page.goto('/1/kitchen/lab');const select=page.getByRole('combobox',{name:'Coût alimentaire cible'});await expect(select).toHaveValue('');await expect(page.locator('main [role=alert]')).toBeVisible();state.faults.target=0;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(select).toHaveValue('0.275');expect(state.writes).toHaveLength(0);
});

test('lab manual starter uses accessible catalog selection and current restaurant',async({page})=>{
 const state=await installLab(page);await page.goto('/2/kitchen/lab');await page.getByRole('button').filter({hasText:'Créer la fiche recette d’un plat existant'}).click();await page.getByRole('button',{name:'Choisir un plat existant',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('radio').first().check();await dialog.getByRole('button',{name:'Ouvrir la fiche recette',exact:true}).click();await expect(page.getByRole('heading',{name:'Recette démo',exact:true})).toBeVisible();const write=state.writes.find(w=>w.path.endsWith('/manual'));expect(write?.restaurant).toBe(2);expect(write?.body).toEqual({menu_item_id:1,locale:'fr'});expect(state.fixture.unhandled).toEqual([]);
});

test('lab read-only review cannot mutate drafts or restore recipe versions',async({page})=>{
 const state=await installLab(page,{readOnly:true});await open(page);await expect(page.getByRole('spinbutton')).toHaveCount(0);await expect(page.getByRole('button',{name:'Supprimer ce brouillon'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Restaurer cette version v1',exact:true})).toBeDisabled();expect(state.writes).toHaveLength(0);
});

test('lab draft deletion asks for confirmation and keeps a failed deletion available',async({page})=>{
 const state=await installLab(page);state.faults.discard=1;await open(page);await page.getByRole('button',{name:'Supprimer ce brouillon',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();expect(state.writes).toHaveLength(0);await page.getByRole('button',{name:'Supprimer ce brouillon',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Supprimer',exact:true}).click();await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');await page.getByRole('button',{name:'Supprimer ce brouillon',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Supprimer',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Brouillon supprimé'})).toBeVisible();await expect(page.getByRole('button',{name:/Recette démo/})).toHaveCount(0);
});

test('lab refinement flushes edits first, retains failed text and server history',async({page},info)=>{
 const state=await installLab(page);await open(page,'Création démo');await qty(page).fill('350');await page.getByRole('button',{name:"✨ Affiner avec l'IA",exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Conversation déjà enregistrée');await dialog.getByRole('textbox').fill('Réduire la portion');state.faults.refine=1;await dialog.getByRole('button',{name:'Envoyer',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Échec synthétique');await expect(dialog.getByRole('textbox')).toHaveValue('Réduire la portion');await dialog.getByRole('button',{name:'Envoyer',exact:true}).click();await expect(dialog.getByRole('log')).toContainText('Quantité ajustée.');await expect.poll(()=>state.drafts[1].payload!.components[0].qty).toBe(180);await page.screenshot({path:info.outputPath('lab-refine-fr.png')});expect(state.writes[0].method).toBe('PATCH');expect(state.writes[1].path).toContain('/refine');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});

test('lab version restoration resumes after draft-save failure without restoring twice',async({page})=>{
 const state=await installLab(page);state.faults.restorePatch=1;await open(page);await page.getByRole('button',{name:'Restaurer cette version v1',exact:true}).click();await expect(page.getByRole('alertdialog')).toContainText('remplace immédiatement');await page.getByRole('alertdialog').getByRole('button',{name:'Restaurer cette version',exact:true}).click();await expect(page.locator('main [role=alert]').filter({hasText:'La recette de l’article est restaurée'})).toBeVisible();await page.locator('main [role=alert]').filter({hasText:'La recette de l’article est restaurée'}).getByRole('button',{name:'Réessayer'}).click();await expect(qty(page)).toHaveValue('100');await expect(page.locator('main [role=alert]')).toHaveCount(0);expect(state.writes.filter(w=>w.path.endsWith('/restore'))).toHaveLength(1);
});

test('lab images preserve partial results, reject stale previews and retain confirmation on later edits',async({page},info)=>{
 const state=await installLab(page);await open(page,'Création démo');state.faults.images=1;await page.getByRole('button',{name:'Générer 3 visuels',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'2 images sur 3'})).toBeVisible();await qty(page).fill('200');await expect(page.getByRole('status').filter({hasText:'Coûts à jour'})).toBeVisible();await page.getByRole('button',{name:'Choisir 1',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'La recette a changé'})).toBeVisible();expect(state.writes.filter(w=>w.path.endsWith('/images/confirm'))).toHaveLength(0);await page.getByRole('button',{name:'Générer 3 visuels',exact:true}).click();await page.getByRole('button',{name:'Choisir 1',exact:true}).click();await expect.poll(()=>state.drafts[1].payload!.selected_image_url).toBe('/brand/foody-symbol.svg');await qty(page).fill('210');await expect.poll(()=>patches(state).at(-1)?.body.components[0].qty).toBe(210);expect(patches(state).at(-1)?.body.selected_image_url).toBe('/brand/foody-symbol.svg');await page.getByRole('heading',{name:'Studio visuel du plat',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('lab-images-fr.png')});
});

test('lab ignores an outdated text parsing result and preserves existing recipe steps',async({page})=>{
 const state=await installLab(page);await open(page);await page.getByRole('button').filter({hasText:'Écrire ou dicter la recette'}).click();const notes=page.getByRole('textbox',{name:'Notes du chef',exact:true});await notes.fill('Tahini 20 g');state.faults.parseDelay=600;await page.getByRole('button',{name:'Extraire la recette',exact:true}).click();await notes.fill('Autre recette');await expect(page.getByRole('button',{name:'Extraire la recette',exact:true})).toBeEnabled();await expect(page.getByText('Tahini',{exact:true})).toHaveCount(0);await notes.fill('Tahini 20 g');await page.getByRole('button',{name:'Extraire la recette',exact:true}).click();await expect(page.getByText('Tahini',{exact:true})).toBeVisible();const buttons=page.getByRole('button',{name:'Utiliser cette recette',exact:true});await expect(buttons).toHaveCount(1);await buttons.click();await expect.poll(()=>state.drafts[0].payload!.components[0].name_primary).toBe('Tahini');expect(state.drafts[0].payload!.recipe_steps[0].instruction_primary).toContain('Préparer les tomates');
});

test('lab library preserves gram and millilitre defaults and custom stock units',async({page})=>{
 const state=await installLab(page);state.drafts[0].payload!.components=[];await open(page);await page.getByRole('button',{name:'Ajouter',exact:true}).click();await page.getByRole('dialog').getByRole('button').filter({hasText:'Tomates de saison'}).click();await expect(qty(page)).toHaveValue('100');await expect(page.getByRole('combobox',{name:'Unité · Tomates de saison'}).getByRole('option',{name:'Pièce',exact:true})).toHaveCount(1);await page.getByRole('button',{name:'Ajouter',exact:true}).click();await page.getByRole('dialog').getByRole('tab').filter({hasText:'Préparations'}).click();await page.getByRole('dialog').getByRole('button').filter({hasText:'Sauce tomate'}).click();await expect(page.getByRole('spinbutton',{name:'Qté · Sauce tomate'})).toHaveValue('100');await expect(page.getByRole('combobox',{name:'Unité · Sauce tomate'})).toHaveValue('ml');await expect.poll(()=>state.drafts[0].payload!.components.length).toBe(2);
});

test('lab AI brief preserves failed input and shows the accepted proposal in the shared queue',async({page},info)=>{
 const state=await installLab(page,{empty:true});state.faults.generate=1;await page.goto('/1/kitchen/lab');await page.getByRole('button').filter({hasText:'Commencer un brief IA'}).click();const ideas=page.locator('#lab-dish-ideas');await ideas.fill('Plat démo\nAutre plat');await page.getByRole('button').filter({hasText:'Créer les propositions'}).click();await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');await expect(ideas).toHaveValue('Plat démo\nAutre plat');await page.getByRole('button').filter({hasText:'Créer les propositions'}).click();await expect(page.getByRole('button',{name:/Plat démo.*En cours de création/})).toBeVisible();const sent=state.writes.at(-1)!;expect(sent.body.dish_names).toEqual(['Plat démo','Autre plat']);expect(sent.body.brief).toMatchObject({creativity:45,max_prep_time_mins:30,stock_policy:'prefer_existing'});await page.screenshot({path:info.outputPath('lab-brief-fr.png')});
});

test('lab unsubmitted recipe notes require a leave confirmation',async({page})=>{
 const state=await installLab(page);await open(page);await page.getByRole('button').filter({hasText:'Écrire ou dicter la recette'}).click();await page.getByRole('textbox',{name:'Notes du chef',exact:true}).fill('Brouillon de texte non appliqué');await page.getByRole('button',{name:'Retour à mes créations',exact:true}).click();await expect(page.getByRole('alertdialog')).toContainText('ne sont pas enregistrés');await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(page.getByRole('textbox',{name:'Notes du chef',exact:true})).toHaveValue('Brouillon de texte non appliqué');expect(state.writes).toHaveLength(0);
});

test('lab draft generation state updates through polling',async({page})=>{
 const state=await installLab(page);state.drafts[0].status='generating';await page.goto('/1/kitchen/lab');await page.getByRole('button',{name:/Recette démo/}).click();await expect(page.getByRole('status').filter({hasText:'En cours de création'})).toBeVisible();await expect(qty(page)).toHaveCount(0);state.drafts[0].status='ready';await expect(qty(page)).toBeVisible({timeout:8000});expect(state.writes).toHaveLength(0);
});

test('lab manual dictation is scoped to the open capture and caps text length',async({page})=>{
 await page.addInitScript(()=>{(window as any).speechAborts=0;(window as any).SpeechRecognition=class{onresult:any;onend:any;onerror:any;start(){(window as any).syntheticSpeech=this;}stop(){this.onend?.();}abort(){(window as any).speechAborts++;this.onend?.();}};});
 const state=await installLab(page);await open(page);const toggle=page.getByRole('button').filter({hasText:'Écrire ou dicter la recette'});await toggle.click();await page.getByRole('button',{name:'Dicter',exact:true}).click();await page.evaluate(()=>{(window as any).syntheticSpeech.onresult({resultIndex:0,results:[{0:{transcript:'Tomates 250 g'},isFinal:true,length:1}]});});await expect(page.getByRole('textbox',{name:'Notes du chef',exact:true})).toHaveValue('Tomates 250 g');await expect(page.getByRole('button',{name:'Extraire la recette',exact:true})).toBeDisabled();await page.evaluate(()=>{(window as any).syntheticSpeech.onresult({resultIndex:0,results:[{0:{transcript:'a'.repeat(16010)},isFinal:true,length:1}]});});await expect.poll(()=>page.getByRole('textbox',{name:'Notes du chef',exact:true}).inputValue().then(value=>value.length)).toBe(16000);await toggle.click();expect(await page.evaluate(()=>(window as any).speechAborts)).toBeGreaterThan(0);await toggle.click();await expect(page.getByRole('button',{name:'Dicter',exact:true})).toBeVisible();expect(state.writes).toHaveLength(0);
});

test('lab incomplete prices never claim all prices are verified',async({page},info)=>{
 const state=await installLab(page);state.drafts[0].payload!.components[0].cost_status='unknown';state.drafts[0].payload!.cost_summary.unknown_cost_count=1;state.drafts[0].payload!.cost_summary.cost_status='incomplete';await open(page);await expect(page.getByText('Tous les prix sont vérifiés',{exact:true})).toHaveCount(0);await qty(page).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('lab-incomplete-fr.png')});expect(state.writes).toHaveLength(0);
});

test('lab a brief cannot be lost through local back navigation',async({page})=>{
 const state=await installLab(page);await page.goto('/1/kitchen/lab');await page.getByRole('button').filter({hasText:'Commencer un brief IA'}).click();await page.locator('#lab-dish-ideas').fill('Création en cours');await page.getByRole('button',{name:'Retour aux choix du Labo',exact:true}).click();await expect(page.getByRole('alertdialog')).toContainText('ne sont pas enregistrés');await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(page.locator('#lab-dish-ideas')).toHaveValue('Création en cours');expect(state.writes).toHaveLength(0);
});

test('lab keeps zero quantity unsaved and permits discarding an invalid draft',async({page})=>{
 const state=await installLab(page);await open(page);await qty(page).fill('0');await expect(page.locator('main [role=alert]')).toContainText('quantité supérieure à zéro');await expect(qty(page)).toHaveValue('0');expect(patches(state)).toHaveLength(0);expect(state.drafts[0].payload!.components[0].qty).toBe(250);await page.getByRole('button',{name:'Supprimer ce brouillon',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Supprimer',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Brouillon supprimé'})).toBeVisible();expect(state.writes.map(w=>w.method)).toEqual(['DELETE']);
});

test('lab resumes autosaving after a local quantity validation error',async({page})=>{
 const state=await installLab(page);await open(page);await qty(page).fill('0');await expect(page.locator('main [role=alert]')).toContainText('quantité supérieure à zéro');await qty(page).fill('150');await expect(page.getByRole('status').filter({hasText:'Coûts à jour'})).toBeVisible();await expect(page.locator('main [role=alert]')).toHaveCount(0);expect(patches(state).map(write=>write.body.components[0].qty)).toEqual([150]);
});
