import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
import type { TranslationReviewEntry, StaffMember } from '../../src/lib/api';

const courierName='Livreur démo — tournée du soir';
async function installSettings(page:Page,options:{locale?:string;theme?:string;permissions?:string[];empty?:boolean}={}) {
 const fixtureOptions={empty:options.empty??false,permissions:options.permissions};const fixture=createFixture(fixtureOptions);
 const staff:StaffMember[]=options.empty?[]:[...fixture.staff.map(member=>({...member,last_login_at:'2026-10-01T10:00:00Z'})) as StaffMember[],{id:3,full_name:courierName,email:'courier@foody.test',phone:'',role:'courier',role_name:'Courier',invite_status:'expired',is_default_courier:true,table_assignment_eligible:false,unrestricted_table_access:false},{id:4,full_name:'שליח לדוגמה · Deuxième',email:'other@foody.test',phone:'',role:'manager',role_name:'Courier',invite_status:'active',is_default_courier:false,table_assignment_eligible:false,unrestricted_table_access:false}];
 const entries:TranslationReviewEntry[]=options.empty?[]:[{text:'Salade de saison',usage:{item_name:2},translations:{en:'Seasonal salad',he:'סלט עונתי'}},{text:'Herbes fraîches et citron',usage:{item_description:1},translations:{en:'Fresh herbs and lemon',he:'עשבי תיבול ולימון'}},{text:'Supplément',usage:{option:2},translations:{en:'Extra',he:'תוספת'}}];
 const writes:{path:string;body:any;restaurant:number;query:string}[]=[];const reads:{path:string;restaurant:number}[]=[];
 const faults={staff:0,roles:0,courier:0,restaurant:0,localeSave:0,preview:0,apply:0,delay:0};let locales:Record<number,string>={1:'fr',2:'he'};
 await page.addInitScript(({locale,theme})=>{localStorage.setItem('foody_restaurant_token','isolated-ui-fixture');localStorage.setItem('foody_restaurant_user',JSON.stringify({id:1,full_name:'Équipe démo',role:'owner',email:'demo@foody.test'}));localStorage.setItem('foody_restaurant_ids','[1,2]');localStorage.setItem('foody-admin-locale',locale);localStorage.setItem('foody_admin_theme',theme);},{locale:options.locale??'fr',theme:options.theme??'light'});
 await page.route('**/api/v1/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method(),body=request.postDataJSON()??{},restaurant=Number(request.headers()['x-restaurant-id'])||1;
  const send=(json:unknown,status=200)=>route.fulfill({json,status});const fail=()=>send({error:'Échec synthétique réglages'},503);const consume=(key:keyof typeof faults)=>{if(faults[key]>0){faults[key]--;return true;}return false;};
  if(/^\/api\/v1\/restaurants\/\d+(\/staff|\/roles|\/staff\/\d+\/default-courier)?$/.test(path)||path.startsWith('/api/v1/menu/translations/')||path==='/api/v1/menu/import/url'){
   if(method==='GET')reads.push({path,restaurant});else{writes.push({path,body,restaurant,query:url.search});if(faults.delay)await new Promise(resolve=>setTimeout(resolve,faults.delay));}
   if(path.endsWith('/staff')){if(consume('staff'))return fail();return send({staff});}
   if(path.endsWith('/roles')){if(consume('roles'))return fail();return send({roles:fixture.roles});}
   if(path.endsWith('/default-courier')){if(consume('courier'))return fail();const id=Number(path.split('/').at(-2));staff.forEach(member=>{if(member.id===id)member.is_default_courier=body.is_default;else if(body.is_default)member.is_default_courier=false;});return send({ok:true,is_default_courier:body.is_default});}
   if(path.endsWith('/retranslate-preview')){if(consume('preview'))return fail();return send({source_locale:locales[restaurant],entries});}
   if(path.endsWith('/translations/apply')){if(consume('apply'))return fail();return send({items:2,groups:1,modifier_sets:1,modifiers:1,variant_groups:1,variants:1,option_sets:1,options:2});}
   if(path.endsWith('/translations/preview')){return send({translations:Object.fromEntries(body.groups.flatMap((group:any)=>group.texts.map((text:string)=>[text,{fr:text,en:`EN ${text}`,he:`עברית ${text}`}])))});}
   if(path.endsWith('/import/url'))return send({categories:[{name:'Plats',items:[{name:'Salade de saison',description:'Herbes fraîches et citron',price:42,option_sets:[],modifier_sets:[]}]}]});
   if(method==='GET'&&consume('restaurant'))return fail();if(method==='PUT'){if(consume('localeSave'))return fail();locales[restaurant]=body.default_locale;}
   const response=fixture.response(request.url(),'GET',{},restaurant) as any;return send({restaurant:{...response.json.restaurant,default_locale:locales[restaurant]}});
  }
  const result=fixture.response(request.url(),method,body,restaurant);return send(result.json??{},result.status??200);
 });
 await page.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.fallback():route.abort());
 return {staff,entries,writes,reads,faults,fixture,locales};
}
const previewButton=(page:Page)=>page.getByRole('button',{name:'Préparer les traductions',exact:true});
const applyButton=(page:Page)=>page.getByRole('button',{name:'Appliquer les traductions',exact:true});
const languageSelect=(page:Page)=>page.getByRole('combobox',{name:'Langue',exact:true});

