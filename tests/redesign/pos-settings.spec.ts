import { expect, test, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
import type { FullServiceSettings } from '../../src/lib/api';
const modeId='4d3db2c3-b29a-4d8d-94f5-0a231d85bc22';
const otherId='4d3db2c3-b29a-4d8d-94f5-0a231d85bc23';
const deviceId='5d3db2c3-b29a-4d8d-94f5-0a231d85bc22';
async function install(page:Page,locale='fr',theme='light',permissions?:string[],options:{supported?:boolean; mergeSupported?:boolean; savedMergeSupported?:boolean; trackingSupported?:boolean; savedTrackingSupported?:boolean; customerInformationSupported?:boolean; savedCustomerInformationSupported?:boolean; restaurantIds?:number[]; initialPolicy?:Partial<FullServiceSettings>; beforeResponse?:(method:string)=>Promise<void>; loadedPolicy?:(policy:FullServiceSettings)=>unknown; savedPolicy?:(policy:FullServiceSettings)=>FullServiceSettings}={}) {
 const fixtureOptions={library:true,permissions};
 const fixture=createFixture(fixtureOptions);
 let policy:FullServiceSettings={seating_mode:'optionalSeats',send_and_stay:false,coursing_enabled:true,courses:['Entrées','Plats principaux','Desserts'],show_held_on_kds:false,sort_cart:'course',comp_reasons:['Geste commercial'],void_reasons:['Erreur'],auto_progression:true,order_entry:{tile_size:'tall',return_to_menu:'home'},modes:[{id:modeId,name:'Service complet',device_ids:[],seating_mode:'requiredSeats',send_and_stay:true,coursing_enabled:true,auto_progression:true,tile_size:'wide',sort_cart:'seat'},{id:otherId,name:'Comptoir',device_ids:[deviceId],seating_mode:'disabled',send_and_stay:false,coursing_enabled:false,auto_progression:false,tile_size:'tall',sort_cart:'entry'}]};
 policy={...policy,...options.initialPolicy};
 const writes:FullServiceSettings[]=[];
 await page.addInitScript(({locale,theme,restaurantIds})=>{
  localStorage.setItem('foody_restaurant_token','isolated-ui-fixture');localStorage.setItem('foody_restaurant_user',JSON.stringify({id:1,full_name:'Demo',role:'owner',email:'demo@foody.test'}));localStorage.setItem('foody_restaurant_ids',JSON.stringify(restaurantIds));localStorage.setItem('foody-admin-locale',locale);localStorage.setItem('foody_admin_theme',theme);
 },{locale,theme,restaurantIds:options.restaurantIds??[1]});
 await page.route('**/*',route=>['localhost','127.0.0.1','square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname)?route.fallback():route.abort());
 await page.route('**/api/v1/**',async route=>{
  const r=route.request(),path=new URL(r.url()).pathname,body=r.postDataJSON()??{};
  if(path==='/api/v1/restaurants/1/settings'){
   if(r.method()==='PUT'){expect(r.headers()['x-restaurant-id']).toBe('1');expect(Object.keys(body).sort()).toEqual(['full_service','full_service_base']);expect(body.full_service_base).toBeTruthy();policy=body.full_service;writes.push(structuredClone(policy));}
   const returned=r.method()==='PUT'&&options.savedPolicy?options.savedPolicy(structuredClone(policy)):r.method()==='GET'&&options.loadedPolicy?options.loadedPolicy(structuredClone(policy)):structuredClone(policy);
   await options.beforeResponse?.(r.method());
   const customerSupported=r.method()==='PUT'?options.savedCustomerInformationSupported??options.customerInformationSupported:options.customerInformationSupported;
   return route.fulfill({json:{settings:{full_service:returned,pos_custom_dining_supported:options.supported??true,pos_fulfillment_tracking_supported:(r.method()==='PUT'?options.savedTrackingSupported??options.trackingSupported:options.trackingSupported)??true,pos_settings_merge_supported:(r.method()==='PUT'?options.savedMergeSupported??options.mergeSupported:options.mergeSupported)??true,...(customerSupported!==false?{pos_fulfillment_customer_information_supported:true}:{})}}});
  }
  if(path==='/api/v1/restaurants/1/devices')return route.fulfill({json:{devices:[{id:deviceId,restaurant_id:1,kind:'tablet',display_name:'iPad Salle',system_name:'iPad',capabilities:[]}]}});
  if(path==='/api/v1/menu/item-categories')return route.fulfill({json:{categories:[{id:10,name:'Boissons'}]}});
  if(path==='/api/v1/orders/kds/stations')return route.fulfill({json:{stations:[]}});
  const result=fixture.response(r.url(),r.method(),body,1);return route.fulfill({status:result.status??200,json:result.json??{}});
 });
 return writes;
}
test('services stage order, categories and print policy, then preserve modes on Save',async({page},info)=>{
 const writes=await install(page);await page.goto('/1/settings/services');
 await expect(page.getByRole('button',{name:/Envoi immédiat/})).toBeVisible();await page.evaluate(()=>document.fonts.ready);await page.addStyleTag({content:'nextjs-portal{display:none}'});await page.screenshot({path:info.outputPath('services-fr-light.png')});
 await page.getByRole('button',{name:'Monter Desserts',exact:true}).click();
 await page.getByRole('button',{name:/Envoi immédiat/}).click();
 await page.getByRole('checkbox',{name:'Boissons'}).check();await page.getByRole('button',{name:'Appliquer',exact:true}).last().click();
 await page.getByRole('radio',{name:/^Imprimer les tickets de services envoyés et en attente/}).check();
 expect(writes).toEqual([]);await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect(page.getByRole('button',{name:'Enregistrer',exact:true})).toBeDisabled();
 expect(writes[0]).toMatchObject({courses:['Entrées','Desserts','Plats principaux'],immediate_category_ids:[10],course_ticket_policy:'fired_and_held'});expect(writes[0].modes).toHaveLength(2);
});
test('mode assignment moves an actual device once and does not change restaurant defaults',async({page})=>{
 const writes=await install(page);await page.goto(`/1/settings/modes/${modeId}`);
 await page.getByRole('button',{name:/Appareils attribués/}).click();await page.getByRole('checkbox',{name:'iPad Salle'}).check();await page.getByRole('button',{name:'Appliquer',exact:true}).last().click();
 expect(writes).toEqual([]);await page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true}).click();
 expect(writes[0].modes?.[0].device_ids).toEqual([deviceId]);expect(writes[0].modes?.[1].device_ids).toEqual([]);expect(writes[0].seating_mode).toBe('optionalSeats');
});
test('mode saves include the original policy snapshot and adopt concurrent POS changes to other fields',async({page})=>{
 const requests:Record<string,FullServiceSettings>[]=[];
 page.on('request',request=>{if(request.method()==='PUT'&&new URL(request.url()).pathname==='/api/v1/restaurants/1/settings')requests.push(request.postDataJSON());});
 const writes=await install(page,'fr','light',undefined,{savedPolicy:policy=>({...policy,modes:policy.modes?.map(mode=>mode.id===modeId?{...mode,name:'Renamed from POS'}:{...mode,auto_progression:true})})});
 await page.goto(`/1/settings/modes/${modeId}/courses`);
 const coursing=page.getByRole('switch',{name:'Activer la gestion des services',exact:true});
 await coursing.uncheck();await page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect(page.locator('.pos-editor-head h2')).toHaveText('Renamed from POS');
 await expect(page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true})).toBeDisabled();
 expect(requests[0].full_service_base.modes?.[0]).toMatchObject({name:'Service complet',coursing_enabled:true});
 expect(requests[0].full_service.modes?.[0].coursing_enabled).toBe(false);
 await coursing.check();await page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect.poll(()=>writes.length).toBe(2);
 expect(requests[1].full_service_base.modes?.[0]).toMatchObject({name:'Renamed from POS',coursing_enabled:false});
 expect(requests[1].full_service_base.modes?.[1].auto_progression).toBe(true);
});

