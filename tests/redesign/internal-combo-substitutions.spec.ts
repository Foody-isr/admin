import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, locale = 'fr', sized = false) {
 const fixture = createFixture();
 const base = fixture.items[0];
 const chicken = { ...base, id: 201, name: 'Poulet démo', price: 25, modifiers: [], option_sets: [] };
 const beef = { ...chicken, id: 202, name: 'Bœuf démo' };
 const fish = { ...chicken, id: 203, name: 'Poisson démo', price: 95,
  option_sets: sized ? [{id:10,name:'Format',options:[{id:41,name:'250g',price:90,is_active:true},{id:42,name:'500g',price:150,is_active:true}]}] : [] };
 const combo = { ...chicken, id: 210, name: 'Formule Mamie démo', price: 100, item_type: 'combo',
  combo_steps: [{id:301,name:'Plats',source_type:'explicit',min_picks:2,max_picks:2,max_per_item:1,
   items:[{menu_item_id:201,menu_item:chicken,price_delta:0},{menu_item_id:202,menu_item:beef,price_delta:0}]}] };
 const items = [chicken, beef, fish, combo,
  {...chicken,id:204,name:'Article désactivé',is_active:false},
  {...chicken,id:205,name:'Article épuisé',availability_state:'sold_out'},
  {...chicken,id:206,name:'Article au poids',pricing_mode:'by_weight'}];
 const orders: Record<string, any>[]=[];
 const replacements: Record<string, any>[]=[];
 await page.addInitScript(locale => {
  localStorage.setItem('foody_restaurant_token','isolated-ui-fixture');
  localStorage.setItem('foody_restaurant_user',JSON.stringify({id:1,full_name:'Équipe démo',role:'owner'}));
  localStorage.setItem('foody_restaurant_ids','[1]');
  localStorage.setItem('foody-admin-locale',locale);
 },locale);
 await page.route('**/*',route => ['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
 await page.route('**/api/v1/**',async route => {
  const req=route.request(),url=new URL(req.url()),path=url.pathname.replace(/\/$/,'');
  if(path==='/api/v1/menu/items')return route.fulfill({json:{items}});
  if(path==='/api/v1/menu')return route.fulfill({json:{menus:[{...fixture.menus[0],groups:[{id:1,name:'Carte',items}]}]}});
  if(path.endsWith('/staff-batch-fulfillment-config'))return route.fulfill({json:{enabled:false,upcoming_cycles:[]}});
  if(/\/menu\/groups\/\d+\/memberships$/.test(path))return route.fulfill({json:{memberships:[]}});
  if(path==='/api/v1/orders/1048/combo/demo-combo'&&req.method()==='PUT'){replacements.push(req.postDataJSON());return route.fulfill({json:{order:fixture.orders[0]}});}
  if(path==='/api/v1/orders'&&req.method()==='POST'){orders.push(req.postDataJSON());return route.fulfill({json:{order:{id:999}}});}
  const result=fixture.response(req.url(),req.method(),req.postDataJSON()??{},1);
  return route.fulfill({status:result.status??200,json:result.json??{}});
 });
 return {orders,replacements,fixture,combo};
}
const modal=(page:Page)=>page.getByRole('dialog');
async function start(page:Page){await page.goto('/1/orders/new');await page.getByRole('button',{name:/^Formule Mamie démo/}).first().click();}
async function submit(page:Page,state:Awaited<ReturnType<typeof install>>){
 const ticket=page.getByRole('complementary',{name:'Articles de la commande',exact:true});
 await expect(ticket).toContainText('100.00');
 await ticket.getByRole('button',{name:'Continuer',exact:true}).click();
 await page.getByRole('region',{name:'Finaliser la commande',exact:true}).getByRole('radio',{name:'Payer plus tard',exact:true}).check();
 await page.getByRole('region',{name:'Finaliser la commande',exact:true}).getByRole('combobox',{name:'Nom du client',exact:true}).fill('Client démo');
 await page.getByRole('region',{name:'Finaliser la commande',exact:true}).getByRole('combobox',{name:'Numéro de téléphone',exact:true}).fill('0500000000');
 await page.getByRole('region',{name:'Finaliser la commande',exact:true}).getByRole('button',{name:/^Créer la commande/}).click();
 await expect.poll(()=>state.orders.length).toBe(1);
 return state.orders[0].combos[0].selections;
}
test('internal exception replaces beef with fish, keeps the base price and survives draft restoration',async({page})=>{
 const state=await install(page);await start(page);
 await modal(page).getByRole('button',{name:'Poulet démo',exact:true}).click();
 await modal(page).getByRole('button',{name:'Choisir un autre article',exact:true}).click();
 await expect(modal(page).getByRole('button',{name:/Article désactivé|Article au poids|Formule Mamie démo/})).toHaveCount(0);
 await expect(modal(page).getByRole('button',{name:/Article épuisé/})).toBeDisabled();
 await modal(page).getByRole('searchbox').fill('poisson');
 await modal(page).getByRole('button',{name:'Poisson démo Exception · inclus',exact:true}).click();
 await expect(modal(page).getByRole('button',{name:/Ajouter à la commande/})).toContainText('100.00');
 await modal(page).getByRole('button',{name:/Ajouter à la commande/}).click();
 await expect.poll(()=>page.evaluate(()=>Object.entries(localStorage).some(([key,value])=>key.includes('draft')&&value.includes('Poisson démo')))).toBe(true);
 await page.reload();
 await expect(page.getByRole('complementary',{name:'Articles de la commande',exact:true})).toContainText('Poisson démo');
 const selections=await submit(page,state);
 expect(selections).toEqual([{step_id:301,menu_item_id:201,quantity:1},{step_id:301,menu_item_id:203,quantity:1,is_substitution:true}]);
});
test('regular composition keeps the standard payload',async({page})=>{
 const state=await install(page);await start(page);
 await modal(page).getByRole('button',{name:'Poulet démo',exact:true}).click();
 await modal(page).getByRole('button',{name:'Bœuf démo',exact:true}).click();
 await modal(page).getByRole('button',{name:/Ajouter à la commande/}).click();
 const selections=await submit(page,state);
 expect(selections).toEqual([{step_id:301,menu_item_id:201,quantity:1},{step_id:301,menu_item_id:202,quantity:1}]);
});
test('replacement size price is included and step capacity is preserved',async({page})=>{
 const state=await install(page,'fr',true);await start(page);
 await modal(page).getByRole('button',{name:'Poulet démo',exact:true}).click();
 await modal(page).getByRole('button',{name:'Choisir un autre article',exact:true}).click();
 await modal(page).getByRole('button',{name:'Poisson démo · 500g Exception · inclus',exact:true}).click();
 await expect(modal(page).getByRole('button',{name:'Poisson démo · 250g Exception · inclus',exact:true})).toBeDisabled();
 await modal(page).getByRole('button',{name:/Ajouter à la commande/}).click();
 const selections=await submit(page,state);
 expect(selections[1]).toMatchObject({menu_item_id:203,option_id:42,is_substitution:true,quantity:1});
});
for(const [locale,choose,included] of [['en','Choose another item','Exception · included'],['he','בחירת פריט אחר','חריגה · כלול במחיר']]){
 test(`mobile replacement picker is localized in ${locale}`,async({page})=>{
  await install(page,locale);await page.setViewportSize({width:390,height:844});await start(page);
  await modal(page).getByRole('button',{name:choose,exact:true}).click();
  await expect(modal(page).getByRole('button',{name:`Poisson démo ${included}`,exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}

test('saved exception reopens and saves with the original combo base price',async({page})=>{
 const state=await install(page);
 state.combo.price=300;
 Object.assign(state.fixture.orders[0],{order_type:'pickup',status:'accepted',payment_status:'unpaid',total_amount:100,total:100,subtotal_amount:100,
  items:[
   {id:9001,menu_item_id:201,name:'Poulet démo',quantity:1,price:0,combo_item_id:210,combo_step_id:301,combo_group:'demo-combo',combo_name:'Formule Mamie démo',combo_price:100},
   {id:9002,menu_item_id:203,name:'Poisson démo',quantity:1,price:0,combo_item_id:210,combo_step_id:301,combo_group:'demo-combo',combo_name:'Formule Mamie démo',combo_price:100,combo_substitution:true},
  ]});
 await page.goto('/1/orders/1048');
 await modal(page).getByRole('button',{name:'Actions',exact:true}).click();
 await page.getByRole('menuitem',{name:'Modifier',exact:true}).click();
 await modal(page).getByRole('button',{name:'Modifier le menu',exact:true}).click();
 const composer=modal(page).filter({has:page.getByRole('heading',{name:'Formule Mamie démo',exact:true})});
 await expect(composer).toContainText('Exception · inclus');
 await expect(composer.getByRole('button',{name:/^Enregistrer/})).toContainText('100.00');
 await composer.getByRole('button',{name:/^Enregistrer/}).click();
 await modal(page).getByRole('button',{name:/^Enregistrer les modifications/}).click();
 await expect.poll(()=>state.replacements.length).toBe(1);
 expect(state.replacements[0].selections).toEqual([{step_id:301,menu_item_id:201,quantity:1},{step_id:301,menu_item_id:203,quantity:1,is_substitution:true}]);
});

test('a single-choice exception replaces an existing choice even at its per-item cap',async({page})=>{
 const state=await install(page);
 Object.assign(state.combo.combo_steps[0],{min_picks:1,max_picks:1,max_per_item:1});
 await start(page);
 await modal(page).getByRole('button',{name:'Poulet démo',exact:true}).click();
 await modal(page).getByRole('button',{name:'Choisir un autre article',exact:true}).click();
 await modal(page).getByRole('button',{name:'Poulet démo Exception · inclus',exact:true}).click();
 await modal(page).getByRole('button',{name:/Ajouter à la commande/}).click();
 const selections=await submit(page,state);
 expect(selections).toEqual([{step_id:301,menu_item_id:201,quantity:1,is_substitution:true}]);
});