for(const locale of ['fr','he'])test(`settings team responsive status and language review ${locale}`,async({page},info)=>{
 const state=await installSettings(page,{locale,theme:locale==='he'?'dark':'light'});await page.setViewportSize({width:locale==='fr'?375:1440,height:950});await page.goto('/1/settings/team');await expect(page.getByText(courierName,{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath(`settings-team-${locale}.png`)});if(locale==='fr'){await page.getByRole('button',{name:'Articles et cartes',exact:true}).click();await expect(page.getByRole('dialog').getByRole('link',{name:'Équipe & rôles',exact:true})).toBeVisible();await page.keyboard.press('Escape');}expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.goto('/1/settings/language');await page.getByRole('button',{name:locale==='fr'?'Préparer les traductions':'הכנת תרגומים לבדיקה',exact:true}).click();await expect(page.getByRole('textbox',{name:'English · Salade de saison',exact:true})).toHaveValue('Seasonal salad');await page.getByRole('textbox',{name:'English · Salade de saison',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`settings-language-${locale}.png`)});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect(state.fixture.unhandled).toEqual([]);
});

test('settings team load failures stay independent and recover without fake empty states',async({page})=>{
 const state=await installSettings(page);state.faults.staff=100;await page.goto('/1/settings/team');await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');await expect(page.getByText('Équipe événementielle — coordination',{exact:true})).toBeVisible();await expect(page.getByText(courierName,{exact:true})).toHaveCount(0);state.faults.staff=0;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByText(courierName,{exact:true})).toBeVisible();expect(state.writes).toHaveLength(0);
});

test('settings team default courier preserves previous choice after error and permits retry',async({page})=>{
 const state=await installSettings(page);state.faults.courier=1;await page.goto('/1/settings/team');const button=page.getByRole('button',{name:'Définir comme livreur par défaut · שליח לדוגמה · Deuxième',exact:true});await button.click();await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');await expect(button).toHaveAttribute('aria-pressed','false');await expect(page.getByRole('button',{name:`Effacer le livreur par défaut · ${courierName}`,exact:true})).toHaveAttribute('aria-pressed','true');await button.click();await expect(page.getByRole('button',{name:'Effacer le livreur par défaut · שליח לדוגמה · Deuxième',exact:true})).toHaveAttribute('aria-pressed','true');expect(state.staff.filter(member=>member.is_default_courier).map(member=>member.id)).toEqual([4]);expect(state.writes.map(write=>write.body)).toEqual([{is_default:true},{is_default:true}]);
});