test('a conflicting POS save keeps the draft and reload requires explicit discard confirmation',async({page})=>{
 const writes=await install(page);
 let attempts=0,changed=false;
 let current:FullServiceSettings|undefined;
 await page.route('**/api/v1/restaurants/1/settings',async route=>{
  if(route.request().method()==='PUT'){
   attempts++;const body=route.request().postDataJSON();current={...body.full_service_base,modes:body.full_service_base.modes.map((mode:Record<string,unknown>)=>mode.id===modeId?{...mode,name:'From iPad'}:mode)};changed=true;
   return route.fulfill({status:409,json:{error:'POS settings changed; reload before saving',details:{code:'pos_settings_conflict'}}});
  }
  if(changed)return route.fulfill({json:{settings:{full_service:current,pos_settings_merge_supported:true,pos_custom_dining_supported:true,pos_fulfillment_customer_information_supported:true}}});
  return route.fallback();
 });
 await page.goto(`/1/settings/modes/${modeId}`);
 const name=page.getByRole('textbox',{name:'Nom',exact:true});
 await name.fill('Local unsaved name');await page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('ont changé sur un autre appareil');
 await expect(name).toHaveValue('Local unsaved name');expect(attempts).toBe(1);expect(writes).toEqual([]);
 await page.getByRole('button',{name:'Recharger les réglages enregistrés',exact:true}).click();
 await expect(page.getByRole('alertdialog')).toBeVisible();
 await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();
 await expect(name).toHaveValue('Local unsaved name');expect(attempts).toBe(1);
 await page.getByRole('button',{name:'Recharger les réglages enregistrés',exact:true}).click();
 await page.getByRole('alertdialog').getByRole('button',{name:'Recharger les réglages enregistrés',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Nom',exact:true})).toHaveValue('From iPad');
 await expect(page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true})).toBeDisabled();expect(attempts).toBe(1);
});

test('a server without safe POS merging cannot receive an unsafe full-policy replacement',async({page})=>{
 const writes=await install(page,'fr','light',undefined,{mergeSupported:false});await page.goto(`/1/settings/modes/${modeId}/courses`);
 await page.getByRole('switch',{name:'Activer la gestion des services',exact:true}).uncheck();
 await page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('sauvegarde sécurisée');
 await expect(page.getByRole('switch',{name:'Activer la gestion des services',exact:true})).not.toBeChecked();expect(writes).toEqual([]);
});

for(const malformed of ['core fields','check behavior'] as const)test(`a policy read with incomplete ${malformed} cannot expose editable defaults`,async({page})=>{
 const writes=await install(page,'fr','light',undefined,{loadedPolicy:policy=>malformed==='core fields'?{...policy,courses:undefined}:{...policy,check_behavior:{allow_hold_fire:false}}});
 await page.goto(`/1/settings/modes/${modeId}/courses`);
 await expect(page.getByRole('alert')).toContainText('Impossible de charger');
 await expect(page.getByRole('switch')).toHaveCount(0);await expect(page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true})).toBeDisabled();expect(writes).toEqual([]);
});

test('a truncated unchanged core field never confirms a changed mode flag',async({page})=>{
 const writes=await install(page,'fr','light',undefined,{savedPolicy:policy=>({...policy,courses:undefined}) as unknown as FullServiceSettings});
 await page.goto(`/1/settings/modes/${modeId}/courses`);const coursing=page.getByRole('switch',{name:'Activer la gestion des services',exact:true});
 await coursing.uncheck();await page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('n’a pas confirmé');await expect(coursing).not.toBeChecked();await expect(page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true})).toBeEnabled();expect(writes).toHaveLength(1);
});

