import { expect, test, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
import type { FullServiceSettings } from '../../src/lib/api';
const modeId='4d3db2c3-b29a-4d8d-94f5-0a231d85bc22';
const otherId='4d3db2c3-b29a-4d8d-94f5-0a231d85bc23';
const deviceId='5d3db2c3-b29a-4d8d-94f5-0a231d85bc22';
async function install(page:Page,locale='fr',theme='light',permissions?:string[]) {
 const fixtureOptions={library:true,permissions};
 const fixture=createFixture(fixtureOptions);
 let policy:FullServiceSettings={seating_mode:'optionalSeats',send_and_stay:false,coursing_enabled:true,courses:['Entrées','Plats principaux','Desserts'],show_held_on_kds:false,sort_cart:'course',comp_reasons:['Geste commercial'],void_reasons:['Erreur'],auto_progression:true,order_entry:{tile_size:'tall',return_to_menu:'home'},modes:[{id:modeId,name:'Service complet',device_ids:[],seating_mode:'requiredSeats',send_and_stay:true,coursing_enabled:true,auto_progression:true,tile_size:'wide',sort_cart:'seat'},{id:otherId,name:'Comptoir',device_ids:[deviceId],seating_mode:'disabled',send_and_stay:false,coursing_enabled:false,auto_progression:false,tile_size:'tall',sort_cart:'entry'}]};
 const writes:FullServiceSettings[]=[];
 await page.addInitScript(({locale,theme})=>{
  localStorage.setItem('foody_restaurant_token','isolated-ui-fixture');localStorage.setItem('foody_restaurant_user',JSON.stringify({id:1,full_name:'Demo',role:'owner',email:'demo@foody.test'}));localStorage.setItem('foody_restaurant_ids','[1]');localStorage.setItem('foody-admin-locale',locale);localStorage.setItem('foody_admin_theme',theme);
 },{locale,theme});
 await page.route('**/*',route=>['localhost','127.0.0.1','square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname)?route.fallback():route.abort());
 await page.route('**/api/v1/**',route=>{
  const r=route.request(),path=new URL(r.url()).pathname,body=r.postDataJSON()??{};
  if(path==='/api/v1/restaurants/1/settings'){
   if(r.method()==='PUT'){expect(r.headers()['x-restaurant-id']).toBe('1');expect(Object.keys(body)).toEqual(['full_service']);policy=body.full_service;writes.push(structuredClone(policy));}
   return route.fulfill({json:{settings:{full_service:policy,pos_custom_dining_supported:true}}});
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
test('fulfillment dialog discards on close and saves only on explicit Save',async({page},info)=>{
 const writes=await install(page);await page.goto('/1/settings/fulfillment');await page.getByRole('button',{name:'Gérer par point de vente'}).click();
 const dialog=page.getByRole('dialog');await page.addStyleTag({content:'nextjs-portal{display:none}'});await page.screenshot({path:info.outputPath('fulfillment-fr-light.png')});await dialog.getByRole('switch',{name:'Demander au personnel de choisir un mode de traitement',exact:true}).check();
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
 expect(await page.locator('.pos-mode-editor').evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}))).toEqual(theme==='dark'?{background:'rgb(28, 28, 28)',color:'rgb(245, 245, 245)'}:{background:'rgb(255, 255, 255)',color:'rgb(23, 23, 23)'});
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

for(const [locale,theme,width] of [['fr','light',1440],['fr','dark',390],['he','dark',390]] as const) test(`custom dining catalogue ${locale} ${theme} ${width}`,async({page},info)=>{
 const writes=await install(page,locale,theme);await page.setViewportSize({width,height:844});await page.goto('/1/settings/fulfillment');
 await page.getByRole('button',{name:locale==='he'?'ניהול לפי סניף':'Gérer par point de vente',exact:true}).click();
 const editor=page.locator('.pos-fulfillment-editor');
 await editor.getByRole('button',{name:locale==='he'?'הוספת אפשרות מסירה':'Ajouter un mode de traitement'}).click();
 const drawer=page.getByRole('dialog').last();
 await drawer.getByRole('textbox').fill('Boutique');
 await drawer.getByRole('radio').first().check();
 await drawer.getByRole('button',{name:locale==='he'?'סיום':'Terminé',exact:true}).click();
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