test('settings team serializes courier writes and allows clearing the default',async({page})=>{
 const state=await installSettings(page);state.faults.delay=700;await page.goto('/2/settings/team');const clear=page.getByRole('button',{name:`Effacer le livreur par défaut · ${courierName}`,exact:true});await clear.evaluate((button:HTMLButtonElement)=>{button.click();button.click();});await expect(clear).toBeDisabled();await expect(page.getByRole('button',{name:`Définir comme livreur par défaut · ${courierName}`,exact:true})).toHaveAttribute('aria-pressed','false');expect(state.writes).toHaveLength(1);expect(state.writes[0]).toMatchObject({path:'/api/v1/restaurants/2/staff/3/default-courier',restaurant:2,body:{is_default:false}});
});

test('settings team roles manager cannot change default couriers or read a staff-only endpoint',async({page})=>{
 const state=await installSettings(page,{permissions:['settings.view','roles.manage']});await page.goto('/1/settings/team');await expect(page.getByText('Équipe événementielle — coordination',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/livreur par défaut/})).toHaveCount(0);expect(state.reads.filter(read=>read.path.endsWith('/staff'))).toHaveLength(0);expect(state.writes).toHaveLength(0);
});

test('settings team read-only access shows invitation status without management links',async({page})=>{
 const state=await installSettings(page,{permissions:['settings.view','staff.view']});await page.goto('/1/settings/team');await expect(page.getByText(courierName,{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/livreur par défaut/})).toHaveCount(0);await expect(page.getByRole('link',{name:/Modifier ·/})).toHaveCount(0);await expect(page.getByText('Invitation expirée',{exact:true})).toBeVisible();expect(state.writes).toHaveLength(0);
});

test('settings language load failure recovers before enabling edits',async({page})=>{
 const state=await installSettings(page);await page.goto('/1/settings');await expect(page.locator('main h1')).toBeVisible();state.faults.restaurant=100;await page.getByRole('navigation',{name:'Navigation principale'}).getByRole('button',{name:'Compte',exact:true}).click();await page.locator('a[href="/1/settings/language"]').first().click();await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');await expect(languageSelect(page)).toHaveCount(0);state.faults.restaurant=0;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(languageSelect(page)).toHaveValue('fr');expect(state.writes).toHaveLength(0);
});

test('settings language failed save retains selected locale and prevents preview before saving',async({page})=>{
 const state=await installSettings(page);state.faults.localeSave=1;await page.goto('/1/settings/language');await languageSelect(page).selectOption('he');await expect(previewButton(page)).toBeDisabled();await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');await expect(languageSelect(page)).toHaveValue('he');await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Enregistré'})).toBeVisible();await expect(previewButton(page)).toBeEnabled();expect(state.locales[1]).toBe('he');expect(state.writes.map(write=>write.body)).toEqual([{default_locale:'he'},{default_locale:'he'}]);
});

test('settings language preview error is recoverable without writing translations',async({page})=>{
 const state=await installSettings(page);state.faults.preview=1;await page.goto('/1/settings/language');await previewButton(page).click();await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');await previewButton(page).click();await expect(page.getByRole('textbox',{name:'English · Salade de saison'})).toBeVisible();expect(state.writes.filter(write=>write.path.endsWith('/apply'))).toHaveLength(0);
});

test('settings language reviews every usage, preserves empty translations and counts all entity kinds',async({page},info)=>{
 const state=await installSettings(page);state.locales[2]='fr';await page.goto('/2/settings/language');await previewButton(page).click();const english=page.getByRole('textbox',{name:'English · Salade de saison',exact:true});await english.fill('Seasonal plate');await page.getByRole('textbox',{name:'עברית · Salade de saison',exact:true}).fill('');await expect(languageSelect(page)).toBeDisabled();await applyButton(page).click();await expect(page.getByRole('alertdialog')).toContainText('3 textes');await page.getByRole('alertdialog').getByRole('button',{name:'Appliquer les traductions',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'10'})).toBeVisible();expect(state.writes.at(-1)).toMatchObject({restaurant:2,path:'/api/v1/menu/translations/apply',body:{entries:{'Salade de saison':{en:'Seasonal plate',he:''}}}});expect(state.writes.at(-1)?.query).toContain('restaurant_id=2');await page.screenshot({path:info.outputPath('settings-language-applied.png')});
});