for(const lost of ['mode field','merge capability'] as const)test(`a save losing its ${lost} remains unconfirmed with its draft retained`,async({page})=>{
 const writes=await install(page,'fr','light',undefined,lost==='mode field'?{savedPolicy:policy=>({...policy,modes:policy.modes?.map(mode=>mode.id===modeId?{...mode,coursing_enabled:true}:mode)})}:{savedMergeSupported:false});
 await page.goto(`/1/settings/modes/${modeId}/courses`);
 await page.getByRole('switch',{name:'Activer la gestion des services',exact:true}).uncheck();
 await page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('n’a pas confirmé');
 await expect(page.getByRole('switch',{name:'Activer la gestion des services',exact:true})).not.toBeChecked();expect(writes).toHaveLength(1);
});
test.describe('Square mode editor alignment',()=>{
test.use({deviceScaleFactor:2});
test('checkout overview matches the supplied Square Dashboard geometry',async({page},info)=>{
 const writes=await install(page);await page.setViewportSize({width:1440,height:716});await page.goto(`/1/settings/modes/${modeId}`);
 const editor=page.locator('.pos-mode-editor'),head=editor.locator('.pos-editor-head'),main=editor.locator('.pos-editor-layout>main');
 await expect(main.getByRole('heading',{name:'Paiement',exact:true})).toBeVisible();await page.evaluate(()=>document.fonts.ready);
 expect(await head.boundingBox()).toMatchObject({x:0,y:0,width:1440,height:93});
 expect(await head.locator('button').first().boundingBox()).toMatchObject({x:32,y:16,width:48,height:48});
 expect(await editor.locator('aside').boundingBox()).toMatchObject({x:0,y:93,width:280});
 expect(await main.locator('.pos-editor-subhead').boundingBox()).toMatchObject({x:352,y:117,height:32});
 const general=main.locator('.pos-setting-section').first();
 expect(await general.getByRole('heading',{name:'Général',exact:true}).boundingBox()).toMatchObject({x:352,y:197,height:24});
 const rows=general.locator(':scope>.pos-setting-row');
 await expect(rows).toHaveText(['Panier','Saisie de commande','Suivi des couverts et des places','Gestion des services','Modes de traitement']);
 for(let i=0;i<5;i++)expect(await rows.nth(i).boundingBox()).toMatchObject({x:352,y:233+i*56,width:1016,height:56});
 await expect(main.getByRole('heading',{name:'Paiement',exact:true})).toHaveCSS('color','rgb(26, 26, 26)');
 await expect(rows.first()).toHaveCSS('border-bottom-color','rgb(240, 240, 240)');
 await expect(head.locator('button').first()).toHaveCSS('background-color','rgb(240, 240, 240)');
 await expect(editor.locator('aside a[aria-current=page]')).toHaveCSS('background-color','rgb(204, 204, 204)');
 const title=await head.locator('h2').boundingBox();expect(title!.x+title!.width/2).toBe(720);
 await expect(head.locator('button').first().locator('svg')).toHaveCSS('width','24px');
 await page.addStyleTag({content:'nextjs-portal{display:none}'});await page.screenshot({path:info.outputPath('mode-checkout-square-fr-1440.png')});
 expect(writes).toEqual([]);
});
for(const [locale,theme,width]of [['fr','light',320],['fr','light',390],['he','dark',390],['he','light',1440]]as const)test(`checkout overview keeps profile and extension reachable ${locale} ${theme} ${width}`,async({page},info)=>{
 const writes=await install(page,locale,theme);await page.setViewportSize({width,height:844});await page.goto(`/1/settings/modes/${modeId}`);
 const editor=page.locator('.pos-mode-editor');await expect(editor.locator('.pos-editor-subhead')).toBeVisible();
 expect(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 const title=await editor.locator('.pos-editor-head h2').boundingBox();expect(Math.abs(title!.x+title!.width/2-width/2)).toBeLessThan(1);
 const main=editor.locator('.pos-editor-layout>main');await expect(main.getByRole('textbox')).toHaveValue('Service complet');
 await page.evaluate(()=>document.fonts.ready);await page.addStyleTag({content:'nextjs-portal{display:none}'});
 for(const row of await main.locator('.pos-setting-section').first().locator('.pos-setting-row').all())expect(await row.evaluate(el=>el.scrollHeight<=el.clientHeight)).toBe(true);
 await page.screenshot({path:info.outputPath(`mode-checkout-${locale}-${theme}-${width}.png`)});
 const extensions=main.locator('.pos-mode-mobile-extension a');
 if(width<768){await extensions.click();await expect(page.locator('.pos-open-notice')).toBeVisible();}
 else await expect(extensions).toBeHidden();
 expect(writes).toEqual([]);
});
});
test('Modes list opens an undimmed profile, stages rename, saves and manages the real profile',async({page},info)=>{
 const writes=await install(page);await page.setViewportSize({width:1440,height:716});await page.goto('/1/settings/modes');
 const list=page.locator('[data-pos-settings=modes]');await expect(list.getByRole('heading',{name:'Modes',exact:true})).toBeVisible();
 await expect(list.locator('tbody tr')).toHaveCount(2);await page.evaluate(()=>document.fonts.ready);await page.addStyleTag({content:'nextjs-portal{display:none}'});
 expect(await list.locator('tbody tr').first().evaluate(el=>el.getBoundingClientRect().height)).toBe(64);
 await expect(list.locator('.pos-mode-search input')).toHaveCSS('height','48px');
 await page.screenshot({path:info.outputPath('modes-list-square-fr.png')});
 await list.getByRole('button',{name:'Comptoir Service complet',exact:true}).click();
 const preview=page.locator('.pos-mode-preview');await expect(preview).toBeVisible();
 await expect(page.locator('.pos-mode-preview-overlay')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 expect(await preview.boundingBox()).toMatchObject({x:976,y:0,width:464,height:716});
 await expect(preview.getByText('iPad Salle',{exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('modes-preview-square-fr.png')});
 await preview.getByRole('button',{name:'Renommer',exact:true}).click();
 const rename=page.getByRole('dialog').last();await rename.getByRole('textbox',{name:'Nom',exact:true}).fill('Comptoir rapide');await rename.getByRole('button',{name:'Appliquer',exact:true}).click();
 await expect(preview.getByRole('heading',{name:'Comptoir rapide',exact:true})).toBeVisible();expect(writes).toEqual([]);
 await preview.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(preview.getByRole('button',{name:'Enregistrer',exact:true})).not.toBeVisible();
 expect(writes[0].modes?.find(m=>m.id===otherId)).toMatchObject({name:'Comptoir rapide',device_ids:[deviceId]});
 await preview.getByRole('link',{name:'Gérer',exact:true}).click();await expect(page.locator('.pos-mode-editor')).toBeVisible();await expect(page.locator('.pos-editor-head')).toContainText('Comptoir rapide');
});
test('Modes sorting, search, selection and deletion remain staged until explicit Save',async({page})=>{
 const writes=await install(page);await page.goto('/1/settings/modes');const list=page.locator('[data-pos-settings=modes]');
 await expect(list.locator('tbody tr').first()).toContainText('Comptoir');await list.getByRole('button',{name:'Nom',exact:true}).click();await expect(list.locator('tbody tr').first()).toContainText('Service complet');
 await list.getByRole('textbox',{name:'Rechercher',exact:true}).fill('Comptoir');await expect(list.locator('tbody tr')).toHaveCount(1);
 await list.getByRole('checkbox',{name:'Comptoir',exact:true}).check();await list.getByRole('button',{name:'Supprimer (1)',exact:true}).click();
 await page.getByRole('alertdialog').getByRole('button',{name:'Supprimer',exact:true}).click();await expect(list.locator('tbody tr')).toHaveCount(0);expect(writes).toEqual([]);
 await list.getByRole('button',{name:'Enregistrer',exact:true}).click();expect(writes[0].modes?.map(m=>m.id)).toEqual([modeId]);
});
async function stageEditorModeDeletion(page:Page) {
 await page.getByRole('button',{name:'Supprimer le mode',exact:true}).click();
 await page.getByRole('alertdialog').getByRole('button',{name:'Supprimer',exact:true}).click();
}
test('mode editor deletion stays explicit until Save then returns to the persisted list',async({page})=>{
 const writes=await install(page);await page.goto(`/1/settings/modes/${modeId}`);
 await page.getByRole('textbox',{name:'Nom',exact:true}).fill('Service QA');await stageEditorModeDeletion(page);
 await expect(page.getByRole('status')).toContainText('Enregistrez pour confirmer la suppression');
 await expect(page.locator('.pos-editor-head h2')).toHaveText('Service QA');
 await expect(page.getByText('Ce mode n’existe plus.',{exact:true})).not.toBeVisible();expect(writes).toEqual([]);
 await page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect(page).toHaveURL('/1/settings/modes');
 const list=page.locator('[data-pos-settings=modes]');await expect(list.locator('tbody tr')).toHaveCount(1);await expect(list.locator('tbody')).toContainText('Comptoir');
 expect(writes).toHaveLength(1);expect(writes[0].modes?.map(mode=>mode.id)).toEqual([otherId]);expect(writes[0].seating_mode).toBe('optionalSeats');
 await page.reload();await expect(list.locator('tbody tr')).toHaveCount(1);await expect(list.locator('tbody')).not.toContainText('Service QA');
});
test('undoing mode editor deletion restores its edited draft and original position without a write',async({page})=>{
 const writes=await install(page);await page.goto(`/1/settings/modes/${modeId}`);
 await page.getByRole('textbox',{name:'Nom',exact:true}).fill('Edited before deletion');await stageEditorModeDeletion(page);
 await page.getByRole('button',{name:'Annuler la suppression',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Nom',exact:true})).toHaveValue('Edited before deletion');expect(writes).toEqual([]);
 await page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect(page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true})).toBeDisabled();await expect(page).toHaveURL(`/1/settings/modes/${modeId}`);
 expect(writes[0].modes?.map(mode=>mode.id)).toEqual([modeId,otherId]);expect(writes[0].modes?.[0]).toMatchObject({name:'Edited before deletion',device_ids:[],seating_mode:'requiredSeats',send_and_stay:true});expect(writes[0].modes?.[0]).not.toHaveProperty('check_behavior');
});
for(const status of [409,503])test(`failed mode editor deletion ${status} retains the pending draft for deliberate retry`,async({page})=>{
 const writes=await install(page);let attempts=0,fail=true;
 await page.route('**/api/v1/restaurants/1/settings',async route=>{
  if(route.request().method()==='PUT'&&fail){attempts++;return route.fulfill({status,json:{error:'Synthetic save failure',details:{code:status===409?'pos_settings_conflict':'unavailable'}}});}
  return route.fallback();
 });
 await page.goto(`/1/settings/modes/${modeId}`);await stageEditorModeDeletion(page);
 const save=page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true});await save.click();
 await expect(page.getByRole('alert')).toContainText(status===409?'ont changé sur un autre appareil':'Vos modifications sont conservées ici');
 await expect(page.getByRole('status')).toContainText('Enregistrez pour confirmer la suppression');await expect(save).toBeEnabled();await expect(page).toHaveURL(`/1/settings/modes/${modeId}`);expect(attempts).toBe(1);expect(writes).toEqual([]);
 fail=false;await save.click();await expect(page).toHaveURL('/1/settings/modes');expect(writes).toHaveLength(1);expect(writes[0].modes?.map(mode=>mode.id)).toEqual([otherId]);
});
test('an unconfirmed deletion response cannot close the pending mode editor',async({page})=>{
 const writes=await install(page,'fr','light',undefined,{savedPolicy:policy=>({...policy,modes:[{id:modeId,name:'Service complet',device_ids:[],seating_mode:'requiredSeats',send_and_stay:true,coursing_enabled:true,auto_progression:true,tile_size:'wide',sort_cart:'seat'},...policy.modes??[]]})});
 await page.goto(`/1/settings/modes/${modeId}`);await stageEditorModeDeletion(page);await page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('n’a pas confirmé');await expect(page.getByRole('status')).toContainText('Enregistrez pour confirmer la suppression');await expect(page).toHaveURL(`/1/settings/modes/${modeId}`);expect(writes).toHaveLength(1);
});
test('a genuinely absent mode remains not found rather than a pending local deletion',async({page})=>{
 const writes=await install(page,'fr','light',undefined,{initialPolicy:{modes:[]}});await page.goto(`/1/settings/modes/${modeId}`);
 await expect(page.getByRole('alert')).toHaveText('Ce mode n’existe plus.');await expect(page.getByRole('button',{name:'Annuler la suppression',exact:true})).not.toBeVisible();await expect(page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true})).toBeDisabled();expect(writes).toEqual([]);
});
test('reload after a conflicting deletion discards its undo snapshot only after confirmation',async({page})=>{
 let removedElsewhere=false;
 const writes=await install(page,'fr','light',undefined,{loadedPolicy:policy=>removedElsewhere?{...policy,modes:policy.modes?.filter(mode=>mode.id!==modeId)}:policy});
 await page.route('**/api/v1/restaurants/1/settings',route=>route.request().method()==='PUT'?route.fulfill({status:409,json:{error:'Synthetic conflict',details:{code:'pos_settings_conflict'}}}):route.fallback());
 await page.goto(`/1/settings/modes/${modeId}`);await stageEditorModeDeletion(page);await page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('ont changé sur un autre appareil');
 const reload=page.getByRole('button',{name:'Recharger les réglages enregistrés',exact:true});await reload.click();
 await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(page.getByRole('button',{name:'Annuler la suppression',exact:true})).toBeVisible();
 removedElsewhere=true;await reload.click();await page.getByRole('alertdialog').getByRole('button',{name:'Recharger les réglages enregistrés',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveText('Ce mode n’existe plus.');await expect(page.getByRole('button',{name:'Annuler la suppression',exact:true})).not.toBeVisible();await expect(page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true})).toBeDisabled();expect(writes).toEqual([]);
});
test('a pending mode deletion locks undo and dismissal until its one save is confirmed',async({page})=>{
 let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
 const writes=await install(page,'fr','light',undefined,{beforeResponse:async method=>{if(method==='PUT')await gate;}});
 await page.goto(`/1/settings/modes/${modeId}`);await stageEditorModeDeletion(page);
 await page.locator('.pos-editor-layout>aside').getByRole('link',{name:'Additions en attente',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Enregistrez pour confirmer la suppression');expect(writes).toEqual([]);
 await page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect.poll(()=>writes.length).toBe(1);await expect(page.getByRole('button',{name:'Annuler la suppression',exact:true})).toBeDisabled();await expect(page.locator('.pos-editor-head').getByRole('button',{name:'Fermer',exact:true})).toBeDisabled();
 await page.keyboard.press('Escape');await expect(page).toHaveURL(`/1/settings/modes/${modeId}/open-checks`);await expect(page.locator('.pos-editor-head button').last()).toBeDisabled();
 release();await expect(page).toHaveURL('/1/settings/modes');expect(writes).toHaveLength(1);
});
test('confirmed mode deletion keeps its title and loading state while the list navigation is slow',async({page})=>{
 const writes=await install(page);let releaseList:()=>void=()=>{},heldList=0;
 const listReady=new Promise<void>(resolve=>{releaseList=resolve;});
 await page.route('**/1/settings/modes?*',async route=>{if(route.request().headers().rsc==='1'){heldList++;await listReady;}await route.continue();});
 await page.goto(`/1/settings/modes/${modeId}`);await page.getByRole('textbox',{name:'Nom',exact:true}).fill('Slow navigation QA');await stageEditorModeDeletion(page);
 await page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true}).click();
 try{
  await expect.poll(()=>heldList).toBe(1);await expect(page.getByRole('status')).toContainText('Chargement');
  await expect(page.locator('.pos-editor-head h2')).toHaveText('Slow navigation QA');await expect(page.getByText('Ce mode n’existe plus.',{exact:true})).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Annuler la suppression',exact:true})).not.toBeVisible();await expect(page.locator('.pos-editor-head').getByRole('button',{name:'Fermer',exact:true})).toBeDisabled();await expect(page.locator('.pos-editor-head button').last()).toBeDisabled();
  await expect(page).toHaveURL(`/1/settings/modes/${modeId}`);expect(writes).toHaveLength(1);
 }finally{releaseList();}
 await expect(page).toHaveURL('/1/settings/modes');await expect(page.locator('[data-pos-settings=modes] tbody tr')).toHaveCount(1);
});
for(const [locale,theme,width,heading,undo]of [['en','light',390,'Deletion pending','Undo deletion'],['he','dark',320,'מחיקה ממתינה לאישור','ביטול המחיקה']]as const)test(`mode deletion pending state remains accessible ${locale} ${width}`,async({page},info)=>{
 const writes=await install(page,locale,theme);await page.setViewportSize({width,height:844});await page.goto(`/1/settings/modes/${modeId}`);
 await page.locator('.pos-mode-delete').click();await page.getByRole('alertdialog').getByRole('button').last().click();
 const editor=page.locator('.pos-mode-editor');await expect(editor.getByRole('heading',{name:heading,exact:true})).toBeVisible();await expect(editor.getByRole('button',{name:undo,exact:true})).toBeEnabled();
 await expect(editor.locator('.pos-editor-head h2')).toHaveText('Service complet');expect(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({path:info.outputPath(`mode-delete-pending-${locale}-${width}.png`)});await editor.getByRole('button',{name:undo,exact:true}).click();await expect(editor.getByRole('textbox')).toHaveValue('Service complet');expect(writes).toEqual([]);
});
test('Modes keeps a failed rename draft and rejects a foreign device inventory',async({page})=>{
 const writes=await install(page);await page.route('**/restaurants/1/devices',route=>route.fulfill({json:{devices:[{id:deviceId,restaurant_id:2,display_name:'Foreign fixture device'}]}}));
 await page.goto('/1/settings/modes');await page.locator('.pos-mode-name').first().click();const preview=page.locator('.pos-mode-preview');
 await expect(preview.getByRole('alert')).toBeVisible();await expect(preview.getByText('Foreign fixture device',{exact:true})).not.toBeVisible();
 await preview.getByRole('button',{name:'Renommer',exact:true}).click();const rename=page.getByRole('dialog').last();await rename.getByRole('textbox').fill('Draft retained');await rename.getByRole('button',{name:'Appliquer',exact:true}).click();
 await page.route('**/restaurants/1/settings',async route=>route.request().method()==='PUT'?route.fulfill({status:503,json:{error:'Synthetic unavailable'}}):route.fallback());
 await preview.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(preview.getByRole('heading',{name:'Draft retained',exact:true})).toBeVisible();await expect(preview.locator('.pos-error')).toBeVisible();expect(writes).toEqual([]);
 await preview.getByRole('button',{name:'Fermer',exact:true}).click();await expect(page.locator('.pos-mode-name').first()).toContainText('Draft retained');await expect(page.locator('.pos-settings-footer').getByRole('button')).toBeEnabled();
});
for(const [locale,theme,width] of [['fr','light',1440],['fr','dark',390],['he','light',1440],['he','dark',390]] as const)test(`Modes preview responsive ${locale} ${theme} ${width}`,async({page},info)=>{
 const writes=await install(page,locale,theme,['settings.view']);await page.setViewportSize({width,height:844});await page.goto('/1/settings/modes');
 await page.locator('.pos-mode-name').first().click();const preview=page.locator('.pos-mode-preview');await expect(preview).toBeVisible();
 expect(await preview.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 if(locale==='he')expect((await preview.boundingBox())?.x).toBe(0);
 await expect(preview.getByRole('button').last()).toBeDisabled();await page.keyboard.press('Escape');await expect(preview).not.toBeVisible();await expect(page.locator('.pos-mode-name').first()).toBeFocused();expect(writes).toEqual([]);
 await page.screenshot({path:info.outputPath(`modes-${locale}-${theme}-${width}.png`)});
});
test('fulfillment dialog discards on close and saves only on explicit Save',async({page},info)=>{
 const writes=await install(page);await page.goto('/1/settings/fulfillment');await page.getByRole('button',{name:'Gérer par point de vente'}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.locator('.pos-fulfillment-location>strong')).toHaveText('Atelier Foody');await page.addStyleTag({content:'nextjs-portal{display:none}'});await page.screenshot({path:info.outputPath('fulfillment-fr-light.png')});await dialog.getByRole('switch',{name:'Demander au personnel de choisir un mode de traitement',exact:true}).check();
 await dialog.getByRole('radio',{name:'Après avoir appuyé sur « Payer » ou « Envoyer »',exact:true}).check();
 await dialog.getByRole('button',{name:'Fermer',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Abandonner les modifications',exact:true}).click();
 expect(writes).toEqual([]);await page.getByRole('button',{name:'Gérer par point de vente'}).click();
 await expect(dialog.getByRole('switch',{name:'Demander au personnel de choisir un mode de traitement',exact:true})).not.toBeChecked();
 await dialog.getByRole('switch',{name:'Demander au personnel de choisir un mode de traitement',exact:true}).check();await dialog.getByRole('button',{name:'Enregistrer',exact:true}).click();
 expect(writes[0].fulfillment?.prompt).toBe('start');await expect(dialog).not.toBeVisible();
});
for(const [locale,theme,width,height] of [['fr','light',1440,756],['fr','dark',1440,756],['fr','dark',390,844],['he','dark',390,844]] as const)test(`mode visual ${locale} ${theme} ${width}`,async({page},info)=>{
 await install(page,locale,theme);await page.setViewportSize({width,height});await page.goto(`/1/settings/modes/${modeId}/order-entry`);
 await expect(page.locator('.pos-tile-option')).toHaveCount(2);await page.evaluate(()=>document.fonts.ready);
 if(width===1440){const box=await page.locator('.pos-tile-option').first().boundingBox();expect(box).toMatchObject({x:352,width:500,height:234});}
 const main=page.locator('.pos-editor-layout>main');expect(await main.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 expect(await page.locator('.pos-mode-editor').evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}))).toEqual(theme==='dark'?{background:'rgb(28, 28, 28)',color:'rgb(245, 245, 245)'}:{background:'rgb(255, 255, 255)',color:'rgb(26, 26, 26)'});
 await page.addStyleTag({content:'nextjs-portal{display:none}'});await page.screenshot({path:info.outputPath(`mode-${locale}-${theme}-${width}.png`)});
});
test('read-only mode options and service actions cannot persist',async({page})=>{
 const writes=await install(page,'en','light',['settings.view']);await page.goto(`/1/settings/modes/${modeId}/order-entry`);await expect(page.getByRole('radio').first()).toBeDisabled();await expect(page.getByRole('switch',{name:'Automatic progression',exact:true})).toBeDisabled();expect(writes).toEqual([]);
});

test('checkout sections share one unsaved profile until Save',async({page})=>{
 const writes=await install(page);await page.goto(`/1/settings/modes/${modeId}/order-entry`);
 await page.getByRole('radio',{name:/Tuiles hautes/}).focus();await page.keyboard.press('Space');
 await page.getByRole('link',{name:'Passage en caisse',exact:true}).click();
 await page.locator(`a[href='/1/settings/modes/${modeId}/covers']`).click();
 await expect(page.getByRole('alertdialog')).not.toBeVisible();
 await page.getByRole('radio').nth(1).check();
 await page.getByRole('link',{name:'Passage en caisse',exact:true}).click();
 await page.locator(`a[href='/1/settings/modes/${modeId}/order-entry']`).click();
 await expect(page.getByRole('radio',{name:/Tuiles hautes/})).toBeChecked();expect(writes).toEqual([]);
 await page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true}).click();
 expect(writes[0].modes?.[0]).toMatchObject({tile_size:'tall',seating_mode:'coversOnly'});expect(writes[0].seating_mode).toBe('optionalSeats');
});