test('settings language failed application keeps the review and warns about partial writes',async({page})=>{
 const state=await installSettings(page);state.faults.apply=1;await page.goto('/1/settings/language');await previewButton(page).click();await page.getByRole('textbox',{name:'English · Salade de saison'}).fill('Corrected plate');await applyButton(page).click();await page.getByRole('alertdialog').getByRole('button',{name:'Appliquer les traductions',exact:true}).click();await expect(page.locator('main [role=alert]')).toContainText('Certaines traductions ont pu être enregistrées');await expect(page.getByRole('textbox',{name:'English · Salade de saison'})).toHaveValue('Corrected plate');await applyButton(page).click();await page.getByRole('alertdialog').getByRole('button',{name:'Appliquer les traductions',exact:true}).click();await expect(previewButton(page)).toBeVisible();expect(state.writes.filter(write=>write.path.endsWith('/apply'))).toHaveLength(2);
});

test('settings language freezes reviewed values while an application is pending',async({page})=>{
 const state=await installSettings(page);await page.goto('/1/settings/language');await previewButton(page).click();state.faults.delay=1000;await applyButton(page).click();await page.getByRole('alertdialog').getByRole('button',{name:'Appliquer les traductions',exact:true}).click();await expect(page.getByRole('textbox',{name:'English · Salade de saison'})).toBeDisabled();await expect(page.getByRole('button',{name:'Annuler',exact:true})).toBeDisabled();await expect(languageSelect(page)).toBeDisabled();await expect(previewButton(page)).toBeVisible();expect(state.writes.filter(write=>write.path.endsWith('/apply'))).toHaveLength(1);
});

test('settings language search and section keyboard controls preserve edited translations',async({page})=>{
 const state=await installSettings(page);await page.goto('/1/settings/language');await previewButton(page).click();await page.getByRole('textbox',{name:'English · Salade de saison'}).fill('Corrected salad');const search=page.getByRole('textbox',{name:'Rechercher des textes ou traductions...',exact:true});await search.fill('zzz');await expect(page.getByText('Aucun texte ni traduction ne correspond à cette recherche.',{exact:true})).toBeVisible();await search.fill('Corrected');await expect(page.getByRole('textbox',{name:'English · Salade de saison'})).toHaveValue('Corrected salad');const section=page.getByRole('button',{name:'Articles (1)',exact:true});await section.focus();await page.keyboard.press('Enter');await expect(section).toHaveAttribute('aria-expanded','false');await page.keyboard.press('Enter');await expect(page.getByRole('textbox',{name:'English · Salade de saison'})).toHaveValue('Corrected salad');expect(state.writes.filter(write=>write.path.endsWith('/apply'))).toHaveLength(0);
});

test('settings language cancel review requires an explicit discard and restores focus',async({page})=>{
 await installSettings(page);await page.goto('/1/settings/language');await previewButton(page).click();await page.getByRole('textbox',{name:'English · Salade de saison'}).fill('Draft');const cancel=page.getByRole('button',{name:'Annuler',exact:true});await cancel.click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(cancel).toBeFocused();await expect(page.getByRole('textbox',{name:'English · Salade de saison'})).toHaveValue('Draft');await cancel.click();await page.getByRole('alertdialog').getByRole('button',{name:'Abandonner les modifications',exact:true}).click();await expect(previewButton(page)).toBeVisible();await expect(languageSelect(page)).toBeEnabled();
});