test('independent hold/fire and sent-items preferences persist with the assigned mode',async({page},info)=>{
 const writes=await install(page);await page.setViewportSize({width:1440,height:756});await page.goto(`/1/settings/modes/${modeId}/courses`);
 await page.getByRole('switch',{name:'Autoriser la mise en attente et l’envoi des plats',exact:true}).uncheck();
 await page.getByRole('radio',{name:'Toujours laisser la section développée',exact:false}).check();
 await expect(page.getByRole('switch',{name:'Activer la gestion des services',exact:true})).toBeChecked();
 await page.evaluate(()=>document.fonts.ready);await page.addStyleTag({content:'nextjs-portal{display:none}'});await page.screenshot({path:info.outputPath('course-preferences-fr-light.png')});
 await page.locator('.pos-editor-head').getByRole('button',{name:'Enregistrer',exact:true}).click();
 expect(writes[0].modes?.[0]).toMatchObject({coursing_enabled:true,check_behavior:{allow_hold_fire:false,collapse_sent:false,open_checks_enabled:true,open_checks_home:false,predefined_tickets:false}});
 expect(writes[0].modes?.[1].check_behavior).toBeUndefined();
 await page.reload();await expect(page.getByRole('switch',{name:'Autoriser la mise en attente et l’envoi des plats',exact:true})).not.toBeChecked();
 await expect(page.getByRole('radio',{name:'Toujours laisser la section développée',exact:false})).toBeChecked();
});
for(const [locale,theme,width,height] of [['fr','light',1440,756],['fr','dark',390,844],['he','dark',390,844]] as const)test(`open checks mode ${locale} ${theme} ${width}`,async({page},info)=>{
 const writes=await install(page,locale,theme);await page.setViewportSize({width,height});await page.goto(`/1/settings/modes/${modeId}/open-checks`);
 const switches=page.getByRole('switch');await expect(switches).toHaveCount(4);
 await switches.nth(1).check();await switches.nth(3).check();
 await page.evaluate(()=>document.fonts.ready);await page.addStyleTag({content:'nextjs-portal{display:none}'});await page.screenshot({path:info.outputPath(`open-checks-${locale}-${theme}-${width}.png`)});
 expect(await page.locator('.pos-editor-layout>main').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await switches.first().uncheck();await expect(switches.nth(1)).toBeDisabled();await expect(switches.nth(2)).toBeDisabled();
 await page.locator('.pos-editor-head').getByRole('button').last().click();
 expect(writes[0].modes?.[0].check_behavior).toMatchObject({open_checks_enabled:false,open_checks_home:true,predefined_tickets:true});
 expect(writes[0].send_and_stay).toBe(false);
});

for(const [locale,theme,width] of [['fr','light',1440],['fr','dark',390],['he','dark',390],['he','light',1440]] as const) test(`custom dining catalogue ${locale} ${theme} ${width}`,async({page},info)=>{
 const writes=await install(page,locale,theme);await page.setViewportSize({width,height:844});await page.goto('/1/settings/fulfillment');
 await page.getByRole('button',{name:locale==='he'?'ניהול לפי סניף':'Gérer par point de vente',exact:true}).click();
 const editor=page.locator('.pos-fulfillment-editor');
 if(width===1440){const bounds=await editor.boundingBox();expect(bounds?.width).toBe(664);expect(bounds?.x).toBe(388);}
 await editor.getByRole('button',{name:locale==='he'?'הוספת אפשרות מסירה':'Ajouter un mode de traitement'}).click();
 const drawer=page.getByRole('dialog').last();
 await drawer.getByRole('textbox').fill('Boutique');
 await drawer.getByRole('combobox').selectOption('dine_in');
 await drawer.getByRole('button',{name:locale==='he'?'שמור':'Enregistrer',exact:true}).click();
 expect(writes).toEqual([]);
 for(let i=0;i<4;i++) await editor.getByRole('button',{name:locale==='he'?'הזזה למעלה Boutique':'Monter Boutique',exact:true}).click();
 await expect(editor.getByRole('button',{name:/^Boutique/}).first()).toBeVisible();
 expect(await editor.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath(`dining-${locale}-${theme}-${width}.png`)});
 await editor.locator('.pos-editor-head').getByRole('button').last().click();
 expect(writes).toHaveLength(1);
 const saved=writes[0].fulfillment!;expect(saved.methods?.[0]).toMatchObject({name:'Boutique',order_type:'dine_in'});
 expect(saved.default).toBe(saved.methods?.[0].id);expect(saved.enabled[0]).toBe(saved.default);
 await page.reload();await expect(page.getByText('Boutique',{exact:true})).toBeVisible();
});