for(const kind of ['settings','menu'])test(`settings language separates ${kind} editing permissions`,async({page})=>{
 const state=await installSettings(page,{permissions:['settings.view',kind==='settings'?'settings.edit':'menu.edit']});await page.goto('/1/settings/language');if(kind==='settings'){await expect(languageSelect(page)).toBeEnabled();await expect(previewButton(page)).toHaveCount(0);}else{await expect(languageSelect(page)).toBeDisabled();await expect(previewButton(page)).toBeEnabled();}expect(state.writes).toHaveLength(0);
});

test('settings language empty catalog has no apply action',async({page})=>{
 const state=await installSettings(page,{empty:true});await page.goto('/1/settings/language');await previewButton(page).click();await expect(page.getByText('Rien à traduire.',{exact:true})).toBeVisible();await expect(applyButton(page)).toBeDisabled();await page.getByRole('button',{name:'Annuler',exact:true}).click();await expect(previewButton(page)).toBeVisible();expect(state.writes.filter(write=>write.path.endsWith('/apply'))).toHaveLength(0);
});

test('shared translation review keeps menu-import section source selection and edits',async({page})=>{
 const state=await installSettings(page);await page.goto('/1/menu/import');await page.getByRole('button',{name:'Site web',exact:true}).click();await page.locator('input[type=url]').fill('https://example.test/menu');await page.getByRole('button',{name:'Importer le menu',exact:true}).click();await page.getByRole('button',{name:'Vérifier les traductions',exact:true}).click();const source=page.getByRole('combobox',{name:'Langue d\'origine · Articles',exact:true});await expect(source).toHaveValue('en');const response=page.waitForResponse(response=>response.url().includes('/translations/preview')&&response.request().postDataJSON()?.groups?.[0]?.source_locale==='fr');await source.selectOption('fr');await (await response).finished();await expect(page.getByRole('textbox',{name:'English · Salade de saison',exact:true})).toBeVisible();await page.getByRole('textbox',{name:'English · Salade de saison',exact:true}).fill('Texte revu');expect(state.writes.filter(write=>write.path.endsWith('/translations/preview')).at(-1)?.body).toEqual({groups:[{source_locale:'fr',texts:['Salade de saison']}]});expect(state.writes.filter(write=>write.path.endsWith('/import/confirm'))).toHaveLength(0);
});

test('settings language protects pending edits and releases the unload guard after saving',async({page})=>{
 await installSettings(page);await page.goto('/1/settings/language');const guarded=()=>page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;});await expect(languageSelect(page)).toHaveValue('fr');expect(await guarded()).toBe(false);await languageSelect(page).selectOption('he');expect(await guarded()).toBe(true);await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Enregistré'})).toBeVisible();expect(await guarded()).toBe(false);await previewButton(page).click();await expect(applyButton(page)).toBeVisible();expect(await guarded()).toBe(true);
});

test('settings language changing interface language preserves the pending source and review draft',async({page})=>{
 const state=await installSettings(page);await page.goto('/1/settings/language');await languageSelect(page).selectOption('he');const count=state.reads.filter(read=>read.path==='/api/v1/restaurants/1').length;await page.getByRole('button',{name:'Atelier Foody',exact:true}).click();await page.getByRole('dialog').getByRole('combobox').selectOption('en');await page.keyboard.press('Escape');await expect(page.getByRole('combobox',{name:'Language',exact:true})).toHaveValue('he');expect(state.reads.filter(read=>read.path==='/api/v1/restaurants/1')).toHaveLength(count);await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Saved'})).toBeVisible();await page.getByRole('button',{name:'Prepare translation preview',exact:true}).click();await page.getByRole('textbox',{name:'English · Salade de saison',exact:true}).fill('Draft kept');await page.getByRole('button',{name:'Atelier Foody',exact:true}).click();await page.getByRole('dialog').getByRole('combobox').selectOption('fr');await page.keyboard.press('Escape');await expect(page.getByRole('textbox',{name:'English · Salade de saison',exact:true})).toHaveValue('Draft kept');expect(state.reads.filter(read=>read.path==='/api/v1/restaurants/1')).toHaveLength(count);
});