test('main catalogue edits save explicitly, reload, and retain a failed edit',async({page},info)=>{
 const writes=await install(page);await page.goto('/1/settings/fulfillment');
 const card=page.locator('.pos-fulfillment-card').filter({has:page.getByText('Livraison',{exact:true})});
 await card.getByRole('button').click();
 const method=page.locator('.pos-fulfillment-method-editor');
 await method.getByRole('textbox').fill('Coursier test');
 await method.getByRole('switch').check();
 const box=await method.boundingBox();expect(box?.width).toBe(664);
 await expect(page.locator('.pos-fulfillment-overlay').last()).toHaveCSS('background-color','rgba(0, 0, 0, 0.8)');
 await page.addStyleTag({content:'nextjs-portal{display:none}'});
 await page.screenshot({path:info.outputPath('square-method-editor-fr.png')});
 expect(writes).toHaveLength(0);
 await method.getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect(method).not.toBeVisible();expect(writes).toHaveLength(1);
 expect(writes[0].fulfillment?.methods?.find(m=>m.id==='delivery')).toMatchObject({name:'Coursier test',show_customer_information:true});
 await page.reload();await page.locator('.pos-fulfillment-card').filter({has:page.getByText('Coursier test',{exact:true})}).getByRole('button').click();
 await expect(method.getByRole('switch')).toBeChecked();
 await method.getByRole('textbox').fill('Retained draft');
 await page.route('**/restaurants/1/settings',async route=>{if(route.request().method()==='PUT')await route.fulfill({status:503,json:{error:'Synthetic unavailable'}});else await route.fallback();});
 await method.getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect(method.getByRole('alert')).toBeVisible();await expect(method.getByRole('textbox')).toHaveValue('Retained draft');
 await expect(method).toBeVisible();
});

test('fulfillment prompt timing survives disabling and re-enabling in the draft',async({page})=>{
 const writes=await install(page);await page.goto('/1/settings/fulfillment');await page.getByRole('button',{name:'Gérer par point de vente'}).click();
 const editor=page.locator('.pos-fulfillment-editor'),toggle=editor.getByRole('switch',{name:'Demander au personnel de choisir un mode de traitement',exact:true});
 await toggle.check();await editor.getByRole('radio',{name:'Après avoir appuyé sur « Payer » ou « Envoyer »',exact:true}).check();
 await toggle.uncheck();await toggle.check();await expect(editor.getByRole('radio',{name:'Après avoir appuyé sur « Payer » ou « Envoyer »',exact:true})).toBeChecked();
 await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();expect(writes[0].fulfillment?.prompt).toBe('checkout');
});

test('method editing is cancelled independently and the last active method cannot be hidden',async({page},info)=>{
 const writes=await install(page);await page.goto('/1/settings/fulfillment');await page.getByRole('button',{name:'Gérer par point de vente'}).click();
 const editor=page.locator('.pos-fulfillment-editor').first();await editor.getByRole('button',{name:/^Livraison$/,exact:true}).click();
 const method=page.locator('.pos-fulfillment-method-editor');await method.getByRole('textbox').fill('Courier');await method.getByRole('combobox').selectOption('dine_in');await page.screenshot({path:info.outputPath('fulfillment-method-fr-light.png')});await method.getByRole('button',{name:'Fermer',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Abandonner les modifications',exact:true}).click();
 await expect(editor.getByRole('button',{name:'Livraison',exact:true})).toBeVisible();await expect(editor.getByRole('button',{name:'Courier',exact:true})).toHaveCount(0);
 await editor.getByRole('switch',{name:'Sur place',exact:true}).uncheck();await editor.getByRole('switch',{name:'Livraison',exact:true}).uncheck();
 const active=editor.getByRole('switch',{checked:true});await expect(active).toHaveCount(1);await expect(active).toBeDisabled();expect(writes).toEqual([]);
});

test('a missing server capability disables fulfillment edits without writing',async({page})=>{
 const writes=await install(page,'fr','light',undefined,{supported:false});await page.goto('/1/settings/fulfillment');await page.getByRole('button',{name:'Gérer par point de vente'}).click();
 const editor=page.locator('.pos-fulfillment-editor');await expect(editor.getByRole('alert')).toContainText('ne prend pas encore en charge');await expect(editor.getByRole('switch').first()).toBeDisabled();await expect(editor.getByRole('button',{name:'Ajouter un mode de traitement'})).toBeDisabled();expect(writes).toEqual([]);
});

test('a truncated saved catalog leaves the draft visible and never reports success',async({page})=>{
 const writes=await install(page,'fr','light',undefined,{savedPolicy:policy=>({...policy,fulfillment:{...policy.fulfillment!,methods:undefined}})});
 await page.goto('/1/settings/fulfillment');await page.getByRole('button',{name:'Gérer par point de vente'}).click();const editor=page.locator('.pos-fulfillment-editor');
 await editor.getByRole('switch',{name:'Demander au personnel de choisir un mode de traitement',exact:true}).check();await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect(editor.getByRole('alert')).toContainText('n’a pas confirmé');await expect(editor.getByRole('switch').first()).toBeChecked();await expect(editor.getByRole('button',{name:'Enregistrer',exact:true})).toBeEnabled();expect(writes).toHaveLength(1);
});

test('fulfillment Escape cancels only the current editor and restores its keyboard trigger',async({page})=>{
 const writes=await install(page);await page.goto('/1/settings/fulfillment');
 const manage=page.getByRole('button',{name:'Gérer par point de vente',exact:true});await manage.focus();await page.keyboard.press('Enter');
 const editor=page.locator('.pos-fulfillment-editor').first();
 const delivery=editor.getByRole('button',{name:'Livraison',exact:true});await delivery.focus();await page.keyboard.press('Enter');
 const method=page.locator('.pos-fulfillment-method-editor');await method.getByRole('textbox').fill('Not applied');
 await page.keyboard.press('Escape');await page.getByRole('alertdialog').getByRole('button',{name:'Abandonner les modifications',exact:true}).click();await expect(method).not.toBeVisible();await expect(editor).toBeVisible();await expect(delivery).toBeFocused();
 await expect(editor.getByRole('button',{name:'Not applied',exact:true})).toHaveCount(0);expect(writes).toEqual([]);
 await page.keyboard.press('Escape');await expect(editor).not.toBeVisible();await expect(manage).toBeFocused();
 await page.keyboard.press('Enter');await editor.getByRole('switch',{name:'Demander au personnel de choisir un mode de traitement',exact:true}).focus();await page.keyboard.press('Space');
 await page.keyboard.press('Escape');const confirmation=page.getByRole('alertdialog');await expect(confirmation).toBeVisible();
 await confirmation.getByRole('button',{name:'Annuler',exact:true}).click();await expect(confirmation).not.toBeVisible();await expect(editor.getByRole('switch').first()).toBeChecked();
 await page.keyboard.press('Escape');await confirmation.getByRole('button',{name:'Abandonner les modifications',exact:true}).click();await expect(editor).not.toBeVisible();await expect(manage).toBeFocused();expect(writes).toEqual([]);
});

test('hidden custom methods and additive fields survive an unrelated prompt edit and reload',async({page})=>{
 const methods=[{id:modeId,name:'Counter pickup',order_type:'pickup' as const,future_rule:{allow:false}},{id:otherId,name:'Seasonal delivery',order_type:'delivery' as const,future_rule:{allow:true}},{id:'dine_in',name:'Dining room',order_type:'dine_in' as const}];
 const writes=await install(page,'fr','light',undefined,{initialPolicy:{fulfillment:{prompt:'never',default:modeId,enabled:[modeId,'dine_in'],methods}}});
 await page.goto('/1/settings/fulfillment');await expect(page.getByText('Seasonal delivery',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Gérer par point de vente'}).click();
 const editor=page.locator('.pos-fulfillment-editor');await expect(editor.getByRole('switch',{name:'Seasonal delivery',exact:true})).not.toBeChecked();
 await editor.getByRole('switch',{name:'Demander au personnel de choisir un mode de traitement',exact:true}).check();await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();
 expect(writes[0].fulfillment).toEqual({prompt:'start',default:modeId,enabled:[modeId,'dine_in'],methods});
 await page.reload();await page.getByRole('button',{name:'Gérer par point de vente'}).click();await expect(editor.getByRole('switch',{name:'Seasonal delivery',exact:true})).not.toBeChecked();
 await editor.getByRole('switch',{name:'Seasonal delivery',exact:true}).check();await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();expect(writes[1].fulfillment?.enabled).toEqual([modeId,otherId,'dine_in']);expect(writes[1].fulfillment?.methods).toEqual(methods);
});

test('fulfillment keeps the editor locked during Save and restores focus after confirmation',async({page})=>{
 let release!:()=>void;const response=new Promise<void>(resolve=>{release=resolve;});
 const writes=await install(page,'fr','light',undefined,{beforeResponse:method=>method==='PUT'?response:Promise.resolve()});
 await page.goto('/1/settings/fulfillment');const manage=page.getByRole('button',{name:'Gérer par point de vente'});await manage.click();
 const editor=page.locator('.pos-fulfillment-editor');await editor.getByRole('switch').first().check();await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect.poll(()=>writes.length).toBe(1);await expect(editor.getByRole('switch').first()).toBeDisabled();await expect(editor.getByRole('button',{name:'Fermer',exact:true})).toBeDisabled();
 await page.keyboard.press('Escape');await expect(editor).toBeVisible();await expect(page.getByRole('alertdialog')).not.toBeVisible();
 release();await expect(editor).not.toBeVisible();await expect(manage).toBeFocused();expect(writes).toHaveLength(1);
});

for(const pending of ['load','draft','save'] as const)test(`restaurant navigation isolates fulfillment ${pending} and late responses`,async({page})=>{
 let release!:()=>void,requestStarted=false;const response=new Promise<void>(resolve=>{release=resolve;});
 const writes=await install(page,'fr','light',undefined,{restaurantIds:[1,2],beforeResponse:async method=>{if(pending==='load'&&method==='GET'||pending==='save'&&method==='PUT'){requestStarted=true;await response;}}});
 const second:FullServiceSettings={seating_mode:'disabled',send_and_stay:false,coursing_enabled:false,courses:['Service'],show_held_on_kds:false,sort_cart:'entry',comp_reasons:['Gift'],void_reasons:['Mistake'],fulfillment:{prompt:'checkout',default:otherId,enabled:[otherId],methods:[{id:otherId,name:'Jardin only',order_type:'delivery'}]}};
 const secondWrites:FullServiceSettings[]=[];
 await page.route('**/api/v1/restaurants/2/settings',route=>{const r=route.request();expect(r.headers()['x-restaurant-id']).toBe('2');if(r.method()==='PUT')secondWrites.push(r.postDataJSON().full_service);return route.fulfill({json:{settings:{full_service:second,pos_custom_dining_supported:true}}});});
 await page.goto('/2/settings/fulfillment');await expect(page.getByText('Jardin only',{exact:true})).toBeVisible();
 const originalHistoryLength=await page.evaluate(()=>history.length);
 await page.getByRole('button',{name:'Jardin Foody',exact:true}).click();await page.getByRole('link',{name:'Changer de restaurant',exact:true}).click();
 await page.getByRole('button',{name:/^Atelier Foody/}).click();await expect(page).toHaveURL(/\/1\/dashboard$/,{timeout:15_000});
 await page.getByRole('button',{name:'Paramètres',exact:true}).click();await page.getByRole('button',{name:'Modes de traitement',exact:true}).click();await page.locator('a[href="/1/settings/fulfillment"]').click();
 const manage=page.getByRole('button',{name:'Gérer par point de vente'});
 if(pending==='load')await expect.poll(()=>requestStarted).toBe(true);
 else{await manage.click();const editor=page.locator('.pos-fulfillment-editor');await expect(editor.locator('.pos-fulfillment-location>strong')).toHaveText('Atelier Foody');await editor.getByRole('switch').first().check();if(pending==='save'){await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect.poll(()=>requestStarted).toBe(true);}}
 const previousEntries=await page.evaluate(start=>history.length-start,originalHistoryLength);
 await page.evaluate(count=>history.go(-count),previousEntries);await expect(page).toHaveURL(/\/2\/settings\/fulfillment$/);await expect(page.getByText('Jardin only',{exact:true})).toBeVisible();
 const lateResponse=pending==='draft'?null:page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/restaurants/1/settings'&&response.request().method()===(pending==='load'?'GET':'PUT'));
 release();if(lateResponse)await (await lateResponse).finished();
 await manage.click();const editor=page.locator('.pos-fulfillment-editor');await expect(editor.locator('.pos-fulfillment-location>strong')).toHaveText('Jardin Foody');await expect(editor.getByRole('radio',{name:'Après avoir appuyé sur « Payer » ou « Envoyer »',exact:true})).toBeChecked();await expect(editor.getByRole('button',{name:'Enregistrer',exact:true})).toBeDisabled();await expect(editor.getByRole('switch',{name:'Jardin only',exact:true})).toBeChecked();
 await editor.getByRole('button',{name:/^Jardin only/}).click();const method=page.locator('.pos-fulfillment-method-editor');await expect(method.getByRole('switch')).toHaveCount(0);await expect(method.getByRole('status')).toContainText('ne prend pas encore en charge');
 expect(secondWrites).toEqual([]);expect(writes).toHaveLength(pending==='save'?1:0);
});

test('customer screen stays staged and Cancel does not materialize a legacy false',async({page})=>{
 const writes=await install(page);await page.goto('/1/settings/fulfillment');await page.getByRole('button',{name:'Gérer par point de vente'}).click();
 const editor=page.locator('.pos-fulfillment-editor').first(),method=page.locator('.pos-fulfillment-method-editor');
 await editor.getByRole('button',{name:'Livraison',exact:true}).click();await method.getByRole('switch',{name:'Afficher l’écran d’informations client',exact:true}).check();await page.keyboard.press('Escape');
 await page.getByRole('alertdialog').getByRole('button',{name:'Abandonner les modifications',exact:true}).click();
 await editor.getByRole('button',{name:'Livraison',exact:true}).click();await expect(method.getByRole('switch')).not.toBeChecked();await method.getByRole('textbox').fill('Courier');await method.getByRole('button',{name:'Enregistrer',exact:true}).click();expect(writes).toEqual([]);
 await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();expect(writes[0].fulfillment?.methods?.find(method=>method.id==='delivery')).toEqual({id:'delivery',name:'Courier',order_type:'delivery'});
});

for(const [locale,theme,width] of [['fr','light',1440],['he','dark',390]] as const)test(`customer screen true and false roundtrip ${locale} ${theme} ${width}`,async({page},info)=>{
 const writes=await install(page,locale,theme);await page.setViewportSize({width,height:844});await page.goto('/1/settings/fulfillment');
 const manage=page.getByRole('button',{name:locale==='fr'?'Gérer par point de vente':'ניהול לפי סניף',exact:true});await manage.click();
 const editor=page.locator('.pos-fulfillment-editor').first(),method=page.locator('.pos-fulfillment-method-editor');
 const delivery=locale==='fr'?'Livraison':'משלוח';await editor.getByRole('button',{name:delivery,exact:true}).click();await method.getByRole('switch').check();
 await page.screenshot({path:info.outputPath(`customer-information-${locale}-${theme}-${width}.png`)});expect(await method.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await method.locator('.pos-editor-head').getByRole('button').last().click();expect(writes).toEqual([]);await editor.locator('.pos-editor-head').getByRole('button').last().click();expect(writes[0].fulfillment?.methods?.find(method=>method.id==='delivery')?.show_customer_information).toBe(true);
 await page.reload();await manage.click();await editor.getByRole('button',{name:delivery,exact:true}).click();await expect(method.getByRole('switch')).toBeChecked();await method.getByRole('switch').uncheck();await method.locator('.pos-editor-head').getByRole('button').last().click();await editor.locator('.pos-editor-head').getByRole('button').last().click();expect(writes[1].fulfillment?.methods?.find(method=>method.id==='delivery')?.show_customer_information).toBe(false);
 await page.reload();await manage.click();await editor.getByRole('button',{name:delivery,exact:true}).click();await expect(method.getByRole('switch')).not.toBeChecked();
});

test('missing customer capability hides only the new control and preserves legacy catalogue editing',async({page})=>{
 const writes=await install(page,'fr','light',undefined,{customerInformationSupported:false});await page.goto('/1/settings/fulfillment');await page.getByRole('button',{name:'Gérer par point de vente'}).click();
 const editor=page.locator('.pos-fulfillment-editor').first(),method=page.locator('.pos-fulfillment-method-editor');await editor.getByRole('button',{name:'Livraison',exact:true}).click();await expect(method.getByRole('switch')).toHaveCount(0);await expect(method.getByRole('status')).toContainText('ne prend pas encore en charge');
 await method.getByRole('textbox').fill('Courier');await method.getByRole('button',{name:'Enregistrer',exact:true}).click();await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor).not.toBeVisible();expect(writes[0].fulfillment?.methods?.find(method=>method.id==='delivery')).toEqual({id:'delivery',name:'Courier',order_type:'delivery'});
});

test('missing capability never strips an existing customer preference to save other changes',async({page})=>{
 const writes=await install(page,'fr','light',undefined,{customerInformationSupported:false,initialPolicy:{fulfillment:{prompt:'never',default:'pickup',enabled:['pickup'],methods:[{id:'pickup',name:'Counter',order_type:'pickup',show_customer_information:true}]}}});
 await page.goto('/1/settings/fulfillment');await page.getByRole('button',{name:'Gérer par point de vente'}).click();const editor=page.locator('.pos-fulfillment-editor');await editor.getByRole('switch').first().check();await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('l’écran d’informations client');expect(writes).toEqual([]);
});

for(const lost of ['false','capability'] as const)test(`customer preference save with lost ${lost} keeps draft unconfirmed`,async({page})=>{
 const writes=await install(page,'fr','light',undefined,{...(lost==='false'?{savedPolicy:(policy:FullServiceSettings)=>({...policy,fulfillment:{...policy.fulfillment!,methods:policy.fulfillment!.methods!.map(({show_customer_information,...method})=>method)}})}:{savedCustomerInformationSupported:false})});
 await page.goto('/1/settings/fulfillment');await page.getByRole('button',{name:'Gérer par point de vente'}).click();const editor=page.locator('.pos-fulfillment-editor').first(),method=page.locator('.pos-fulfillment-method-editor');await editor.getByRole('button',{name:'Livraison',exact:true}).click();await method.getByRole('switch').check();await method.getByRole('switch').uncheck();await method.getByRole('button',{name:'Enregistrer',exact:true}).click();await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect(editor.getByRole('alert')).toContainText('n’a pas confirmé');await expect(editor).toBeVisible();expect(writes).toHaveLength(1);expect(writes[0].fulfillment?.methods?.find(method=>method.id==='delivery')?.show_customer_information).toBe(false);
});


test('fulfillment tracking saves explicit false independently and survives a fresh read',async({page},info)=>{
 const writes=await install(page);await page.goto('/1/settings/fulfillment');
 await page.locator('.pos-fulfillment-card').first().getByRole('button',{name:'Modifier',exact:true}).click();
 const editor=page.getByRole('dialog').last();
 await expect(editor.getByRole('switch',{name:'Suivre la préparation',exact:true})).toBeChecked();
 await expect(editor.getByRole('switch',{name:'Suivre la remise',exact:true})).toBeChecked();
 await editor.getByRole('switch',{name:'Suivre la remise',exact:true}).uncheck();
 await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect.poll(()=>writes.length).toBe(1);
 expect(writes[0].fulfillment?.methods?.[0]).toMatchObject({track_handoff:false});
 expect(writes[0].fulfillment?.methods?.[0].track_preparation).toBeUndefined();
 await page.reload();await page.locator('.pos-fulfillment-card').first().getByRole('button',{name:'Modifier',exact:true}).click();
 await expect(page.getByRole('dialog').last().getByRole('switch',{name:'Suivre la remise',exact:true})).not.toBeChecked();
 await page.screenshot({path:info.outputPath('fulfillment-tracking-fr.png')});
});
