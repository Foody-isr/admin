import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, options: {locale?: string; theme?: string; empty?: boolean; denied?: boolean; fail?: boolean; permissions?: string[]; authenticated?: boolean; library?: boolean; rotation?: boolean; menuLibrary?: boolean; carte?: boolean; unitLibrary?:boolean; stockLibrary?:boolean} = {}) {
  const fixture = createFixture(options);
  await page.addInitScript(({locale,theme,authenticated}) => {
    if (authenticated) {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({id:1,full_name:'Équipe démo',role:'owner',email:'demo@foody.test'}));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    }
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', theme);
  }, {locale:options.locale??'fr',theme:options.theme??'light',authenticated:options.authenticated!==false});
  await page.route('**/api/v1/**', async route => {
    const request=route.request();
    const result=fixture.response(request.url(),request.method(),request.postDataJSON()??{},Number(request.headers()['x-restaurant-id'])||1);
    await route.fulfill({status:result.status??200,json:result.json??{}});
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['localhost','127.0.0.1'].includes(url.hostname)) return route.fallback();
    await route.abort();
  });
  return fixture;
}

test('real login preserves input on error and reaches the restaurant picker', async ({page}) => {
  const fixture=createFixture();
  await page.route('**/api/v1/**',async route => {const r=fixture.response(route.request().url(),route.request().method(),route.request().postDataJSON()??{}); await route.fulfill({status:r.status??200,json:r.json??{}});});
  await page.goto('/login');
  await page.getByLabel('Language',{exact:true}).selectOption('fr');
  await page.getByLabel('Email',{exact:true}).fill('demo@foody.test');
  await page.getByLabel('Mot de passe',{exact:true}).fill('wrong');
  await page.getByRole('button',{name:'Se connecter',exact:true}).click();
  await expect(page.locator('#login-error')).toBeVisible();
  await expect(page.getByLabel('Email',{exact:true})).toHaveValue('demo@foody.test');
  await page.getByLabel('Mot de passe',{exact:true}).fill('demo-local');
  await page.getByRole('button',{name:'Se connecter',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Choisir un restaurant'})).toBeVisible();
});

for (const variant of [
  {name:'fr-desktop',locale:'fr',theme:'light',width:1440,height:1000},
  {name:'he-dark',locale:'he',theme:'dark',width:1440,height:1000},
  {name:'en-laptop',locale:'en',theme:'light',width:1024,height:900},
  {name:'fr-mobile',locale:'fr',theme:'light',width:375,height:812},
  {name:'he-tablet',locale:'he',theme:'dark',width:768,height:1024},
]) {
  test(`calibration ${variant.name}`,async({page},testInfo)=>{
    const fixture=await install(page,variant);
    await page.setViewportSize(variant);
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    for(const [name,path] of [['dashboard','/1/dashboard'],['orders','/1/orders/all'],['order-detail','/1/orders/1048'],['item','/1/menu/items/1'],['options','/1/menu/options'],['modifiers','/1/menu/modifier-sets'],['settings','/1/settings'],['kitchen','/1/kitchen/daily-operations']]){
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).not.toContainText('Application error');
      await expect(page.getByRole('heading').first(),`${path} heading`).toBeVisible();
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
      expect(overflow,`${path} global overflow`).toBe(false);
      await page.screenshot({path:testInfo.outputPath(`${name}.png`),fullPage:true,animations:'disabled'});
    }
    await testInfo.attach('unhandled-fixtures',{body:JSON.stringify(Array.from(new Set(fixture.unhandled)),null,2),contentType:'application/json'});
    expect(errors).toEqual([]);
    expect(Array.from(new Set(fixture.unhandled))).toEqual([]);
  });
}

test('empty dashboard has no fabricated green comparison',async({page})=>{
  await install(page,{empty:true});await page.goto('/1/dashboard');
  await expect(page.getByRole('heading',{name:'Accueil'})).toBeVisible();
  await expect(page.locator('body')).not.toContainText('+0,0');
  await expect(page.locator('body')).not.toContainText('+100');
});

test('mobile menu traps focus and returns to the trigger',async({page})=>{
  await page.setViewportSize({width:375,height:812});await install(page);await page.goto('/1/dashboard');
  const menu=page.getByRole('button',{name:'Articles et cartes',exact:true});await menu.click();
  await expect(page.getByRole('dialog',{name:'Articles et cartes'})).toBeVisible();
  for (let i=0;i<20;i++) {
    await page.keyboard.press('Tab');
    expect(await page.getByRole('dialog',{name:'Articles et cartes'}).evaluate(el=>el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(menu).toBeFocused();
});

test('restricted role has no order mutation actions',async({page})=>{
  await install(page,{denied:true});await page.goto('/1/orders/all');
  await expect(page.getByRole('heading',{name:'Commandes',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Nouvelle commande',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Pause',exact:true})).toHaveCount(0);
});

test('article save failure retains the draft; a retry persists the exact name',async({page})=>{
  const fixture=await install(page);await page.goto('/1/menu/items/1');
  const name=page.getByLabel("Nom de l'article",{exact:true});await expect(name).toHaveValue('Salade méditerranéenne');
  await name.fill('Salade de saison — brouillon');
  let failSave=true;
  await page.route('**/api/v1/menu/items/1?*',async route=>{
    if(route.request().method()!=='PUT')return route.fallback();
    if(failSave)return route.fulfill({status:503,json:{error:'Enregistrement indisponible (test)'}});
    const r=fixture.response(route.request().url(),'PUT',route.request().postDataJSON());await route.fulfill({json:r.json});
  });
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Enregistrement indisponible'})).toBeVisible();
  await expect(name).toHaveValue('Salade de saison — brouillon');
  failSave=false;await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page).toHaveURL(/\/1\/menu\/items$/);
  expect(fixture.items[0].name).toBe('Salade de saison — brouillon');
});

test('order detail preserves the query on return without changing the order',async({page})=>{
  const fixture=await install(page);await page.goto('/1/orders/all?q=Client');
  await page.getByText('#1048',{exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(/\/1\/orders\/1048\?q=Client/);
  await page.getByRole('dialog').getByRole('button',{name:'Fermer',exact:true}).click();
  await expect(page).toHaveURL(/\/1\/orders\/all\?q=Client/);
  expect(fixture.writes.filter(p=>p.includes('/orders/'))).toEqual([]);
});

test('scoped search is usable on mobile and opens the actual article editor',async({page})=>{
  await page.setViewportSize({width:375,height:812});await install(page);await page.goto('/1/dashboard');
  await page.getByRole('button',{name:'Rechercher dans Foody…',exact:true}).click();
  const input=page.getByRole('combobox',{name:'Rechercher dans Foody…',exact:true});
  await expect(input).toBeFocused();await input.fill('sal');
  await expect(page.getByRole('option',{name:/Salade méditerranéenne/})).toBeVisible();
  await input.press('Enter');await expect(page).toHaveURL(/\/1\/menu\/items\/1$/);
  await expect(page.getByRole('dialog',{name:"Modifier l'article"})).toBeVisible();
});

test('branch selection updates the active establishment',async({page})=>{
  await install(page);await page.goto('/1/dashboard');
  await page.getByRole('button',{name:'Atelier Foody',exact:true}).click();
  await page.getByRole('menuitem',{name:'Jardin Foody',exact:true}).click();
  await expect(page).toHaveURL(/\/2\/dashboard$/);
  await expect(page.getByRole('button',{name:'Jardin Foody',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Atelier Foody',exact:true})).toHaveCount(0);
});

for (const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}]) {
  test(`catalogue editors ${variant.locale}`,async({page},testInfo)=>{
    const fixture=await install(page,variant);await page.setViewportSize(variant);
    for(const [name,path] of [['options-new','/1/menu/options/new'],['option-set','/1/menu/options/1'],['modifier-set','/1/menu/modifier-sets/1']]){
      await page.goto(path);await page.waitForLoadState('networkidle');
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
      await page.screenshot({path:testInfo.outputPath(`${name}.png`),fullPage:true,animations:'disabled'});
    }
    expect(Array.from(new Set(fixture.unhandled))).toEqual([]);
  });
}

test('deleting a set requires confirmation and cancelling returns focus without a write',async({page})=>{
  const fixture=await install(page);await page.goto('/1/menu/options');
  const trigger=page.getByRole('button',{name:'Supprimer · Taille de portion',exact:true});await trigger.click();
  await expect(page.getByRole('alertdialog')).toContainText('Taille de portion');
  await page.getByRole('button',{name:'Annuler',exact:true}).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);await expect(trigger).toBeFocused();
  expect(fixture.writes).toEqual([]);
});

test('general settings keep the draft on failure and save only supported fields', async ({page}) => {
  const fixture=await install(page);await page.goto('/1/settings');
  const name=page.getByLabel('Nom',{exact:true});await expect(name).toHaveValue('Atelier Foody');
  const save=page.getByRole('button',{name:'Enregistrer les modifications',exact:true});
  await expect(save).toBeDisabled();await name.fill('Atelier Foody — essai local');
  let fail=true;let body:Record<string,unknown>={};
  await page.route('**/api/v1/restaurants/1', async route=>{
    if(route.request().method()!=='PUT')return route.fallback();
    body=route.request().postDataJSON();
    if(fail)return route.fulfill({status:503,json:{error:'Sauvegarde indisponible (test)'}});
    const r=fixture.response(route.request().url(),'PUT',body);return route.fulfill({json:r.json});
  });
  await save.click();await expect(page.getByRole('alert').filter({hasText:'Sauvegarde indisponible'})).toBeVisible();
  await expect(name).toHaveValue('Atelier Foody — essai local');
  fail=false;await save.click();await expect(save).toBeDisabled();
  expect(Object.keys(body).sort()).toEqual(['address','currency','dashboard_default_date_basis','dashboard_revenue_mode','name','orders_default_date_basis','phone','timezone']);
  await page.reload();await expect(name).toHaveValue('Atelier Foody — essai local');
  await expect(page.getByRole('button',{name:'Exporter toutes les données',exact:true})).toBeDisabled();
  expect(fixture.unhandled).toEqual([]);
});

test('settings navigation warns before discarding a changed draft',async({page})=>{
  await install(page);await page.goto('/1/settings');await page.getByLabel('Nom',{exact:true}).fill('Brouillon local');
  page.once('dialog',dialog=>dialog.dismiss());
  await page.locator('a[href="/1/dashboard"]').first().click();
  await expect(page).toHaveURL(/\/1\/settings$/);
  await expect(page.getByLabel('Nom',{exact:true})).toHaveValue('Brouillon local');
});

for(const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000},{locale:'fr',theme:'light',width:1920,height:1080}]) {
  test(`food cost selection ${variant.locale} ${variant.width}`,async({page},testInfo)=>{
    const fixture=await install(page,variant);await page.setViewportSize(variant);await page.goto('/1/kitchen/food-cost');
    await page.getByRole('button').filter({has:page.getByRole('heading',{name:'Salade méditerranéenne',exact:true})}).click();
    await expect(page.getByRole('heading',{name:'Salade méditerranéenne',exact:true,level:2})).toBeVisible();
    await expect(page.getByRole('button',{name:'Tomates de saison',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await page.screenshot({path:testInfo.outputPath('food-cost.png'),fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'Tomates de saison',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:testInfo.outputPath('food-cost-recipe.png'),fullPage:true,animations:'disabled'});
    if(variant.width===1920){
      await page.setViewportSize({width:1583,height:1000});
      await page.locator('section').filter({has:page.getByRole('heading',{name:'Coût',exact:true})}).screenshot({path:testInfo.outputPath('food-cost-comparable.png'),animations:'disabled'});
    }
    expect(fixture.unhandled).toEqual([]);expect(fixture.writes).toEqual([]);
  });
}

test('empty food cost stops loading and explains the absence of recipes',async({page})=>{
  await install(page,{empty:true});await page.goto('/1/kitchen/food-cost');
  await expect(page.getByText('Aucun article avec recette pour le moment',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('Calcul des coûts...', {exact:true})).toHaveCount(0);
});

test('failed ingredient request shows a recoverable error instead of zero cost',async({page})=>{
  await install(page);let fail=false;
  await page.route('**/api/v1/stock/menu-items/1/ingredients?*',async route=>fail?route.fulfill({status:503,json:{error:'Recipe fixture unavailable'}}):route.fallback());
  await page.goto('/1/kitchen/food-cost');
  const item=page.getByRole('button').filter({has:page.getByRole('heading',{name:'Salade méditerranéenne',exact:true})});
  await expect(item).toBeVisible();fail=true;await item.click();
  await expect(page.getByRole('alert').filter({hasText:'Impossible'})).toBeVisible();
  fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();
  await expect(page.getByRole('button',{name:'Tomates de saison',exact:true})).toBeVisible();
});

for (const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}]) {
  test(`new order catalogue and checkout ${variant.locale}`,async({page},testInfo)=>{
    const fixture=await install(page,variant);await page.setViewportSize(variant);await page.goto('/1/orders/new');
    await page.getByRole('button',{name:/^Salade méditerranéenne/}).click();
    if(variant.width<1024) await page.getByRole('button',{name:/Articles de la commande · 1/}).click();
    const ticket=page.getByRole('complementary',{name:variant.locale==='fr'?'Articles de la commande':'פריטים בהזמנה',exact:true});await expect(ticket).toContainText('Salade méditerranéenne');
    await ticket.getByRole('button',{name:variant.locale==='fr'?'Augmenter':'הוספה',exact:true}).click();
    await expect(ticket).toContainText('96.00');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await page.screenshot({path:testInfo.outputPath('new-order.png'),fullPage:true,animations:'disabled'});
    await ticket.getByRole('button',{name:variant.locale==='fr'?/^Encaisser/:/^תשלום/}).click();
    const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
    await expect.poll(async()=>{const box=await dialog.boundingBox();return !!box && box.x>=-1 && box.x+box.width<=variant.width+1;}).toBe(true);
    await page.screenshot({path:testInfo.outputPath('checkout.png'),fullPage:true,animations:'disabled'});
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
    await expect(ticket).toContainText('96.00');
    expect(fixture.unhandled).toEqual([]);expect(fixture.writes).toEqual([]);
  });
}

for(const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}]) {
  test(`reports overview ${variant.locale}`,async({page},testInfo)=>{
    const fixture=await install(page,variant);await page.setViewportSize(variant);await page.goto('/1/analytics/overview');
    await page.waitForLoadState('networkidle');await expect(page.getByRole('heading',{level:1})).toBeVisible();
    await page.getByText(variant.locale==='fr'?'Voir les données du graphique':'הצגת נתוני הגרף',{exact:true}).click();
    await expect(page.locator('details[open] table')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await page.screenshot({path:testInfo.outputPath('reports.png'),fullPage:true,animations:'disabled'});
    expect(fixture.unhandled).toEqual([]);
  });
}

test('reports show a retry for failed data rather than a zero revenue result',async({page})=>{
  await install(page);let fail=true;
  await page.route('**/api/v1/analytics/period?*',async route=>fail?route.fulfill({status:503,json:{error:'Report fixture unavailable'}}):route.fallback());
  await page.goto('/1/analytics/overview');
  await expect(page.getByRole('alert').filter({hasText:'Impossible'})).toBeVisible();
  await expect(page.locator('details')).toHaveCount(0);
  fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();
  await expect(page.getByText('Voir les données du graphique',{exact:true})).toBeVisible();
});

for(const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}]) {
  for(const report of ['items','customers']) {
    test(`report drilldown ${report} ${variant.locale}`,async({page},testInfo)=>{
      const fixture=await install(page,variant);await page.setViewportSize(variant);
      const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`/1/analytics/${report}`);await page.waitForLoadState('networkidle');
      const name=report==='items'?'Salade méditerranéenne':'Client de démonstration — réception de l’équipe';
      const trigger=page.getByRole('button',{name,exact:true});await expect(trigger).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
      await page.screenshot({path:testInfo.outputPath(`${report}-report.png`),fullPage:true,animations:'disabled'});
      await trigger.focus();await page.keyboard.press('Enter');
      const dialog=page.getByRole('dialog');await expect(dialog).toContainText(name);
      await expect.poll(async()=>{const box=await dialog.boundingBox();return !!box&&box.x>=-1&&box.x+box.width<=variant.width+1;}).toBe(true);
      for(let i=0;i<10;i++) {await page.keyboard.press('Tab');expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);}
      await dialog.getByText(variant.locale==='fr'?'Voir les données du graphique':'הצגת נתוני הגרף',{exact:true}).click();
      await expect(dialog.locator('details[open] tbody tr')).toHaveCount(report==='items'?12:3);
      await dialog.getByText(variant.locale==='fr'?'Voir les données du graphique':'הצגת נתוני הגרף',{exact:true}).click();
      await dialog.getByRole('heading',{level:3}).scrollIntoViewIfNeeded();
      await page.screenshot({path:testInfo.outputPath(`${report}-detail.png`),fullPage:true,animations:'disabled'});
      await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
      expect(fixture.unhandled).toEqual([]);expect(fixture.writes).toEqual([]);expect(errors).toEqual([]);
    });
  }
}

for(const report of ['items','customers']) {
  test(`report recovery ${report} keeps filters and supports detail retry`,async({page})=>{
    const fixture=await install(page);let fail=true;
    await page.route(`**/api/v1/analytics/${report}?*`,async route=>fail?route.fulfill({status:503,json:{error:'Synthetic report failure'}}):route.fallback());
    await page.goto(`/1/analytics/${report}`);await expect(page.getByRole('alert').filter({hasText:'Échec du chargement. Réessayez.'})).toBeVisible();
    fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();
    const search=page.getByRole('searchbox',{name:report==='items'?"Rechercher par nom d'article":'Rechercher par nom ou téléphone...',exact:true});
    const request=page.waitForRequest(req=>req.url().includes(`/analytics/${report}?`)&&new URL(req.url()).searchParams.get('search')===(report==='items'?'Salade':'demo-1'));
    await search.fill(report==='items'?'Salade':'demo-1');await request;
    const name=report==='items'?'Salade méditerranéenne':'Client de démonstration — réception de l’équipe';
    const trigger=page.getByRole('button',{name,exact:true});await expect(trigger).toBeVisible();
    const detailId=report==='items'?'1':'demo-1';let detailFail=true;
    await page.route(`**/api/v1/analytics/${report}/${detailId}?*`,async route=>detailFail?route.fulfill({status:503,json:{error:'Synthetic detail failure'}}):route.fallback());
    await trigger.click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.locator('details')).toHaveCount(0);
    detailFail=false;await dialog.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(dialog).toContainText(name);
    await page.keyboard.press('Escape');await expect(search).toHaveValue(report==='items'?'Salade':'demo-1');
    expect(fixture.unhandled).toEqual([]);expect(fixture.writes).toEqual([]);
  });
  test(`empty report ${report} explains the missing data`,async({page})=>{
    const fixture=await install(page,{empty:true});await page.goto(`/1/analytics/${report}`);
    await expect(page.getByText(report==='items'?"Aucune vente d'article pour cette période.":'Aucune donnée client. Les insights apparaîtront après des commandes avec numéros de téléphone.',{exact:true})).toBeVisible();
    await expect(page.getByRole('status',{name:'Chargement...'})).toHaveCount(0);expect(fixture.unhandled).toEqual([]);
  });
}

for(const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}]) {
  test(`team and role editors ${variant.locale}`,async({page},testInfo)=>{
    const fixture=await install(page,variant);await page.setViewportSize(variant);
    await page.goto('/1/staff');await expect(page.getByRole('heading',{level:1})).toBeVisible();
    await expect(page.getByText('coordination@foody.test',{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await page.screenshot({path:testInfo.outputPath('staff.png'),fullPage:true,animations:'disabled'});
    // Use the label of the actual invitation action, independent of the translated page title.
    await page.locator('main button').filter({has:page.locator('svg.lucide-plus')}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.screenshot({path:testInfo.outputPath('staff-invite.png'),fullPage:true,animations:'disabled'});
    await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto('/1/roles');await page.getByRole('button').filter({has:page.getByRole('heading',{name:'Équipe événementielle — coordination',exact:true})}).click();
    const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('checkbox').first()).toHaveJSProperty('indeterminate',true);
    const box=await dialog.boundingBox();expect(box!.width).toBeLessThanOrEqual(variant.width);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await page.screenshot({path:testInfo.outputPath('role-editor.png'),fullPage:true,animations:'disabled'});
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
    expect(fixture.unhandled).toEqual([]);expect(fixture.writes).toEqual([]);
  });
}

test('team invitation retains the draft after failure and reports the actual email outcome',async({page})=>{
  const fixture=await install(page);let fail=true;
  await page.route('**/api/v1/restaurants/1/staff/invite',async route=>fail?route.fulfill({status:503,json:{error:'Invitation indisponible (test)'}}):route.fallback());
  await page.goto('/1/staff');await page.getByRole('button',{name:'Inviter du personnel',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Nom complet',{exact:true}).fill('Nouveau membre démo');await dialog.getByLabel('Email',{exact:true}).fill('new-member@foody.test');
  await dialog.getByRole('button',{name:'Inviter',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Invitation indisponible');
  await expect(dialog.getByLabel('Email',{exact:true})).toHaveValue('new-member@foody.test');
  fail=false;await dialog.getByRole('button',{name:'Inviter',exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText("aucune invitation n'a été envoyée");
  await expect(page.getByText('new-member@foody.test',{exact:true})).toBeVisible();
  expect(fixture.staff.find(member=>member.email==='new-member@foody.test')?.role_id).toBe(1);
});

test('team removal requires confirmation and a failed role change remains visible',async({page})=>{
  const fixture=await install(page);await page.goto('/1/staff');
  const trigger=page.getByRole('button',{name:'Supprimer · Responsable démo — coordination des événements',exact:true});await trigger.click();
  await expect(page.getByRole('alertdialog')).toContainText('Responsable démo');await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();
  await expect(trigger).toBeFocused();expect(fixture.writes).toEqual([]);
  await page.route('**/api/v1/restaurants/1/staff/2/role',route=>route.fulfill({status:503,json:{error:'Rôle inchangé (test)'}}));
  const role=page.getByRole('combobox',{name:'Rôle · Responsable démo — coordination des événements',exact:true});await role.selectOption('2');
  await expect(page.getByRole('alert').filter({hasText:'Rôle inchangé'})).toBeVisible();await expect(role).toHaveValue('1');
});

test('role editor retains permissions on save failure and protects a dirty draft',async({page})=>{
  const fixture=await install(page);let fail=true;
  await page.route('**/api/v1/restaurants/1/roles',async route=>route.request().method()==='POST'&&fail?route.fulfill({status:503,json:{error:'Rôle indisponible (test)'}}):route.fallback());
  await page.goto('/1/roles');await page.getByRole('button',{name:'Créer un rôle',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Nom',{exact:true}).fill('Équipe de renfort');
  const check=dialog.getByRole('checkbox',{name:/^Voir les commandes/});await check.focus();await page.keyboard.press('Space');
  await dialog.getByRole('button',{name:'Créer un rôle',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Rôle indisponible');
  await expect(check).toBeChecked();await expect(dialog.getByLabel('Nom',{exact:true})).toHaveValue('Équipe de renfort');
  await page.keyboard.press('Escape');await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(check).toBeChecked();
  fail=false;await dialog.getByRole('button',{name:'Créer un rôle',exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(fixture.roles.find(role=>role.name==='Équipe de renfort')?.permissions.map(permission=>permission.permission)).toEqual(['orders.view']);
});

test('default role updates preserve canonical names and send only selected permissions',async({page})=>{
  const fixture=await install(page);await page.goto('/1/roles');await page.getByRole('button').filter({has:page.getByRole('heading',{name:'Gérant',exact:true})}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Nom',{exact:true})).toBeDisabled();
  await expect(dialog.getByRole('button',{name:'Supprimer le rôle',exact:true})).toHaveCount(0);
  const check=dialog.getByRole('checkbox',{name:/^Voir le personnel/});await check.focus();await page.keyboard.press('Space');
  const request=page.waitForRequest(req=>req.method()==='PUT'&&req.url().endsWith('/restaurants/1/roles/1'));
  await dialog.getByRole('button',{name:'Enregistrer les modifications',exact:true}).click();
  expect((await request).postDataJSON()).toEqual({permissions:['orders.view','orders.manage','staff.view']});
  await expect(dialog).toHaveCount(0);expect(fixture.roles[0].name).toBe('Manager');
});

test('role deletion cancellation keeps the editor and a failed deletion preserves the role',async({page})=>{
  const fixture=await install(page);await page.goto('/1/roles');await page.getByRole('button').filter({has:page.getByRole('heading',{name:'Équipe événementielle — coordination',exact:true})}).click();
  const dialog=page.getByRole('dialog');const remove=dialog.getByRole('button',{name:'Supprimer le rôle',exact:true});await remove.click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(dialog).toBeVisible();await expect(remove).toBeFocused();expect(fixture.writes).toEqual([]);
  await page.route('**/api/v1/restaurants/1/roles/2',async route=>route.fulfill({status:503,json:{error:'Suppression indisponible (test)'}}));
  await remove.click();await page.getByRole('alertdialog').getByRole('button',{name:'Supprimer le rôle',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Suppression indisponible');expect(fixture.roles).toHaveLength(2);
});

test('team read-only and role read-only permissions prevent edits',async({page})=>{
  const fixture=await install(page,{permissions:['staff.view']});await page.goto('/1/staff');await expect(page.getByText('coordination@foody.test',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Inviter du personnel',exact:true})).toHaveCount(0);await expect(page.getByRole('combobox')).toHaveCount(0);
  await page.route('**/api/v1/users/me?*',route=>route.fulfill({json:{permissions:['staff.manage'],role_name:'Team coordinator',user:{id:1,role:'manager'}}}));
  await page.goto('/1/roles');await page.getByRole('button').filter({has:page.getByRole('heading',{name:'Équipe événementielle — coordination',exact:true})}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Nom',{exact:true})).toBeDisabled();
  for(const checkbox of await dialog.getByRole('checkbox').all()) await expect(checkbox).toBeDisabled();
  await expect(dialog.getByRole('button',{name:'Enregistrer les modifications',exact:true})).toHaveCount(0);expect(fixture.writes).toEqual([]);
});

for(const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}]) {
  test(`team secondary reports ${variant.locale}`,async({page},testInfo)=>{
    const fixture=await install(page,variant);await page.setViewportSize(variant);
    for(const screen of ['shifts','devices']) {
      await page.goto(`/1/staff/${screen}`);await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading',{level:1})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
      await expect(page.locator('tbody tr')).toHaveCount(screen==='shifts'?3:2);
      await page.screenshot({path:testInfo.outputPath(`${screen}.png`),fullPage:true,animations:'disabled'});
    }
    const trigger=page.getByRole('button',{name:variant.locale==='fr'?'Révoquer l’accès':'ביטול גישה',exact:true});await trigger.click();
    const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Caisse principale');
    await page.screenshot({path:testInfo.outputPath('device-revoke.png'),fullPage:true,animations:'disabled'});
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
  });
}

test('POS access revoke failure is shown in the confirmation and retry updates the real state',async({page})=>{
  const fixture=await install(page);let fail=true;
  await page.route('**/api/v1/restaurants/1/pos-devices/1',async route=>fail?route.fulfill({status:503,json:{error:'Révocation indisponible (test)'}}):route.fallback());
  await page.goto('/1/staff/devices');await page.getByRole('button',{name:'Révoquer l’accès',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Révoquer l’accès',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Révocation indisponible');expect(fixture.posDevices[0].revoked_at).toBeUndefined();
  fail=false;await dialog.getByRole('button',{name:'Révoquer l’accès',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Révoquer l’accès',exact:true})).toHaveCount(0);expect(fixture.posDevices[0].revoked_at).toBeTruthy();
});

for(const screen of ['shifts','devices']) {
  test(`team ${screen} load error stays distinct from empty data`,async({page})=>{
    const fixture=await install(page);let fail=true;const endpoint=screen==='shifts'?'shifts?*':'pos-devices';
    await page.route(`**/api/v1/restaurants/1/${endpoint}`,async route=>fail?route.fulfill({status:503,json:{error:'Chargement indisponible (test)'}}):route.fallback());
    await page.goto(`/1/staff/${screen}`);await expect(page.getByRole('alert').filter({hasText:'Chargement indisponible'})).toBeVisible();await expect(page.locator('tbody')).toHaveCount(0);
    fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(screen==='shifts'?3:2);expect(fixture.unhandled).toEqual([]);
  });
}

test('shift dates preserve their API scope and a late response cannot replace the new period',async({page})=>{
  await install(page);let finishOld:(()=>Promise<void>)|undefined;let delayed=false;
  await page.route('**/api/v1/restaurants/1/shifts?*',async route=>{
    if(delayed) return route.fulfill({json:{shifts:[{id:22,staff_name:'Période récente',role_name:'Manager',started_at:'2026-10-01T09:00:00Z',ended_at:'2026-10-01T10:00:00Z',duration_seconds:3600,order_count:5,table_count:2,sales_total:420}]}});
    delayed=true;await new Promise<void>(resolve=>{finishOld=async()=>{await route.fulfill({json:{shifts:[{id:11,staff_name:'Ancienne période',role_name:'Manager',started_at:'2026-09-01T09:00:00Z',ended_at:'2026-09-01T10:00:00Z',duration_seconds:3600,order_count:1,table_count:1,sales_total:50}]}});resolve();};});
  });
  await page.goto('/1/staff/shifts');await expect.poll(()=>!!finishOld).toBe(true);
  const request=page.waitForRequest(req=>req.url().includes('/shifts?')&&new URL(req.url()).searchParams.get('from')==='2026-09-30T21:00:00.000Z');
  await page.locator('input[type=date]').first().fill('2026-10-01');await request;
  await expect(page.getByText('Période récente',{exact:true})).toBeVisible();await finishOld!();await expect(page.getByText('Période récente',{exact:true})).toBeVisible();await expect(page.getByText('Ancienne période',{exact:true})).toHaveCount(0);
});

for(const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}]) {
  test(`floor service assignment ${variant.locale}`,async({page},testInfo)=>{
    const fixture=await install(page,variant);await page.setViewportSize(variant);await page.goto('/1/staff/table-service');
    await expect(page.locator('input[value=collaborative]')).toBeChecked();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await page.screenshot({path:testInfo.outputPath('table-service.png'),fullPage:true,animations:'disabled'});
    const trigger=page.getByRole('button').filter({has:page.locator('svg.lucide-map-pinned')});await trigger.click();
    const dialog=page.getByRole('dialog');await expect(dialog.getByRole('checkbox',{name:/Table 01/})).toBeChecked();
    await page.screenshot({path:testInfo.outputPath('table-assignment.png'),fullPage:true,animations:'disabled'});
    const box=await dialog.boundingBox();expect(box!.width).toBeLessThanOrEqual(variant.width);
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
  });
}

test('floor service keeps the confirmed mode when its update fails',async({page})=>{
  const fixture=await install(page);let fail=true;
  await page.route('**/api/v1/restaurants/1/staff/table-assignment-mode',async route=>route.request().method()==='PUT'&&fail?route.fulfill({status:503,json:{error:'Mode inchangé (test)'}}):route.fallback());
  await page.goto('/1/staff/table-service');const radio=page.locator('input[value=strict]');await radio.focus();await radio.press('Space');
  await expect(page.getByRole('alert').filter({hasText:'Mode inchangé'})).toBeVisible();await expect(page.locator('input[value=collaborative]')).toBeChecked();
  fail=false;await radio.focus();await radio.press('Space');await expect(radio).toBeChecked();await expect(page.getByRole('status')).toBeVisible();expect(fixture.unhandled).toEqual([]);
});

test('table assignment retries without losing selected rules or changing their scope',async({page})=>{
  await install(page);let fail=true;
  await page.route('**/api/v1/restaurants/1/staff/2/table-assignments',async route=>route.request().method()==='PUT'&&fail?route.fulfill({status:503,json:{error:'Affectation indisponible (test)'}}):route.fallback());
  await page.goto('/1/staff/table-service');await page.getByRole('button').filter({has:page.locator('svg.lucide-map-pinned')}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('checkbox',{name:/Table 02/}).check();
  await dialog.getByRole('button',{name:'Enregistrer les modifications',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Affectation indisponible');
  await expect(dialog.getByRole('checkbox',{name:/Table 02/})).toBeChecked();await page.keyboard.press('Escape');await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();
  fail=false;const request=page.waitForRequest(req=>req.method()==='PUT'&&req.url().endsWith('/staff/2/table-assignments'));
  await dialog.getByRole('button',{name:'Enregistrer les modifications',exact:true}).click();
  expect((await request).postDataJSON()).toEqual({table_ids:[1,2],section_ids:[],floor_plan_ids:[]});await expect(dialog).toHaveCount(0);
});

for(const screen of ['staff','roles','staff/table-service']) {
  test(`team workspace recovery ${screen}`,async({page})=>{
    const fixture=await install(page);let fail=true;const endpoint=screen==='roles'?'roles':'staff';
    await page.route(`**/api/v1/restaurants/1/${endpoint}`,async route=>fail?route.fulfill({status:503,json:{error:'Chargement indisponible (test)'}}):route.fallback());
    await page.goto(`/1/${screen}`);await expect(page.getByRole('alert').filter({hasText:'Chargement indisponible'})).toBeVisible();
    if(screen==='staff/table-service')await expect(page.getByRole('radio')).toHaveCount(0);
    fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();
    if(screen==='roles')await expect(page.getByRole('heading',{name:'Équipe événementielle — coordination',exact:true})).toBeVisible();
    else await expect(page.getByText('coordination@foody.test',{exact:true})).toBeVisible();
    expect(fixture.unhandled).toEqual([]);expect(fixture.writes).toEqual([]);
  });
}

for (const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}]) {
  test(`access screens and owner setup ${variant.locale}`,async({page},testInfo)=>{
    const fixture=await install(page,{...variant,authenticated:false});await page.setViewportSize(variant);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    for(const [name,path] of [['login','/login'],['reset','/reset-password?token=reset-demo'],['reset-invalid','/reset-password?token=expired-demo'],['setup-invalid','/setup-account?token=expired-demo'],['setup','/setup-account?token=owner-demo']]){
      await page.goto(path);await page.waitForLoadState('networkidle');
      await expect(page.locator('main h1')).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
      await page.screenshot({path:testInfo.outputPath(`${name}.png`),fullPage:true,animations:'disabled'});
    }
    await page.locator('#setup-password').fill('local-demo-only');
    await page.locator('#setup-confirmPassword').fill('local-demo-only');
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('#setup-fullName')).toHaveValue('Équipe démo');
    await page.locator('#setup-fullName').fill('Responsable de démonstration');
    await page.locator('#setup-fullName').press('Enter');
    await page.locator('#setup-restaurantName').fill('Atelier Foody de démonstration');
    await page.locator('form button[type="submit"]').click();
    await page.locator('input[value="both"]').check();
    await expect(page.locator('input[value="both"]')).toBeChecked();
    await expect(page.locator('input[value="ipad"]')).not.toBeChecked();
    await page.screenshot({path:testInfo.outputPath('setup-platform.png'),fullPage:true,animations:'disabled'});
    let payload:Record<string,unknown>={};
    await page.route('**/api/v1/auth/setup-account',async route=>{payload=route.request().postDataJSON();return route.fallback();});
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByRole('link',{name:/Foody POS démo/})).toHaveAttribute('href','https://downloads.foody.test/foody-demo.dmg');
    expect(payload).toMatchObject({token:'owner-demo',password:'local-demo-only',full_name:'Responsable de démonstration',restaurant_name:'Atelier Foody de démonstration',pos_platform:'both'});
    expect(payload).not.toHaveProperty('pos_pin');
    await page.screenshot({path:testInfo.outputPath('setup-success.png'),fullPage:true,animations:'disabled'});
    await page.locator('.card button').click();
    await expect(page).toHaveURL(/\/select-restaurant$/);
    await expect(page.getByRole('button',{name:/Atelier Foody/})).toBeVisible();
    await page.screenshot({path:testInfo.outputPath('restaurant-picker.png'),fullPage:true,animations:'disabled'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    expect(errors).toEqual([]);expect(fixture.unhandled).toEqual([]);
  });
}

test('reset password retains the draft after failure and follows the existing session redirect',async({page})=>{
  const fixture=await install(page,{authenticated:false});await page.goto('/reset-password?token=reset-demo');
  const password=page.locator('#reset-password');const confirm=page.locator('#reset-confirm');
  await password.fill('local-demo-only');await confirm.fill('different-demo');
  await expect(confirm).toHaveAttribute('aria-invalid','true');
  await page.getByRole('button',{name:'Afficher le mot de passe · Nouveau mot de passe',exact:true}).click();
  await expect(password).toHaveAttribute('type','text');
  await page.getByRole('button',{name:'Masquer le mot de passe · Nouveau mot de passe',exact:true}).click();
  await expect(password).toHaveAttribute('type','password');
  await page.locator('form button[type="submit"]').click();expect(fixture.writes).toEqual([]);
  await confirm.fill('local-demo-only');
  let fail=true;let payload:Record<string,unknown>={};
  await page.route('**/api/v1/auth/reset-password',async route=>{payload=route.request().postDataJSON();if(fail)return route.fulfill({status:503,json:{error:'Réinitialisation indisponible (test)'}});return route.fallback();});
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator('main').getByRole('alert')).toContainText('Réinitialisation indisponible');
  await expect(password).toHaveValue('local-demo-only');await expect(confirm).toHaveValue('local-demo-only');
  // Changing language must not validate the token again or erase the password.
  await page.locator('#access-locale').selectOption('en');await expect(password).toHaveValue('local-demo-only');
  fail=false;await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole('status')).toContainText('Password Updated');
  expect(payload).toEqual({token:'reset-demo',password:'local-demo-only'});
  await expect(page).toHaveURL(/\/select-restaurant$/);
  expect(await page.evaluate(()=>!!localStorage.getItem('foody_restaurant_token'))).toBe(true);
});

for (const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}]) {
  test(`staff setup preserves the invite kind and clears the admin session ${variant.locale}`,async({page},testInfo)=>{
    const fixture=await install(page,{...variant,authenticated:false});await page.setViewportSize(variant);await page.goto('/setup-account?token=staff-demo');
    await page.locator('#setup-password').fill('local-demo-only');await page.locator('#setup-confirmPassword').fill('local-demo-only');
    await page.locator('form button[type="submit"]').click();await page.locator('form button[type="submit"]').click();
    await expect(page.locator('#setup-posPin')).toBeVisible();await expect(page.locator('#setup-restaurantName')).toHaveCount(0);
    await page.locator('#setup-posPin').fill('12a');await expect(page.locator('#setup-posPin')).toHaveValue('12');
    await page.locator('#setup-posPin').fill('1234567');await expect(page.locator('#setup-posPin')).toHaveValue('123456');
    await page.locator('#setup-confirmPosPin').fill('1234');await expect(page.locator('form button[type="submit"]')).toBeDisabled();
    await page.locator('#setup-confirmPosPin').fill('123456');
    await page.screenshot({path:testInfo.outputPath('setup-staff-pin.png'),fullPage:true,animations:'disabled'});
    let fail=true;let payload:Record<string,unknown>={};
    await page.route('**/api/v1/auth/setup-account',async route=>{payload=route.request().postDataJSON();if(fail)return route.fulfill({status:503,json:{error:'Activation indisponible (test)'}});return route.fallback();});
    await page.locator('form button[type="submit"]').click();await expect(page.locator('main').getByRole('alert')).toContainText('Activation indisponible');
    await expect(page.locator('#setup-posPin')).toHaveValue('123456');
    fail=false;await page.locator('form button[type="submit"]').click();
    await expect(page.locator('main h1')).toBeVisible();await expect(page.locator('#setup-posPin')).toHaveCount(0);
    expect(payload).toEqual({token:'staff-demo',password:'local-demo-only',full_name:'Équipe démo',pos_pin:'123456'});
    expect(await page.evaluate(()=>localStorage.getItem('foody_restaurant_token'))).toBeNull();
    await expect(page.locator('.card button')).toHaveCount(0);
    await page.screenshot({path:testInfo.outputPath('setup-staff-ready.png'),fullPage:true,animations:'disabled'});
    expect(fixture.unhandled).toEqual([]);
  });
}

test('restaurant picker reports missing details while keeping both establishments reachable',async({page})=>{
  await install(page);await page.setViewportSize({width:375,height:812});
  let unavailable=true;
  await page.route('**/api/v1/restaurants/2',async route=>unavailable?route.fulfill({status:503,json:{error:'Détails indisponibles'}}):route.fallback());
  await page.goto('/select-restaurant');await expect(page.locator('main').getByRole('alert')).toContainText('Vous pouvez toujours sélectionner');
  await expect(page.getByRole('button',{name:/Atelier Foody/})).toBeVisible();
  const fallback=page.getByRole('button',{name:'Restaurant #2',exact:true});await expect(fallback).toBeVisible();
  unavailable=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);await expect(page.getByRole('button',{name:'Jardin Foody',exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Jardin Foody',exact:false}).click();await expect(page).toHaveURL(/\/2\/dashboard$/);
});

test('missing or expired access links never submit a credential change',async({page})=>{
  const fixture=await install(page,{authenticated:false});
  for(const path of ['/setup-account','/reset-password','/setup-account?token=expired-demo','/reset-password?token=expired-demo']){
    await page.goto(path);await expect(page.locator('main').getByRole('alert')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);await expect(page.getByRole('link',{name:'Retour à la connexion',exact:true})).toBeVisible();
  }
  expect(fixture.writes).toEqual([]);
  await page.goto('/select-restaurant');await expect(page).toHaveURL(/\/login$/);
});

test('owner setup reports an unavailable download without undoing successful activation',async({page})=>{
  await install(page,{authenticated:false});await page.route('**/api/v1/public/pos-downloads',route=>route.fulfill({status:503,json:{error:'Download unavailable'}}));
  await page.goto('/setup-account?token=owner-demo');await page.locator('#setup-password').fill('local-demo-only');await page.locator('#setup-confirmPassword').fill('local-demo-only');
  for(let step=0;step<3;step++)await page.locator('form button[type="submit"]').click();
  await page.locator('input[value="macos"]').check();await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole('heading',{name:'Tout est prêt !',exact:true})).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:'Le lien de téléchargement'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Aller au tableau de bord',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>!!localStorage.getItem('foody_restaurant_token'))).toBe(true);
});

for (const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}]) {
  test(`catalogue libraries and editors ${variant.locale}`,async({page},testInfo)=>{
    const fixture=await install(page,{...variant,library:true});await page.setViewportSize(variant);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    for(const [name,path,trigger] of [['categories','/1/menu/categories','button[aria-label$=" · Cuisine"]'],['modifiers-legacy','/1/menu/modifiers','main header button'],['image-prompts','/1/menu/image-prompts','button[aria-label$=" · Studio Foody — présentation à partager"]']]){
      await page.goto(path);await page.waitForLoadState('networkidle');await expect(page.locator('main h1')).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
      await page.screenshot({path:testInfo.outputPath(`${name}.png`),fullPage:true,animations:'disabled'});
      if(name==='modifiers-legacy')await page.getByRole('button',{name:variant.locale==='fr'?'Créer un modificateur':'צור תוספת',exact:true}).click();
      else await page.locator(trigger).first().click();
      const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
      const rect=await dialog.boundingBox();expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.width).toBeLessThanOrEqual(variant.width);expect(rect!.height).toBeLessThanOrEqual(variant.height);
      for(let i=0;i<12;i++){await page.keyboard.press('Tab');expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);}
      expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
      await page.screenshot({path:testInfo.outputPath(`${name}-editor.png`),fullPage:true,animations:'disabled'});
      await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
    }
    expect(errors).toEqual([]);expect(fixture.unhandled).toEqual([]);expect(fixture.writes).toEqual([]);
  });
}

test('category editor retains failed changes, confirms discarding and saves the exact draft',async({page})=>{
  const fixture=await install(page,{library:true});await page.goto('/1/menu/categories');
  const trigger=page.getByRole('button',{name:'Modifier · Cuisine',exact:true});await trigger.click();
  const input=page.getByLabel('Nom de la catégorie',{exact:true});await input.fill('Cuisine de réception');
  await page.keyboard.press('Escape');await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(input).toHaveValue('Cuisine de réception');
  let fail=true;let payload:Record<string,unknown>={};
  await page.route('**/api/v1/menu/categories/1?*',async route=>{if(route.request().method()!=='PUT')return route.fallback();payload=route.request().postDataJSON();if(fail)return route.fulfill({status:503,json:{error:'Catégorie non enregistrée (test)'}});return route.fallback();});
  await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Catégorie non enregistrée');
  await expect(input).toHaveValue('Cuisine de réception');fail=false;
  await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Modifier · Cuisine de réception',exact:true})).toBeVisible();
  expect(payload).toEqual({name:'Cuisine de réception'});expect(fixture.categories[0].name).toBe('Cuisine de réception');
});

test('category image errors are visible and a successful upload is immediately acknowledged',async({page})=>{
  await install(page,{library:true});await page.goto('/1/menu/categories');await page.getByRole('button',{name:'Modifier · Cuisine',exact:true}).click();
  let fail=true;
  await page.route('**/api/v1/menu/categories/1/image?*',route=>fail?route.fulfill({status:503,json:{error:'Image non transférée (test)'}}):route.fulfill({json:{image_url:'http://localhost:3103/brand/foody-symbol.svg'}}));
  const file={name:'demo.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>')};
  await page.locator('input[type="file"]').setInputFiles(file);await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Image non transférée');
  fail=false;await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Image enregistrée.');
  await page.getByRole('dialog').getByRole('button',{name:'Annuler',exact:true}).click();
  await expect(page.locator('main img[src$="foody-symbol.svg"]')).toBeVisible();
});

test('modifier creation preserves decimal negative deltas after a failure',async({page})=>{
  const fixture=await install(page,{library:true});await page.goto('/1/menu/modifiers');await page.getByRole('button',{name:'Créer un modificateur',exact:true}).click();
  await page.getByLabel('Nom du modificateur',{exact:true}).fill('Sans accompagnement');await page.locator('#modifier-action').selectOption('remove');await page.locator('#modifier-price').fill('-3,75');await page.locator('#modifier-group').fill('Garniture');
  await page.getByRole('checkbox').check();
  let fail=true;let payload:Record<string,unknown>={};
  await page.route('**/api/v1/menu/modifiers?*',async route=>{if(route.request().method()!=='POST')return route.fallback();payload=route.request().postDataJSON();if(fail)return route.fulfill({status:503,json:{error:'Modificateur non enregistré (test)'}});return route.fallback();});
  await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Modificateur non enregistré');
  await expect(page.locator('#modifier-price')).toHaveValue('-3.75');fail=false;
  await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(payload).toEqual({menu_item_id:1,name:'Sans accompagnement',action:'remove',category:'Garniture',price_delta:-3.75,is_required:true});
  await expect(page.getByRole('button',{name:'Supprimer · Sans accompagnement',exact:true})).toBeVisible();expect(fixture.items[0].modifiers).toHaveLength(2);
});

test('image template keeps its variables and default flag through a failed save',async({page})=>{
  const fixture=await install(page,{library:true});await page.goto('/1/menu/image-prompts');await page.getByRole('button',{name:'Modifier · Studio Foody — présentation à partager',exact:true}).click();
  const instructions='Photo de {{item_name}} et {{item_description}} — catégorie {{category}}.';
  await page.getByLabel('Consignes pour l’image',{exact:true}).fill(instructions);await page.getByRole('checkbox').uncheck();
  let fail=true;let payload:Record<string,unknown>={};
  await page.route('**/api/v1/menu/image-prompts/1?*',async route=>{if(route.request().method()!=='PUT')return route.fallback();payload=route.request().postDataJSON();if(fail)return route.fulfill({status:503,json:{error:'Modèle non enregistré (test)'}});return route.fallback();});
  await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Modèle non enregistré');
  await expect(page.getByLabel('Consignes pour l’image',{exact:true})).toHaveValue(instructions);
  await page.keyboard.press('Escape');await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();
  fail=false;await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(payload).toEqual({name:'Studio Foody — présentation à partager',prompt:instructions,is_default:false});
  expect(fixture.imagePrompts[0].prompt).toBe(instructions);await expect(page.getByText(instructions,{exact:true})).toBeVisible();
});

for(const [path,endpoint,title,deleteName] of [
  ['/1/menu/categories','**/api/v1/menu/item-categories?*','Catégories','Supprimer · Cuisine'],
  ['/1/menu/modifiers','**/api/v1/menu/item-categories?*','Modificateurs','Supprimer · Sans garniture — ajustement individuel'],
  ['/1/menu/image-prompts','**/api/v1/menu/image-prompts?*','Modèles d’images IA','Supprimer · Studio Foody — présentation à partager'],
]){
  test(`catalogue library failure and delete cancellation ${path}`,async({page})=>{
    const fixture=await install(page,{library:true});let fail=true;
    await page.route(endpoint,route=>fail?route.fulfill({status:503,json:{error:'Catalogue indisponible (test)'}}):route.fallback());
    await page.goto(path);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();await expect(page.getByRole('alert').filter({hasText:'Catalogue indisponible'})).toBeVisible();
    fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();
    const trigger=page.getByRole('button',{name:deleteName,exact:true});await trigger.click();await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(trigger).toBeFocused();expect(fixture.writes).toEqual([]);
    let deleteFail=true;
    await page.route('**/api/v1/menu/**',async route=>deleteFail && route.request().method()==='DELETE'?route.fulfill({status:409,json:{error:'Suppression refusée (test)'}}):route.fallback());
    await trigger.click();await page.getByRole('alertdialog').getByRole('button',{name:'Supprimer',exact:true}).click();
    await expect(page.getByRole('alert').filter({hasText:'Suppression refusée'})).toBeVisible();await expect(trigger).toBeVisible();
    deleteFail=false;await trigger.click();await page.getByRole('alertdialog').getByRole('button',{name:'Supprimer',exact:true}).click();await expect(trigger).toHaveCount(0);expect(fixture.writes).toHaveLength(1);
  });
  test(`catalogue library read-only ${path}`,async({page})=>{
    const fixture=await install(page,{library:true,permissions:['menu.view']});await page.goto(path);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();await page.waitForLoadState('networkidle');
    await expect(page.locator('main button[aria-label^="Modifier ·"], main button[aria-label^="Supprimer ·"]')).toHaveCount(0);
    await expect(page.getByRole('button',{name:/Créer une catégorie|Créer un modificateur|Nouveau modèle/})).toHaveCount(0);expect(fixture.writes).toEqual([]);
  });
}

for (const [path,title,create,field] of [
  ['/1/menu/categories','Catégories','Créer une catégorie','category-name'],
  ['/1/menu/image-prompts','Modèles d’images IA','Nouveau modèle','image-prompt-name'],
]) {
  test(`catalogue empty library creates its first entry ${path}`,async({page})=>{
    const fixture=await install(page,{empty:true});await page.goto(path);
    await expect(page.getByRole('heading',{name:title,exact:true}).first()).toBeVisible();
    await page.getByRole('button',{name:create,exact:true}).first().click();
    await page.locator('#'+field).fill('Première entrée démo');
    if(field==='image-prompt-name')await page.locator('#image-prompt-text').fill('Photo de {{item_name}}');
    await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Modifier · Première entrée démo',exact:true})).toBeVisible();
    expect(fixture.writes).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
  });
}

for(const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}]){
  test(`weekly rotation responsive workspace ${variant.locale}`,async({page},testInfo)=>{
    const fixture=await install(page,{...variant,rotation:true});await page.setViewportSize(variant);await page.goto('/1/menu/rotation');
    await expect(page.getByRole('region',{name:'Cuisine de saison',exact:true})).toBeVisible();
    await expect(page.getByRole('combobox')).toHaveCount(4);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await page.screenshot({path:testInfo.outputPath('rotation.png'),fullPage:true,animations:'disabled'});
    await page.getByRole('combobox').last().scrollIntoViewIfNeeded();await expect(page.getByRole('combobox').last()).toBeInViewport();
    await page.screenshot({path:testInfo.outputPath('rotation-weeks.png'),fullPage:true,animations:'disabled'});
    await page.locator('button[aria-label$=" · Cuisine de saison"]').first().click();
    const dialog=page.getByRole('dialog');await expect(page.locator('#rotation-group-name')).toHaveValue('Cuisine de saison');
    for(let i=0;i<10;i++){await page.keyboard.press('Tab');expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);}
    await page.screenshot({path:testInfo.outputPath('rotation-group.png'),fullPage:true,animations:'disabled'});
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
    await page.getByRole('region',{name:'Cuisine de saison',exact:true}).getByRole('button',{name:variant.locale==='fr'?'Ajouter un article':'הוסף פריט',exact:true}).click();
    await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:/Cappuccino/})).toBeVisible();
    await page.screenshot({path:testInfo.outputPath('rotation-picker.png'),fullPage:true,animations:'disabled'});
    expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');expect(fixture.unhandled).toEqual([]);expect(fixture.writes).toEqual([]);
  });
}

test('weekly rotation keeps its confirmed selection on failure and sends the restaurant week boundary',async({page})=>{
  const fixture=await install(page,{rotation:true});await page.goto('/1/menu/rotation');
  const first=page.getByRole('combobox').first();await expect(first).toHaveValue('1');
  let fail=true;let payload:Record<string,unknown>={};
  await page.route('**/api/v1/menus/rotation-schedules',async route=>{payload=route.request().postDataJSON();if(fail)return route.fulfill({status:503,json:{error:'Planning non enregistré (test)'}});return route.fallback();});
  await first.selectOption('2');await expect(page.getByRole('alert').filter({hasText:'Planning non enregistré'})).toBeVisible();await expect(first).toHaveValue('1');
  fail=false;await first.selectOption('2');await expect(first).toHaveValue('2');
  expect(payload).toMatchObject({rotation_group:'Cuisine de saison',menu_item_id:2});expect(new Date(String(payload.week_start)+'T00:00:00Z').getUTCDay()).toBe(0);
  expect(fixture.rotationSchedules[0].menu_item_id).toBe(2);
  await first.selectOption('');await expect(first).toHaveValue('');expect(fixture.rotationSchedules).toHaveLength(0);
});

test('weekly rotation creates a group through its first available item and retains a failed draft',async({page})=>{
  const fixture=await install(page,{rotation:true});await page.goto('/1/menu/rotation');await page.getByRole('button',{name:'Nouveau groupe',exact:true}).click();
  await page.getByLabel('Nom du groupe de rotation',{exact:true}).fill('Boissons de la semaine');
  await expect(page.getByRole('dialog')).toContainText('קפה הפוך · Cappuccino');
  await page.keyboard.press('Escape');await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();
  let fail=true;let payload:Record<string,unknown>={};
  await page.route('**/api/v1/menu/items/3?*',async route=>{if(route.request().method()!=='PUT')return route.fallback();payload=route.request().postDataJSON();if(fail)return route.fulfill({status:503,json:{error:'Groupe non créé (test)'}});return route.fallback();});
  await page.getByRole('dialog').getByRole('button',{name:'Créer',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Groupe non créé');
  await expect(page.locator('#rotation-group-name')).toHaveValue('Boissons de la semaine');fail=false;
  await page.getByRole('dialog').getByRole('button',{name:'Créer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Boissons de la semaine',exact:true})).toBeVisible();expect(payload).toEqual({rotation_group:'Boissons de la semaine'});expect(fixture.items[2].rotation_group).toBe('Boissons de la semaine');
});

test('weekly rotation rename keeps its draft on error and refreshes scheduled group names',async({page})=>{
  const fixture=await install(page,{rotation:true});await page.goto('/1/menu/rotation');await page.getByRole('button',{name:'Renommer le groupe · Cuisine de saison',exact:true}).click();await page.locator('#rotation-group-name').fill('Cuisine de réception');
  let fail=true;
  await page.route('**/api/v1/menus/rotation-groups/rename',route=>fail?route.fulfill({status:503,json:{error:'Renommage indisponible (test)'}}):route.fallback());
  await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Renommage indisponible');
  fail=false;await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Cuisine de réception',exact:true})).toBeVisible();await expect(page.getByRole('combobox').first()).toHaveValue('1');expect(fixture.rotationSchedules[0].rotation_group).toBe('Cuisine de réception');
});

test('weekly rotation item picker supports search and retry, while removal requires confirmation',async({page})=>{
  const fixture=await install(page,{rotation:true});await page.goto('/1/menu/rotation');await page.getByRole('button',{name:'Ajouter un article',exact:true}).click();
  await page.getByRole('dialog').getByRole('textbox',{name:'Rechercher',exact:true}).fill('xyz');await expect(page.getByRole('dialog').getByRole('status')).toContainText('Aucun résultat');
  await page.getByRole('dialog').getByRole('textbox',{name:'Rechercher',exact:true}).fill('capp');
  let fail=true;
  await page.route('**/api/v1/menu/items/3?*',route=>fail&&route.request().method()==='PUT'?route.fulfill({status:503,json:{error:'Affectation indisponible (test)'}}):route.fallback());
  await page.getByRole('dialog').getByRole('button',{name:/Cappuccino/}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Affectation indisponible');
  fail=false;await page.getByRole('dialog').getByRole('button',{name:/Cappuccino/}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const remove=page.getByRole('button',{name:'Retirer du groupe · קפה הפוך · Cappuccino',exact:true});await remove.click();await expect(page.getByRole('alertdialog')).toContainText('Cappuccino');await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(remove).toBeFocused();
  expect(fixture.items[2].rotation_group).toBe('Cuisine de saison');await remove.click();await page.getByRole('alertdialog').getByRole('button',{name:'Supprimer',exact:true}).click();await expect(remove).toHaveCount(0);expect(fixture.items[2].rotation_group).toBeNull();
});

test('weekly rotation deletion errors preserve the group until a confirmed retry succeeds',async({page})=>{
  const fixture=await install(page,{rotation:true});await page.goto('/1/menu/rotation');
  const trigger=page.getByRole('button',{name:'Supprimer le groupe · Cuisine de saison',exact:true});await trigger.click();await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();expect(fixture.writes).toEqual([]);
  let fail=true;await page.route('**/api/v1/menus/rotation-groups/*',route=>fail?route.fulfill({status:503,json:{error:'Suppression indisponible (test)'}}):route.fallback());
  await trigger.click();await page.getByRole('alertdialog').getByRole('button',{name:'Supprimer',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Suppression indisponible'})).toBeVisible();await expect(trigger).toBeVisible();
  fail=false;await trigger.click();await page.getByRole('alertdialog').getByRole('button',{name:'Supprimer',exact:true}).click();await expect(page.getByText('Aucun groupe de rotation',{exact:true})).toBeVisible();expect(fixture.rotationSchedules).toHaveLength(0);
});

test('weekly rotation load retry does not replace failure with an empty planning',async({page})=>{
  await install(page,{rotation:true});let fail=true;
  await page.route('**/api/v1/menus/rotation-schedules?*',route=>fail?route.fulfill({status:503,json:{error:'Planning indisponible (test)'}}):route.fallback());
  await page.goto('/1/menu/rotation');await expect(page.getByRole('alert').filter({hasText:'Planning indisponible'})).toBeVisible();await expect(page.getByText('Aucun groupe de rotation',{exact:true})).toHaveCount(0);
  fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('region',{name:'Cuisine de saison',exact:true})).toBeVisible();
});

test('weekly rotation read-only permissions disable all planning mutations',async({page})=>{
  const fixture=await install(page,{rotation:true,permissions:['menu.view']});await page.goto('/1/menu/rotation');await expect(page.getByRole('combobox')).toHaveCount(4);
  for(const select of await page.getByRole('combobox').all())await expect(select).toBeDisabled();
  await expect(page.getByRole('button',{name:/Nouveau groupe|Renommer le groupe|Supprimer le groupe|Retirer du groupe|Ajouter un article|Effacer/})).toHaveCount(0);expect(fixture.writes).toEqual([]);
});


test('weekly rotation respects a Monday week start instead of assuming Sunday',async({page})=>{
  const fixture=await install(page,{rotation:true});
  await page.route('**/api/v1/restaurants/1',async route=>{const response=fixture.response(route.request().url());const data=response.json;if(!data || !('restaurant' in data) || !data.restaurant)throw new Error('Missing restaurant fixture');await route.fulfill({json:{...data,restaurant:{...data.restaurant,week_start_day:1}}});});
  let week='';await page.route('**/api/v1/menus/rotation-schedules',async route=>{week=route.request().postDataJSON().week_start;return route.fallback();});
  await page.goto('/1/menu/rotation');await expect(page.getByRole('combobox').first()).toHaveValue('');await page.getByRole('combobox').first().selectOption('1');await expect(page.getByRole('combobox').first()).toHaveValue('1');
  expect(new Date(week+'T00:00:00Z').getUTCDay()).toBe(1);
});

test('weekly rotation cannot create an implicit group without an available item',async({page})=>{
  const fixture=await install(page,{empty:true,rotation:true});await page.goto('/1/menu/rotation');await expect(page.getByText('Aucun groupe de rotation',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Nouveau groupe',exact:true}).click();
  await page.getByLabel('Nom du groupe de rotation',{exact:true}).fill('Groupe vide');await expect(page.getByRole('dialog')).toContainText('Aucun article sans groupe disponible');await expect(page.getByRole('dialog').getByRole('button',{name:'Créer',exact:true})).toBeDisabled();expect(fixture.writes).toEqual([]);
});

for(const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}]){
  test(`menu cards and availability editors ${variant.locale}`,async({page},testInfo)=>{
    const fixture=await install(page,{...variant,menuLibrary:true});await page.setViewportSize(variant);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/1/menu/menus');await expect(page.getByRole('link',{name:'Carte du jour',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await page.screenshot({path:testInfo.outputPath('menus.png'),fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:variant.locale==='fr'?'Vue en liste':'תצוגת רשימה',exact:true}).click();await expect(page.locator('main table')).toBeVisible();
    await page.screenshot({path:testInfo.outputPath('menus-list.png'),fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:variant.locale==='fr'?'Créer une carte':'צור תפריט',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('#menu-create-name')).toBeFocused();
    await page.getByRole('dialog').getByRole('checkbox').last().uncheck();await expect(page.getByRole('dialog').getByRole('checkbox',{name:variant.locale==='fr'?'Fermé · dimanche':'סגור · יום ראשון',exact:true})).toBeChecked();
    await page.screenshot({path:testInfo.outputPath('menu-create.png'),fullPage:true,animations:'disabled'});
    await page.goto('/1/menu/menus/1/edit');const editor=page.getByRole('dialog');await expect(page.locator('#menu-detail-name')).toHaveValue('Carte du jour');
    expect(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath('menu-availability.png'),fullPage:true,animations:'disabled'});
    await editor.locator('input[type="time"]').last().scrollIntoViewIfNeeded();await expect(editor.locator('input[type="time"]').last()).toHaveValue('02:00');await expect(editor.locator('input[type="time"]').last()).toBeInViewport();
    await page.screenshot({path:testInfo.outputPath('menu-hours.png'),fullPage:true,animations:'disabled'});
    expect(fixture.unhandled).toEqual([]);expect(errors).toEqual([]);expect(fixture.writes).toEqual([]);
  });
}

test('menu filters and list view preserve channel scope and distinguish no result from no menu',async({page})=>{
  await install(page,{menuLibrary:true});await page.goto('/1/menu/menus');await page.getByLabel('Canaux',{exact:true}).selectOption('web');
  await expect(page.getByRole('link',{name:'Carte du jour',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Carte des réceptions — événements de démonstration',exact:true})).toHaveCount(0);
  await page.locator('#menu-search').fill('aucune');await expect(page.getByText('Aucun résultat trouvé',{exact:true})).toBeVisible();
  await page.locator('#menu-search').fill('');await page.locator('#menu-channel').selectOption('all');await page.getByRole('button',{name:'Vue en liste',exact:true}).click();await expect(page.locator('main tbody tr')).toHaveCount(2);
});

test('menu order can be changed by keyboard, cancelled or retried without losing the draft',async({page})=>{
  const fixture=await install(page,{menuLibrary:true});await page.goto('/1/menu/menus');await page.getByRole('button',{name:'Réorganiser',exact:true}).click();
  await page.getByRole('button',{name:'Descendre · Carte du jour',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('main article').first()).toContainText('Carte des réceptions');
  await page.getByRole('button',{name:'Annuler',exact:true}).click();await expect(page.locator('main article').first()).toContainText('Carte du jour');expect(fixture.writes).toEqual([]);
  await page.getByRole('button',{name:'Réorganiser',exact:true}).click();await page.getByRole('button',{name:'Descendre · Carte du jour',exact:true}).click();
  let fail=true;let payload:Record<string,unknown>={};await page.route('**/api/v1/menu/menus/reorder?*',async route=>{payload=route.request().postDataJSON();if(fail)return route.fulfill({status:503,json:{error:'Ordre non enregistré (test)'}});return route.fallback();});
  await page.getByRole('button',{name:'Terminer',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Ordre non enregistré'})).toBeVisible();await expect(page.locator('main article').first()).toContainText('Carte des réceptions');
  fail=false;await page.getByRole('button',{name:'Terminer',exact:true}).click();await expect(page.getByRole('button',{name:'Réorganiser',exact:true})).toBeVisible();expect(payload).toEqual({menu_ids:[2,1]});expect(fixture.menus.map(m=>m.id)).toEqual([2,1]);
});

test('menu creation retries custom hours without creating a duplicate and supports overnight times',async({page})=>{
  const fixture=await install(page,{menuLibrary:true});await page.goto('/1/menu/menus');await page.getByRole('button',{name:'Créer une carte',exact:true}).click();
  await page.getByLabel('Nom de la carte',{exact:true}).fill('Carte nocturne');await page.getByRole('checkbox',{name:'Suivre les horaires du restaurant',exact:true}).uncheck();
  const sunday=page.getByRole('checkbox',{name:'Fermé · dimanche',exact:true});await expect(sunday).toBeChecked();await expect(page.getByRole('dialog').locator('input[type="time"]')).toHaveCount(0);
  await sunday.uncheck();await page.getByLabel('Heure de début · dimanche',{exact:true}).fill('21:00');await page.getByLabel('Heure de fin · dimanche',{exact:true}).fill('02:00');await expect(page.getByText('La fermeture a lieu le lendemain.',{exact:true})).toBeVisible();
  let fail=true;let hours:unknown;
  await page.route('**/api/v1/menu/menus/3/hours?*',async route=>{hours=route.request().postDataJSON();if(fail)return route.fulfill({status:503,json:{error:'Horaires indisponibles (test)'}});return route.fallback();});
  await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('La carte existe');await expect(page.getByLabel('Nom de la carte',{exact:true})).toHaveValue('Carte nocturne');
  fail=false;await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('link',{name:'Carte nocturne',exact:true})).toBeVisible();
  expect(fixture.menus.filter(m=>m.name==='Carte nocturne')).toHaveLength(1);expect(fixture.writes.filter(p=>p==='/api/v1/menu/menus')).toHaveLength(1);expect(hours).toEqual([{day_of_week:0,open_time:'21:00',close_time:'02:00',is_closed:false}]);
});

test('menu availability failure retains locations and custom hours instead of silently replacing them',async({page})=>{
  const fixture=await install(page,{menuLibrary:true});let failLoad=true;
  await page.route('**/api/v1/menu/menus/1/locations?*',route=>failLoad&&route.request().method()==='GET'?route.fulfill({status:503,json:{error:'Affectations indisponibles (test)'}}):route.fallback());
  await page.goto('/1/menu/menus/1/edit');await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Affectations indisponibles');await expect(page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true})).toHaveCount(0);expect(fixture.writes).toEqual([]);
  failLoad=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.locator('#menu-detail-name')).toHaveValue('Carte du jour');
  await page.locator('#menu-detail-name').fill('Carte du soir');await expect(page.getByRole('checkbox',{name:'Salle principale',exact:true})).toBeChecked();await expect(page.getByRole('checkbox',{name:/Annexe inactive/})).toBeChecked();
  await expect(page.getByRole('checkbox',{name:'Fermé · lundi',exact:true})).toBeChecked();await expect(page.getByLabel('Heure de fin · vendredi',{exact:true})).toHaveValue('02:00');
  let failSave=true;let payload:Record<string,unknown>={};await page.route('**/api/v1/menu/menus/1/locations?*',async route=>{if(route.request().method()!=='PUT')return route.fallback();payload=route.request().postDataJSON();if(failSave)return route.fulfill({status:503,json:{error:'Affectations non enregistrées (test)'}});return route.fallback();});
  await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Certaines modifications peuvent déjà être enregistrées');await expect(page.locator('#menu-detail-name')).toHaveValue('Carte du soir');expect(payload).toEqual({location_ids:[1,3]});
  failSave=false;await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/menus\/1$/);expect(fixture.menus[0].name).toBe('Carte du soir');expect(fixture.menuLocations[1]).toEqual([1,3]);expect(fixture.menuHours[1]).toHaveLength(2);
});

test('menu dropdown cancellation returns focus and a duplication uses the existing route',async({page})=>{
  const fixture=await install(page,{menuLibrary:true});await page.goto('/1/menu/menus');const trigger=page.getByRole('button',{name:'Actions · Carte du jour',exact:true});await trigger.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();await page.getByRole('menuitem',{name:'Supprimer la carte',exact:true}).click();await expect(page.getByRole('alertdialog')).toContainText('Carte du jour');await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(trigger).toBeFocused();expect(fixture.writes).toEqual([]);
  await trigger.click();await page.getByRole('menuitem',{name:'Dupliquer la carte',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/menus\/3$/);expect(fixture.menus).toHaveLength(3);
});

test('menu list and availability editor honor read-only permissions',async({page})=>{
  const fixture=await install(page,{menuLibrary:true,permissions:['menu.view']});await page.goto('/1/menu/menus');await expect(page.getByRole('link',{name:'Carte du jour',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/Créer une carte|Réorganiser|Actions · Carte/})).toHaveCount(0);
  await page.goto('/1/menu/menus/1/edit');await expect(page.locator('#menu-detail-name')).toBeDisabled();await expect(page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true})).toHaveCount(0);
  for(const input of await page.getByRole('dialog').locator('input').all())await expect(input).toBeDisabled();expect(fixture.writes).toEqual([]);
});

for(const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}]){
  test(`carte content and membership dialogs ${variant.locale}`,async({page},testInfo)=>{
    const fixture=await install(page,{...variant,carte:true});await page.setViewportSize(variant);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/1/menu/menus/1');const group=page.getByRole('region',{name:'À la carte',exact:true});await expect(group.getByRole('article')).toHaveCount(2);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:testInfo.outputPath('carte-detail.png'),fullPage:true,animations:'disabled'});
    const add=group.getByRole('button',{name:variant.locale==='fr'?'Ajouter un article':'הוסף פריט',exact:true});await add.click();await expect(page.getByRole('dialog').getByRole('textbox')).toBeFocused();await page.screenshot({path:testInfo.outputPath('carte-membership.png'),fullPage:true,animations:'disabled'});await page.keyboard.press('Escape');await expect(add).toBeFocused();
    await group.getByRole('article').first().getByRole('checkbox').check();await group.getByRole('button',{name:variant.locale==='fr'?'Déplacer vers un groupe':'העבר לקבוצה',exact:true}).click();await expect(page.getByRole('dialog').getByRole('radio')).toHaveCount(1);await page.screenshot({path:testInfo.outputPath('carte-move.png'),fullPage:true,animations:'disabled'});await page.keyboard.press('Escape');
    await group.getByRole('article').first().getByRole('checkbox').check();await group.getByRole('button',{name:variant.locale==='fr'?'Remplacer':'החלף',exact:true}).click();await expect(page.getByRole('dialog').getByRole('radio')).toHaveCount(1);await page.screenshot({path:testInfo.outputPath('carte-replace.png'),fullPage:true,animations:'disabled'});await page.keyboard.press('Escape');
    expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);expect(errors).toEqual([]);
  });
}

test('carte membership save retries only unfinished removals and keeps the checked draft',async({page})=>{
  const fixture=await install(page,{carte:true});let failed=true;await page.route('**/api/v1/menu/groups/1/items/2?*',async route=>{if(failed&&route.request().method()==='DELETE')return route.fulfill({status:503,json:{error:'Retrait indisponible'}});return route.fallback();});
  await page.goto('/1/menu/menus/1');await page.getByRole('region',{name:'À la carte',exact:true}).getByRole('button',{name:'Ajouter un article',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('checkbox',{name:'Salade méditerranéenne',exact:true}).uncheck();await dialog.getByRole('checkbox',{name:'Focaccia maison — tomates confites et basilic',exact:true}).uncheck();await dialog.getByRole('checkbox',{name:'קפה הפוך · Cappuccino',exact:true}).check();await dialog.getByRole('button',{name:'Terminé',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Retrait indisponible');
  await expect(dialog.getByRole('checkbox',{name:'קפה הפוך · Cappuccino',exact:true})).toBeChecked();failed=false;await dialog.getByRole('button',{name:'Terminé',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('region',{name:'À la carte',exact:true}).getByRole('article')).toHaveCount(1);
  expect(fixture.writes.filter(p=>p==='/api/v1/menu/groups/1/items')).toHaveLength(1);expect(fixture.writes.filter(p=>p==='/api/v1/menu/groups/1/items/1')).toHaveLength(1);expect(fixture.menus[0].groups[0].items.map(i=>i.id)).toEqual([3]);expect(fixture.unhandled).toEqual([]);
});

test('carte replacement retains its choice and retries an add without removing the old membership twice',async({page})=>{
  const fixture=await install(page,{carte:true});let failed=true;await page.route('**/api/v1/menu/groups/1/items?*',async route=>{if(failed&&route.request().method()==='POST')return route.fulfill({status:503,json:{error:'Ajout indisponible'}});return route.fallback();});
  await page.goto('/1/menu/menus/1');const group=page.getByRole('region',{name:'À la carte',exact:true});await group.getByRole('article').first().getByRole('checkbox').check();await group.getByRole('button',{name:'Remplacer',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('radio',{name:'קפה הפוך · Cappuccino',exact:true}).check();await dialog.getByRole('button',{name:'Terminé',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Ajout indisponible');await expect(dialog.getByRole('radio')).toBeChecked();failed=false;await dialog.getByRole('button',{name:'Terminé',exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(fixture.writes.filter(p=>p==='/api/v1/menu/groups/1/items/1')).toHaveLength(1);expect(fixture.menus[0].groups[0].items.map(i=>i.id)).toEqual([2,3]);expect(fixture.unhandled).toEqual([]);
});

test('carte moving selection is keyboard accessible and retries without duplicating the destination add',async({page})=>{
  const fixture=await install(page,{carte:true});let failed=true;await page.route('**/api/v1/menu/groups/1/items/1?*',async route=>{if(failed&&route.request().method()==='DELETE')return route.fulfill({status:503,json:{error:'Déplacement interrompu'}});return route.fallback();});
  await page.goto('/1/menu/menus/1');const group=page.getByRole('region',{name:'À la carte',exact:true});await group.getByRole('article').first().getByRole('checkbox').check();await group.getByRole('button',{name:'Déplacer vers un groupe',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('radio').focus();await page.keyboard.press('Space');await dialog.getByRole('button',{name:'Déplacer',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Déplacement interrompu');failed=false;await dialog.getByRole('button',{name:'Déplacer',exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(fixture.writes.filter(p=>p==='/api/v1/menu/groups/2/items')).toHaveLength(1);expect(fixture.menus[0].groups[0].items.map(i=>i.id)).toEqual([2]);expect(fixture.menus[0].groups[1].items.map(i=>i.id)).toEqual([1]);expect(fixture.unhandled).toEqual([]);
});

test('carte group and article ordering work without drag and removal cancellation returns focus',async({page})=>{
  const fixture=await install(page,{carte:true});await page.goto('/1/menu/menus/1');let group=page.getByRole('region',{name:'À la carte',exact:true});const trigger=group.getByRole('button',{name:'Actions · Salade méditerranéenne',exact:true});await trigger.click();await page.getByRole('menuitem',{name:'Descendre',exact:true}).click();await expect(group.getByRole('article').first()).toHaveAccessibleName('Focaccia maison — tomates confites et basilic');
  await group.getByRole('button',{name:'Actions · À la carte',exact:true}).click();await page.getByRole('menuitem',{name:'Descendre',exact:true}).click();expect(fixture.menus[0].groups.map(g=>g.id)).toEqual([2,1]);
  group=page.getByRole('region',{name:'À la carte',exact:true});await trigger.click();await expect(page.getByRole('menuitem',{name:/Dupliquer/})).toBeDisabled();await page.getByRole('menuitem',{name:"Retirer du groupe",exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(trigger).toBeFocused();
  expect(fixture.writes).toEqual(['/api/v1/menu/groups/1/items/reorder','/api/v1/menu/groups/reorder']);expect(fixture.unhandled).toEqual([]);
});

test('carte future series uses fulfillment dates for scoped add and retirement while moves stay structural',async({page})=>{
  const fixture=await install(page,{carte:true});fixture.menus[0].is_weekly_rotating=true;const writes:{url:string;body:unknown}[]=[];await page.route('**/api/v1/menu/groups/**',async route=>{if(route.request().method()!=='GET')writes.push({url:route.request().url(),body:route.request().postDataJSON()});return route.fallback();});
  await page.goto('/1/menu/menus/1');await page.getByLabel('Choisir une série',{exact:true}).selectOption('1');const group=page.getByRole('region',{name:'À la carte',exact:true});await expect(group.getByRole('article')).toHaveCount(1);await group.getByRole('button',{name:/hors de cette série/}).click();await group.getByRole('button',{name:'Ajouter à cette série',exact:true}).click();await expect(group.getByRole('article')).toHaveCount(2);
  const future=fixture.batchConfig.upcoming_cycles[1].fulfillment_days[0].date;expect(writes[0].body).toEqual({item_ids:[2],effective_from:future,effective_until:future});
  await group.getByRole('button',{name:'Actions · Salade méditerranéenne',exact:true}).click();await page.getByRole('menuitem',{name:"Retirer du groupe",exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:"Retirer du groupe",exact:true}).click();await expect(group.getByRole('article')).toHaveCount(1);
  const cutoff=new Date(future+'T00:00:00Z');cutoff.setUTCDate(cutoff.getUTCDate()-1);expect(new URL(writes[1].url).searchParams.get('effective_until')).toBe(cutoff.toISOString().slice(0,10));await page.getByLabel('Choisir une série',{exact:true}).selectOption('0');await expect(group.getByRole('article',{name:'Salade méditerranéenne',exact:true})).toBeVisible();expect(fixture.unhandled).toEqual([]);
});

test('carte failed memberships block an unsafe fallback and permit retry',async({page})=>{
  const fixture=await install(page,{carte:true});fixture.menus[0].is_weekly_rotating=true;let fail=true;await page.route('**/api/v1/menu/groups/1/memberships?*',async route=>fail?route.fulfill({status:503,json:{error:'Séries indisponibles'}}):route.fallback());await page.goto('/1/menu/menus/1');await expect(page.locator('main').getByRole('alert')).toContainText('Séries indisponibles');await expect(page.getByRole('article')).toHaveCount(0);fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('article')).toHaveCount(2);expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('carte availability failure retains confirmed state and all scoped actions stay read only without permission',async({page})=>{
  const fixture=await install(page,{carte:true});let fail=true;await page.route('**/api/v1/menu/items/1?*',async route=>fail&&route.request().method()==='PUT'?route.fulfill({status:503,json:{error:'Disponibilité indisponible'}}):route.fallback());await page.goto('/1/menu/menus/1');const row=page.getByRole('article',{name:'Salade méditerranéenne',exact:true});await row.getByRole('button',{name:/Disponible —/}).click();await expect(page.locator('main').getByRole('alert')).toContainText('Disponibilité indisponible');await expect(row.getByRole('button',{name:/Disponible —/})).toBeVisible();fail=false;await row.getByRole('button',{name:/Disponible —/}).click();await expect(row.getByRole('button',{name:/Rupture/})).toBeVisible();expect(fixture.writes).toEqual(['/api/v1/menu/items/1']);
});

test('carte read-only view exposes articles and series without mutation controls',async({page})=>{
  const fixture=await install(page,{carte:true,permissions:['menu.view']});await page.goto('/1/menu/menus/1');await expect(page.getByRole('article')).toHaveCount(2);await expect(page.locator('main').getByRole('checkbox')).toHaveCount(0);await expect(page.locator('main').getByRole('button',{name:/Actions ·|Ajouter un article|Ajouter un groupe/})).toHaveCount(0);await page.getByRole('button',{name:'À la carte 2 articles',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('article')).toHaveCount(0);expect(fixture.writes).toEqual([]);
});

for(const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}]){
  test(`POS layout editor and pickers ${variant.locale}`,async({page},testInfo)=>{
    const fixture=await install(page,{...variant,carte:true});await page.setViewportSize(variant);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/1/menu/menus/1/pos-display');const editor=page.getByRole('dialog');await expect(editor.getByRole('button',{name:'À la carte',exact:true})).toBeVisible();expect(await editor.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);await page.screenshot({path:testInfo.outputPath('pos-layout.png'),fullPage:true,animations:'disabled'});
    await editor.getByRole('button',{name:'À la carte',exact:true}).click();const inspector=editor.getByRole('complementary');await inspector.scrollIntoViewIfNeeded();await expect(inspector).toContainText('À la carte');await page.screenshot({path:testInfo.outputPath('pos-inspector.png'),fullPage:true,animations:'disabled'});
    await inspector.getByRole('button',{name:variant.locale==='fr'?'Renommer le groupe':'שינוי שם הקבוצה',exact:true}).click();const rename=page.getByRole('dialog',{name:variant.locale==='fr'?'Renommer le groupe':'שינוי שם הקבוצה',exact:true});await expect(rename.getByRole('textbox')).toBeFocused();await page.screenshot({path:testInfo.outputPath('pos-rename.png'),fullPage:true,animations:'disabled'});await page.keyboard.press('Escape');
    await editor.getByRole('button',{name:variant.locale==='fr'?'Ajouter une tuile':'הוספת אריח',exact:true}).first().click();const picker=page.getByRole('dialog',{name:variant.locale==='fr'?'Ajouter à la présentation POS':'הוספה לתצוגת הקופה',exact:true});await expect(picker.getByRole('heading',{name:variant.locale==='fr'?'Articles':'פריטים',exact:true})).toBeVisible();await expect(picker.getByRole('textbox')).toBeFocused();await picker.getByRole('textbox').fill('sans résultat');await expect(picker.getByRole('button',{name:/Salade/})).toHaveCount(0);await picker.getByRole('textbox').fill('');await page.screenshot({path:testInfo.outputPath('pos-picker.png'),fullPage:true,animations:'disabled'});await page.keyboard.press('Escape');expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);expect(errors).toEqual([]);
  });
}

test('POS layout saves exact tile data and retains edits after a failure',async({page})=>{
  const fixture=await install(page,{carte:true});let fail=true;let payload:unknown;await page.route('**/api/v1/menu/menus/1/pos-display?*',async route=>{if(route.request().method()==='PUT'){payload=route.request().postDataJSON();if(fail)return route.fulfill({status:503,json:{error:'Présentation indisponible'}});}return route.fallback();});await page.goto('/1/menu/menus/1/pos-display');const editor=page.getByRole('dialog');await editor.getByRole('button',{name:'À la carte',exact:true}).click();const inspector=editor.getByRole('complementary');await inspector.getByRole('button',{name:'Haute',exact:true}).click();await inspector.getByRole('button',{name:'Couleur #166534',exact:true}).click();await inspector.getByRole('button',{name:'Descendre',exact:true}).click();await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Présentation indisponible');await expect(inspector.getByRole('button',{name:'Haute',exact:true})).toHaveAttribute('aria-pressed','true');fail=false;await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor.getByRole('status')).toHaveText('Présentation enregistrée');await expect(editor.getByRole('button',{name:'Enregistrer',exact:true})).toBeDisabled();
  expect(payload).toEqual({tiles:[{tile_type:'item',ref_item_id:3,size:'large',bg_type:'color',color:'#2563EB',image_url:'',position:0},{tile_type:'group',ref_group_id:1,size:'grand',bg_type:'color',color:'#166534',image_url:'',position:1}],group_tiles:{}});expect(fixture.writes).toEqual(['/api/v1/menu/menus/1/pos-display']);expect(fixture.unhandled).toEqual([]);
});

test('POS layout closing protects the draft and preview preserves its tiles',async({page})=>{
  const fixture=await install(page,{carte:true});await page.goto('/1/menu/menus/1/pos-display');const editor=page.getByRole('dialog');await editor.getByRole('button',{name:'À la carte',exact:true}).click();await editor.getByRole('complementary').getByRole('button',{name:'Large',exact:true}).click();await editor.getByRole('button',{name:'Aperçu',exact:true}).click();await expect(editor.getByRole('complementary')).toHaveCount(0);await editor.getByRole('button',{name:'À la carte',exact:true}).click();await expect(editor.getByRole('button',{name:'Salade méditerranéenne',exact:true})).toBeVisible();await editor.getByRole('button',{name:'Fermer',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(editor).toBeVisible();await editor.getByRole('button',{name:'Fermer',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Abandonner les modifications',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/menus\/1$/);expect(fixture.writes).toEqual([]);
});

test('POS group fallback tiles become an explicit saved group layout only after editing',async({page})=>{
  const fixture=await install(page,{carte:true});let body:unknown;await page.route('**/api/v1/menu/menus/1/pos-display?*',async route=>{if(route.request().method()==='PUT')body=route.request().postDataJSON();return route.fallback();});await page.goto('/1/menu/menus/1/pos-display');const editor=page.getByRole('dialog');await editor.getByRole('button',{name:'À la carte',exact:true}).click();await editor.getByRole('button',{name:'Accéder au groupe',exact:true}).click();await expect(editor.getByRole('button',{name:'Salade méditerranéenne',exact:true})).toBeVisible();await expect(editor.getByRole('button',{name:'Enregistrer',exact:true})).toBeDisabled();await editor.getByRole('button',{name:'Salade méditerranéenne',exact:true}).click();await editor.getByRole('complementary').getByRole('button',{name:'Large',exact:true}).click();await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor.getByRole('status')).toHaveText('Présentation enregistrée');expect(body).toMatchObject({group_tiles:{'1':[{tile_type:'item',ref_item_id:1,size:'large',position:0},{tile_type:'item',ref_item_id:2,size:'petit',position:1}]}});expect(fixture.unhandled).toEqual([]);
});

test('POS group renaming has independent immediate persistence and keeps its draft on failure',async({page})=>{
  const fixture=await install(page,{carte:true});let fail=true;await page.route('**/api/v1/menu/groups/1?*',async route=>fail&&route.request().method()==='PUT'?route.fulfill({status:503,json:{error:'Renommage indisponible'}}):route.fallback());await page.goto('/1/menu/menus/1/pos-display');await page.getByRole('button',{name:'À la carte',exact:true}).click();await page.getByRole('button',{name:'Renommer le groupe',exact:true}).click();const rename=page.getByRole('dialog',{name:'Renommer le groupe',exact:true});await rename.getByRole('textbox').fill('Sélection du jour');await rename.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(rename.getByRole('alert')).toContainText('Renommage indisponible');await expect(rename.getByRole('textbox')).toHaveValue('Sélection du jour');fail=false;await rename.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(rename).toHaveCount(0);await expect(page.getByRole('button',{name:'Sélection du jour',exact:true})).toBeVisible();expect(fixture.writes).toEqual(['/api/v1/menu/groups/1']);
});

test('POS layout loading errors support retry instead of exposing an empty draft',async({page})=>{
  const fixture=await install(page,{carte:true});let fail=true;await page.route('**/api/v1/menu/menus/1/pos-display?*',async route=>fail?route.fulfill({status:503,json:{error:'Canevas indisponible'}}):route.fallback());await page.goto('/1/menu/menus/1/pos-display');await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Canevas indisponible');await expect(page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true})).toHaveCount(0);fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('button',{name:'À la carte',exact:true})).toBeVisible();expect(fixture.writes).toEqual([]);
});

test('POS layout read-only access keeps group navigation and removes editing actions',async({page})=>{
  const fixture=await install(page,{carte:true,permissions:['menu.view']});await page.goto('/1/menu/menus/1/pos-display');const editor=page.getByRole('dialog');await expect(editor.getByRole('button',{name:/Ajouter une tuile|Enregistrer|Renommer le groupe/})).toHaveCount(0);await editor.getByRole('button',{name:'À la carte',exact:true}).click();await expect(editor.getByRole('button',{name:'Salade méditerranéenne',exact:true})).toBeVisible();expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

for(const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}]){
  test(`group editor and nested selectors ${variant.locale}`,async({page},testInfo)=>{
    const fixture=await install(page,{...variant,carte:true});await page.setViewportSize(variant);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/1/menu/menus/1/group/1');const editor=page.getByRole('dialog').first();await expect(editor.getByRole('article')).toHaveCount(2);expect(await editor.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);await page.screenshot({path:testInfo.outputPath('group-editor.png'),fullPage:true,animations:'disabled'});await editor.getByRole('article').last().scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('group-articles.png'),fullPage:true,animations:'disabled'});
    await editor.getByRole('button',{name:variant.locale==='fr'?'Ajouter un article':'הוסף פריט',exact:true}).click();const picker=page.getByRole('dialog').last();await expect(picker.getByRole('textbox')).toBeFocused();await page.screenshot({path:testInfo.outputPath('group-picker.png'),fullPage:true,animations:'disabled'});await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(1);
    await editor.getByRole('article').first().getByRole('checkbox').check();await editor.getByRole('button',{name:variant.locale==='fr'?'Remplacer':'החלף',exact:true}).click();const replace=page.getByRole('dialog').last();await expect(replace.getByRole('textbox')).toBeFocused();await page.screenshot({path:testInfo.outputPath('group-replace.png'),fullPage:true,animations:'disabled'});await page.keyboard.press('Escape');
    await editor.getByRole('article').first().getByRole('button',{name:variant.locale==='fr'?'Retirer du groupe':'הסרה מהקבוצה',exact:true}).click();await page.screenshot({path:testInfo.outputPath('group-remove.png'),fullPage:true,animations:'disabled'});await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(1);expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);expect(errors).toEqual([]);
  });
}

test('group source and translated names, channels and overnight hours retain exact payload on retry',async({page})=>{
  const fixture=await install(page,{carte:true});let fail=true;const bodies:{path:string;body:unknown}[]=[];await page.route('**/api/v1/menu/groups/**',async route=>{if(route.request().method()==='PUT'){const path=new URL(route.request().url()).pathname;bodies.push({path,body:route.request().postDataJSON()});if(fail&&path.endsWith('/hours'))return route.fulfill({status:503,json:{error:'Horaires indisponibles'}});}return route.fallback();});
  await page.goto('/1/menu/menus/1/group/1');const editor=page.getByRole('dialog').first();await editor.getByLabel('Nom du groupe de cartes',{exact:true}).fill('Seasonal selection');await editor.getByRole('button',{name:/Français/}).click();await editor.getByLabel('Nom du groupe de cartes',{exact:true}).fill('Sélection de saison');await editor.getByRole('button',{name:/עברית/}).click();await editor.getByLabel('Nom du groupe de cartes',{exact:true}).fill('מבחר עונתי');await editor.getByRole('checkbox',{name:'Web',exact:true}).uncheck();await editor.getByRole('checkbox',{name:'Utiliser les heures de traitement existantes',exact:true}).uncheck();await expect(editor).toContainText('Sans jour ouvert');await editor.getByLabel('Fermé · dimanche',{exact:true}).uncheck();await editor.getByLabel('Heure de début · dimanche',{exact:true}).fill('21:00');await editor.getByLabel('Heure de fin · dimanche',{exact:true}).fill('02:00');await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Horaires indisponibles');await expect(editor.getByLabel('Nom du groupe de cartes',{exact:true})).toHaveValue('מבחר עונתי');fail=false;await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/menus\/1$/);
  expect(bodies[0].body).toEqual({name:'Seasonal selection',translations:{name:{fr:'Sélection de saison',he:'מבחר עונתי'}},menu_id:1,follows_menu_hours:false,is_hidden:false,pos_enabled:true,web_enabled:false});expect(bodies[1].body).toEqual([{day_of_week:0,open_time:'21:00',close_time:'02:00',is_closed:false}]);expect(fixture.unhandled).toEqual([]);
});

test('group creation preserves pending category items and retries hours without a second creation',async({page})=>{
  const fixture=await install(page,{carte:true});let fail=true;await page.route('**/api/v1/menu/groups/3/hours?*',async route=>fail&&route.request().method()==='PUT'?route.fulfill({status:503,json:{error:'Création incomplète'}}):route.fallback());await page.goto('/1/menu/menus/1/group/new');const editor=page.getByRole('dialog').first();await editor.getByLabel('Nom du groupe de cartes',{exact:true}).fill('Nouveau groupe');await editor.getByRole('button',{name:"À partir d'une catégorie existante",exact:true}).click();const picker=page.getByRole('dialog').last();await picker.getByRole('checkbox',{name:'Cuisine',exact:true}).check();await picker.getByRole('button',{name:'Ajouter',exact:true}).click();await expect(editor.getByRole('article')).toHaveCount(2);expect(fixture.writes).toEqual([]);await editor.getByRole('checkbox',{name:'Utiliser les heures de traitement existantes',exact:true}).uncheck();await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Création incomplète');fail=false;await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/menus\/1$/);expect(fixture.writes.filter(p=>p==='/api/v1/menu/groups')).toHaveLength(1);expect(fixture.menus[0].groups.find(g=>g.id===3)?.items.map(i=>i.id)).toEqual([1,2]);expect(fixture.unhandled).toEqual([]);
});

test('group category selector includes a category with the same id and preserves the form draft',async({page})=>{
  const fixture=await install(page,{carte:true});fixture.memberships[1]=[];fixture.menus[0].groups[0].items=[];await page.goto('/1/menu/menus/1/group/1');const editor=page.getByRole('dialog').first();await editor.getByLabel('Nom du groupe de cartes',{exact:true}).fill('Brouillon conservé');await editor.getByRole('button',{name:"À partir d'une catégorie existante",exact:true}).click();const picker=page.getByRole('dialog').last();await picker.getByRole('checkbox',{name:'Cuisine',exact:true}).check();await picker.getByRole('button',{name:'Ajouter',exact:true}).click();await expect(editor.getByRole('article')).toHaveCount(2);await expect(editor.getByLabel('Nom du groupe de cartes',{exact:true})).toHaveValue('Brouillon conservé');expect(fixture.writes).toEqual(['/api/v1/menu/groups/1/items']);await editor.getByRole('button',{name:'Fermer',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(editor.getByLabel('Nom du groupe de cartes',{exact:true})).toHaveValue('Brouillon conservé');expect(fixture.unhandled).toEqual([]);
});

test('group future week additions and removal keep the selected week and original date bounds',async({page})=>{
  const fixture=await install(page,{carte:true});const writes:{url:string;body:unknown}[]=[];await page.route('**/api/v1/menu/groups/**',async route=>{if(route.request().method()!=='GET')writes.push({url:route.request().url(),body:route.request().postDataJSON()});return route.fallback();});await page.goto('/1/menu/menus/1/group/1');const editor=page.getByRole('dialog').first();await editor.getByRole('button',{name:'Semaine prochaine',exact:true}).click();const week=await editor.getByLabel('Choisir une semaine',{exact:true}).inputValue();await editor.getByRole('button',{name:'Ajouter un article',exact:true}).click();const picker=page.getByRole('dialog').last();await picker.getByRole('checkbox',{name:'קפה הפוך · Cappuccino',exact:true}).check();await picker.getByRole('button',{name:'Ajouter',exact:true}).click();await expect(editor.getByLabel('Choisir une semaine',{exact:true})).toHaveValue(week);const end=new Date(week+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+6);expect(writes[0].body).toEqual({item_ids:[3],effective_from:week,effective_until:end.toISOString().slice(0,10)});
  const item=editor.getByRole('article',{name:'Salade méditerranéenne',exact:true});await item.getByRole('button',{name:'Retirer du groupe',exact:true}).click();const remove=page.getByRole('dialog').last();await expect(remove.getByRole('radio',{name:/À partir de la semaine/})).toBeChecked();await remove.getByRole('button',{name:'Retirer du groupe',exact:true}).click();await expect(item).toHaveCount(0);const cutoff=new Date(week+'T00:00:00Z');cutoff.setUTCDate(cutoff.getUTCDate()-1);expect(new URL(writes[1].url).searchParams.get('effective_until')).toBe(cutoff.toISOString().slice(0,10));expect(fixture.unhandled).toEqual([]);
});

test('group replacement retries completed removal once inside the nested dialog',async({page})=>{
  const fixture=await install(page,{carte:true});let fail=true;await page.route('**/api/v1/menu/groups/1/items?*',async route=>fail&&route.request().method()==='POST'?route.fulfill({status:503,json:{error:'Affectation interrompue'}}):route.fallback());await page.goto('/1/menu/menus/1/group/1');const editor=page.getByRole('dialog').first();await editor.getByRole('article').first().getByRole('checkbox').check();await editor.getByRole('button',{name:'Remplacer',exact:true}).click();const replace=page.getByRole('dialog').last();await replace.getByRole('radio',{name:'קפה הפוך · Cappuccino',exact:true}).check();await replace.getByRole('button',{name:'Terminé',exact:true}).click();await expect(replace.getByRole('alert')).toContainText('Affectation interrompue');fail=false;await replace.getByRole('button',{name:'Terminé',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(1);await expect(editor.getByRole('article',{name:'קפה הפוך · Cappuccino',exact:true})).toBeVisible();expect(fixture.writes.filter(p=>p==='/api/v1/menu/groups/1/items/1')).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
});

test('group membership load failures cannot be mistaken for an empty group',async({page})=>{
  const fixture=await install(page,{carte:true});let fail=true;await page.route('**/api/v1/menu/groups/1/memberships?*',async route=>fail?route.fulfill({status:503,json:{error:'Groupe indisponible'}}):route.fallback());await page.goto('/1/menu/menus/1/group/1');const editor=page.getByRole('dialog');await expect(editor.getByRole('alert')).toContainText('Groupe indisponible');await expect(editor.getByRole('button',{name:'Enregistrer',exact:true})).toHaveCount(0);fail=false;await editor.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(editor.getByRole('article')).toHaveCount(2);expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('group read-only view has no mutation actions and disabled source fields',async({page})=>{
  const fixture=await install(page,{carte:true,permissions:['menu.view']});await page.goto('/1/menu/menus/1/group/1');const editor=page.getByRole('dialog');await expect(editor.getByRole('article')).toHaveCount(2);await expect(editor.getByLabel('Nom du groupe de cartes',{exact:true})).toBeDisabled();await expect(editor.getByRole('button',{name:/^Enregistrer$|^Retirer du groupe$|^Ajouter un article$/})).toHaveCount(0);await expect(editor.getByRole('article').getByRole('checkbox')).toHaveCount(0);expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('group image is saved independently and removal errors remain visible for retry',async({page})=>{
  const fixture=await install(page,{carte:true});const data='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40"%3E%3Crect width="40" height="40" fill="%23eb5204"/%3E%3C/svg%3E';let uploads=0;let fail=false;
  await page.route('**/api/v1/menu/groups/1/image?*',async route=>{uploads++;await route.fulfill({json:{image_url:data}});});await page.route('**/api/v1/menu/groups/1?*',async route=>fail&&route.request().method()==='PUT'?route.fulfill({status:503,json:{error:'Image indisponible'}}):route.fallback());await page.goto('/1/menu/menus/1/group/1');const editor=page.getByRole('dialog').first();await editor.getByLabel('Nom du groupe de cartes',{exact:true}).fill('Brouillon image');await editor.locator('input[type=file]').setInputFiles({name:'demo.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"/>')});await expect(editor.getByRole('button',{name:'Retirer l’image',exact:true})).toBeVisible();await expect(editor.getByLabel('Nom du groupe de cartes',{exact:true})).toHaveValue('Brouillon image');expect(fixture.writes).toEqual(['/api/v1/menu/groups/1']);expect(uploads).toBe(1);fail=true;await editor.getByRole('button',{name:'Retirer l’image',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Image indisponible');await expect(editor.getByRole('button',{name:'Retirer l’image',exact:true})).toBeVisible();fail=false;await editor.getByRole('button',{name:'Retirer l’image',exact:true}).click();await expect(editor.getByRole('button',{name:'Retirer l’image',exact:true})).toHaveCount(0);expect(fixture.unhandled).toEqual([]);
});

test('group creating an item does not reuse a display group id as a library category',async({page})=>{
  const fixture=await install(page,{carte:true});await page.goto('/1/menu/menus/1/group/1');await page.getByRole('button',{name:'Ajouter un article',exact:true}).click();await page.getByRole('dialog').last().getByRole('button',{name:'Créer de nouveaux articles',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/items\/new$/);expect(new URL(page.url()).searchParams.has('category')).toBe(false);expect(fixture.writes).toEqual([]);
});

for(const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}]){
  test(`new item form variants and nested pickers ${variant.locale}`,async({page},testInfo)=>{
    const fixture=await install(page,{...variant,carte:true});await page.setViewportSize(variant);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/1/menu/items/new');const editor=page.getByRole('dialog').first();await expect(editor.locator('#menu-item-name')).toBeVisible();await editor.locator('#menu-item-name').fill('Article de démonstration · פריט');expect(await editor.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);await page.screenshot({path:testInfo.outputPath('new-item.png'),fullPage:true,animations:'disabled'});
    await editor.getByRole('button',{name:variant.locale==='fr'?'Ajouter aux cartes':'הוסף לתפריטים',exact:true}).click();const groups=page.getByRole('dialog').last();await expect(groups.getByRole('textbox')).toBeFocused();await groups.getByRole('checkbox',{name:'À la carte',exact:true}).check();await page.screenshot({path:testInfo.outputPath('item-groups.png'),fullPage:true,animations:'disabled'});await page.keyboard.press('Escape');
    await editor.getByRole('button',{name:variant.locale==='fr'?'Ajouter un autre ensemble':'הוסף קבוצה נוספת',exact:true}).click();await editor.getByRole('button',{name:variant.locale==='fr'?"Groupes d'options enregistrés":'ערכות אפשרויות שמורות',exact:true}).click();const options=page.getByRole('dialog').last();await expect(options.getByRole('textbox')).toBeFocused();await options.getByRole('button',{name:/Taille de portion/}).click();const section=editor.getByRole('region',{name:'Taille de portion',exact:true});await section.scrollIntoViewIfNeeded();expect(await editor.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);await page.screenshot({path:testInfo.outputPath('item-variants.png'),fullPage:true,animations:'disabled'});
    await editor.getByRole('button',{name:variant.locale==='fr'?'Ajouter':'הוספה',exact:true}).click();const modifiers=page.getByRole('dialog').last();await expect(modifiers.getByRole('textbox')).toBeFocused();await modifiers.getByRole('checkbox',{name:'Accompagnements',exact:true}).check();await page.screenshot({path:testInfo.outputPath('item-modifiers.png'),fullPage:true,animations:'disabled'});await page.keyboard.press('Escape');expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);expect(errors).toEqual([]);
  });
}

test('new item creation retries unfinished assignments without creating or attaching twice',async({page})=>{
  const fixture=await install(page,{carte:true});let fail=true;const payloads:{path:string;body:unknown}[]=[];await page.route('**/api/v1/menu/**',async route=>{if(route.request().method()!=='GET'){const path=new URL(route.request().url()).pathname;payloads.push({path,body:route.request().postDataJSON()});if(fail&&path==='/api/v1/menu/modifier-sets/1/items')return route.fulfill({status:503,json:{error:'Options indisponibles'}});}return route.fallback();});await page.goto('/1/menu/items/new');const editor=page.getByRole('dialog').first();await editor.locator('#menu-item-name').fill('Article de test');await editor.getByRole('textbox',{name:'Prix de vente',exact:true}).fill('52');await editor.getByRole('button',{name:'Ajouter aux cartes',exact:true}).click();await page.getByRole('dialog').last().getByRole('checkbox',{name:'À la carte',exact:true}).check();await page.keyboard.press('Escape');await editor.getByRole('button',{name:'Ajouter',exact:true}).click();await page.getByRole('dialog').last().getByRole('checkbox',{name:'Accompagnements',exact:true}).check();await page.keyboard.press('Escape');await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Options indisponibles');await expect(editor.locator('#menu-item-name')).toBeDisabled();expect(await page.evaluate(()=>localStorage.getItem('foody.menu.itemDraft.1'))).toBeNull();fail=false;await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/items$/);expect(fixture.writes.filter(p=>p==='/api/v1/menu/items')).toHaveLength(1);expect(fixture.writes.filter(p=>p==='/api/v1/menu/groups/1/items')).toHaveLength(1);expect(payloads[0].body).toMatchObject({name:'Article de test',price:52,category_id:1,item_type:'food_and_beverage'});expect(fixture.unhandled).toEqual([]);
});

test('new item creation errors retain an editable draft and loading errors require retry',async({page})=>{
  const fixture=await install(page,{carte:true});let failLoad=true;let failSave=true;await page.route('**/api/v1/menu/option-sets?*',async route=>failLoad?route.fulfill({status:503,json:{error:'Bibliothèque indisponible'}}):route.fallback());await page.route('**/api/v1/menu/items?*',async route=>failSave&&route.request().method()==='POST'?route.fulfill({status:503,json:{error:'Création indisponible'}}):route.fallback());await page.goto('/1/menu/items/new');await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Bibliothèque indisponible');await expect(page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true})).toHaveCount(0);failLoad=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();const editor=page.getByRole('dialog').first();await editor.locator('#menu-item-name').fill('Brouillon sûr');await editor.getByRole('textbox',{name:'Prix de vente',exact:true}).fill('19');await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Création indisponible');await expect(editor.locator('#menu-item-name')).toBeEnabled();failSave=false;await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/items$/);expect(fixture.writes.filter(p=>p==='/api/v1/menu/items')).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
});

test('new item local draft resumes by-weight fields and remains scoped to its restaurant',async({page})=>{
  const fixture=await install(page);await page.goto('/1/menu/items/new');let editor=page.getByRole('dialog').first();await editor.locator('#menu-item-name').fill('Plat au poids');await editor.getByRole('button',{name:'Au poids',exact:true}).click();await editor.getByRole('textbox',{name:'Prix au kg',exact:true}).fill('88');await editor.getByRole('textbox',{name:'Poids estimé',exact:true}).fill('350');await editor.getByRole('button',{name:'Annuler',exact:true}).first().click();await page.getByRole('alertdialog').getByRole('button',{name:'Fermer',exact:true}).click();await page.goto('/1/menu/items/new');editor=page.getByRole('dialog').first();await expect(editor).toContainText('Reprendre votre article inachevé');await editor.getByRole('button',{name:'Reprendre',exact:true}).click();await expect(editor.locator('#menu-item-name')).toHaveValue('Plat au poids');await expect(editor.getByRole('textbox',{name:'Prix au kg',exact:true})).toHaveValue('88');await expect(editor.getByRole('textbox',{name:'Poids estimé',exact:true})).toHaveValue('350');await page.goto('/2/menu/items/new');await expect(page.getByRole('dialog').locator('#menu-item-name')).toHaveValue('');expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('new item type switch warns about variant loss and supports keyboard cancellation',async({page},testInfo)=>{
  const fixture=await install(page);await page.goto('/1/menu/items/new');const editor=page.getByRole('dialog').first();await editor.getByRole('button',{name:'Ajouter un autre ensemble',exact:true}).click();await editor.getByRole('textbox',{name:'Variante',exact:true}).fill('Grande');await editor.getByRole('radio',{name:/^Combo/}).focus();await page.keyboard.press('Space');const confirmation=page.getByRole('dialog').last();await expect(confirmation.getByRole('heading',{name:"Changer le type d'article ?",exact:true})).toBeVisible();await page.screenshot({path:testInfo.outputPath('item-type-confirmation.png'),fullPage:true,animations:'disabled'});await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(1);await expect(editor.getByRole('textbox',{name:'Variante',exact:true})).toHaveValue('Grande');expect(fixture.writes).toEqual([]);
});

test('new item variants keep absolute prices, order and per-variant flags in the saved contract',async({page})=>{
  const fixture=await install(page);const payloads:{path:string;body:unknown}[]=[];await page.route('**/api/v1/menu/items**',async route=>{if(route.request().method()!=='GET')payloads.push({path:new URL(route.request().url()).pathname,body:route.request().postDataJSON()});return route.fallback();});await page.goto('/1/menu/items/new');const editor=page.getByRole('dialog').first();await editor.locator('#menu-item-name').fill('Deux portions');await editor.getByRole('button',{name:'Ajouter un autre ensemble',exact:true}).click();await editor.getByRole('button',{name:"Groupes d'options enregistrés",exact:true}).click();await page.getByRole('dialog').last().getByRole('button',{name:/Taille de portion/}).click();const variants=editor.getByRole('region',{name:'Taille de portion',exact:true});await variants.getByRole('button',{name:'Descendre',exact:true}).first().click();await variants.getByRole('textbox',{name:'Portion',exact:true}).first().fill('2 personnes');await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/items$/);expect(payloads[0].body).toMatchObject({price:82});expect(payloads[1]).toEqual({path:'/api/v1/menu/items/4/variants-sync',body:{groups:[{option_set_id:1,name:'Taille de portion',sort_order:0,variants:[{option_id:2,name:'À partager',price:82,portion:'2 personnes',is_active:true,is_combo_only:false,sort_order:0},{option_id:1,name:'Individuelle',price:48,portion:'',is_active:true,is_combo_only:false,sort_order:1}]}]}});expect(fixture.unhandled).toEqual([]);
});

test('new item read-only fields and pickers cannot mutate the catalogue',async({page})=>{
  const fixture=await install(page,{permissions:['menu.view']});await page.goto('/1/menu/items/new');const editor=page.getByRole('dialog');await expect(editor.locator('#menu-item-name')).toBeDisabled();await expect(editor.getByRole('button',{name:'Ajouter aux cartes',exact:true})).toBeDisabled();await expect(editor.getByRole('button',{name:/^Enregistrer$|^Ajouter$|^Ajouter un autre ensemble$/})).toHaveCount(0);expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('new item reports unavailable local draft storage without blocking an API save',async({page})=>{
  const fixture=await install(page);await page.goto('/1/menu/items/new');await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('foody.menu.itemDraft.'))throw new Error('Fixture quota');return original.call(this,key,value);};});const editor=page.getByRole('dialog').first();await editor.locator('#menu-item-name').fill('Brouillon sans stockage');await expect(editor.getByRole('status')).toContainText('Le brouillon local n’a pas pu être conservé');await editor.getByRole('textbox',{name:'Prix de vente',exact:true}).fill('22');await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/items$/);expect(fixture.writes).toEqual(['/api/v1/menu/items']);expect(fixture.unhandled).toEqual([]);
});

for(const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}]){
  test(`existing item modifier dialog and draft preservation ${variant.locale}`,async({page},testInfo)=>{
    const fixture=await install(page,variant);await page.setViewportSize(variant);await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.locator('#menu-item-name').fill('Nom en cours · שם');const section=editor.locator('section').filter({has:page.getByRole('heading',{name:variant.locale==='fr'?'Modificateurs':'תוספות',exact:true})});await section.getByRole('button',{name:variant.locale==='fr'?'Ajouter':'הוספה',exact:true}).click();const picker=page.getByRole('dialog').last();await expect(picker.getByRole('textbox')).toBeFocused();await page.screenshot({path:testInfo.outputPath('existing-item-modifiers.png'),fullPage:true,animations:'disabled'});await picker.getByRole('checkbox',{name:'Accompagnements',exact:true}).click();await expect(picker.getByRole('checkbox',{name:'Accompagnements',exact:true})).toBeChecked();await page.keyboard.press('Escape');await expect(editor.locator('#menu-item-name')).toHaveValue('Nom en cours · שם');await section.getByRole('button',{name:variant.locale==='fr'?'Détacher':'נתק',exact:true}).click();await page.screenshot({path:testInfo.outputPath('existing-item-detach.png'),fullPage:true,animations:'disabled'});await page.keyboard.press('Escape');await expect(section.getByRole('button',{name:variant.locale==='fr'?'Détacher':'נתק',exact:true})).toBeFocused();expect(fixture.writes).toEqual(['/api/v1/menu/modifier-sets/1/items']);expect(fixture.unhandled).toEqual([]);
  });
}

test('existing item load failure blocks saving and retries without fabricating a missing item',async({page})=>{
  const fixture=await install(page);let fail=true;await page.route('**/api/v1/restaurants/1/settings',async route=>fail?route.fulfill({status:503,json:{error:'Paramètres indisponibles'}}):route.fallback());await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog');await expect(editor.getByRole('alert')).toContainText('Paramètres indisponibles');await expect(editor.getByRole('button',{name:'Enregistrer',exact:true})).toBeDisabled();fail=false;await editor.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(editor.locator('#menu-item-name')).toHaveValue('Salade méditerranéenne');expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('existing item attachment error and detach error preserve the draft and allow retry',async({page})=>{
  const fixture=await install(page);let fail=true;await page.route('**/api/v1/menu/modifier-sets/1/items**',async route=>fail&&route.request().method()!=='GET'?route.fulfill({status:503,json:{error:'Modificateurs indisponibles'}}):route.fallback());await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.locator('#menu-item-name').fill('Nom conservé');const section=editor.locator('section').filter({has:page.getByRole('heading',{name:'Modificateurs',exact:true})});await section.getByRole('button',{name:'Ajouter',exact:true}).click();const picker=page.getByRole('dialog').last();await picker.getByRole('checkbox',{name:'Accompagnements',exact:true}).click();await expect(picker.getByRole('alert')).toContainText('Modificateurs indisponibles');await expect(picker.getByRole('checkbox')).not.toBeChecked();fail=false;await picker.getByRole('checkbox').click();await expect(picker.getByRole('checkbox')).toBeChecked();await page.keyboard.press('Escape');await section.getByRole('button',{name:'Détacher',exact:true}).click();const remove=page.getByRole('dialog').last();fail=true;await remove.getByRole('button',{name:'Détacher',exact:true}).click();await expect(remove.getByRole('alert')).toContainText('Modificateurs indisponibles');fail=false;await remove.getByRole('button',{name:'Détacher',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(1);await expect(section.getByText('Accompagnements',{exact:true})).toHaveCount(0);await expect(editor.locator('#menu-item-name')).toHaveValue('Nom conservé');expect(fixture.unhandled).toEqual([]);
});

test('existing item read-only identity inputs cannot be edited',async({page})=>{
  const fixture=await install(page,{permissions:['menu.view']});await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog');await expect(editor.locator('#menu-item-name')).toBeDisabled();await expect(editor.locator('#menu-item-description')).toBeDisabled();await expect(editor.getByRole('textbox',{name:'Prix de vente',exact:true})).toBeDisabled();await expect(editor.getByRole('button',{name:'Enregistrer',exact:true})).toHaveCount(0);expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('existing item modifier overrides retain input on failure without resetting article edits',async({page})=>{
  const fixture=await install(page);let fail=true;let payload:unknown;await page.route('**/api/v1/menu/modifier-sets/1/items/1/overrides?*',async route=>{payload=route.request().postDataJSON();return fail?route.fulfill({status:503,json:{error:'Règles indisponibles'}}):route.fallback();});await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.locator('#menu-item-name').fill('Brouillon intact');const section=editor.locator('section').filter({has:page.getByRole('heading',{name:'Modificateurs',exact:true})});await section.getByRole('button',{name:'Ajouter',exact:true}).click();const picker=page.getByRole('dialog').last();await picker.getByRole('checkbox').click();await expect(picker.getByRole('checkbox')).toBeChecked();await page.keyboard.press('Escape');await section.getByRole('button',{name:'Remplacer',exact:true}).click();await section.getByLabel('Sélections minimum',{exact:true}).fill('1');await section.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(section.getByRole('alert')).toContainText('Règles indisponibles');await expect(section.getByLabel('Sélections minimum',{exact:true})).toHaveValue('1');fail=false;await section.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(section.getByLabel('Sélections minimum',{exact:true})).toHaveCount(0);await expect(editor.locator('#menu-item-name')).toHaveValue('Brouillon intact');expect(payload).toEqual({min_selections:1,max_selections:null,is_required:null});expect(fixture.unhandled).toEqual([]);
});

for (const locale of ['fr','he']) {
  test(`existing item recipe and availability drafts survive tabs ${locale}`,async({page},info)=>{
    await page.setViewportSize({width:locale==='fr'?375:1440,height:1000});const fixture=await install(page,{locale,theme:locale==='he'?'dark':'light'});await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();
    await editor.getByRole('tab',{name:locale==='fr'?'Recette':'מתכון',exact:true}).click();await editor.getByRole('button',{name:/^(Instructions|הוראות)/}).click();const title=editor.getByLabel(locale==='fr'?'Étape 1':'שלב 1',{exact:true});await expect(title).toHaveValue('Préparer les légumes');await title.fill('Brouillon de préparation');await editor.getByLabel(locale==='fr'?'Notes du chef':'הערות שף',{exact:true}).fill('Note conservée entre les onglets');await page.screenshot({path:info.outputPath('existing-item-recipe.png'),fullPage:true});
    await editor.getByRole('tab',{name:locale==='fr'?'Stock & disponibilité':'מלאי וזמינות',exact:true}).click();await editor.getByRole('checkbox',{name:locale==='fr'?/Suivre un stock prédéfini/:/עקוב אחר מלאי/}).check();const stock=editor.getByLabel(locale==='fr'?'Stock disponible':'מלאי זמין',{exact:true});await stock.fill('17');await expect(editor).not.toContainText('NaN');await expect(editor.getByText('48',{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('existing-item-availability.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await editor.getByRole('tab',{name:locale==='fr'?'Recette':'מתכון',exact:true}).click();await expect(title).toHaveValue('Brouillon de préparation');await editor.getByRole('tab',{name:locale==='fr'?'Stock & disponibilité':'מלאי וזמינות',exact:true}).click();await expect(stock).toHaveValue('17');expect(fixture.writes).toEqual([]);
    await editor.getByRole('tab',{name:locale==='fr'?'Article':'פריט',exact:true}).click();await editor.getByRole('button',{name:locale==='fr'?'Enregistrer':'שמור',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/items$/);expect(fixture.recipeSteps[1][0].instruction).toBe('Brouillon de préparation\nLaver et découper les tomates.');expect(fixture.items[0]).toMatchObject({stock_quantity:17,stock_mode:'count',recipe_notes:'Note conservée entre les onglets'});expect(fixture.unhandled).toEqual([]);
  });
}

test('existing item recipe and availability load failures are recoverable without empty editors',async({page})=>{
  const fixture=await install(page);let fail=true;await page.route(/\/api\/v1\/(recipes\/items\/1\/steps|availability\/rules)(\?|$)/,route=>fail?route.fulfill({status:503,json:{error:'Données indisponibles'}}):route.fallback());await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:'Recette',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Impossible de charger les instructions');await expect(editor.getByRole('button',{name:/^Instructions/})).toHaveCount(0);fail=false;await editor.getByRole('button',{name:'Réessayer',exact:true}).click();await editor.getByRole('button',{name:/^Instructions/}).click();await expect(editor.getByLabel('Étape 1',{exact:true})).toHaveValue('Préparer les légumes');fail=true;await editor.getByRole('tab',{name:'Stock & disponibilité',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Impossible de charger les règles');await expect(editor.getByRole('checkbox',{name:/Suivre un stock/})).toHaveCount(0);fail=false;await editor.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(editor.getByRole('checkbox',{name:/Suivre un stock/})).toBeVisible();expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('existing item closing guards unsaved fields and recipe-only changes',async({page})=>{
  const fixture=await install(page);await page.goto('/1/menu/items/1?from=%2F1%2Fmenu%2Fitems%3Fq%3DSalade');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:'Recette',exact:true}).click();await editor.getByRole('button',{name:/^Instructions/}).click();await editor.getByLabel('Étape 1',{exact:true}).fill('Recette en cours');await editor.getByRole('button',{name:'Annuler',exact:true}).first().click();const confirm=page.getByRole('alertdialog');await expect(confirm).toContainText('modifications du formulaire');await confirm.getByRole('button',{name:'Annuler',exact:true}).click();await expect(editor.getByLabel('Étape 1',{exact:true})).toHaveValue('Recette en cours');await editor.getByRole('button',{name:'Annuler',exact:true}).first().click();await confirm.getByRole('button',{name:'Abandonner les modifications',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/items\?q=Salade$/,{timeout:15000});expect(fixture.writes).toEqual([]);
});

test('existing item recipe save error retains instructions after changing tabs and allows retry',async({page})=>{
  const fixture=await install(page);let fail=true;await page.route(/\/api\/v1\/recipes\/items\/1\/steps(\?|$)/,route=>route.request().method()==='PUT'&&fail?route.fulfill({status:503,json:{error:'Recette non enregistrée'}}):route.fallback());await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:'Recette',exact:true}).click();await editor.getByRole('button',{name:/^Instructions/}).click();await editor.getByLabel('Étape 1',{exact:true}).fill('Cuisson précise');await editor.getByRole('tab',{name:'Article',exact:true}).click();await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Recette non enregistrée');await editor.getByRole('tab',{name:'Recette',exact:true}).click();await expect(editor.getByLabel('Étape 1',{exact:true})).toHaveValue('Cuisson précise');fail=false;await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/items$/);expect(fixture.recipeSteps[1][0].instruction).toContain('Cuisson précise');expect(fixture.unhandled).toEqual([]);
});

test('existing item read-only recipe and availability expose no editing controls',async({page})=>{
  const fixture=await install(page,{permissions:['menu.view']});await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:'Recette',exact:true}).click();await editor.getByRole('button',{name:/^Instructions/}).click();await expect(editor.getByLabel('Étape 1',{exact:true})).toBeDisabled();await expect(editor.getByRole('button',{name:'Ajouter une étape',exact:true})).toHaveCount(0);await editor.getByRole('tab',{name:'Stock & disponibilité',exact:true}).click();await expect(editor.getByRole('checkbox',{name:/Suivre un stock/})).toBeDisabled();expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('existing item ingredient errors retain values through tabs and refreshed ingredient IDs',async({page})=>{
  const fixture=await install(page);let fail=true;await page.route('**/api/v1/stock/menu-items/1/ingredients?*',route=>route.request().method()==='PUT'&&fail?route.fulfill({status:503,json:{error:'Quantité non enregistrée'}}):route.fallback());await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:'Recette',exact:true}).click();const tomatoes=editor.getByLabel('Quantité — Tomates de saison',{exact:true});await tomatoes.fill('0,35');await editor.getByRole('heading',{name:'Recette',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Quantité non enregistrée');await expect(tomatoes).toHaveValue('0.35');await editor.getByRole('tab',{name:'Article',exact:true}).click();await editor.getByRole('tab',{name:'Recette',exact:true}).click();await expect(tomatoes).toHaveValue('0.35');fail=false;await editor.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(editor.getByRole('alert')).toHaveCount(0);expect(fixture.recipeByItem[1][0].id).toBeGreaterThan(100);await editor.getByLabel('Quantité — Tahini',{exact:true}).fill('0.1');await editor.getByRole('heading',{name:'Recette',exact:true}).click();await expect.poll(()=>fixture.recipeByItem[1][1].quantity_needed).toBe(0.1);expect(fixture.recipeByItem[1][0].quantity_needed).toBe(0.35);expect(fixture.unhandled).toEqual([]);
});

test('existing item recipe multipliers save every row when IDs are recreated',async({page})=>{
  const fixture=await install(page);Object.assign(fixture.optionSets[0],{menu_items:[{id:1}]});await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:'Recette',exact:true}).click();await editor.getByRole('checkbox',{name:'Quantités différentes par taille ?',exact:true}).check();await editor.getByRole('button',{name:'Préremplir les quantités par taille',exact:true}).click();await editor.getByLabel('À partager',{exact:true}).fill('2');await editor.getByRole('button',{name:'Appliquer',exact:true}).click();await expect.poll(()=>fixture.recipeByItem[1].every(ingredient=>ingredient.variant_overrides?.length===2)).toBe(true);expect(fixture.recipeByItem[1].map(ingredient=>(ingredient.variant_overrides??[]).map(override=>override.quantity))).toEqual([[0.25,0.5],[0.07,0.14]]);expect(fixture.recipeByItem[1].every(ingredient=>ingredient.id>102)).toBe(true);expect(fixture.unhandled).toEqual([]);
});

test('existing item ingredient picker and removal keep failures visible',async({page},info)=>{
  const fixture=await install(page);let fail=false;await page.setViewportSize({width:375,height:1000});await page.route('**/api/v1/stock/menu-items/1/ingredients?*',route=>route.request().method()==='PUT'&&fail?route.fulfill({status:503,json:{error:'Recette momentanément indisponible'}}):route.fallback());await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:'Recette',exact:true}).click();await editor.getByRole('button',{name:'Ajouter un ingrédient',exact:true}).click();const search=editor.getByRole('textbox',{name:'Rechercher dans le stock ou les préparations…',exact:true});await search.fill('Sauce');await editor.getByRole('button',{name:/^Sauce tomate/}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('existing-item-ingredient-picker.png'),fullPage:true});fail=true;await editor.getByRole('button',{name:/^Sauce tomate/}).click();await expect(editor.getByRole('alert')).toContainText('Recette momentanément indisponible');await expect(search).toHaveValue('Sauce');fail=false;await editor.getByRole('button',{name:/^Sauce tomate/}).click();await expect(search).toHaveCount(0);await expect.poll(()=>fixture.recipeByItem[1].length).toBe(3);await editor.getByRole('button',{name:'Retirer l’ingrédient — Sauce tomate',exact:true}).click();const modal=page.getByRole('dialog').last();await modal.getByRole('button',{name:'Annuler',exact:true}).click();await editor.getByRole('button',{name:'Retirer l’ingrédient — Sauce tomate',exact:true}).click();fail=true;await modal.getByRole('button',{name:'Supprimer',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Recette momentanément indisponible');fail=false;await modal.getByRole('button',{name:'Supprimer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(1);expect(fixture.recipeByItem[1].length).toBe(2);expect(fixture.unhandled).toEqual([]);
});

for (const locale of ['fr','he']) {
  test(`existing item inline stock creation keyboard and responsive dialog ${locale}`,async({page},info)=>{
    const fixture=await install(page,{locale,theme:locale==='he'?'dark':'light'});await page.setViewportSize({width:locale==='fr'?375:1440,height:1000});await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:locale==='fr'?'Recette':'מתכון',exact:true}).click();await editor.getByRole('button',{name:locale==='fr'?'Ajouter un ingrédient':'הוסף מרכיב',exact:true}).click();await editor.getByRole('textbox',{name:locale==='fr'?'Rechercher dans le stock ou les préparations…':'חיפוש במלאי או בהכנות…',exact:true}).fill('Citron démo');await editor.getByRole('button',{name:locale==='fr'?/^Créer · Ingrédient brut/:/^צור · חומר גלם/}).click();const sheet=page.getByRole('dialog').last();await expect(sheet.getByLabel(locale==='fr'?'Nom':'שם',{exact:true})).toBeFocused();await page.screenshot({path:info.outputPath('existing-item-create-stock.png'),fullPage:true});for(let i=0;i<9;i++){await page.keyboard.press('Tab');expect(await sheet.evaluate(element=>element.contains(document.activeElement))).toBe(true);}await sheet.getByRole('button',{name:locale==='fr'?'Créer et utiliser':'צור והוסף',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(1);await expect.poll(()=>fixture.recipeByItem[1].length).toBe(3);expect(fixture.stock.find(item=>item.name==='Citron démo')).toMatchObject({quantity:0,unit:'kg'});expect(fixture.unhandled).toEqual([]);
  });
}

test('existing item inline preparation retries its recipe without duplicating the preparation',async({page},info)=>{
  const fixture=await install(page);let fail=true;await page.route(/\/api\/v1\/prep\/items\/\d+\/ingredients/,route=>fail?route.fulfill({status:503,json:{error:'Composition non enregistrée'}}):route.fallback());await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:'Recette',exact:true}).click();await editor.getByRole('button',{name:'Ajouter un ingrédient',exact:true}).click();await editor.getByRole('textbox',{name:'Rechercher dans le stock ou les préparations…',exact:true}).fill('Sauce citron démo');await editor.getByRole('button',{name:/^Créer · Préparation/}).click();const sheet=page.getByRole('dialog').last();await sheet.getByLabel('Rendement/Lot',{exact:true}).fill('2');await sheet.getByRole('combobox',{name:'Ingrédient 1',exact:true}).selectOption('1');await sheet.getByLabel('Quantité 1 (kg)',{exact:true}).fill('0.5');await page.setViewportSize({width:375,height:1000});await page.screenshot({path:info.outputPath('existing-item-create-prep.png'),fullPage:true});await sheet.getByRole('button',{name:'Créer et utiliser',exact:true}).click();await expect(sheet.getByRole('alert')).toContainText('Composition non enregistrée');await expect(sheet.getByLabel('Nom',{exact:true})).toBeDisabled();await expect(sheet).toContainText('La fiche a été créée');expect(fixture.preps.filter(item=>item.name==='Sauce citron démo')).toHaveLength(1);fail=false;await sheet.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(1);await expect.poll(()=>fixture.recipeByItem[1].length).toBe(3);expect(fixture.writes.filter(path=>path==='/api/v1/prep/items')).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
});

test('existing item recipe writes require the kitchen permission already enforced by the API',async({page})=>{
  const fixture=await install(page,{permissions:['menu.view','menu.edit']});await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:'Recette',exact:true}).click();await expect(editor.getByRole('button',{name:'Ajouter un ingrédient',exact:true})).toHaveCount(0);await expect(editor.getByLabel('Quantité — Tomates de saison',{exact:true})).toBeDisabled();await editor.getByRole('button',{name:/^Instructions/}).click();await expect(editor.getByLabel('Étape 1',{exact:true})).toBeDisabled();expect(fixture.writes).toEqual([]);
});

test('existing item unit picker restores focus and persists the chosen recipe unit',async({page})=>{
  const fixture=await install(page);await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:'Recette',exact:true}).click();const unit=editor.getByRole('button',{name:'Unité — Tomates de saison',exact:true});await unit.click();await page.getByRole('button',{name:'g',exact:true}).click();await expect.poll(()=>fixture.recipeByItem[1][0].unit).toBe('g');await expect(unit).toBeFocused();expect(fixture.recipeByItem[1][0].quantity_needed).toBe(0.25);expect(fixture.unhandled).toEqual([]);
});

for(const variant of [
  {locale:'fr',theme:'light',width:375,height:900,title:'Créer une image avec l’IA',trigger:"Générer avec l'IA",prompt:'Consignes pour l’image',close:'Fermer',cancel:'Annuler'},
  {locale:'he',theme:'dark',width:1440,height:1000,title:'יצירת תמונה עם AI',trigger:'צור עם AI',prompt:'הנחיות לתמונה',close:'סגור',cancel:'ביטול'},
  {locale:'en',theme:'light',width:1024,height:900,title:'Create an image with AI',trigger:'Generate with AI',prompt:'Image instructions',close:'Close',cancel:'Cancel'},
]){
  test(`existing item AI image keyboard and unsaved draft ${variant.locale}`,async({page},info)=>{
    const fixture=await install(page,variant);await page.setViewportSize(variant);await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();const trigger=editor.getByRole('button',{name:variant.trigger,exact:true});await trigger.click();const modal=page.getByRole('dialog',{name:variant.title,exact:true});const prompt=modal.getByRole('textbox',{name:variant.prompt,exact:true});await expect(prompt).toBeFocused();await expect(prompt).toHaveValue(/Salade méditerranéenne/);await page.screenshot({path:info.outputPath('existing-item-ai-image.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);for(let i=0;i<12;i++){await page.keyboard.press('Tab');expect(await modal.evaluate(element=>element.contains(document.activeElement))).toBe(true);}await prompt.fill('Photo test · תמונה');await page.keyboard.press('Escape');const confirmation=page.getByRole('alertdialog');await expect(confirmation).toBeVisible();await confirmation.getByRole('button',{name:variant.cancel,exact:true}).click();await expect(prompt).toHaveValue('Photo test · תמונה');await modal.getByRole('button',{name:variant.close,exact:true}).click();await confirmation.getByRole('button').last().click();await expect(modal).toHaveCount(0);await expect(trigger).toBeFocused();expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
  });
}

test('existing item AI image retries templates, generation and confirmation without losing the draft',async({page},info)=>{
  const fixture=await install(page);let failTemplates=true,failGeneration=false,failConfirmation=true;let generated=0;let confirmationBody:unknown;let release:()=>void=()=>{};const generationGate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/v1/menu/image-prompts?*',route=>failTemplates?route.fulfill({status:503,json:{error:'Modèles indisponibles'}}):route.fallback());
  await page.route('**/api/v1/menu/items/1/ai-image/generate?*',async route=>{generated++;if(generated===1)await generationGate;return failGeneration?route.fulfill({status:503,json:{error:'Génération indisponible'}}):route.fallback();});
  await page.route('**/api/v1/menu/items/1/ai-image/confirm?*',async route=>{confirmationBody=route.request().postDataJSON();return failConfirmation?route.fulfill({status:503,json:{error:'Image non enregistrée'}}):route.fallback();});
  await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.locator('#menu-item-name').fill('Nom en cours');await editor.getByRole('button',{name:"Générer avec l'IA",exact:true}).click();const modal=page.getByRole('dialog',{name:'Créer une image avec l’IA'});await expect(modal.getByRole('alert')).toContainText('Modèles indisponibles');const prompt=modal.getByRole('textbox',{name:'Consignes pour l’image',exact:true});await prompt.fill('Image de test conservée');failTemplates=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(modal.getByRole('alert')).toHaveCount(0);await expect(prompt).toHaveValue('Image de test conservée');await modal.getByRole('button',{name:'Générer',exact:true}).click();await expect(modal.getByRole('button',{name:'Fermer',exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(modal).toBeVisible();await expect(prompt).toBeDisabled();release();await expect(modal.getByRole('img')).toBeVisible();expect(generated).toBe(1);failGeneration=true;await modal.getByRole('button',{name:'Générer à nouveau',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Génération indisponible');await expect(modal.getByRole('img')).toBeVisible();await modal.getByRole('button',{name:'Utiliser cette image',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Image non enregistrée');await expect(prompt).toHaveValue('Image de test conservée');await page.screenshot({path:info.outputPath('existing-item-ai-retry.png'),fullPage:true});failConfirmation=false;await modal.getByRole('button',{name:'Utiliser cette image',exact:true}).click();await expect(modal).toHaveCount(0);await expect(editor.locator('#menu-item-name')).toHaveValue('Nom en cours');expect(confirmationBody).toEqual({generation_id:71,image_b64:expect.any(String)});expect(fixture.items[0].image_url).toBe('/brand/favicon.svg');expect(fixture.writes.filter(path=>path.endsWith('/confirm'))).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
});

test('existing item AI photo validates the reference and sends the original multipart contract',async({page})=>{
  const fixture=await install(page);let upload='';await page.route('**/api/v1/menu/items/1/ai-image/edit?*',async route=>{expect(new URL(route.request().url()).searchParams.get('restaurant_id')).toBe('1');upload=route.request().postData()??'';await route.fulfill({json:{generation_id:72,image_b64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',rendered_prompt:'Photo à améliorer'}});});
  await page.goto('/1/menu/items/1');await page.getByRole('button',{name:"Générer avec l'IA",exact:true}).click();const modal=page.getByRole('dialog',{name:'Créer une image avec l’IA'});await modal.getByRole('button',{name:'Modifier une photo',exact:true}).click();const input=modal.getByLabel('Photo de référence',{exact:true});await input.setInputFiles({name:'test.txt',mimeType:'text/plain',buffer:Buffer.from('test')});await expect(modal.getByRole('alert')).toContainText('8 Mo maximum');await expect(modal.getByRole('button',{name:'Générer',exact:true})).toBeDisabled();await input.setInputFiles({name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(8*1024*1024+1)});await expect(modal.getByRole('alert')).toContainText('8 Mo maximum');await input.setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});await modal.getByRole('textbox',{name:'Consignes pour l’image',exact:true}).fill('Photo à améliorer');await modal.getByRole('button',{name:'Générer',exact:true}).click();await expect(modal.getByRole('img')).toBeVisible();expect(upload).toContain('name="image"; filename="reference.png"');expect(upload).toContain('name="prompt_override"');expect(upload).toContain('Photo à améliorer');expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

for(const variant of [
  {locale:'fr',theme:'light',width:375,height:1000,recipe:'Recette',import:'Importer une recette',paste:'Coller le texte',extract:'Extraire la recette',confirm:"Confirmer l'import",quantity:'Quantité par portion',cancel:'Annuler'},
  {locale:'he',theme:'dark',width:1440,height:1000,recipe:'מתכון',import:'ייבא מתכון',paste:'הדבק טקסט',extract:'חלץ מתכון',confirm:'אשר ייבוא',quantity:'כמות למנה',cancel:'ביטול'},
]){
  test(`existing item recipe import review and replacement ${variant.locale}`,async({page},info)=>{
    const fixture=await install(page,variant);await page.setViewportSize(variant);let body:unknown;await page.route('**/api/v1/stock/import/recipes/confirm?*',route=>{body=route.request().postDataJSON();return route.fallback();});await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.locator('#menu-item-name').fill('Nom conservé · שם');await editor.getByRole('tab',{name:variant.recipe,exact:true}).click();await editor.getByRole('button',{name:variant.import,exact:true}).click();const modal=page.getByRole('dialog').last();const input=modal.getByRole('textbox').first();await expect(input).toBeFocused();await input.fill('Tomato · 250 g pour quatre portions');await page.screenshot({path:info.outputPath('existing-item-recipe-import-input.png'),fullPage:true});await modal.getByRole('button',{name:variant.extract,exact:true}).click();await expect(modal.getByRole('heading').last()).toBeFocused();const quantity=modal.getByRole('textbox',{name:`${variant.quantity} — Tomates de saison`,exact:true});await expect(quantity).toHaveValue('250');await quantity.fill('300');await page.screenshot({path:info.outputPath('existing-item-recipe-import-review.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);for(let i=0;i<10;i++){await page.keyboard.press('Tab');expect(await modal.evaluate(element=>element.contains(document.activeElement))).toBe(true);}await modal.getByRole('button',{name:variant.confirm,exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(1);expect(body).toEqual({recipes:[{menu_item_id:1,ingredients:[{stock_item_id:1,name:'Tomates de saison',original_name:'Tomato',quantity_needed:300,unit:'g',category:'Légumes',cost_per_unit:16,price_includes_vat:false}]}]});expect(fixture.recipeByItem[1]).toHaveLength(1);await editor.getByRole('tab').first().click();await expect(editor.locator('#menu-item-name')).toHaveValue('Nom conservé · שם');expect(fixture.unhandled).toEqual([]);
  });
}

test('existing item recipe import recovers settings and extraction errors with its source intact',async({page})=>{
  const fixture=await install(page);await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:'Recette',exact:true}).click();let settingsFail=true,extractFail=true;await page.route('**/api/v1/restaurants/1/settings',route=>settingsFail?route.fulfill({status:503,json:{error:'TVA indisponible'}}):route.fallback());await page.route('**/api/v1/stock/import/recipes/text?*',route=>extractFail?route.fulfill({status:503,json:{error:'Extraction indisponible'}}):route.fallback());await editor.getByRole('button',{name:'Importer une recette',exact:true}).click();const modal=page.getByRole('dialog').last();await modal.getByRole('textbox').fill('Tomates 250 g');await expect(modal.getByRole('alert')).toContainText('TVA indisponible');await expect(modal.getByRole('button',{name:'Extraire la recette',exact:true})).toBeDisabled();settingsFail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await modal.getByRole('button',{name:'Extraire la recette',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Extraction indisponible');await expect(modal.getByRole('textbox')).toHaveValue('Tomates 250 g');extractFail=false;fixture.recipeExtraction.recipes=[];await modal.getByRole('button',{name:'Extraire la recette',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Aucune recette');await expect(modal.getByRole('textbox')).toHaveValue('Tomates 250 g');await page.keyboard.press('Escape');await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(modal.getByRole('textbox')).toHaveValue('Tomates 250 g');expect(fixture.unhandled).toEqual([]);
});

test('existing item recipe import retries a confirmed refresh without repeating the transaction',async({page})=>{
  const fixture=await install(page);let failSave=true,failRefresh=false;let confirmations=0;await page.route('**/api/v1/stock/import/recipes/confirm?*',route=>{confirmations++;if(failSave)return route.fulfill({status:503,json:{error:'Recette non importée'}});failRefresh=true;return route.fallback();});await page.route('**/api/v1/stock/menu-items/1/ingredients?*',route=>route.request().method()==='GET'&&failRefresh?route.fulfill({status:503,json:{error:'Affichage indisponible'}}):route.fallback());await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:'Recette',exact:true}).click();await editor.getByRole('button',{name:'Importer une recette',exact:true}).click();const modal=page.getByRole('dialog').last();await modal.getByRole('textbox').fill('Tomates 250 g');await modal.getByRole('button',{name:'Extraire la recette',exact:true}).click();const qty=modal.getByRole('textbox',{name:'Quantité par portion — Tomates de saison',exact:true});await qty.fill('350');await modal.getByRole('button',{name:"Confirmer l'import",exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Recette non importée');await expect(qty).toHaveValue('350');failSave=false;await modal.getByRole('button',{name:"Confirmer l'import",exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Affichage indisponible');await expect(modal.getByRole('status')).toContainText('La recette a été enregistrée');await expect(qty).toBeDisabled();failRefresh=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(1);expect(confirmations).toBe(2);expect(fixture.writes.filter(path=>path.endsWith('/recipes/confirm'))).toHaveLength(1);expect(fixture.recipeByItem[1][0].quantity_needed).toBe(350);expect(fixture.unhandled).toEqual([]);
});

test('existing item recipe import selects one extracted recipe and can unmatch a stock ingredient',async({page},info)=>{
  const fixture=await install(page);fixture.recipeExtraction.recipes.push({...fixture.recipeExtraction.recipes[0],dish_name:'Recette alternative',ingredients:[{...fixture.recipeExtraction.recipes[0].ingredients[0],quantity:80,unit:'ml'}]});await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:'Recette',exact:true}).click();await editor.getByRole('button',{name:'Importer une recette',exact:true}).click();const modal=page.getByRole('dialog').last();await modal.getByRole('textbox').fill('Deux recettes synthétiques');await modal.getByRole('button',{name:'Extraire la recette',exact:true}).click();await modal.getByLabel('Recette à importer',{exact:true}).selectOption('1');await expect(modal.getByRole('textbox',{name:'Quantité par portion — Tomates de saison',exact:true})).toHaveValue('80');await expect(modal).toContainText('ml');await modal.getByRole('button',{name:/Tomates de saison.*kg/}).click();await page.getByRole('option',{name:/nouvel article: Tomates de saison/}).click();await expect(modal.getByRole('textbox',{name:'Nom — 1',exact:true})).toBeVisible();await modal.getByRole('textbox',{name:'Nom — 1',exact:true}).fill('Ingrédient extrait démo');await page.screenshot({path:info.outputPath('existing-item-recipe-import-new-stock.png'),fullPage:true});await modal.getByRole('button',{name:"Confirmer l'import",exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(1);expect(fixture.stock.find(item=>item.name==='Ingrédient extrait démo')).toBeTruthy();expect(fixture.recipeByItem[1][0].unit).toBe('ml');expect(fixture.recipeByItem[1][0].quantity_needed).toBe(80);expect(fixture.unhandled).toEqual([]);
});

test('existing item recipe document validates file and preserves the multipart extraction contract',async({page},info)=>{
  const fixture=await install(page);let upload='';let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});await page.route('**/api/v1/stock/import/recipes?*',async route=>{expect(new URL(route.request().url()).searchParams.get('lang')).toBe('fr');upload=route.request().postData()??'';await gate;await route.fulfill({json:{extraction:fixture.recipeExtraction}});});await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:'Recette',exact:true}).click();await editor.getByRole('button',{name:'Importer une recette',exact:true}).click();const modal=page.getByRole('dialog').last();await modal.getByRole('button',{name:'Importer un fichier',exact:true}).click();const input=modal.getByLabel('Importer un fichier',{exact:true});await input.setInputFiles({name:'test.txt',mimeType:'text/plain',buffer:Buffer.from('test')});await expect(modal.getByRole('alert')).toContainText('10 Mo');await expect(modal.getByRole('button',{name:'Extraire la recette',exact:true})).toBeDisabled();await input.setInputFiles({name:'recette.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});await modal.getByRole('button',{name:'Extraire la recette',exact:true}).click();await expect(modal.getByRole('button',{name:'Fermer',exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(modal).toBeVisible();release();await expect(modal.getByRole('textbox',{name:'Quantité par portion — Tomates de saison',exact:true})).toBeVisible();expect(upload).toContain('name="file"; filename="recette.png"');await page.setViewportSize({width:768,height:1024});await page.screenshot({path:info.outputPath('existing-item-recipe-import-file.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(fixture.unhandled).toEqual([]);
});

for(const existing of [false,true]){
  test(`recipe import preparation ${existing?'replacement':'creation'} preserves yield and instructions`,async({page},info)=>{
    const fixture=await install(page);let body:unknown;await page.route('**/api/v1/stock/import/recipes/confirm-prep?*',route=>{body=route.request().postDataJSON();return route.fallback();});await page.goto(existing?'/1/kitchen/prep?edit=1':'/1/kitchen/prep');if(existing){await page.getByRole('dialog').getByRole('tab',{name:'Recette',exact:true}).click();await page.getByRole('button',{name:'Importer une recette',exact:true}).click();}else{await page.getByRole('button',{name:'Actions',exact:true}).click();await page.getByRole('menuitem',{name:'Importer une recette',exact:true}).click();}const modal=page.getByRole('dialog').last();await modal.getByRole('textbox').fill('Sauce de tomates démo · rendement 1 kg');await modal.getByRole('button',{name:'Extraire la recette',exact:true}).click();await modal.getByLabel('Étape 1',{exact:true}).fill('Cuire à feu doux');await modal.getByLabel('Unité de rendement',{exact:true}).selectOption('kg');await modal.getByRole('textbox',{name:/Rendement/,exact:false}).fill('2');await page.setViewportSize({width:375,height:1000});await modal.getByLabel('Étape 1',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('recipe-import-preparation.png'),fullPage:true});await modal.getByRole('button',{name:"Confirmer l'import",exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(existing?1:0);expect(body).toMatchObject({prep_item_id:existing?1:null,name:existing?'Sauce tomate':'Sauce de tomates démo',yield:2,yield_unit:'kg',steps:[{instruction:'Cuire à feu doux\nMijoter doucement.',duration_mins:15}]});expect(fixture.writes.filter(path=>path.endsWith('/confirm-prep'))).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
  });
}

for(const variant of [{locale:'fr',theme:'light',width:375,height:1000,tab:'Composition',step:'Étape 1',search:'Rechercher articles ou catégories',upcharge:'Supplément',name:'Nom',save:'Enregistrer'},{locale:'he',theme:'dark',width:1440,height:1000,tab:'הרכב',step:'שלב 1',search:'חיפוש פריטים או קטגוריות',upcharge:'תוספת',name:'שם',save:'שמור'}]){
  test(`combo implicit first step preserves the selected item and surcharge ${variant.locale}`,async({page},info)=>{
    const fixture=await install(page,variant);Object.assign(fixture.items[0],{item_type:'combo',combo_steps:[]});await page.setViewportSize(variant);await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:variant.tab,exact:true}).click();await editor.getByRole('textbox',{name:variant.search,exact:true}).fill('Focaccia');await editor.getByRole('complementary').getByRole('button',{name:/^Focaccia/}).click();const step=editor.getByRole('region',{name:variant.step,exact:true});await expect(step).toBeVisible();await step.getByRole('textbox',{name:`${variant.upcharge} — ${fixture.items[1].name}`,exact:true}).fill('5');await step.getByRole('textbox',{name:variant.name,exact:true}).fill('Choix du plat · מנה');await page.screenshot({path:info.outputPath('existing-item-combo-composition.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await editor.getByRole('button',{name:variant.save,exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/items$/);expect(fixture.items[0]).toMatchObject({item_type:'combo',combo_steps:[{name:'Choix du plat · מנה',min_picks:1,max_picks:1,source_type:'explicit',items:[{menu_item_id:2,price_delta:5,force_off_carte:true}]}]});expect(fixture.unhandled).toEqual([]);
  });
}

test('combo bulk add uses visible catalogue matches and creates a single step',async({page})=>{
  const fixture=await install(page);Object.assign(fixture.items[0],{item_type:'combo',combo_steps:[]});await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:/^Composition(?: \d+)?$/,exact:true}).click();await editor.getByRole('textbox',{name:'Rechercher articles ou catégories',exact:true}).fill('Focaccia');await editor.getByRole('button',{name:'tout ajouter — Cuisine',exact:true}).click();await expect(editor.getByRole('region',{name:'Étape 1',exact:true})).toBeVisible();await expect(editor.getByRole('textbox',{name:/^Supplément — /})).toHaveCount(1);await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/items$/);expect(fixture.items[0]).toMatchObject({combo_steps:[{source_type:'explicit',items:[{menu_item_id:2}]}]});expect(fixture.unhandled).toEqual([]);
});

test('combo closed step uses sibling controls and confirms removal with focus restoration',async({page},info)=>{
  const fixture=await install(page);Object.assign(fixture.items[0],{item_type:'combo',combo_steps:[{id:1,name:'Choix du plat',min_picks:1,max_picks:1,source_type:'explicit',items:[{menu_item_id:2,price_delta:0}]}]});await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:/^Composition(?: \d+)?$/,exact:true}).click();expect(await editor.locator('button button').count()).toBe(0);const remove=editor.getByRole('button',{name:"Supprimer l'étape",exact:true});await remove.click();await page.screenshot({path:info.outputPath('existing-item-combo-remove-step.png'),fullPage:true});await page.keyboard.press('Escape');await expect(remove).toBeFocused();await expect(editor.getByRole('button',{name:'Choix du plat',exact:true})).toBeVisible();await remove.click();await page.getByRole('alertdialog').getByRole('button',{name:'Supprimer',exact:true}).click();await expect(editor.getByRole('button',{name:'Choix du plat',exact:true})).toHaveCount(0);expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('combo read-only role can inspect a step without modifying its price or rules',async({page})=>{
  const fixture=await install(page,{permissions:['menu.view']});Object.assign(fixture.items[0],{item_type:'combo',combo_steps:[{id:1,name:'Choix du plat',min_picks:1,max_picks:1,source_type:'explicit',items:[{menu_item_id:2,price_delta:0}]}]});await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:/^Composition(?: \d+)?$/,exact:true}).click();await expect(editor.getByRole('textbox',{name:'Prix de base',exact:true})).toBeDisabled();await editor.getByRole('button',{name:'Choix du plat',exact:true}).click();const step=editor.getByRole('region',{name:'Choix du plat',exact:true});await expect(step.getByRole('textbox',{name:'Nom',exact:true})).toBeDisabled();await expect(step.getByRole('textbox',{name:'Min',exact:true})).toBeDisabled();await expect(step.getByRole('button',{name:'Carte (groupe)',exact:true})).toBeDisabled();await expect(editor.getByRole('button',{name:"Supprimer l'étape",exact:true})).toHaveCount(0);expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('combo dynamic group retries its authoritative preview and preserves size and item caps',async({page},info)=>{
  const fixture=await install(page);Object.assign(fixture.items[0],{item_type:'combo',combo_steps:[{id:1,name:'Choix du plat',min_picks:1,max_picks:2,source_type:'explicit',items:[{menu_item_id:2,price_delta:0}]}]});Object.assign(fixture.items[1],{option_sets:[fixture.optionSets[0]]});let fail=true;await page.route('**/api/v1/menu/combo/resolve-preview?*',route=>fail?route.fulfill({status:503,json:{error:'Source indisponible'}}):route.fallback());await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:/^Composition(?: \d+)?$/,exact:true}).click();await editor.getByRole('button',{name:'Choix du plat',exact:true}).click();const step=editor.getByRole('region',{name:'Choix du plat',exact:true});await step.getByRole('button',{name:'Carte (groupe)',exact:true}).click();await expect(page.getByRole('alertdialog')).toContainText('supprimera la sélection');await page.getByRole('alertdialog').getByRole('button',{name:'Confirmer',exact:true}).click();await step.getByRole('combobox',{name:'Choisir un groupe de carte…',exact:true}).selectOption('1');await expect(step.getByRole('alert')).toContainText('Aperçu indisponible');fail=false;await step.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(step).toContainText('2 article(s) disponible(s) au client');await step.getByLabel('Max — À partager',{exact:true}).fill('1');await step.getByLabel('Max du même article',{exact:true}).fill('2');await step.getByRole('combobox',{name:'+ Limiter un article précis…',exact:true}).selectOption('2');await step.getByLabel(`Max du même article — ${fixture.items[1].name}`,{exact:true}).fill('1');await page.screenshot({path:info.outputPath('existing-item-combo-group.png'),fullPage:true});await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/items$/);expect(fixture.items[0]).toMatchObject({combo_steps:[{source_type:'group',source_group_id:1,source_variant_label:null,max_per_item:2,item_limits:[{menu_item_id:2,max_qty:1}],variant_rules:[{variant_label:'Individuelle',min_picks:0,max_picks:0},{variant_label:'À partager',min_picks:0,max_picks:1}],items:[]}]});expect(fixture.unhandled).toEqual([]);
});

test('combo source variants preserve inclusion, default ordering and price deltas on mobile',async({page},info)=>{
  const fixture=await install(page);Object.assign(fixture.items[0],{item_type:'combo',combo_steps:[{id:1,name:'Choix du plat',min_picks:1,max_picks:1,source_type:'explicit',items:[{menu_item_id:2,option_id:1,price_delta:0},{menu_item_id:2,option_id:2,price_delta:5}]}]});Object.assign(fixture.items[1],{option_sets:[fixture.optionSets[0]]});await page.setViewportSize({width:375,height:1000});await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:/^Composition(?: \d+)?$/,exact:true}).click();await editor.getByRole('button',{name:'Choix du plat',exact:true}).click();const step=editor.getByRole('region',{name:'Choix du plat',exact:true});await step.getByRole('textbox',{name:'Supplément — À partager',exact:true}).fill('7');await step.getByRole('button',{name:'Définir défaut — À partager',exact:true}).click();await step.getByRole('button',{name:'Inclure cette variante — Individuelle',exact:true}).click();await expect(step.getByRole('textbox',{name:'Supplément — Individuelle',exact:true})).toBeDisabled();await step.getByRole('textbox',{name:'Supplément — À partager',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('existing-item-combo-variants-mobile.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/items$/);expect(fixture.items[0]).toMatchObject({combo_steps:[{items:[{menu_item_id:2,option_id:2,price_delta:7}]}]});expect(fixture.unhandled).toEqual([]);
});

test('combo new item saves its first source selection with a base price',async({page})=>{
  const fixture=await install(page);await page.goto('/1/menu/items/new');const editor=page.getByRole('dialog').first();await editor.locator('#menu-item-name').fill('Menu de démonstration');await editor.getByRole('radio',{name:/^Combo/}).click();await editor.getByRole('tab',{name:'Composition',exact:true}).click();await editor.getByRole('textbox',{name:'Prix de base',exact:true}).fill('65');await editor.getByRole('textbox',{name:'Rechercher articles ou catégories',exact:true}).fill('Focaccia');await editor.getByRole('complementary').getByRole('button',{name:/^Focaccia/}).click();await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/items$/);expect(fixture.items.at(-1)).toMatchObject({name:'Menu de démonstration',price:65,item_type:'combo',combo_steps:[{min_picks:1,max_picks:1,source_type:'explicit',items:[{menu_item_id:2,price_delta:0}]}]});expect(fixture.writes.filter(path=>path==='/api/v1/menu/items')).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
});

for(const variant of [
  {locale:'fr',theme:'light',width:375,height:1000,recipe:'Recette',cost:'Coût',ratio:'% Coût',ratioTitle:'Comment le % Coût est calculé',margin:'Marge brute',simulator:'Et si ?',unitCost:'Coût unitaire',detail:'Voir le détail du calcul',prepTitle:'Comment le coût de Sauce tomate est calculé'},
  {locale:'he',theme:'dark',width:1440,height:1000,recipe:'מתכון',cost:'עלות',ratio:'% עלות',ratioTitle:'איך מחושב אחוז עלות המזון',margin:'רווח גולמי',simulator:'מה אם…?',unitCost:'עלות יחידה',detail:'הצג פרטי חישוב',prepTitle:'כיצד מחושבת העלות של Sauce tomate'},
]){
  test(`cost detail dialogs and preparation simulations are accessible ${variant.locale}`,async({page},info)=>{
    const fixture=await install(page,variant);Object.assign(fixture.preps[0],{ingredients:[{id:1,quantity_needed:2,stock_item:fixture.stock[0]}]});fixture.recipeByItem[1].push({id:3,menu_item_id:1,created_at:'2026-01-01T00:00:00Z',prep_item_id:1,prep_item:{...fixture.preps[0],unit:'l'},quantity_needed:0.5,unit:'l'});await page.setViewportSize(variant);await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:variant.recipe,exact:true}).click();await editor.getByRole('button',{name:new RegExp(`^${variant.cost} `)}).click();const ratio=editor.getByRole('button',{name:new RegExp(`^${variant.ratio}`)});await ratio.click();const modal=page.getByRole('dialog').last();await expect(modal.getByRole('heading',{name:variant.ratioTitle,exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('cost-ratio.png'),fullPage:true});await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(1);await expect(ratio).toBeFocused();await editor.getByRole('button',{name:new RegExp(`^${variant.margin}`)}).click();await expect(page.getByRole('dialog').last().getByRole('heading',{name:variant.margin,exact:true})).toBeVisible();await page.keyboard.press('Escape');await editor.getByRole('button',{name:`${variant.detail} — Sauce tomate`,exact:true}).click();await expect(page.getByRole('dialog').last().getByRole('heading',{name:variant.prepTitle,exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('cost-preparation.png'),fullPage:true});await page.keyboard.press('Escape');const sim=editor.getByRole('region',{name:variant.simulator,exact:true});await sim.getByRole('button',{name:/Sauce tomate/}).click();await page.getByRole('dialog').last().getByRole('textbox',{name:`${variant.unitCost} — Tomates de saison`,exact:true}).fill('20');await page.keyboard.press('Escape');await expect(sim.getByRole('textbox',{name:`${variant.unitCost} — Tomates de saison`,exact:true})).toHaveValue('20.00');await sim.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('cost-simulator.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
  });
}

async function openItemCost(page:Page){
  await page.goto('/1/menu/items/1');const editor=page.getByRole('dialog').first();await editor.getByRole('tab',{name:'Recette',exact:true}).click();await editor.getByRole('button',{name:/^Coût /}).click();return {editor,sim:editor.getByRole('region',{name:'Et si ?',exact:true})};
}

test('cost simulator resumes a partial apply without repeating confirmed writes and preserves item drafts',async({page})=>{
  const fixture=await install(page);let fail=true;await page.route('**/api/v1/stock/items/2?*',route=>fail&&route.request().method()==='PUT'?route.fulfill({status:503,json:{error:'Coût fournisseur indisponible'}}):route.fallback());const {editor,sim}=await openItemCost(page);await editor.getByRole('tab',{name:'Article',exact:true}).click();await editor.locator('#menu-item-name').fill('Nom encore en brouillon');await editor.getByRole('tab',{name:'Recette',exact:true}).click();await sim.getByRole('button',{name:'+10 % prix',exact:true}).click();await sim.getByRole('textbox',{name:'Coût unitaire — Tomates de saison',exact:true}).fill('20');await sim.getByRole('textbox',{name:'Coût unitaire — Tahini',exact:true}).fill('30');await sim.getByRole('button',{name:'Appliquer les changements',exact:true}).click();await expect(sim.getByRole('alert')).toContainText('Coût fournisseur indisponible');await expect(sim.getByRole('status')).toContainText('2 mises à jour sur 3');await expect(editor.getByRole('button',{name:'TTC',exact:true})).toBeDisabled();await expect(sim.getByRole('textbox',{name:'Coût unitaire — Tomates de saison',exact:true})).toBeDisabled();fail=false;await sim.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(sim.getByRole('status')).toContainText('Changements enregistrés');expect(fixture.writes.filter(path=>path==='/api/v1/menu/items/1')).toHaveLength(1);expect(fixture.writes.filter(path=>path==='/api/v1/stock/items/1')).toHaveLength(1);expect(fixture.writes.filter(path=>path==='/api/v1/stock/items/2')).toHaveLength(1);expect(fixture.items[0].price).toBeCloseTo(52.805,3);expect(fixture.stock[0].cost_per_unit).toBe(20);expect(fixture.stock[1].cost_per_unit).toBe(30);await editor.getByRole('tab',{name:'Article',exact:true}).click();await expect(editor.locator('#menu-item-name')).toHaveValue('Nom encore en brouillon');await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page).toHaveURL(/\/1\/menu\/items$/);expect(fixture.items[0].name).toBe('Nom encore en brouillon');expect(fixture.items[0].price).toBeCloseTo(52.805,3);expect(fixture.unhandled).toEqual([]);
});

test('cost simulator retry after a refresh error only reloads the saved values',async({page})=>{
  const fixture=await install(page);const {sim}=await openItemCost(page);let fail=true;await page.route('**/api/v1/menu/item-categories?*',route=>fail?route.fulfill({status:503,json:{error:'Actualisation indisponible'}}):route.fallback());await sim.getByRole('button',{name:'+10 % prix',exact:true}).click();await sim.getByRole('button',{name:'Appliquer les changements',exact:true}).click();await expect(sim.getByRole('alert')).toContainText('Actualisation indisponible');await expect(sim.getByRole('status')).toContainText('sans les enregistrer à nouveau');fail=false;await sim.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(sim.getByRole('status')).toContainText('Changements enregistrés');expect(fixture.writes.filter(path=>path==='/api/v1/menu/items/1')).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
});

test('cost simulator retains its draft between tabs and confirms VAT changes or source navigation',async({page})=>{
  const fixture=await install(page);const {editor,sim}=await openItemCost(page);await sim.getByRole('textbox',{name:'Coût unitaire — Tahini',exact:true}).fill('24');await editor.getByRole('tab',{name:'Article',exact:true}).click();await editor.getByRole('tab',{name:'Recette',exact:true}).click();await expect(sim.getByRole('textbox',{name:'Coût unitaire — Tahini',exact:true})).toHaveValue('24.00');await editor.getByRole('button',{name:'TTC',exact:true}).click();await expect(page.getByRole('alertdialog')).toContainText('Abandonner cette simulation');await page.keyboard.press('Escape');await expect(sim.getByRole('textbox',{name:'Coût unitaire — Tahini',exact:true})).toHaveValue('24.00');await editor.getByRole('button',{name:'Tomates de saison',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.keyboard.press('Escape');await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('réinitialisez la simulation');expect(fixture.writes).toEqual([]);await editor.getByRole('button',{name:'TTC',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Abandonner les modifications',exact:true}).click();await expect(editor.getByRole('button',{name:'TTC',exact:true})).toHaveAttribute('aria-pressed','true');await expect(sim.getByRole('textbox',{name:'Coût unitaire — Tahini',exact:true})).toHaveValue('42.48');expect(fixture.unhandled).toEqual([]);
});

test('cost simulator enforces kitchen permission for saving stock costs',async({page})=>{
  const fixture=await install(page,{permissions:['menu.view','menu.edit','kitchen.view']});const {sim}=await openItemCost(page);await sim.getByRole('textbox',{name:'Coût unitaire — Tahini',exact:true}).fill('24');await expect(sim.getByRole('button',{name:'Appliquer les changements',exact:true})).toBeDisabled();await expect(sim).toContainText('droit de gérer la cuisine');expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('cost simulator converts inclusive stock costs with each stocks VAT rate',async({page})=>{
  const fixture=await install(page);const {editor,sim}=await openItemCost(page);await editor.getByRole('button',{name:'TTC',exact:true}).click();await sim.getByRole('textbox',{name:'Coût unitaire — Tomates de saison',exact:true}).fill('20');await sim.getByRole('textbox',{name:'Coût unitaire — Tahini',exact:true}).fill('47.2');await sim.getByRole('button',{name:'Appliquer les changements',exact:true}).click();await expect(sim.getByRole('status')).toContainText('Changements enregistrés');expect(fixture.stock[0].cost_per_unit).toBe(20);expect(fixture.stock[1].cost_per_unit).toBeCloseTo(40,5);expect(fixture.unhandled).toEqual([]);
});

test('cost simulator applies an option price and preserves other variant prices',async({page})=>{
  const fixture=await install(page);Object.assign(fixture.items[0],{option_sets:[fixture.optionSets[0]]});Object.assign(fixture.optionSets[0],{menu_items:[{id:1,name:fixture.items[0].name}]});const {editor,sim}=await openItemCost(page);await sim.getByRole('button',{name:'+10 % prix',exact:true}).click();await sim.getByRole('button',{name:'Appliquer les changements',exact:true}).click();await expect(sim.getByRole('status')).toContainText('Changements enregistrés');expect(fixture.writes.filter(path=>path==='/api/v1/menu/option-sets/1/items/1/options/1')).toHaveLength(1);await editor.getByRole('tab',{name:'Article',exact:true}).click();const variants=editor.getByRole('region',{name:'Taille de portion',exact:true});await expect(variants.getByRole('textbox',{name:'Prix',exact:true}).first()).toHaveValue(/52\.80/);await expect(variants.getByRole('textbox',{name:'Prix',exact:true}).nth(1)).toHaveValue('82');expect(fixture.unhandled).toEqual([]);
});

test('cost simulator names legacy-price and zero-cost projection limitations without writing',async({page})=>{
  const fixture=await install(page);Object.assign(fixture.items[0],{variant_groups:[{id:1,name:'Ancienne portion',variants:[{id:1,name:'Portion historique',price:48,is_active:true}]}]});fixture.stock[0].cost_per_unit=0;const {sim}=await openItemCost(page);await sim.getByRole('button',{name:'+10 % prix',exact:true}).click();await expect(sim).toContainText('ancienne variante');await expect(sim.getByRole('button',{name:'Appliquer les changements',exact:true})).toBeDisabled();await sim.getByRole('button',{name:'Réinitialiser',exact:true}).click();await sim.getByRole('textbox',{name:'Coût unitaire — Tomates de saison',exact:true}).fill('20');await expect(sim).toContainText('Un coût initial nul');await expect(sim.getByRole('button',{name:'Appliquer les changements',exact:true})).toBeDisabled();expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

for(const variant of [
  {locale:'fr',total:'Total Articles',totalTitle:'Total des articles',active:'Articles actifs',price:'Prix moyen',inactive:'Articles inactifs',formula:'Calcul'},
  {locale:'en',total:'Total items',totalTitle:'Total items',active:'Active items',price:'Average price',inactive:'Inactive items',formula:'Calculation'},
  {locale:'he',total:'סה"כ פריטים',totalTitle:'סך הפריטים',active:'פריטים פעילים',price:'מחיר ממוצע',inactive:'פריטים לא פעילים',formula:'חישוב'},
]){
  test(`cost catalogue KPI definitions match their real metrics ${variant.locale}`,async({page})=>{
    const fixture=await install(page,variant);await page.goto('/1/menu/items');for(const [label,title] of [[variant.total,variant.totalTitle],[variant.active,variant.active],[variant.price,variant.price],[variant.inactive,variant.inactive]]){const trigger=page.getByRole('button',{name:new RegExp(`^${label}`)});await trigger.click();const modal=page.getByRole('dialog');await expect(modal.getByRole('heading',{name:title,exact:true})).toBeVisible();await expect(modal.getByRole('heading',{name:variant.formula,exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(trigger).toBeFocused();}expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
  });
}

test('cost workspace keeps simulations on cancelled selection and refreshes an applied price',async({page})=>{
  const fixture=await install(page);await page.goto('/1/kitchen/food-cost');const select=(name:string)=>page.getByRole('button').filter({has:page.getByRole('heading',{name,exact:true})});await select(fixture.items[0].name).click();const sim=page.getByRole('region',{name:'Et si ?',exact:true});await sim.getByRole('button',{name:'+10 % prix',exact:true}).click();await select(fixture.items[1].name).click();await expect(page.getByRole('alertdialog')).toContainText('Abandonner cette simulation');await page.keyboard.press('Escape');await expect(sim.getByRole('button',{name:'Appliquer les changements',exact:true})).toBeEnabled();await sim.getByRole('button',{name:'Appliquer les changements',exact:true}).click();await expect(sim.getByRole('status')).toContainText('Changements enregistrés');expect(fixture.writes.filter(path=>path==='/api/v1/menu/items/1')).toHaveLength(1);await select(fixture.items[1].name).click();await expect(page.getByRole('heading',{name:fixture.items[1].name,level:2,exact:true})).toBeVisible();expect(fixture.unhandled).toEqual([]);
});

for(const variant of [
  {locale:'fr',theme:'light',width:375,height:900,path:'/1/kitchen/units',title:'Unités',usage:'Utilisée sur 1 article',edit:'Modifier',name:'Nom',abbr:'Abréviation',save:'Enregistrer'},
  {locale:'he',theme:'dark',width:1440,height:1000,path:'/1/settings/stock/units',title:'יחידות',usage:'בשימוש בפריט אחד',edit:'ערוך',name:'שם',abbr:'קיצור',save:'שמור'},
]){
  test(`units library and editor preserve conversions on both routes ${variant.locale}`,async({page},info)=>{
    const fixture=await install(page,{...variant,unitLibrary:true});await page.setViewportSize(variant);await page.goto(variant.path);await expect(page.getByRole('heading',{name:variant.title,level:1,exact:true})).toBeVisible();await expect(page.getByRole('link',{name:variant.title,exact:true})).toHaveAttribute('aria-current','page');const unit=page.getByRole('region',{name:'Pièce',exact:true});await unit.getByLabel(`Pièce — ${variant.usage}`,{exact:true}).click();await expect(unit.getByRole('link',{name:/Tomates de saison/})).toHaveAttribute('href','/1/kitchen/stock?edit=1');await expect(unit).toContainText('0.15 kg');await page.screenshot({path:info.outputPath('units-library.png'),fullPage:true});await unit.getByRole('button',{name:`${variant.edit} — Pièce`,exact:true}).click();const modal=page.getByRole('dialog');await expect(modal.getByRole('textbox',{name:variant.name,exact:true})).toBeFocused();await modal.getByRole('textbox',{name:variant.abbr,exact:true}).fill('pièce');await page.screenshot({path:info.outputPath('units-edit.png'),fullPage:true});await page.keyboard.press('Escape');await expect(page.getByRole('alertdialog')).toBeVisible();await page.keyboard.press('Escape');await expect(modal.getByRole('textbox',{name:variant.abbr,exact:true})).toHaveValue('pièce');await modal.getByRole('button',{name:variant.save,exact:true}).click();await expect(modal).toHaveCount(0);expect(fixture.customUnits[0].abbreviation).toBe('pièce');expect(fixture.stock[0].unit_conversions?.[0].base_quantity).toBe(0.15);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(fixture.writes).toEqual(['/api/v1/units/41']);expect(fixture.unhandled).toEqual([]);
  });
}

test('units load failures and unknown stock usage remain distinct from an empty library',async({page})=>{
  const fixture=await install(page,{unitLibrary:true});let failUnits=true,failStock=true;await page.route('**/api/v1/units',route=>failUnits?route.fulfill({status:503,json:{error:'Bibliothèque indisponible'}}):route.fallback());await page.route('**/api/v1/stock/items*',route=>failStock?route.fulfill({status:503,json:{error:'Stock indisponible'}}):route.fallback());await page.goto('/1/kitchen/units');await expect(page.getByRole('main').getByRole('alert')).toContainText('Bibliothèque indisponible');await expect(page.getByRole('heading',{name:'Aucune unité personnalisée',exact:true})).toHaveCount(0);failUnits=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();const unit=page.getByRole('region',{name:'Pièce',exact:true});await expect(unit).toContainText('Utilisation indisponible');await expect(unit.getByRole('button',{name:'Supprimer — Pièce',exact:true})).toBeDisabled();await expect(unit).not.toContainText('Non utilisée');failStock=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(unit.getByRole('button',{name:'Supprimer — Pièce',exact:true})).toBeEnabled();await expect(unit).toContainText('Utilisée sur 1 article');expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('units creation preserves a failed draft and locks repeated submission and closing',async({page})=>{
  const fixture=await install(page,{unitLibrary:true});let fail=true,requests=0,release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});await page.route('**/api/v1/units',async route=>{if(route.request().method()==='POST'){requests++;if(fail){await gate;return route.fulfill({status:503,json:{error:'Unité non enregistrée'}});}}return route.fallback();});await page.goto('/1/kitchen/units');await page.getByRole('button',{name:'Ajouter une unité',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByRole('textbox',{name:'Nom',exact:true}).fill('  Tranche épaisse  ');await modal.getByRole('textbox',{name:'Abréviation',exact:true}).fill(' tr ');await modal.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(modal.getByRole('textbox',{name:'Nom',exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(modal).toBeVisible();await expect(modal.getByRole('button',{name:'Fermer',exact:true})).toBeDisabled();release();await expect(modal.getByRole('alert')).toContainText('Unité non enregistrée');await expect(modal.getByRole('textbox',{name:'Nom',exact:true})).toHaveValue('  Tranche épaisse  ');fail=false;await modal.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(modal).toHaveCount(0);await expect(page.getByRole('region',{name:'Tranche épaisse',exact:true})).toBeVisible();expect(fixture.customUnits.at(-1)).toMatchObject({name:'Tranche épaisse',abbreviation:'tr'});expect(requests).toBe(2);expect(fixture.writes.filter(path=>path==='/api/v1/units')).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
});

test('units deletion explains lost conversions and retains failures in its confirmation',async({page},info)=>{
  const fixture=await install(page,{unitLibrary:true});let fail=true;await page.route('**/api/v1/units/41',route=>fail?route.fulfill({status:503,json:{error:'Suppression indisponible'}}):route.fallback());await page.goto('/1/kitchen/units');const remove=page.getByRole('button',{name:'Supprimer — Pièce',exact:true});await remove.click();let modal=page.getByRole('dialog');await expect(modal).toContainText("n'auront plus de conversion");await page.keyboard.press('Escape');await expect(remove).toBeFocused();await remove.click();modal=page.getByRole('dialog');await modal.getByRole('button',{name:'Supprimer',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Suppression indisponible');await page.screenshot({path:info.outputPath('units-delete-error.png'),fullPage:true});fail=false;await modal.getByRole('button',{name:'Supprimer',exact:true}).click();await expect(modal).toHaveCount(0);await expect(page.getByRole('region',{name:'Pièce',exact:true})).toHaveCount(0);expect(fixture.writes).toEqual(['/api/v1/units/41']);expect(fixture.unhandled).toEqual([]);
});

test('units library empty and read-only states expose no unauthorized writes',async({page})=>{
  const fixture=await install(page,{unitLibrary:true,permissions:['kitchen.view','settings.view']});await page.goto('/1/settings/stock/units');await expect(page.getByRole('region',{name:'Pièce',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/^(Ajouter une unité|Modifier — |Supprimer — )/})).toHaveCount(0);fixture.customUnits.length=0;await page.reload();await expect(page.getByRole('heading',{name:'Aucune unité personnalisée',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Ajouter une unité',exact:true})).toHaveCount(0);expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

for(const variant of [
  {locale:'fr',theme:'light',width:375,height:950,path:'/1/kitchen/availability',title:'Règles de disponibilité',edit:'Modifier',name:'Nom de la règle',threshold:'Alerte stock faible à ≤ (portions, 0 = désactivé)',when:'Quand épuisé',count:'Afficher la quantité restante aux clients',useDefault:'Utiliser comme règle par défaut',save:'Enregistrer'},
  {locale:'he',theme:'dark',width:1440,height:1000,path:'/1/settings/stock/availability',title:'כללי זמינות',edit:'ערוך',name:'שם הכלל',threshold:'התראת מלאי נמוך ב-≤ (מנות, 0 = כבוי)',when:'כשאזל המלאי',count:'הצג כמות שנותרה ללקוחות',useDefault:'השתמש ככלל ברירת המחדל',save:'שמור'},
]){
  test(`availability rules editor preserves all fields and replaces the default ${variant.locale}`,async({page},info)=>{
    const fixture=await install(page,variant);await page.setViewportSize(variant);await page.goto(variant.path);
    await expect(page.getByRole('heading',{name:variant.title,level:1,exact:true})).toBeVisible();
    const rule=page.getByRole('region',{name:'Réserve événement',exact:true});
    await rule.getByRole('button',{name:`${variant.edit} — Réserve événement`,exact:true}).click();const modal=page.getByRole('dialog');
    await expect(modal.getByRole('textbox',{name:variant.name,exact:true})).toBeFocused();
    await modal.getByRole('textbox',{name:variant.name,exact:true}).fill('Événement · אירוע');
    await modal.getByRole('textbox',{name:variant.threshold,exact:true}).fill('0');
    await modal.getByRole('combobox',{name:variant.when,exact:true}).selectOption('sold_out');
    await modal.getByRole('checkbox',{name:variant.count,exact:true}).check();await modal.getByRole('checkbox',{name:variant.useDefault,exact:true}).check();
    await page.screenshot({path:info.outputPath('availability-rule-editor.png'),fullPage:true});
    await page.keyboard.press('Escape');await expect(page.getByRole('alertdialog')).toBeVisible();await page.keyboard.press('Escape');
    await modal.getByRole('button',{name:variant.save,exact:true}).click();await expect(modal).toHaveCount(0);
    expect(fixture.availabilityRules[0].is_default).toBe(false);expect(fixture.availabilityRules[1]).toMatchObject({name:'Événement · אירוע',track:true,low_stock_threshold:0,out_of_stock_behavior:'sold_out',show_count:true,is_default:true,sort_order:1});
    await page.getByRole('region',{name:'Événement · אירוע',exact:true}).getByRole('button',{name:`${variant.edit} — Événement · אירוע`,exact:true}).click();
    await expect(modal.getByRole('checkbox',{name:variant.useDefault,exact:true})).toBeDisabled();await page.keyboard.press('Escape');
    await page.screenshot({path:info.outputPath('availability-rule-library.png'),fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(fixture.writes).toEqual(['/api/v1/availability/rules/2']);expect(fixture.unhandled).toEqual([]);
  });
}

test('availability rules creation retains failure, hidden stock fields and a single confirmed write',async({page})=>{
  const fixture=await install(page);let fail=true,requests=0,release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/v1/availability/rules',async route=>{if(route.request().method()==='POST'){requests++;if(fail){await gate;return route.fulfill({status:503,json:{error:'Règle non enregistrée'}});}}return route.fallback();});
  await page.goto('/1/kitchen/availability');await page.getByRole('button',{name:'Nouvelle règle',exact:true}).click();const modal=page.getByRole('dialog');
  await modal.getByRole('textbox',{name:'Nom de la règle',exact:true}).fill('  Buffet démo  ');
  await modal.getByRole('textbox',{name:'Alerte stock faible à ≤ (portions, 0 = désactivé)',exact:true}).fill('8');
  await modal.getByRole('combobox',{name:'Quand épuisé',exact:true}).selectOption('hide');
  await modal.getByRole('checkbox',{name:'Suivre le stock de la recette',exact:true}).uncheck();
  await modal.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(modal.getByRole('textbox')).toBeDisabled();
  await page.keyboard.press('Escape');await expect(modal.getByRole('button',{name:'Fermer',exact:true})).toBeDisabled();release();
  await expect(modal.getByRole('alert')).toContainText('Règle non enregistrée');await expect(modal.getByRole('textbox')).toHaveValue('  Buffet démo  ');
  await modal.getByRole('checkbox',{name:'Suivre le stock de la recette',exact:true}).check();await expect(modal.getByRole('textbox',{name:'Alerte stock faible à ≤ (portions, 0 = désactivé)',exact:true})).toHaveValue('8');
  fail=false;await modal.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(modal).toHaveCount(0);
  expect(fixture.availabilityRules.at(-1)).toMatchObject({name:'Buffet démo',track:true,low_stock_threshold:8,out_of_stock_behavior:'hide',show_count:true,is_default:false,sort_order:2});expect(requests).toBe(2);expect(fixture.writes).toEqual(['/api/v1/availability/rules']);expect(fixture.unhandled).toEqual([]);
});

test('availability rules deletion keeps a server conflict in its dialog and restores focus',async({page},info)=>{
  const fixture=await install(page);let conflict=true;
  await page.route('**/api/v1/availability/rules/2',route=>conflict&&route.request().method()==='DELETE'?route.fulfill({status:409,json:{error:'Cette règle est encore affectée à un article.'}}):route.fallback());
  await page.goto('/1/kitchen/availability');await expect(page.getByRole('button',{name:'Supprimer — Standard',exact:true})).toHaveCount(0);
  const trigger=page.getByRole('button',{name:'Supprimer — Réserve événement',exact:true});await trigger.click();const modal=page.getByRole('dialog');
  await expect(modal).toContainText('Changez d’abord ces affectations');await page.keyboard.press('Escape');await expect(trigger).toBeFocused();await trigger.click();
  await modal.getByRole('button',{name:'Supprimer',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('encore affectée');
  await page.screenshot({path:info.outputPath('availability-rule-delete-conflict.png'),fullPage:true});conflict=false;
  await modal.getByRole('button',{name:'Supprimer',exact:true}).click();await expect(modal).toHaveCount(0);await expect(trigger).toHaveCount(0);
  expect(fixture.availabilityRules.map(rule=>rule.name)).toEqual(['Standard']);expect(fixture.unhandled).toEqual([]);
});

test('availability rules distinguish failed loading, empty and read-only libraries',async({page})=>{
  const fixture=await install(page,{permissions:['settings.view','kitchen.view']});let failed=true;
  await page.route('**/api/v1/availability/rules',route=>failed?route.fulfill({status:503,json:{error:'Règles indisponibles'}}):route.fallback());
  await page.goto('/1/settings/stock/availability');await expect(page.getByRole('main').getByRole('alert')).toContainText('Règles indisponibles');await expect(page.getByText('Aucune règle pour le moment.',{exact:true})).toHaveCount(0);
  failed=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('region',{name:'Standard',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/^(Nouvelle règle|Modifier — |Supprimer — )/})).toHaveCount(0);
  fixture.availabilityRules.length=0;await page.reload();await expect(page.getByText('Aucune règle pour le moment.',{exact:true})).toBeVisible();expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

for(const variant of [
  {locale:'fr',theme:'light',width:375,height:950,title:'Stock',unit:'Unité par défaut',legacy:'Réglage historique',checkbox:'Désactiver automatiquement les articles épuisés',save:'Enregistrer les modifications',saved:'Enregistré'},
  {locale:'he',theme:'dark',width:1440,height:1000,title:'מלאי',unit:'יחידת ברירת מחדל',legacy:'הגדרה ישנה',checkbox:'השבתה אוטומטית של פריטים שאזלו',save:'שמור שינויים',saved:'נשמר'},
]){
  test(`stock settings preserve the legacy flag and save only scoped settings ${variant.locale}`,async({page},info)=>{
    const fixture=await install(page,variant);let body:unknown;
    await page.route('**/api/v1/restaurants/1/settings',route=>{if(route.request().method()==='PUT')body=route.request().postDataJSON();return route.fallback();});
    await page.setViewportSize(variant);await page.goto('/1/settings/stock');await expect(page.getByRole('heading',{name:variant.title,level:1,exact:true})).toBeVisible();
    await page.screenshot({path:info.outputPath('stock-settings-overview.png'),fullPage:true});const save=page.getByRole('button',{name:variant.save,exact:true});await expect(save).toBeDisabled();await page.getByRole('combobox',{name:variant.unit,exact:true}).selectOption('kg');
    await page.getByText(variant.legacy,{exact:true}).click();await page.getByRole('checkbox',{name:variant.checkbox,exact:true}).check();
    await page.screenshot({path:info.outputPath('stock-settings-draft.png'),fullPage:true});await save.click();
    await expect(page.getByRole('main').getByRole('status')).toContainText(variant.saved);await expect(save).toBeDisabled();
    expect(body).toEqual({default_stock_unit:'kg',auto_disable_soldout:true});expect(fixture.writes).toEqual(['/api/v1/restaurants/1/settings']);expect(fixture.unhandled).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  });
}

test('stock settings preserve a failed draft, guard navigation and prevent repeated saving',async({page})=>{
  const fixture=await install(page);let fail=true,release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/v1/restaurants/1/settings',async route=>{if(fail&&route.request().method()==='PUT'){await gate;return route.fulfill({status:503,json:{error:'Stock non enregistré'}});}return route.fallback();});
  await page.goto('/1/settings/stock');const unit=page.getByRole('combobox',{name:'Unité par défaut',exact:true});await unit.selectOption('g');
  await page.getByRole('link',{name:'Gérer les règles',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.keyboard.press('Escape');await expect(unit).toHaveValue('g');
  await page.getByRole('button',{name:'Enregistrer les modifications',exact:true}).click();await expect(unit).toBeDisabled();await page.getByRole('link',{name:'Gérer les règles',exact:true}).click();await expect(page).toHaveURL(/\/settings\/stock$/);release();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Stock non enregistré');await expect(unit).toHaveValue('g');fail=false;
  await page.getByRole('button',{name:'Enregistrer les modifications',exact:true}).click();await expect(page.getByRole('main').getByRole('status')).toContainText('Enregistré');
  await unit.selectOption('kg');await page.getByRole('button',{name:'Réinitialiser',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Abandonner les modifications',exact:true}).click();await expect(unit).toHaveValue('g');
  await unit.selectOption('kg');await page.getByRole('link',{name:'Gérer les règles',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Abandonner les modifications',exact:true}).click();await expect(page).toHaveURL(/\/settings\/stock\/availability$/);
  expect(fixture.writes).toEqual(['/api/v1/restaurants/1/settings']);expect(fixture.unhandled).toEqual([]);
});

test('stock settings failed loading never offers defaults for saving and permits read-only inspection',async({page})=>{
  const fixture=await install(page,{permissions:['settings.view']});let failed=true;
  await page.route('**/api/v1/restaurants/1/settings',route=>failed?route.fulfill({status:503,json:{error:'Paramètres indisponibles'}}):route.fallback());
  await page.goto('/1/settings/stock');await expect(page.getByRole('main').getByRole('alert')).toContainText('Paramètres indisponibles');await expect(page.getByRole('combobox')).toHaveCount(0);
  failed=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('combobox',{name:'Unité par défaut',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Enregistrer les modifications',exact:true})).toHaveCount(0);expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

for(const variant of [
  {locale:'fr',theme:'light',width:375,height:1000,actions:'Actions',history:'Historique',historyTitle:'Historique des mouvements',filters:'Tous les filtres',category:'Catégorie',search:'Rechercher une catégorie...',close:'Fermer',display:'Afficher en'},
  {locale:'he',theme:'dark',width:1440,height:1000,actions:'פעולות',history:'היסטוריה',historyTitle:'היסטוריית תנועות',filters:'כל הסינונים',category:'קטגוריה',search:'חפש קטגוריה...',close:'סגור',display:'הצג בתור'},
]){
  test(`stock workspace filters and row actions work by keyboard ${variant.locale}`,async({page},info)=>{
    const fixture=await install(page,{...variant,stockLibrary:true});await page.setViewportSize(variant);await page.goto('/1/kitchen/stock');
    const trigger=page.getByRole('button',{name:`${variant.actions} — Tomates de saison`,exact:true});await expect(trigger).toBeVisible();
    await page.screenshot({animations:'disabled',path:info.outputPath('stock-workspace.png'),fullPage:true});await trigger.focus();await page.keyboard.press('Enter');await page.getByRole('menuitem',{name:variant.history,exact:true}).press('Enter');
    const history=page.getByRole('dialog');await expect(history.getByRole('heading',{name:variant.historyTitle,exact:true})).toBeVisible();await expect(history).toContainText('Livraison de démonstration');await page.screenshot({animations:'disabled',path:info.outputPath('stock-history.png'),fullPage:true});await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
    await page.getByRole('button',{name:variant.filters,exact:true}).click();const filters=page.getByRole('dialog');await filters.getByRole('button').filter({has:page.getByText(variant.category,{exact:true})}).click();
    await expect(filters.getByRole('searchbox',{name:variant.search,exact:true})).toBeFocused();await filters.getByRole('searchbox').fill('Légumes');await filters.getByRole('button',{name:'Légumes',exact:true}).click();await expect(filters.getByRole('button',{name:'Légumes',exact:true})).toHaveAttribute('aria-pressed','true');await page.screenshot({animations:'disabled',path:info.outputPath('stock-filter-drawer.png'),fullPage:true});await page.keyboard.press('Escape');await expect(trigger).toBeVisible();await expect(page.getByRole('button',{name:`${variant.actions} — Tahini`,exact:true})).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
  });
}

test('stock workspace reports failed settings and retries instead of presenting a fabricated empty stock',async({page})=>{
  const fixture=await install(page,{stockLibrary:true});let fail=true;await page.route('**/api/v1/restaurants/1/settings',route=>fail?route.fulfill({status:503,json:{error:'TVA indisponible'}}):route.fallback());
  await page.goto('/1/kitchen/stock');await expect(page.getByRole('main').getByRole('alert')).toContainText('TVA indisponible');await expect(page.getByRole('button',{name:'Ajouter un article',exact:true})).toHaveCount(0);fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('button',{name:'Actions — Tomates de saison',exact:true})).toBeVisible();expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('stock workspace partial deletion retries remaining records only',async({page},info)=>{
  const fixture=await install(page,{stockLibrary:true});let fail=true;await page.route('**/api/v1/stock/items/2?*',route=>fail&&route.request().method()==='DELETE'?route.fulfill({status:503,json:{error:'Tahini encore présent'}}):route.fallback());
  await page.goto('/1/kitchen/stock');await page.getByRole('checkbox',{name:'Sélectionner — Tomates de saison',exact:true}).check();await page.getByRole('checkbox',{name:'Sélectionner — Tahini',exact:true}).check();await page.getByRole('button',{name:'Supprimer (2)',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByRole('button',{name:'Supprimer',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Tahini encore présent');await expect(modal.getByRole('status')).toContainText('1 articles sur 2');await page.screenshot({animations:'disabled',path:info.outputPath('stock-delete-partial.png'),fullPage:true});fail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(modal).toHaveCount(0);
  expect(fixture.writes.filter(path=>path==='/api/v1/stock/items/1')).toHaveLength(1);expect(fixture.writes.filter(path=>path==='/api/v1/stock/items/2')).toHaveLength(1);expect(fixture.stock.map(item=>item.id)).toEqual([3]);expect(fixture.unhandled).toEqual([]);
});

test('stock movement recovers failed submission and refresh without writing twice',async({page},info)=>{
  const fixture=await install(page,{stockLibrary:true});let failSave=true,failRefresh=false;
  await page.route('**/api/v1/stock/transactions?*',route=>failSave&&route.request().method()==='POST'?route.fulfill({status:503,json:{error:'Mouvement refusé'}}):route.fallback());
  await page.route('**/api/v1/stock/items?*',route=>failRefresh&&route.request().method()==='GET'?route.fulfill({status:503,json:{error:'Rafraîchissement interrompu'}}):route.fallback());
  await page.goto('/1/kitchen/stock');await page.getByRole('button',{name:'Actions — Tomates de saison',exact:true}).click();await page.getByRole('menuitem',{name:'Réception de stock',exact:true}).click();const modal=page.getByRole('dialog');const qty=modal.getByRole('textbox',{name:'Quantité (kg)',exact:true});await expect(qty).toBeFocused();await qty.fill('2,5');await modal.getByRole('textbox',{name:'Notes',exact:true}).fill('Réception démo');
  await page.keyboard.press('Escape');await expect(page.getByRole('alertdialog')).toBeVisible();await page.keyboard.press('Escape');await modal.getByRole('button',{name:'Confirmer',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Mouvement refusé');await expect(qty).toHaveValue(/2[.,]5/);
  failSave=false;failRefresh=true;await modal.getByRole('button',{name:'Confirmer',exact:true}).click();await expect(modal.getByRole('status')).toContainText('Le mouvement est enregistré');await expect(qty).toBeDisabled();await expect(modal.getByRole('alert')).toContainText('Rafraîchissement interrompu');await page.screenshot({animations:'disabled',path:info.outputPath('stock-movement-recovery.png'),fullPage:true});failRefresh=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(modal).toHaveCount(0);
  expect(fixture.stock[0].quantity).toBe(14.5);expect(fixture.writes.filter(path=>path==='/api/v1/stock/transactions')).toHaveLength(1);expect(fixture.stockTransactions[0]).toMatchObject({type:'receive',quantity_delta:2.5,notes:'Réception démo'});expect(fixture.unhandled).toEqual([]);
});

test('stock movement waste and adjustment preserve the signed delta and zero floor',async({page})=>{
  const fixture=await install(page,{stockLibrary:true});await page.goto('/1/kitchen/stock');
  for(const [label,type] of [['Perte','waste'],['Ajustement','adjust']]){
    await page.getByRole('button',{name:'Actions — Tahini',exact:true}).click();await page.getByRole('menuitem',{name:'Réception de stock',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByRole('button',{name:label,exact:true}).click();await modal.getByRole('textbox',{name:'Quantité (kg)',exact:true}).fill('6');await expect(modal).toContainText('Le solde du stock est limité à zéro');await modal.getByRole('button',{name:'Confirmer',exact:true}).click();await expect(modal).toHaveCount(0);expect(fixture.stockTransactions[0]).toMatchObject({type,quantity_delta:-6});expect(fixture.stock[1].quantity).toBe(0);
  }
  expect(fixture.unhandled).toEqual([]);
});

test('stock history distinguishes failure from empty history and supports retry for a read-only role',async({page})=>{
  const fixture=await install(page,{stockLibrary:true,permissions:['kitchen.view']});let fail=true;await page.route('**/api/v1/stock/transactions?*',route=>fail?route.fulfill({status:503,json:{error:'Historique indisponible'}}):route.fallback());await page.goto('/1/kitchen/stock');await page.getByRole('button',{name:'Actions — Tahini',exact:true}).click();await expect(page.getByRole('menuitem',{name:'Réception de stock',exact:true})).toHaveCount(0);await page.getByRole('menuitem',{name:'Historique',exact:true}).click();const modal=page.getByRole('dialog');await expect(modal.getByRole('alert')).toContainText('Historique indisponible');fail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(modal).toContainText('Aucun mouvement');expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('stock editor failed unit metadata never clears existing conversions',async({page})=>{
  const fixture=await install(page,{stockLibrary:true,unitLibrary:true});let fail=true;await page.route('**/api/v1/units',route=>fail?route.fulfill({status:503,json:{error:'Conversions indisponibles'}}):route.fallback());await page.goto('/1/kitchen/stock?edit=1');const modal=page.getByRole('dialog');await expect(modal.getByRole('alert')).toContainText('Conversions indisponibles');await expect(modal.getByRole('button',{name:'Mettre à jour',exact:true})).toBeDisabled();expect(fixture.stock[0].unit_conversions?.[0].base_quantity).toBe(.15);fail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(modal.getByRole('button',{name:'Mettre à jour',exact:true})).toBeEnabled();await modal.getByRole('button',{name:'Mettre à jour',exact:true}).click();await expect(modal).toHaveCount(0);expect(fixture.stock[0].unit_conversions).toEqual([{custom_unit_id:41,base_quantity:.15}]);expect(fixture.unhandled).toEqual([]);
});

for(const variant of [
  {locale:'fr',theme:'light',width:375,height:1000,title:'Modifier l’article',name:'Nom original',save:'Mettre à jour',price:'Afficher le prix en',unit:'Par litre',source:'Lait de démonstration — carton de six bouteilles · חלב'},
  {locale:'he',theme:'dark',width:1440,height:1000,title:'ערוך פריט מלאי',name:'שם מקורי',save:'עדכן',price:'הצג מחיר ב',unit:'לפי ליטר',source:'Lait de démonstration — carton de six bouteilles · חלב'},
]){
  test(`stock editor packaging and VAT preserve server quantities ${variant.locale}`,async({page},info)=>{
    const fixture=await install(page,{...variant,stockLibrary:true,unitLibrary:true});await page.setViewportSize(variant);await page.goto('/1/kitchen/stock?edit=3');const editor=page.getByRole('dialog');await expect(editor.getByRole('textbox',{name:variant.name,exact:true})).toHaveValue(variant.source);
    await page.screenshot({animations:'disabled',path:info.outputPath('stock-editor-identity.png'),fullPage:true});await editor.getByRole('button',{name:variant.price,exact:true}).scrollIntoViewIfNeeded();await editor.getByRole('button',{name:variant.price,exact:true}).press('Enter');await page.getByRole('menuitemradio').last().press('Enter');await expect(page.getByRole('menu')).toHaveCount(0);await page.screenshot({animations:'disabled',path:info.outputPath('stock-editor-purchase.png'),fullPage:true});
    await editor.getByRole('button',{name:variant.save,exact:true}).click();await expect(editor).toHaveCount(0);expect(fixture.stock[2]).toMatchObject({quantity:12,cost_per_unit:9,pack_size:6,container_type:'carton',unit_type:'bottle',unit_content:1,unit_content_unit:'l',vat_rate_override:null});expect(fixture.unhandled).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  });
}

test('stock editor protects drafts and retries a confirmed save without repeating it',async({page},info)=>{
  const fixture=await install(page,{stockLibrary:true,unitLibrary:true});let failSave=true,failRefresh=false;await page.route('**/api/v1/stock/items/1?*',route=>failSave&&route.request().method()==='PUT'?route.fulfill({status:503,json:{error:'Article refusé'}}):route.fallback());await page.route('**/api/v1/stock/items?*',route=>failRefresh&&route.request().method()==='GET'?route.fulfill({status:503,json:{error:'Liste indisponible'}}):route.fallback());
  await page.goto('/1/kitchen/stock?edit=1');const editor=page.getByRole('dialog');await editor.getByRole('textbox',{name:'Nom original',exact:true}).fill('Tomates nouvelles');await page.keyboard.press('Escape');await expect(page.getByRole('alertdialog')).toBeVisible();await page.keyboard.press('Escape');await editor.getByRole('button',{name:'Mettre à jour',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Article refusé');failSave=false;failRefresh=true;await editor.getByRole('button',{name:'Mettre à jour',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Liste indisponible');await expect(editor.getByRole('textbox',{name:'Nom original',exact:true})).toBeDisabled();await expect(editor.getByRole('status')).toContainText('L’article est enregistré');await page.screenshot({animations:'disabled',path:info.outputPath('stock-editor-recovery.png'),fullPage:true});failRefresh=false;await editor.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(editor).toHaveCount(0);expect(fixture.writes.filter(path=>path==='/api/v1/stock/items/1')).toHaveLength(1);expect(fixture.stock[0].vat_rate_override).toBe(0);expect(fixture.stock[0].unit_conversions).toEqual([{custom_unit_id:41,base_quantity:.15}]);expect(fixture.unhandled).toEqual([]);
});

test('stock editor image retry keeps the created item and uploaded image receipt',async({page})=>{
  const fixture=await install(page,{stockLibrary:true});let uploads=0,failUpload=true,failAttach=true;await page.route('**/api/v1/stock/items/4/image?*',route=>{uploads++;return failUpload?route.fulfill({status:503,json:{error:'Image interrompue'}}):route.fulfill({json:{image_url:'/brand/favicon.svg'}});});await page.route('**/api/v1/stock/items/4?*',route=>failAttach&&route.request().method()==='PUT'?route.fulfill({status:503,json:{error:'Image non liée'}}):route.fallback());
  await page.goto('/1/kitchen/stock');await page.getByRole('button',{name:'Ajouter un article',exact:true}).click();const editor=page.getByRole('dialog');await editor.getByRole('textbox',{name:'Nom original',exact:true}).fill('Farine de test');await editor.locator('input[type=file]').setInputFiles({name:'farine.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});expect(fixture.writes).toEqual([]);await editor.getByRole('button',{name:'Créer',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Image interrompue');expect(fixture.stock).toHaveLength(4);failUpload=false;await editor.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Image non liée');expect(uploads).toBe(2);failAttach=false;await editor.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(editor).toHaveCount(0);expect(uploads).toBe(2);expect(fixture.writes.filter(path=>path==='/api/v1/stock/items')).toHaveLength(1);expect(fixture.stock[3]).toMatchObject({name:'Farine de test',image_url:'/brand/favicon.svg'});expect(fixture.unhandled).toEqual([]);
});

test('stock editor icon library retries and applies the chosen image only on save',async({page},info)=>{
  const fixture=await install(page,{stockLibrary:true});let fail=true;await page.route('**/api/v1/ingredient-icons?*',route=>fail?route.fulfill({status:503,json:{error:'Bibliothèque indisponible'}}):route.fallback());await page.goto('/1/kitchen/stock?edit=1');await page.getByRole('button',{name:'Choisir dans la bibliothèque',exact:true}).click();const library=page.getByRole('dialog').last();await expect(library.getByRole('searchbox')).toBeFocused();await expect(library.getByRole('alert')).toContainText('Bibliothèque indisponible');fail=false;await library.getByRole('button',{name:'Réessayer',exact:true}).click();await page.setViewportSize({width:375,height:1000});await page.screenshot({animations:'disabled',path:info.outputPath('stock-icon-library.png'),fullPage:true});await library.getByRole('button',{name:'Tomates de saison Légumes',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(1);expect(fixture.writes).toEqual([]);await page.getByRole('button',{name:'Mettre à jour',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(fixture.stock[0].image_url).toBe('/brand/favicon.svg');expect(fixture.unhandled).toEqual([]);
});

test('stock editor recipe conversion changes stay local until saving the item',async({page},info)=>{
  const fixture=await install(page,{stockLibrary:true,unitLibrary:true});await page.goto('/1/kitchen/stock?edit=1');await page.getByRole('button',{name:'Modifier — Pièce',exact:true}).click();let modal=page.getByRole('dialog').last();const amount=modal.getByRole('textbox').last();await expect(amount).toBeFocused();await amount.fill('0,2');await modal.getByRole('button',{name:'Enregistrer',exact:true}).click();expect(fixture.writes).toEqual([]);
  await page.getByRole('button',{name:'Ajouter une unité',exact:true}).click();modal=page.getByRole('dialog').last();await modal.getByRole('combobox',{name:'Nom',exact:true}).fill('Cuillère de service — mesure de démonstration · כף');await modal.getByRole('textbox').last().fill('0,03');await page.setViewportSize({width:375,height:1000});await page.screenshot({animations:'disabled',path:info.outputPath('stock-recipe-unit.png'),fullPage:true});await modal.getByRole('button',{name:'Enregistrer',exact:true}).click();expect(fixture.writes).toEqual([]);await page.getByRole('button',{name:'Mettre à jour',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(fixture.stock[0].unit_conversions).toEqual([{custom_unit_id:41,base_quantity:.2},{custom_unit_id:42,base_quantity:.03}]);expect(fixture.unhandled).toEqual([]);
});

test('stock editor read-only role can inspect purchasing and conversions without mutation',async({page})=>{
  const fixture=await install(page,{stockLibrary:true,unitLibrary:true,permissions:['kitchen.view']});await page.goto('/1/kitchen/stock?edit=1');const editor=page.getByRole('dialog');await expect(editor.getByRole('textbox',{name:'Nom original',exact:true})).toBeDisabled();await expect(editor.getByRole('textbox',{name:'Notes',exact:true})).toBeDisabled();await expect(editor.getByRole('button',{name:'Mettre à jour',exact:true})).toHaveCount(0);await expect(editor.getByRole('button',{name:'Modifier — Pièce',exact:true})).toHaveCount(0);await page.keyboard.press('Escape');await expect(editor).toHaveCount(0);await page.getByRole('button',{name:'Catégorie Tous',exact:true}).click();await expect(page.getByRole('button',{name:'Créer une catégorie',exact:true})).toHaveCount(0);await expect(page.getByRole('dialog').getByRole('button',{name:/Modifier —/})).toHaveCount(0);expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('stock categories create rename and delete metadata with visible failure recovery',async({page},info)=>{
  const fixture=await install(page,{stockLibrary:true});let fail=true;await page.route('**/api/v1/stock/categories/1?*',route=>fail&&route.request().method()==='PUT'?route.fulfill({status:503,json:{error:'Catégorie refusée'}}):route.fallback());await page.goto('/1/kitchen/stock');await page.getByRole('button',{name:'Catégorie Tous',exact:true}).click();const drawer=page.getByRole('dialog').first();await drawer.getByRole('button',{name:'Créer une catégorie',exact:true}).click();let modal=page.getByRole('dialog').last();await modal.getByRole('textbox').fill('Nouveautés');await modal.getByRole('button',{name:'Créer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(1);await drawer.getByRole('button',{name:'Modifier — Légumes',exact:true}).click();modal=page.getByRole('dialog').last();await modal.getByRole('textbox').fill('Légumes frais');await modal.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Catégorie refusée');fail=false;await modal.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(1);expect(fixture.stock[0].category).toBe('Légumes frais');await drawer.getByRole('button',{name:'Modifier — Légumes frais',exact:true}).click();await page.getByRole('dialog').last().getByRole('button',{name:'Supprimer',exact:true}).click();const confirmation=page.getByRole('dialog').last();await expect(confirmation).toContainText('articles de stock conservent');await page.setViewportSize({width:375,height:1000});await page.screenshot({animations:'disabled',path:info.outputPath('stock-category-delete.png'),fullPage:true});await confirmation.getByRole('button',{name:'Supprimer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(1);expect(fixture.stock[0].category).toBe('Légumes frais');expect(fixture.stockCategories.some(category=>category.name==='Légumes frais')).toBe(false);expect(fixture.unhandled).toEqual([]);
});

test('stock bulk category and VAT preserve selection on failure and apply zero override',async({page})=>{
  const fixture=await install(page,{stockLibrary:true});let fail=true;await page.route('**/api/v1/stock/items/batch-category?*',route=>fail?route.fulfill({status:503,json:{error:'Affectation refusée'}}):route.fallback());await page.goto('/1/kitchen/stock');await page.getByRole('checkbox',{name:'Sélectionner — Tomates de saison',exact:true}).check();await page.getByRole('button',{name:'Modifier la catégorie',exact:true}).click();const drawer=page.getByRole('dialog');await drawer.getByRole('button',{name:/^Épicerie/}).click();await expect(drawer.getByRole('alert')).toContainText('Affectation refusée');fail=false;await drawer.getByRole('button',{name:/^Épicerie/}).click();await expect(drawer).toHaveCount(0);expect(fixture.stock[0].category).toBe('Épicerie');await page.getByRole('checkbox',{name:'Sélectionner — Tahini',exact:true}).check();await page.getByRole('button',{name:'Modifier la TVA',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByRole('combobox',{name:'Taux TVA (%)',exact:true}).selectOption('exempt');await modal.getByRole('button',{name:'Appliquer',exact:true}).click();await expect(modal).toHaveCount(0);expect(fixture.stock[1].vat_rate_override).toBe(0);expect(fixture.unhandled).toEqual([]);
});

test('stock quantity display persists per item and renders large values without page overflow',async({page},info)=>{
  const fixture=await install(page,{stockLibrary:true});fixture.stock[0].cost_per_unit=123456789.25;await page.setViewportSize({width:375,height:1000});await page.goto('/1/kitchen/stock');const display=page.getByRole('button',{name:'Afficher en — Lait de démonstration — carton de six bouteilles · חלב',exact:true});await display.press('Enter');await page.getByRole('menuitem').first().press('Enter');await expect(display).toContainText('2 Cartons');expect(await page.evaluate(()=>localStorage.getItem('foody.stock.level.1.3'))).toBe('L1');await page.screenshot({animations:'disabled',path:info.outputPath('stock-large-values.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.reload();await expect(display).toContainText('2 Cartons');expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('stock CSV import preserves duplicate choices, units and confirmed results on refresh failure',async({page},info)=>{
  const fixture=await install(page,{stockLibrary:true});let fail=false;await page.route('**/api/v1/stock/items?*',route=>fail&&route.request().method()==='GET'?route.fulfill({status:503,json:{error:'Rafraîchissement CSV interrompu'}}):route.fallback());await page.goto('/1/kitchen/stock');await page.getByRole('button',{name:'Actions',exact:true}).click();await page.getByRole('menuitem',{name:'Importer CSV',exact:true}).click();const modal=page.getByRole('dialog');const text=modal.getByRole('textbox',{name:'Coller le contenu CSV',exact:true});await expect(text).toBeFocused();await text.fill('Légumes,Épicerie\nTomates de saison,Riz\nCarotte,');await modal.getByRole('button',{name:'Analyser',exact:true}).click();await expect(modal.getByRole('checkbox',{name:/Tomates de saison/})).not.toBeChecked();await modal.getByRole('combobox',{name:'Unité par défaut',exact:true}).selectOption('kg');await page.setViewportSize({width:375,height:1000});await page.screenshot({animations:'disabled',path:info.outputPath('stock-csv-review.png'),fullPage:true});fail=true;await modal.getByRole('button',{name:'Importer',exact:true}).click();await expect(modal.getByRole('status')).toContainText('2 articles créés');await expect(modal.getByRole('alert')).toContainText('Rafraîchissement CSV interrompu');expect(fixture.stock).toHaveLength(5);fail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await modal.getByRole('button',{name:'Terminé',exact:true}).click();await expect(modal).toHaveCount(0);expect(fixture.writes.filter(path=>path==='/api/v1/stock/import/csv')).toHaveLength(1);expect(fixture.stock.slice(3).every(item=>item.unit==='kg'&&item.quantity===0)).toBe(true);expect(fixture.unhandled).toEqual([]);
});

test('stock CSV import keeps review on rejection and blocks closing while busy',async({page})=>{
  const fixture=await install(page,{stockLibrary:true});let fail=true,release:()=>void=()=>{};let submissions=0;await page.route('**/api/v1/stock/import/csv?*',async route=>{submissions++;await new Promise<void>(resolve=>{release=resolve;});return fail?route.fulfill({status:503,json:{error:'Import refusé'}}):route.fallback();});await page.goto('/1/kitchen/stock');await page.getByRole('button',{name:'Actions',exact:true}).click();await page.getByRole('menuitem',{name:'Importer CSV',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByRole('textbox').fill('Légumes\nCarotte');await page.keyboard.press('Escape');await expect(page.getByRole('alertdialog')).toBeVisible();await page.keyboard.press('Escape');await modal.getByRole('button',{name:'Analyser',exact:true}).click();await modal.getByRole('button',{name:'Importer',exact:true}).click();await expect.poll(()=>submissions).toBe(1);await expect(modal.getByRole('button',{name:'Fermer',exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(modal).toBeVisible();release();await expect(modal.getByRole('alert')).toContainText('Import refusé');await expect(modal.getByRole('checkbox',{name:'Carotte',exact:true})).toBeChecked();fail=false;await modal.getByRole('button',{name:'Importer',exact:true}).click();await expect.poll(()=>submissions).toBe(2);release();await expect(modal.getByRole('status')).toContainText('1 articles créés');expect(fixture.writes.filter(path=>path==='/api/v1/stock/import/csv')).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
});

test('catalogue CSV import reports image failures and keeps navigation to its created carte',async({page},info)=>{
  const fixture=await install(page,{library:true,menuLibrary:true});let body:unknown;await page.route('**/api/v1/menu/import/csv?*',route=>{body=route.request().postDataJSON();return route.fulfill({json:{created:[{id:77,name:'Tarte démo',category_id:1,price:32}],skipped:[],categories_created:[],image_failures:[{item_id:77,name:'Tarte démo',source_url:'https://assets.invalid/tarte.png',reason:'Image indisponible'}],carte_id:1}});});await page.goto('/1/menu/items');await page.getByRole('button',{name:'Actions',exact:true}).click();await page.getByRole('menuitem',{name:'Importer CSV',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByRole('textbox').fill('category,name,price,image_url\nDesserts,Tarte démo,32,https://assets.invalid/tarte.png');await modal.getByRole('button',{name:'Analyser',exact:true}).click();await modal.getByRole('button',{name:'Importer',exact:true}).click();await expect(modal).toContainText('1 images n’ont pas pu être copiées');await expect(modal).toContainText('Tarte démo · Image indisponible');await page.setViewportSize({width:375,height:1000});await page.screenshot({animations:'disabled',path:info.outputPath('catalogue-csv-result.png'),fullPage:true});await modal.getByRole('button',{name:'Terminé',exact:true}).click();await expect(page).toHaveURL('/1/menu/menus/1');expect(body).toMatchObject({categories:[{name:'Desserts',items:[{name:'Tarte démo',price:32,image_url:'https://assets.invalid/tarte.png'}]}]});expect(fixture.unhandled).toEqual([]);
});

test('stock CSV upload handles format and size errors without discarding entered content',async({page})=>{
  const fixture=await install(page,{stockLibrary:true});await page.goto('/1/kitchen/stock');await page.getByRole('button',{name:'Actions',exact:true}).click();await page.getByRole('menuitem',{name:'Importer CSV',exact:true}).click();const modal=page.getByRole('dialog');const input=modal.locator('input[type=file]');await modal.getByRole('textbox').fill('Légumes\nCarotte');await input.setInputFiles({name:'stock.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('test')});await expect(modal.getByRole('alert')).toBeVisible();await expect(modal.getByRole('textbox')).toHaveValue('Légumes\nCarotte');await input.setInputFiles({name:'stock.csv',mimeType:'text/csv',buffer:Buffer.alloc(5*1024*1024+1)});await expect(modal.getByRole('alert')).toContainText('5 Mo maximum');expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

async function installDelivery(page:Page,options:{locale?:string;theme?:string;documentMissing?:boolean}={}) {
  const fixture=await install(page,{...options,stockLibrary:true});
  const extraction={supplier_name:'Maraîcher démo',delivery_date:'2026-10-04',raw_notes:'Revue synthétique',items:[{original_name:'Tomates facture',translated_name:'Tomates de saison',quantity:2,unit:'kg',estimated_cost:16,total_price:32,category:'Produce',matched_item_id:1,needs_review:true,review_reason:'low_confidence',row_index:1,confidence:.7},{original_name:'Farine',translated_name:'Farine de démonstration',quantity:1,unit:'kg',estimated_cost:8,total_price:8,category:'Dry Goods',matched_item_id:null,row_index:2,confidence:.9}]};
  const lines=extraction.items.map(item=>({stock_item_id:item.matched_item_id??undefined,name:item.translated_name,original_name:item.original_name,quantity:item.quantity,unit:item.unit,category:item.category,cost_per_unit:item.estimated_cost,total_price:item.total_price,needs_review:item.needs_review,review_reason:item.review_reason,vat_rate_override:item.matched_item_id===1?0:null}));
  let detail={draft:{id:70,supplier_id:8,supplier_name:'Maraîcher démo',document_url:options.documentMissing?'':'/brand/favicon.svg',document_type:'image/png',item_count:2,created_at:'2026-10-04T07:00:00Z'},extraction,edited_items:lines};
  const writes:{method:string;path:string;body:any}[]=[];
  await page.route('**/api/v1/suppliers?*',route=>route.fulfill({json:{suppliers:[{id:8,name:'Maraîcher démo'}]}}));
  await page.route('**/api/v1/stock/import/delivery/stream?*',route=>route.fulfill({contentType:'text/event-stream',body:[{event:'meta',data:{supplier_name:extraction.supplier_name,delivery_date:extraction.delivery_date}},...extraction.items.map(item=>({event:'item',data:item})),{event:'done',data:{raw_notes:extraction.raw_notes}}].map(frame=>`event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`).join('')}));
  await page.route('**/api/v1/stock/import/drafts?*',route=>{if(route.request().method()==='GET')return route.fulfill({json:{drafts:[detail.draft]}});const input=JSON.parse((route.request().postData()??'').match(/name="input"\r\n\r\n([\s\S]*?)\r\n--/)?.[1]??'{}');writes.push({method:'POST',path:'draft',body:input});detail={...detail,extraction:input.extraction,edited_items:input.edited_items};return route.fulfill({json:{draft:detail.draft}});});
  await page.route('**/api/v1/stock/import/drafts/70?*',route=>{const method=route.request().method();if(method!=='GET'){const body=route.request().postDataJSON();writes.push({method,path:'draft/70',body});if(method==='PUT')detail={...detail,extraction:body.extraction,edited_items:body.edited_items};}return route.fulfill({json:method==='GET'?detail:{draft:detail.draft}});});
  await page.route('**/api/v1/stock/import/delivery/confirm?*',route=>{writes.push({method:'POST',path:'confirm',body:route.request().postDataJSON()});return route.fulfill({json:{}});});
  return {fixture,writes,extraction};
}
async function openDeliveryScan(page:Page,copy={actions:'Actions',import:'Importer livraison',supplier:'Sélectionner le fournisseur',file:'Justificatif de livraison',analyze:'Télécharger et analyser'}) {
  await page.goto('/1/kitchen/stock');await page.getByRole('button',{name:copy.actions,exact:true}).click();await page.getByRole('menuitem',{name:copy.import,exact:true}).click();const modal=page.getByRole('dialog');await modal.getByRole('button',{name:new RegExp(`^${copy.supplier}`)}).click();await page.getByRole('option',{name:'Maraîcher démo',exact:true}).click();await modal.getByLabel(copy.file,{exact:true}).setInputFiles('tests/redesign/assets/delivery-document.png');await modal.getByRole('button',{name:copy.analyze,exact:true}).click();
}
for(const variant of [
  {locale:'fr',theme:'light',width:375,height:1000,actions:'Actions',import:'Importer livraison',supplier:'Sélectionner le fournisseur',file:'Justificatif de livraison',analyze:'Télécharger et analyser',confirm:"Confirmer l'import",ack:'Marquer comme vérifié'},
  {locale:'he',theme:'dark',width:1440,height:1000,actions:'פעולות',import:'ייבא משלוח',supplier:'בחר ספק',file:'מסמך אספקה',analyze:'העלה ונתח',confirm:'אשר ייבוא',ack:'סמן כנבדק'},
]){
  test(`delivery scan review preserves flagged lines packaging and exempt VAT ${variant.locale}`,async({page},info)=>{
    const {fixture,writes}=await installDelivery(page,variant);await page.setViewportSize(variant);await openDeliveryScan(page,variant);const editor=page.getByRole('dialog');await expect(editor.getByRole('button',{name:variant.confirm,exact:true})).toBeDisabled();await expect(editor.getByRole('button',{name:variant.ack,exact:true})).toBeVisible();await editor.getByRole('button',{name:variant.ack,exact:true}).click();await expect(editor.getByRole('button',{name:variant.confirm,exact:true})).toBeEnabled();await editor.getByRole('region',{name:variant.locale==='he'?'פריטים':'Articles',exact:true}).evaluate(node=>{node.scrollTop=0;});await page.screenshot({animations:'disabled',path:info.outputPath('delivery-review.png'),fullPage:true});await editor.getByRole('button',{name:variant.confirm,exact:true}).click();await expect(editor).toHaveCount(0);expect(writes.map(value=>`${value.method} ${value.path}`)).toEqual(['POST draft','POST confirm','DELETE draft/70']);expect(writes[1].body).toMatchObject({supplier_name:'Maraîcher démo',document_url:'/brand/favicon.svg',items:[{stock_item_id:1,quantity:2,vat_rate_override:0,cost_per_unit:16},{name:'Farine de démonstration',quantity:1,cost_per_unit:8,vat_rate_override:null}]});expect(fixture.unhandled).toEqual([]);
  });
}

test('delivery saved import retries draft cleanup and refresh without importing twice',async({page},info)=>{
  const {fixture,writes}=await installDelivery(page);let failDelete=true,failRefresh=false;await page.route('**/api/v1/stock/import/drafts/70?*',route=>failDelete&&route.request().method()==='DELETE'?route.fulfill({status:503,json:{error:'Retrait du brouillon interrompu'}}):route.fallback());await page.route('**/api/v1/stock/items?*',route=>failRefresh?route.fulfill({status:503,json:{error:'Liste indisponible'}}):route.fallback());await openDeliveryScan(page);const editor=page.getByRole('dialog');await editor.getByRole('button',{name:'Marquer comme vérifié',exact:true}).click();await editor.getByRole('button',{name:"Confirmer l'import",exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Retrait du brouillon interrompu');await expect(editor.getByRole('status')).toContainText('Le stock est déjà importé');await expect(editor.getByRole('textbox',{name:'Quantité',exact:true}).first()).toBeDisabled();failDelete=false;failRefresh=true;await editor.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Liste indisponible');await page.setViewportSize({width:375,height:1000});await page.screenshot({animations:'disabled',path:info.outputPath('delivery-recovery.png'),fullPage:true});failRefresh=false;await editor.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(editor).toHaveCount(0);expect(writes.filter(value=>value.path==='confirm')).toHaveLength(1);expect(writes.filter(value=>value.path==='draft/70'&&value.method==='DELETE')).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
});

test('delivery reports a draft without a document before accepting import without the bill',async({page},info)=>{
  const {fixture,writes}=await installDelivery(page,{documentMissing:true});await openDeliveryScan(page);const editor=page.getByRole('dialog');await editor.getByRole('button',{name:'Marquer comme vérifié',exact:true}).click();await editor.getByRole('button',{name:"Confirmer l'import",exact:true}).click();await expect(editor).toContainText('Aucun justificatif');expect(writes.filter(value=>value.path==='confirm')).toHaveLength(0);await expect(editor.getByRole('button',{name:"Confirmer l'import",exact:true})).toBeDisabled();await editor.getByRole('checkbox',{name:'Continuer l’import sans justificatif joint',exact:true}).check();await page.setViewportSize({width:375,height:1000});await page.screenshot({animations:'disabled',path:info.outputPath('delivery-document-missing.png'),fullPage:true});await editor.getByRole('button',{name:"Confirmer l'import",exact:true}).click();await expect(editor).toHaveCount(0);expect(writes.filter(value=>value.path==='draft')).toHaveLength(1);expect(writes.find(value=>value.path==='confirm')?.body.document_url).toBe('');expect(fixture.unhandled).toEqual([]);
});

test('delivery resumes a draft and updates it through the existing endpoint without losing its document',async({page})=>{
  const {fixture,writes}=await installDelivery(page);await page.goto('/1/kitchen/stock?draft=70');const editor=page.getByRole('dialog');await expect(editor.getByRole('button',{name:'Enregistrer le brouillon',exact:true})).toBeVisible();await editor.getByRole('textbox',{name:'Quantité',exact:true}).first().fill('3');await editor.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();await expect(editor).toHaveCount(0);expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({method:'PUT',path:'draft/70',body:{edited_items:[{quantity:3},{quantity:1}]}});expect(fixture.unhandled).toEqual([]);
});

test('delivery load errors do not offer fabricated VAT or discard a resumed draft',async({page})=>{
  const {fixture,writes}=await installDelivery(page);let fail=true;await page.route('**/api/v1/stock/import/drafts/70?*',route=>fail?route.fulfill({status:503,json:{error:'Brouillon indisponible'}}):route.fallback());await page.goto('/1/kitchen/stock?draft=70');const modal=page.getByRole('dialog');await expect(modal.getByRole('alert')).toContainText('Brouillon indisponible');await expect(modal.getByRole('button',{name:'Télécharger et analyser',exact:true})).toHaveCount(0);fail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('dialog').getByRole('button',{name:'Enregistrer le brouillon',exact:true})).toBeVisible();expect(writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

async function stubDeliveryMicrophone(page:Page,{deferred=false,denied=false}={}) {
  await page.addInitScript(({deferred,denied})=>{
    const scope=window as any;
    scope.microphoneCalls=0;scope.microphoneStops=0;
    const stream={getTracks:()=>[{stop:()=>scope.microphoneStops++}]};
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>{
      scope.microphoneCalls++;
      if(denied)return Promise.reject(new DOMException('denied','NotAllowedError'));
      return deferred?new Promise(resolve=>{scope.resolveMicrophone=()=>resolve(stream);}):Promise.resolve(stream);
    }}});
    class Recorder {
      static isTypeSupported(){return true;}
      state='inactive';mimeType='audio/webm;codecs=opus';ondataavailable:any;onstop:any;
      start(){this.state='recording';}
      stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['isolated-audio-fixture'],{type:this.mimeType})});this.onstop?.();}
    }
    scope.MediaRecorder=Recorder;
  },{deferred,denied});
}
async function openDeliveryVoice(page:Page){
  await page.goto('/1/kitchen/stock');await page.getByRole('button',{name:'Actions',exact:true}).click();await page.getByRole('menuitem',{name:'Importer livraison',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByRole('button',{name:'Note vocale',exact:true}).click();await modal.getByRole('button',{name:/^Sélectionner le fournisseur/}).click();await page.getByRole('option',{name:'Maraîcher démo',exact:true}).click();return modal;
}

test('delivery voice preserves the recording until sent and reuses it after a failed analysis',async({page},info)=>{
  const {fixture,writes,extraction}=await installDelivery(page);await stubDeliveryMicrophone(page);let fail=true,calls=0;
  await page.route('**/api/v1/stock/import/delivery/voice?*',route=>{calls++;expect(route.request().url()).toContain('supplier_id=8');expect(route.request().headers()['x-restaurant-id']).toBe('1');return fail?route.fulfill({status:503,json:{error:'Analyse vocale interrompue'}}):route.fulfill({json:{extraction,transcript:'Deux kilos de tomates et un kilo de farine.'}});});
  await page.setViewportSize({width:375,height:1000});const modal=await openDeliveryVoice(page);await modal.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(modal.getByRole('button',{name:'Arrêter',exact:true})).toBeVisible();await page.clock.install();await page.clock.fastForward(2000);await modal.getByRole('button',{name:'Arrêter',exact:true}).click();await expect(modal.getByRole('status')).toContainText('2s');expect(calls).toBe(0);await modal.getByRole('button',{name:'Fermer',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await page.screenshot({animations:'disabled',path:info.outputPath('delivery-voice-review.png'),fullPage:true});await modal.getByRole('button',{name:'Envoyer',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Analyse vocale interrompue');fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await page.getByRole('button',{name:'Transcription',exact:true}).click();await expect(page.getByRole('region',{name:'Transcription',exact:true})).toContainText('Deux kilos de tomates');await page.getByRole('button',{name:'Articles',exact:true}).click();await page.getByRole('button',{name:'Marquer comme vérifié',exact:true}).click();await page.getByRole('button',{name:"Confirmer l'import",exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(calls).toBe(2);expect(writes.map(value=>value.path)).toEqual(['confirm']);expect(await page.evaluate(()=>(window as any).microphoneStops)).toBe(1);expect(fixture.unhandled).toEqual([]);
});

test('delivery voice releases microphone access granted after its dialog was discarded',async({page})=>{
  const {fixture,writes}=await installDelivery(page);await stubDeliveryMicrophone(page,{deferred:true});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const modal=await openDeliveryVoice(page);await modal.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(modal.getByRole('button',{name:'En attente de l’accès au microphone…',exact:true})).toBeDisabled();await modal.getByRole('button',{name:'Fermer',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Abandonner les modifications',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await page.evaluate(()=>(window as any).resolveMicrophone());await expect.poll(()=>page.evaluate(()=>(window as any).microphoneStops)).toBe(1);expect(writes).toEqual([]);expect(errors).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('delivery voice explains denied microphone access without submitting an import',async({page})=>{
  const {fixture,writes}=await installDelivery(page);await stubDeliveryMicrophone(page,{denied:true});const modal=await openDeliveryVoice(page);await modal.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Accès au micro refusé');await expect(modal.getByRole('button',{name:'Enregistrer',exact:true})).toBeEnabled();expect(writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('delivery interrupted scan retains received rows and asks before replacing them',async({page})=>{
  const {fixture,writes,extraction}=await installDelivery(page);let calls=0;await page.route('**/api/v1/stock/import/delivery/stream?*',route=>{calls++;return route.fulfill({contentType:'text/event-stream',body:`event: item\ndata: ${JSON.stringify(extraction.items[0])}\n\n`});});await openDeliveryScan(page);const modal=page.getByRole('dialog');await expect(modal.getByRole('alert')).toContainText('sans confirmer sa fin');await expect(modal.getByRole('region',{name:/Article 1/})).toBeVisible();await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();expect(calls).toBe(1);await modal.getByRole('button',{name:'Marquer comme vérifié',exact:true}).click();await modal.getByRole('button',{name:"Confirmer l'import",exact:true}).click();await expect(modal).toHaveCount(0);expect(writes.find(value=>value.path==='confirm')?.body.items).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
});

test('delivery validates files and guards a changed document before closing',async({page})=>{
  const {fixture,writes}=await installDelivery(page);await page.goto('/1/kitchen/stock');await page.getByRole('button',{name:'Actions',exact:true}).click();await page.getByRole('menuitem',{name:'Importer livraison',exact:true}).click();const modal=page.getByRole('dialog');const input=modal.getByLabel('Justificatif de livraison',{exact:true});await input.setInputFiles({name:'bill.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('invalid')});await expect(modal.getByRole('alert')).toContainText('10');await expect(modal.getByRole('button',{name:'Télécharger et analyser',exact:true})).toBeDisabled();await input.setInputFiles({name:'bill.png',mimeType:'image/png',buffer:Buffer.alloc(10*1024*1024+1)});await expect(modal.getByRole('alert')).toBeVisible();await input.setInputFiles({name:'bill.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-demo')});await modal.getByRole('button',{name:'Fermer',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(modal).toContainText('bill.pdf');expect(writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

async function installSupplies(page:Page,options:{locale?:string;theme?:string;permissions?:string[]}={}) {
  const fixture=await install(page,{stockLibrary:true,...options});
  let drafts=[{id:70,supplier_name:'Maraîcher démo',supplier_id:8,item_count:2,created_at:'2026-10-04T07:00:00Z',document_url:'/fixture-document.svg',document_type:'image/svg+xml'}];
  const supplies=[{batch_id:'demo-reception-70',supplier_name:'Maraîcher démo — légumes et fruits de saison pour le service du week-end',item_count:2,total_cost:41.99,created_at:'2026-10-04T07:00:00Z',document_url:'/fixture-document.svg',document_type:'image/svg+xml'},
    {batch_id:'demo-reception-71',supplier_name:'Épicerie démo',item_count:1,total_cost:12645.75,created_at:'2026-10-03T09:00:00Z',document_url:'',document_type:''}];
  const mutations:string[]=[];
  await page.route('**/fixture-document.svg',route=>route.fulfill({path:'tests/redesign/assets/delivery-document.svg',contentType:'image/svg+xml'}));
  await page.route('**/api/v1/stock/supplies',route=>route.fulfill({json:{supplies}}));
  await page.route('**/api/v1/stock/supplies/*',route=>route.fulfill({json:{transactions:[{id:71,quantity_delta:2,stock_item:{name:'Tomates de saison',unit:'kg',cost_per_unit:16}},{id:72,quantity_delta:1,stock_item:{name:'Farine de démonstration',unit:'kg',cost_per_unit:9.99}}]}}));
  await page.route('**/api/v1/stock/import/drafts?*',route=>route.fulfill({json:{drafts}}));
  await page.route('**/api/v1/stock/import/drafts/70?*',route=>{mutations.push(route.request().method());drafts=[];return route.fulfill({json:{}});});
  return {fixture,mutations,supplies};
}
for(const variant of [
  {locale:'fr',theme:'light',width:375,height:1000,title:'Livraisons fournisseurs',search:'Rechercher',supplier:'Fournisseur',document:'Document',withDocument:'Avec document',details:'Voir les détails',viewDocument:'Voir le document',scanned:'Document scanné',close:'Fermer'},
  {locale:'he',theme:'dark',width:1440,height:1000,title:'משלוחי ספקים',search:'חיפוש',supplier:'ספק',document:'מסמך',withDocument:'עם מסמך',details:'צפה בפרטים',viewDocument:'הצג מסמך',scanned:'מסמך סרוק',close:'סגור'},
]){
  test(`supplies list filters detail and nested document viewer ${variant.locale}`,async({page},info)=>{
    const {fixture,supplies}=await installSupplies(page,variant);await page.setViewportSize(variant);await page.goto('/1/kitchen/supplies');await expect(page.getByRole('heading',{name:variant.title,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:supplies[0].supplier_name,exact:true})).toBeVisible();await page.locator('[data-list-toolbar]').getByRole('button',{name:new RegExp(variant.document)}).click();await page.getByRole('menuitemcheckbox').nth(2).click();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Épicerie démo',exact:true})).toHaveCount(0);await page.locator('[data-list-toolbar]').getByRole('button',{name:new RegExp(variant.document)}).click();await page.getByRole('menuitemcheckbox').first().click();await page.keyboard.press('Escape');await page.getByRole('searchbox',{name:variant.search,exact:true}).fill('épicerie');await expect(page.getByRole('button',{name:supplies[0].supplier_name,exact:true})).toHaveCount(0);await page.getByRole('searchbox',{name:variant.search,exact:true}).clear();await page.getByRole('heading',{name:variant.title,exact:true}).scrollIntoViewIfNeeded();await page.screenshot({animations:'disabled',path:info.outputPath('supplies-list.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.getByRole('button',{name:supplies[0].supplier_name,exact:true}).click();const detail=page.getByRole('dialog');await expect(detail).toContainText('Tomates de saison');await expect(detail).toContainText('41.99');await page.screenshot({animations:'disabled',path:info.outputPath('supplies-detail.png'),fullPage:true});await detail.getByRole('button',{name:variant.viewDocument,exact:true}).last().click();const viewer=page.getByRole('dialog',{name:variant.scanned,exact:true});await expect(viewer).toBeVisible();await expect(viewer.getByRole('img')).toBeVisible();await page.screenshot({animations:'disabled',path:info.outputPath('supplies-document.png'),fullPage:true});await viewer.getByRole('button',{name:variant.close,exact:true}).click();await expect(page.getByRole('dialog',{name:supplies[0].supplier_name,exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);expect(fixture.unhandled).toEqual([]);
  });
}

test('supplies initial and detail errors remain distinct from empty data and can be retried',async({page})=>{
  const {fixture,supplies}=await installSupplies(page);let failList=true,failDetail=true;await page.route('**/api/v1/stock/supplies',route=>failList?route.fulfill({status:503,json:{error:'Réceptions indisponibles'}}):route.fallback());await page.route('**/api/v1/stock/supplies/*',route=>failDetail?route.fulfill({status:503,json:{error:'Lignes indisponibles'}}):route.fallback());await page.goto('/1/kitchen/supplies');await expect(page.getByRole('alert').filter({hasText:'Réceptions indisponibles'})).toBeVisible();await expect(page.getByText('Aucun approvisionnement',{exact:true})).toHaveCount(0);failList=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await page.getByRole('button',{name:supplies[0].supplier_name,exact:true}).click();const modal=page.getByRole('dialog');await expect(modal.getByRole('alert')).toContainText('Lignes indisponibles');await expect(modal.getByText('Aucun article',{exact:true})).toHaveCount(0);failDetail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(modal).toContainText('Tomates de saison');expect(fixture.unhandled).toEqual([]);
});

test('supplies draft deletion remains open on failure and resumes retain their deep link',async({page},info)=>{
  const {fixture,mutations}=await installSupplies(page);let fail=true;await page.route('**/api/v1/stock/import/drafts/70?*',route=>fail?route.fulfill({status:503,json:{error:'Suppression interrompue'}}):route.fallback());await page.goto('/1/kitchen/supplies');await page.locator('[data-list-toolbar]').getByRole('button',{name:'Actions',exact:true}).click();await page.getByRole('menuitem',{name:/^Imports en attente/}).click();await expect(page.getByRole('link',{name:'Reprendre',exact:true})).toHaveAttribute('href','/1/kitchen/stock?draft=70');await page.getByRole('button',{name:'Supprimer ce brouillon ? — Maraîcher démo',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByRole('button',{name:'Supprimer',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Suppression interrompue');await page.setViewportSize({width:375,height:812});await page.screenshot({animations:'disabled',path:info.outputPath('supplies-delete-draft.png'),fullPage:true});fail=false;await modal.getByRole('button',{name:'Supprimer',exact:true}).click();await expect(modal).toHaveCount(0);await expect(page.getByRole('link',{name:'Reprendre',exact:true})).toHaveCount(0);expect(mutations).toEqual(['DELETE']);expect(fixture.unhandled).toEqual([]);
});

test('supplies keeps read access without import permissions and explains unavailable images',async({page})=>{
  const {fixture,supplies,mutations}=await installSupplies(page,{permissions:['kitchen.view']});await page.route('**/fixture-document.svg',route=>route.fulfill({status:404,body:'missing'}));await page.goto('/1/kitchen/supplies');await expect(page.getByRole('button',{name:/Supprimer ce brouillon/})).toHaveCount(0);await expect(page.getByRole('link',{name:'Reprendre',exact:true})).toHaveCount(0);await page.getByRole('button',{name:supplies[0].supplier_name,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Voir le document',exact:true}).last().click();const viewer=page.getByRole('dialog',{name:'Document scanné',exact:true});await expect(viewer.getByRole('alert')).toContainText('ne peut pas être affiché');await expect(viewer.getByRole('link',{name:'Ouvrir le document dans un nouvel onglet',exact:true})).toHaveAttribute('href','/fixture-document.svg');expect(mutations).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('supplies refresh failure preserves the already loaded deliveries',async({page})=>{
  const {fixture,supplies}=await installSupplies(page);await page.goto('/1/kitchen/supplies');await expect(page.getByRole('button',{name:supplies[0].supplier_name,exact:true})).toBeVisible();await page.route('**/api/v1/stock/supplies',route=>route.fulfill({status:503,json:{error:'Actualisation interrompue'}}));await page.locator('[data-list-toolbar]').getByRole('button',{name:'Actions',exact:true}).click();await page.getByRole('menuitem',{name:'Actualiser',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Actualisation interrompue'})).toBeVisible();await expect(page.getByRole('button',{name:supplies[0].supplier_name,exact:true})).toBeVisible();expect(fixture.unhandled).toEqual([]);
});

test('delivery opened from daily production retries its refresh without confirming stock twice',async({page})=>{
  const {fixture,writes}=await installDelivery(page);let fail=false;await page.route('**/api/v1/stock/items?*',route=>fail?route.fulfill({status:503,json:{error:'Stock indisponible après réception'}}):route.fallback());await page.goto('/1/kitchen/daily-operations');await page.getByRole('button',{name:'Scanner un bon',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByRole('button',{name:/^Sélectionner le fournisseur/}).click();await page.getByRole('option',{name:'Maraîcher démo',exact:true}).click();await modal.getByLabel('Justificatif de livraison',{exact:true}).setInputFiles('tests/redesign/assets/delivery-document.png');await modal.getByRole('button',{name:'Télécharger et analyser',exact:true}).click();await page.getByRole('button',{name:'Marquer comme vérifié',exact:true}).click();fail=true;await page.getByRole('button',{name:"Confirmer l'import",exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Stock indisponible après réception');await expect(page.getByRole('dialog').getByRole('status')).toContainText('Le stock est déjà importé');fail=false;await page.getByRole('dialog').getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(writes.filter(value=>value.path==='confirm')).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
});

async function installPurchases(page:Page,options:Parameters<typeof install>[1]={}) {
  const fixture=await install(page,{stockLibrary:true,...options});
  const stamp='2026-10-04T06:00:00.000Z';
  Object.assign(fixture.stock[0],{supplier_id:8,supplier:'Maraîcher démo',quantity:1,reorder_threshold:5});
  Object.assign(fixture.stock[2],{supplier_id:8,supplier:'Maraîcher démo'});
  const makeSupplier=(id:number,name:string)=>({id,restaurant_id:1,name,translations:{name:{he:'ספק הדגמה',en:'Demo supplier'}},contact_name:'Contact fictif',phone:'+972000000000',email:'purchase@foody.test',address:'Adresse de démonstration',notes:'Données fictives',extraction_hints:'',preferred_channel:'whatsapp',preferred_language:'fr',is_active:true,products:[] as any[],schedules:[{id:id+100,weekday:(new Date().getDay()+1)%7,window_start:'06:00',window_end:'09:00',order_cutoff_days_before:1,order_cutoff_time:'14:00'}],created_at:stamp,updated_at:stamp});
  const suppliers=[makeSupplier(8,'Maraîcher démo'),makeSupplier(9,'Épicerie démo')];
  suppliers[0].products.push({id:81,supplier_id:8,restaurant_id:1,stock_item_id:1,name:'Tomates fournisseur',translations:{name:{he:'עגבניות ספק',en:'Supplier tomatoes'}},sku:'DEMO-81',unit:'kg',price_per_unit:16,stock_item:fixture.stock[0],created_at:stamp,updated_at:stamp});
  const makeOrder=(id:number,status:string)=>({id,restaurant_id:1,supplier_id:8,status,notes:'Commande fictive — ne pas expédier',total_amount:120,order_date:stamp,expected_delivery_at:'2026-10-05T03:00:00.000Z',expected_delivery_end_at:'2026-10-05T06:00:00.000Z',received_date:null,send_channel:'',send_language:'',sent_at:null,created_by_id:1,supplier:suppliers[0],items:[{id:id*100+1,purchase_order_id:id,supplier_product_id:81,stock_item_id:1,name:'Tomates fournisseur',unit:'kg',quantity:6,order_quantity:6,order_unit:'kg',packaging_set:false,package_count:0,units_per_pack:0,unit_size:0,unit_size_unit:'kg',container_type:'',unit_type:'',translations:{name:{he:'עגבניות ספק'}},price_per_unit:16,total_price:96,received_qty:null},{id:id*100+2,purchase_order_id:id,supplier_product_id:null,stock_item_id:null,name:'Serviettes sans lien stock',unit:'unit',quantity:3,order_quantity:3,order_unit:'unit',packaging_set:false,package_count:0,units_per_pack:0,unit_size:0,unit_size_unit:'unit',container_type:'',unit_type:'',translations:{},price_per_unit:8,total_price:24,received_qty:null}],created_at:stamp,updated_at:stamp});
  const orders:any[]=[makeOrder(71,'draft'),makeOrder(72,'sent')];
  const writes:{method:string;path:string;body:any}[]=[];
  await page.addInitScript(()=>{(window as any).__purchaseUrls=[];window.open=((url:any)=>{(window as any).__purchaseUrls.push(String(url));return null;})as typeof window.open;});
  await page.route(/\/api\/v1\/(?:suppliers|purchase-orders)(?:\/|\?)/,async route=>{
    const req=route.request(),path=new URL(req.url()).pathname.replace('/api/v1/',''),method=req.method(),body=req.postDataJSON()??{};
    if(method!=='GET')writes.push({method,path,body});
    if(path==='suppliers'){
      if(method==='POST'){const supplier={...makeSupplier(10,'New'),...body};suppliers.push(supplier);return route.fulfill({json:{supplier}});}
      return route.fulfill({json:{suppliers}});
    }
    const sm=path.match(/^suppliers\/(\d+)(?:\/(products|order-unit-preferences)(?:\/(\d+))?)?$/);
    if(sm){
      const supplier=suppliers.find(value=>value.id===Number(sm[1]))!;
      if(sm[2]==='order-unit-preferences')return route.fulfill({json:{preferences:[{stock_item_id:1,unit:'kg'},{stock_item_id:3,unit:'carton'}]}});
      if(sm[2]==='products'){
        if(method==='POST'){const product={id:82,supplier_id:supplier.id,...body};supplier.products.push(product);return route.fulfill({json:{product}});}
        if(method==='PUT'){const product=supplier.products.find(value=>value.id===Number(sm[3]));Object.assign(product,body);return route.fulfill({json:{product}});}
        if(method==='DELETE'){supplier.products=supplier.products.filter(value=>value.id!==Number(sm[3]));return route.fulfill({json:{}});}
        return route.fulfill({json:{products:supplier.products}});
      }
      if(method==='PUT')Object.assign(supplier,body);
      if(method==='DELETE')suppliers.splice(suppliers.indexOf(supplier),1);
      return route.fulfill({json:{supplier}});
    }
    if(path==='purchase-orders'){
      if(method==='POST'){const order={...makeOrder(73,'draft'),...body,items:body.items.map((item:any,index:number)=>({...item,id:7300+index})),supplier:suppliers.find(value=>value.id===body.supplier_id)};orders.unshift(order);return route.fulfill({json:{order}});}
      return route.fulfill({json:{orders}});
    }
    const om=path.match(/^purchase-orders\/(\d+)(?:\/(refresh-translations|status|receive|send-email))?$/);
    if(om){
      const order=orders.find(value=>value.id===Number(om[1]));
      if(om[2]==='status')Object.assign(order,{status:body.status,send_channel:body.channel,send_language:body.language});
      else if(om[2]==='receive')Object.assign(order,{status:'received',received_date:stamp});
      else if(om[2]==='send-email'){Object.assign(order,{status:'sent'});return route.fulfill({json:{sent:true}});}
      else if(method==='PUT')Object.assign(order,body);
      else if(method==='DELETE')orders.splice(orders.indexOf(order),1);
      return route.fulfill({json:{order}});
    }
    fixture.unhandled.push(path);return route.fulfill({status:501,json:{error:`Missing supplier fixture ${path}`}});
  });
  return {fixture,suppliers,orders,writes};
}

async function purchaseRowAction(page:Page, row:string, action:string, actionsLabel='Actions') { await page.getByRole('button',{name:`${actionsLabel} — ${row}`,exact:true}).click();await page.getByRole('menuitem',{name:action,exact:true}).click(); }

for(const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}])test(`supplier surfaces ${variant.locale}`,async({page},info)=>{
  const {fixture}=await installPurchases(page,variant);await page.setViewportSize(variant);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  for(const tab of ['needs','orders','suppliers']){
    await page.goto(`/1/kitchen/suppliers?tab=${tab}&source=fixture`);await page.waitForLoadState('networkidle');
    await expect(page.locator('main h1')).toHaveCount(1);if(tab!=='needs')await expect(page.locator('[data-list-toolbar]')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await page.screenshot({path:info.outputPath(`supplier-${tab}-${variant.locale}.png`),fullPage:true,animations:'disabled'});
  }
  await page.getByRole('button',{name:'Maraîcher démo',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({path:info.outputPath(`supplier-form-${variant.locale}.png`),fullPage:true,animations:'disabled'});
  expect(errors).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('supplier form retains schedules, translations and draft through save and refresh failures',async({page},info)=>{
  const {fixture,suppliers,writes}=await installPurchases(page);let saveFail=true,refreshFail=false;
  await page.route('**/api/v1/suppliers/8?*',route=>route.request().method()==='PUT'&&saveFail?route.fulfill({status:503,json:{error:'Fournisseur non enregistré'}}):route.fallback());
  await page.route('**/api/v1/suppliers?*',route=>route.request().method()==='GET'&&refreshFail?route.fulfill({status:503,json:{error:'Liste non actualisée'}}):route.fallback());
  await page.goto('/1/kitchen/suppliers?tab=suppliers&source=fixture');await page.getByRole('button',{name:'Maraîcher démo',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Modifier le fournisseur',exact:true});await modal.getByLabel('Nom original',{exact:true}).fill('Maraîcher — nouveau nom');await modal.getByLabel('Nom du contact',{exact:true}).fill('Contact révisé');
  await page.keyboard.press('Escape');const discard=page.getByRole('alertdialog');await expect(discard).toBeVisible();await discard.getByRole('button',{name:'Annuler',exact:true}).click();
  await modal.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Fournisseur non enregistré');await expect(modal.getByLabel('Nom original',{exact:true})).toHaveValue('Maraîcher — nouveau nom');
  saveFail=false;refreshFail=true;await modal.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Liste non actualisée');await expect(modal.getByLabel('Nom original',{exact:true})).toBeDisabled();
  await page.screenshot({path:info.outputPath('supplier-refresh-recovery.png'),fullPage:true,animations:'disabled'});
  refreshFail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(modal).toHaveCount(0);
  expect(writes.filter(value=>value.path==='suppliers/8')).toHaveLength(1);expect(suppliers[0].contact_name).toBe('Contact révisé');expect(suppliers[0].translations.name.he).toBe('ספק הדגמה');expect(suppliers[0].schedules[0]).toMatchObject({window_start:'06:00',window_end:'09:00',order_cutoff_days_before:1,order_cutoff_time:'14:00'});expect(fixture.unhandled).toEqual([]);
});

test('supplier products preserve links, units and prices with nested draft protection',async({page},info)=>{
  const {fixture,suppliers,writes}=await installPurchases(page);await page.goto('/1/kitchen/suppliers?tab=suppliers');await page.getByRole('button',{name:'Produits — Maraîcher démo',exact:true}).click();
  await page.getByRole('button',{name:'Modifier — Tomates fournisseur',exact:true}).click();const editor=page.getByRole('dialog',{name:'Modifier le produit',exact:true});
  await expect(editor.getByRole('combobox',{name:'Article de stock lié',exact:true})).toHaveValue('1');await editor.getByLabel('Prix / Unité',{exact:true}).fill('18.75');await editor.getByLabel('Réf.',{exact:true}).fill('DEMO-NOUVEAU');
  await page.keyboard.press('Escape');await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();
  await page.screenshot({path:info.outputPath('supplier-product-editor.png'),fullPage:true,animations:'disabled'});
  await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor).toHaveCount(0);
  expect(suppliers[0].products[0]).toMatchObject({stock_item_id:1,unit:'kg',price_per_unit:18.75,sku:'DEMO-NOUVEAU'});
  await page.getByRole('button',{name:'Supprimer — Tomates fournisseur',exact:true}).click();await page.getByRole('dialog',{name:'Supprimer ce produit fournisseur ?',exact:true}).getByRole('button',{name:'Supprimer',exact:true}).click();await expect(page.getByText('Tomates fournisseur',{exact:true})).toHaveCount(0);expect(writes.map(value=>value.method)).toEqual(['PUT','DELETE']);expect(fixture.unhandled).toEqual([]);
});

test('supplier creation and product creation retry a known success without duplicate POST',async({page})=>{
  const {fixture,suppliers,writes}=await installPurchases(page);let fail=false;await page.route('**/api/v1/suppliers?*',route=>route.request().method()==='GET'&&fail?route.fulfill({status:503,json:{error:'Actualisation suspendue'}}):route.fallback());
  await page.goto('/1/kitchen/suppliers?tab=suppliers');await page.getByRole('button',{name:'Ajouter un fournisseur',exact:true}).click();let editor=page.getByRole('dialog',{name:'Ajouter un fournisseur',exact:true});await editor.getByLabel('Nom original',{exact:true}).fill('Nouveau fournisseur démo');fail=true;await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Actualisation suspendue');fail=false;await editor.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(editor).toHaveCount(0);expect(writes.filter(value=>value.path==='suppliers'&&value.method==='POST')).toHaveLength(1);
  await page.getByRole('button',{name:'Produits — Maraîcher démo',exact:true}).click();await page.getByRole('button',{name:'Ajouter un produit',exact:true}).click();editor=page.getByRole('dialog',{name:'Ajouter un produit',exact:true});await editor.getByLabel('Nom original',{exact:true}).fill('Produit démo');
  await page.route('**/api/v1/suppliers/8/products?*',route=>route.request().method()==='GET'&&fail?route.fulfill({status:503,json:{error:'Catalogue suspendu'}}):route.fallback());fail=true;await editor.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Catalogue suspendu');fail=false;await editor.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(editor).toHaveCount(0);expect(suppliers[0].products.filter(value=>value.name==='Produit démo')).toHaveLength(1);expect(writes.filter(value=>value.path==='suppliers/8/products'&&value.method==='POST')).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
});

test('supplier reader can inspect products but cannot change stock or orders',async({page})=>{
  const {fixture,writes}=await installPurchases(page,{permissions:['kitchen.view']});await page.goto('/1/kitchen/suppliers?tab=suppliers');await expect(page.getByRole('button',{name:'Ajouter un fournisseur',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:/^Modifier —/})).toHaveCount(0);await page.getByRole('button',{name:'Produits — Maraîcher démo',exact:true}).click();await expect(page.getByText('Tomates fournisseur',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Ajouter un produit',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:/^Supprimer —/})).toHaveCount(0);await page.keyboard.press('Escape');await page.goto('/1/kitchen/suppliers?tab=orders');await expect(page.getByRole('button',{name:/PO-7[12]/})).toHaveCount(0);expect(writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('supplier load failure is not an empty list and tabs preserve URL context',async({page})=>{
  const {fixture}=await installPurchases(page);let fail=true;await page.route('**/api/v1/suppliers?*',route=>fail?route.fulfill({status:503,json:{error:'Fournisseurs indisponibles'}}):route.fallback());await page.goto('/1/kitchen/suppliers?tab=suppliers&source=fixture');await expect(page.getByRole('alert').filter({hasText:'Fournisseurs indisponibles'})).toBeVisible();await expect(page.getByText('Aucun fournisseur pour le moment',{exact:true})).toHaveCount(0);fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByText('Maraîcher démo',{exact:true})).toBeVisible();await page.locator('[data-list-toolbar]').getByRole('button',{name:'Actions',exact:true}).click();await page.getByRole('menuitem',{name:'Bons de commande',exact:true}).click();await expect(page).toHaveURL(/source=fixture/);await expect(page.getByText('PO-71',{exact:true})).toBeVisible();expect(fixture.unhandled).toEqual([]);
});

test('supplier cancellation and deletion retain confirmation after failure',async({page})=>{
  const {fixture,writes,orders}=await installPurchases(page);let fail=true;await page.route('**/api/v1/purchase-orders/72/status?*',route=>fail?route.fulfill({status:503,json:{error:'Annulation interrompue'}}):route.fallback());await page.goto('/1/kitchen/suppliers?tab=orders');await purchaseRowAction(page,'PO-72','Annuler');let modal=page.getByRole('dialog');await modal.getByRole('button',{name:'Confirmer',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Annulation interrompue');fail=false;await modal.getByRole('button',{name:'Confirmer',exact:true}).click();await expect(modal).toHaveCount(0);expect(orders.find(value=>value.id===72).status).toBe('cancelled');
  await purchaseRowAction(page,'PO-71','Supprimer');modal=page.getByRole('dialog');await modal.getByRole('button',{name:'Supprimer',exact:true}).click();await expect(page.getByText('PO-71',{exact:true})).toHaveCount(0);expect(writes).toHaveLength(2);expect(fixture.unhandled).toEqual([]);
});

test('supplier composer blocks failed unit preferences and protects a supplier change',async({page})=>{
  const {fixture,writes}=await installPurchases(page);let fail=true;await page.route('**/api/v1/suppliers/8/order-unit-preferences?*',route=>fail?route.fulfill({status:503,json:{error:'Préférences indisponibles'}}):route.fallback());await page.goto('/1/kitchen/suppliers');await page.getByRole('button',{name:'Passer une commande',exact:true}).click();const modal=page.getByRole('dialog',{name:'Passer une commande',exact:true});await expect(modal.getByRole('alert')).toContainText('Préférences indisponibles');await expect(modal.getByRole('button',{name:'Enregistrer le brouillon',exact:true})).toBeDisabled();fail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await modal.getByLabel('Quantité · Tomates fournisseur',{exact:true}).fill('2');await modal.getByRole('combobox',{name:'Fournisseur',exact:true}).selectOption('9');const guard=page.getByRole('alertdialog');await expect(guard).toBeVisible();await guard.getByRole('button',{name:'Annuler',exact:true}).click();await expect(modal.getByLabel('Quantité · Tomates fournisseur',{exact:true})).toHaveValue('2');await modal.getByRole('combobox',{name:'Fournisseur',exact:true}).selectOption('9');await guard.getByRole('button',{name:'Continuer',exact:true}).click();await expect(modal.getByRole('combobox',{name:'Fournisseur',exact:true})).toHaveValue('9');await expect(modal.getByLabel('Quantité · Tomates fournisseur',{exact:true})).toHaveCount(0);expect(writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('supplier composer retains carton conversion and retries refresh without creating twice',async({page},info)=>{
  const {fixture,writes}=await installPurchases(page);let fail=false;await page.route('**/api/v1/purchase-orders?*',route=>route.request().method()==='GET'&&fail?route.fulfill({status:503,json:{error:'Bons non actualisés'}}):route.fallback());await page.setViewportSize({width:375,height:812});await page.goto('/1/kitchen/suppliers');await page.getByRole('button',{name:'Passer une commande',exact:true}).click();const modal=page.getByRole('dialog',{name:'Passer une commande',exact:true});const milk=fixture.stock[2].name;
  await modal.getByLabel(`Quantité · ${milk}`,{exact:true}).fill('2');await expect(modal.getByLabel(`Unité de commande · ${milk}`,{exact:true})).toHaveValue('carton');await modal.getByLabel('Notes',{exact:true}).fill('Conserver au frais — essai');await page.screenshot({path:info.outputPath('supplier-composer-mobile.png'),fullPage:true,animations:'disabled'});
  fail=true;await modal.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Bons non actualisés');await expect(modal.getByLabel(`Quantité · ${milk}`,{exact:true})).toBeDisabled();fail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(modal).toHaveCount(0);const created=writes.filter(value=>value.path==='purchase-orders'&&value.method==='POST');expect(created).toHaveLength(1);expect(created[0].body).toMatchObject({supplier_id:8,notes:'Conserver au frais — essai',items:[{stock_item_id:3,quantity:12,order_quantity:2,order_unit:'carton',packaging_set:true,package_count:2,units_per_pack:6,unit_size:1,unit_size_unit:'l',container_type:'carton',unit_type:'bottle',price_per_unit:9}]});expect(fixture.unhandled).toEqual([]);
});

test('supplier reception accepts zero and partial quantities and retries only its refresh',async({page},info)=>{
  const {fixture,writes}=await installPurchases(page);let fail=false;await page.route('**/api/v1/purchase-orders?*',route=>route.request().method()==='GET'&&fail?route.fulfill({status:503,json:{error:'Réception déjà enregistrée, liste indisponible'}}):route.fallback());await page.goto('/1/kitchen/suppliers?tab=orders');await purchaseRowAction(page,'PO-72','Réceptionner');const modal=page.getByRole('dialog',{name:'Réceptionner',exact:true});await modal.getByLabel('Qté reçue — Tomates fournisseur (kg)',{exact:true}).fill('0');await modal.getByLabel('Qté reçue — Serviettes sans lien stock (unit)',{exact:true}).fill('1.5');await page.screenshot({path:info.outputPath('supplier-receive.png'),fullPage:true,animations:'disabled'});fail=true;await modal.getByRole('button',{name:'Marquer comme reçu',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Réception déjà enregistrée');fail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(modal).toHaveCount(0);expect(writes.filter(value=>value.path.endsWith('/receive'))).toEqual([{method:'POST',path:'purchase-orders/72/receive',body:{items:[{item_id:7201,received_qty:0},{item_id:7202,received_qty:1.5}]}}]);expect(fixture.unhandled).toEqual([]);
});

test('supplier WhatsApp opening does not mark sent and custom text survives cancelled regeneration',async({page},info)=>{
  const {fixture,writes}=await installPurchases(page);await page.goto('/1/kitchen/suppliers?tab=orders');await purchaseRowAction(page,'PO-71','Envoyer la commande');const modal=page.getByRole('dialog',{name:'Envoyer le bon de commande',exact:true});const preview=modal.getByRole('textbox',{name:'Aperçu du message',exact:true});await expect(preview).toBeEnabled();await preview.fill('Texte de démonstration personnalisé');await modal.getByRole('combobox',{name:'Langue du message',exact:true}).selectOption('he');await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(preview).toHaveValue('Texte de démonstration personnalisé');await modal.getByRole('button',{name:'Ouvrir WhatsApp',exact:true}).click();await expect(modal.getByText('Foody ne peut pas détecter si vous avez appuyé sur Envoyer dans WhatsApp.',{exact:true})).toBeVisible();expect(writes.filter(value=>value.path.endsWith('/status'))).toHaveLength(0);const opened=await page.evaluate(()=>(window as any).__purchaseUrls);expect(opened).toHaveLength(1);expect(decodeURIComponent(opened[0])).toContain('Texte de démonstration personnalisé');await page.screenshot({path:info.outputPath('supplier-whatsapp-confirm.png'),fullPage:true,animations:'disabled'});await modal.getByRole('button',{name:'Oui, marquer comme envoyée',exact:true}).click();await expect(modal).toHaveCount(0);expect(writes.filter(value=>value.path.endsWith('/status'))).toEqual([{method:'PUT',path:'purchase-orders/71/status',body:{status:'sent',channel:'whatsapp',language:'fr'}}]);expect(fixture.unhandled).toEqual([]);
});

test('supplier email is an explicit generated preview and does not resend after refresh failure',async({page},info)=>{
  const {fixture,writes}=await installPurchases(page);let fail=false;await page.route('**/api/v1/purchase-orders?*',route=>route.request().method()==='GET'&&fail?route.fulfill({status:503,json:{error:'Envoi terminé, actualisation indisponible'}}):route.fallback());await page.goto('/1/kitchen/suppliers?tab=orders');await purchaseRowAction(page,'PO-71','Envoyer la commande');const modal=page.getByRole('dialog',{name:'Envoyer le bon de commande',exact:true});await modal.getByRole('button',{name:'Email purchase@foody.test',exact:true}).click();await expect(modal.getByRole('textbox',{name:'Aperçu du message',exact:true})).toHaveAttribute('readonly','');await page.screenshot({path:info.outputPath('supplier-email-preview.png'),fullPage:true,animations:'disabled'});fail=true;await modal.getByRole('button',{name:'Envoyer l’email',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Envoi terminé');fail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(modal).toHaveCount(0);expect(writes.filter(value=>value.path.endsWith('/send-email'))).toHaveLength(1);expect(writes.filter(value=>value.path==='purchase-orders/71'&&value.method==='PUT')).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
});

for(const variant of [{locale:'he',theme:'dark',width:768,height:1024},{locale:'en',theme:'light',width:1024,height:900}])test(`supplier order overlays ${variant.locale}`,async({page},info)=>{
  const {fixture}=await installPurchases(page,variant);await page.setViewportSize(variant);const he=variant.locale==='he';
  await page.goto('/1/kitchen/suppliers');const trigger=page.getByRole('button',{name:he?'ביצוע הזמנה':'Place an order',exact:true});await trigger.click();const composer=page.getByRole('dialog');await expect(composer.getByRole('textbox',{name:/Tomates fournisseur/})).toBeEnabled();
  for(let i=0;i<12;i++){await page.keyboard.press('Tab');expect(await composer.evaluate(element=>element.contains(document.activeElement))).toBe(true);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:info.outputPath(`supplier-composer-${variant.locale}.png`),fullPage:true,animations:'disabled'});await page.keyboard.press('Escape');await expect(composer).toHaveCount(0);await expect(trigger).toBeFocused();
  await page.goto('/1/kitchen/suppliers?tab=orders');await purchaseRowAction(page,'PO-71',he?'שלח הזמנה':'Send order',he?'פעולות':'Actions');const send=page.getByRole('dialog');await expect(send.getByRole('textbox',{name:he?'תצוגה מקדימה של ההודעה':'Message preview',exact:true})).toBeEnabled();await page.screenshot({path:info.outputPath(`supplier-send-${variant.locale}.png`),fullPage:true,animations:'disabled'});expect(fixture.unhandled).toEqual([]);
});

test('supplier send preparation is recoverable and missing contacts never mark an order sent',async({page})=>{
  const {fixture,suppliers,writes}=await installPurchases(page);suppliers[0].phone='';suppliers[0].email='';let fail=true;await page.route('**/api/v1/purchase-orders/71/refresh-translations?*',route=>fail?route.fulfill({status:503,json:{error:'Préparation interrompue'}}):route.fallback());await page.goto('/1/kitchen/suppliers?tab=orders');await purchaseRowAction(page,'PO-71','Envoyer la commande');const modal=page.getByRole('dialog');await expect(modal.getByRole('alert')).toContainText('Préparation interrompue');await expect(modal.getByRole('button',{name:'Ouvrir WhatsApp',exact:true})).toBeDisabled();fail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await modal.getByRole('button',{name:'Ouvrir WhatsApp',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('numéro WhatsApp valide');await modal.getByRole('button',{name:'Email Email manquant',exact:true}).click();await modal.getByRole('button',{name:'Envoyer l’email',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('adresse email');expect(writes.map(value=>value.path)).toEqual(['purchase-orders/71/refresh-translations']);expect(fixture.unhandled).toEqual([]);
});

test('supplier deletion explains stock links and does not repeat after a successful delete',async({page})=>{
  const {fixture,writes,suppliers}=await installPurchases(page);let fail=false;await page.route('**/api/v1/suppliers?*',route=>route.request().method()==='GET'&&fail?route.fulfill({status:503,json:{error:'Liste indisponible après suppression'}}):route.fallback());await page.goto('/1/kitchen/suppliers?tab=suppliers');await purchaseRowAction(page,'Épicerie démo','Supprimer');const modal=page.getByRole('dialog');await expect(modal).toContainText('quantités en stock');fail=true;await modal.getByRole('button',{name:'Supprimer',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Liste indisponible');fail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(modal).toHaveCount(0);expect(suppliers.some(value=>value.id===9)).toBe(false);expect(writes.filter(value=>value.path==='suppliers/9')).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
});

test('supplier composer continues to send only after persisting the exact draft and dates',async({page})=>{
  const {fixture,writes}=await installPurchases(page);await page.goto('/1/kitchen/suppliers');await page.getByRole('button',{name:'Passer une commande',exact:true}).click();const composer=page.getByRole('dialog',{name:'Passer une commande',exact:true});await composer.getByLabel('Quantité · Tomates fournisseur',{exact:true}).fill('2.5');await composer.getByLabel('Date et début de livraison',{exact:true}).fill('');await composer.getByRole('button',{name:'Continuer vers l’envoi',exact:true}).click();await expect(composer.getByRole('alert')).toContainText('Choisissez une date');expect(writes).toEqual([]);await composer.getByLabel('Date et début de livraison',{exact:true}).fill('2026-10-05T08:00');await composer.getByLabel('Fin du créneau (facultative)',{exact:true}).fill('2026-10-05T07:00');await composer.getByRole('button',{name:'Continuer vers l’envoi',exact:true}).click();await expect(composer.getByRole('alert')).toContainText('postérieure');await composer.getByLabel('Fin du créneau (facultative)',{exact:true}).fill('2026-10-05T09:00');await composer.getByRole('button',{name:'Continuer vers l’envoi',exact:true}).click();await expect(composer).toHaveCount(0);await expect(page.getByRole('dialog',{name:'Envoyer le bon de commande',exact:true})).toBeVisible();expect(writes.find(value=>value.path==='purchase-orders')?.body).toMatchObject({expected_delivery_at:'2026-10-05T05:00:00.000Z',expected_delivery_end_at:'2026-10-05T06:00:00.000Z',items:[{supplier_product_id:81,stock_item_id:1,quantity:2.5,order_quantity:2.5,order_unit:'kg',packaging_set:false}]});expect(writes.filter(value=>value.path.endsWith('/status')||value.path.endsWith('/send-email'))).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('supplier email failure retains the draft and does not repeat a confirmed delivery update',async({page})=>{
  const {fixture,writes}=await installPurchases(page);let fail=true;await page.route('**/api/v1/purchase-orders/71/send-email?*',route=>fail?route.fulfill({status:503,json:{error:'Service e-mail indisponible'}}):route.fallback());await page.goto('/1/kitchen/suppliers?tab=orders');await purchaseRowAction(page,'PO-71','Envoyer la commande');const modal=page.getByRole('dialog');await modal.getByRole('button',{name:'Email purchase@foody.test',exact:true}).click();await modal.getByRole('button',{name:'Envoyer l’email',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Service e-mail indisponible');await expect(modal.getByLabel('Date et début de livraison',{exact:true})).toHaveValue('2026-10-05T06:00');fail=false;await modal.getByRole('button',{name:'Envoyer l’email',exact:true}).click();await expect(modal).toHaveCount(0);expect(writes.filter(value=>value.path==='purchase-orders/71'&&value.method==='PUT')).toHaveLength(1);expect(writes.filter(value=>value.path.endsWith('/send-email'))).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
});

async function installPreparations(page:Page,options:Parameters<typeof install>[1]={}) {
  const fixture=await install(page,{stockLibrary:true,...options});
  Object.assign(fixture.preps[0],{cost_per_unit:12.34,prep_time_mins:20,reorder_threshold:15,updated_at:new Date().toISOString()});
  const recipes:Record<number,any[]>={1:[{id:11,prep_item_id:1,stock_item_id:1,quantity_needed:2,recipe_quantity:2000,recipe_unit:'g',stock_item:fixture.stock[0]}]};
  const steps:Record<number,any[]>={1:[{id:21,prep_item_id:1,step_number:1,instruction:'Cuire les tomates\nRemuer doucement.',duration_mins:15,image_url:'/brand/favicon.svg'}]};
  const categories=[{id:1,name:'Bases',color:'',image_url:'',sort_order:0}];
  const writes:{method:string;path:string;body:any}[]=[];
  await page.route(/\/api\/v1\/prep\//,async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname.replace('/api/v1/prep/',''),method=req.method(),body=req.postDataJSON()??{};
    if(method!=='GET')writes.push({method,path,body});
    if(path==='items'){
      if(method==='POST'){const item={...fixture.preps[0],...body,id:4};fixture.preps.push(item);return route.fulfill({json:item});}
      return route.fulfill({json:{items:fixture.preps}});
    }
    const match=path.match(/^items\/(\d+)(?:\/(ingredients|steps|recipe-meta|preview|produce))?$/);
    if(match){
      const id=Number(match[1]),item=fixture.preps.find(value=>value.id===id)!;
      if(match[2]==='ingredients'){
        if(method==='PUT')recipes[id]=body.ingredients.map((ingredient:any,index:number)=>({...ingredient,id:110+index,recipe_quantity:ingredient.quantity_needed,recipe_unit:ingredient.unit,stock_item:fixture.stock.find(value=>value.id===ingredient.stock_item_id)}));
        return route.fulfill({json:{ingredients:recipes[id]??[]}});
      }
      if(match[2]==='steps'){if(method==='PUT')steps[id]=body.steps.map((step:any,index:number)=>({...step,id:210+index}));return route.fulfill({json:{steps:steps[id]??[]}});}
      if(match[2]==='recipe-meta'){Object.assign(item,body);return route.fulfill({json:{}});}
      if(match[2]==='preview'||match[2]==='produce'){
        const quantity=Number(body.quantity),used=quantity/6*2;
        const result={prep_item:item,produced:quantity,ingredients:[{stock_item_id:1,stock_item_name:'Tomates de saison',unit:'kg',quantity_used:used,remaining:12-used}],insufficient:used>12?[{stock_item_id:1,stock_item_name:'Tomates de saison',unit:'kg',required:used,available:12}]:[]};
        if(match[2]==='produce')item.quantity+=quantity;
        return route.fulfill({json:result});
      }
      if(method==='DELETE'){fixture.preps.splice(fixture.preps.indexOf(item),1);return route.fulfill({json:{}});}
      if(method==='PUT'){const {quantity,...rest}=body;Object.assign(item,rest);if(quantity>0)item.quantity=quantity;return route.fulfill({json:item});}
      return route.fulfill({json:{item}});
    }
    if(path==='categories'){if(method==='POST'){const category={id:2,color:'',image_url:'',sort_order:0,...body};categories.push(category);return route.fulfill({json:{category}});}return route.fulfill({json:{categories}});}
    if(path.match(/^categories\/\d+$/)){const category=categories.find(value=>value.id===Number(path.split('/')[1]))!;const oldName=category.name;Object.assign(category,body);fixture.preps.forEach(item=>{if(item.category===oldName)item.category=category.name;});return route.fulfill({json:{category}});}
    if(path==='transactions'){const item=fixture.preps.find(value=>value.id===body.prep_item_id)!;item.quantity=Math.max(0,item.quantity+body.quantity_delta);return route.fulfill({json:{transaction:{id:40,...body}}});}
    if(path==='daily-plan')return route.fulfill({json:{items:[{prep_item_id:1,prep_item_name:`Sauce tomate — jour ${url.searchParams.get('day_of_week')}`,unit:'l',current_qty:12,required_qty:24,shortfall_qty:12,batches_needed:2,yield_per_batch:6,shelf_life_hours:24,category:'Bases',priority:'high'}]}});
    return route.fallback();
  });
  return {fixture,recipes,steps,writes};
}

for(const variant of [{locale:'fr',theme:'light',width:375,height:812},{locale:'he',theme:'dark',width:1440,height:1000}])test(`preparation workspace and editor ${variant.locale}`,async({page},info)=>{
  const {fixture,writes}=await installPreparations(page,variant);await page.setViewportSize(variant);await page.goto('/1/kitchen/prep');await expect(page.getByRole('button',{name:'Sauce tomate',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:info.outputPath(`prep-list-${variant.locale}.png`),fullPage:true,animations:'disabled'});await page.getByRole('button',{name:'Sauce tomate',exact:true}).click();const editor=page.getByRole('dialog');await expect(editor.getByRole('button',{name:variant.locale==='fr'?'Mettre à jour':'עדכן',exact:true})).toBeEnabled();await page.screenshot({path:info.outputPath(`prep-details-${variant.locale}.png`),fullPage:true,animations:'disabled'});await editor.getByRole('tab',{name:variant.locale==='fr'?'Recette':'מתכון',exact:true}).click();await expect(editor.getByLabel(variant.locale==='fr'?'Étape 1':'שלב 1',{exact:true})).toHaveValue('Cuire les tomates');await page.screenshot({path:info.outputPath(`prep-recipe-${variant.locale}.png`),fullPage:true,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('preparation recipe load error cannot overwrite instructions with an empty recipe',async({page})=>{
  const {fixture,writes}=await installPreparations(page);let fail=true;await page.route('**/api/v1/prep/items/1/steps',route=>fail?route.fulfill({status:503,json:{error:'Instructions indisponibles'}}):route.fallback());await page.goto('/1/kitchen/prep?edit=1&source=cost');const editor=page.getByRole('dialog');await expect(editor.getByRole('alert')).toContainText('Instructions indisponibles');await expect(editor.getByRole('button',{name:'Mettre à jour',exact:true})).toBeDisabled();await expect(page).toHaveURL(/source=cost/);fail=false;await editor.getByRole('button',{name:'Réessayer',exact:true}).click();await editor.getByRole('tab',{name:'Recette',exact:true}).click();await expect(editor.getByLabel('Étape 1',{exact:true})).toHaveValue('Cuire les tomates');expect(writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('preparation editor preserves conversion and step images through a partial save',async({page},info)=>{
  const {fixture,writes,recipes,steps}=await installPreparations(page);let fail=true;await page.route('**/api/v1/prep/items/1/steps',route=>route.request().method()==='PUT'&&fail?route.fulfill({status:503,json:{error:'Instructions non enregistrées'}}):route.fallback());await page.goto('/1/kitchen/prep?edit=1');const editor=page.getByRole('dialog');await editor.getByRole('textbox',{name:'Nom *',exact:true}).fill('Sauce tomate révisée');await editor.getByRole('tab',{name:'Recette',exact:true}).click();await expect(editor.getByLabel('Quantité — Tomates de saison',{exact:true})).toHaveValue('2000');await editor.getByLabel('Étape 1',{exact:true}).fill('Cuire lentement');await page.keyboard.press('Escape');await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await editor.getByRole('button',{name:'Mettre à jour',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Instructions non enregistrées');await expect(editor.getByRole('status')).toContainText('La fiche est enregistrée');await expect(editor.getByLabel('Étape 1',{exact:true})).toBeDisabled();await page.screenshot({path:info.outputPath('prep-partial-save.png'),fullPage:true,animations:'disabled'});fail=false;await editor.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(editor).toHaveCount(0);expect(writes.filter(value=>value.path==='items/1')).toHaveLength(1);expect(writes.filter(value=>value.path==='items/1/ingredients')).toHaveLength(1);expect(recipes[1][0]).toMatchObject({stock_item_id:1,recipe_quantity:2000,recipe_unit:'g'});expect(steps[1][0]).toMatchObject({instruction:'Cuire lentement\nRemuer doucement.',image_url:'/brand/favicon.svg',duration_mins:15});expect(fixture.unhandled).toEqual([]);
});

test('preparation duplication resumes its new identity and retains recipe metadata',async({page})=>{
  const {fixture,writes,steps}=await installPreparations(page);let fail=true;await page.route('**/api/v1/prep/items/4/ingredients?*',route=>fail?route.fulfill({status:503,json:{error:'Copie incomplète'}}):route.fallback());await page.goto('/1/kitchen/prep?edit=1');const editor=page.getByRole('dialog');await editor.getByRole('button',{name:'Dupliquer',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Copie incomplète');expect(fixture.preps.filter(item=>item.id===4)).toHaveLength(1);fail=false;await editor.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(editor).toHaveCount(0);expect(writes.filter(value=>value.path==='items'&&value.method==='POST')).toHaveLength(1);expect(fixture.preps.find(item=>item.id===4)).toMatchObject({name:'Sauce tomate — copie',quantity:0,is_active:false,prep_time_mins:20,yield_per_batch:6});expect(steps[4][0].image_url).toBe('/brand/favicon.svg');expect(fixture.unhandled).toEqual([]);
});

test('preparation stock zero explains the existing API limitation without pretending to save it',async({page})=>{
  const {fixture,writes}=await installPreparations(page);await page.goto('/1/kitchen/prep?edit=1');const editor=page.getByRole('dialog');await editor.getByRole('textbox',{name:/^Stock actuel/}).fill('0');await editor.getByRole('button',{name:'Mettre à jour',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Utilisez l’ajustement');expect(writes).toEqual([]);expect(fixture.preps[0].quantity).toBe(12);expect(fixture.unhandled).toEqual([]);
});

test('preparation ingredient picker adds and swaps raw items without losing instructions',async({page},info)=>{
  const {fixture,writes}=await installPreparations(page);await page.goto('/1/kitchen/prep?edit=1');const editor=page.getByRole('dialog');await editor.getByRole('tab',{name:'Recette',exact:true}).click();await editor.getByRole('button',{name:'Ajouter un ingrédient',exact:true}).click();let picker=page.getByRole('dialog',{name:'Sélectionner des ingrédients',exact:true});await expect(picker.getByRole('checkbox',{name:'Tomates de saison',exact:true})).toBeDisabled();await picker.getByRole('checkbox',{name:'Tahini',exact:true}).check();await page.setViewportSize({width:375,height:812});await page.screenshot({path:info.outputPath('prep-ingredient-picker.png'),fullPage:true,animations:'disabled'});await picker.getByRole('button',{name:'Ajouter 1 sélectionné(s)',exact:true}).click();await expect(picker).toHaveCount(0);await editor.getByLabel('Quantité — Tahini',{exact:true}).fill('0.25');await editor.getByRole('button',{name:'Remplacer — Tahini',exact:true}).click();picker=page.getByRole('dialog',{name:'Sélectionner des ingrédients',exact:true});await picker.getByRole('radio',{name:fixture.stock[2].name,exact:true}).check();await picker.getByRole('button',{name:'Confirmer',exact:true}).click();await expect(editor.getByLabel(`Quantité — ${fixture.stock[2].name}`,{exact:true})).toHaveValue('');await expect(editor.getByLabel('Étape 1',{exact:true})).toHaveValue('Cuire les tomates');expect(writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('preparation production refresh retries do not consume ingredients twice',async({page},info)=>{
  const {fixture,writes}=await installPreparations(page);let fail=false;await page.route('**/api/v1/prep/items?*',route=>route.request().method()==='GET'&&fail?route.fulfill({status:503,json:{error:'Production enregistrée, liste indisponible'}}):route.fallback());await page.goto('/1/kitchen/prep');await page.getByRole('button',{name:'Actions — Sauce tomate',exact:true}).click();await page.getByRole('menuitem',{name:'Produire',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByRole('textbox',{name:'Quantité à produire (l)',exact:true}).fill('3');await modal.getByRole('button',{name:'Aperçu',exact:true}).click();await expect(modal.getByRole('region',{name:'Ingrédients à consommer :',exact:true})).toContainText('Tomates de saison');await page.screenshot({path:info.outputPath('prep-production.png'),fullPage:true,animations:'disabled'});fail=true;await modal.getByRole('button',{name:'Confirmer la production',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Production enregistrée');await expect(modal.getByRole('textbox',{name:'Quantité à produire (l)',exact:true})).toBeDisabled();fail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(modal).toHaveCount(0);expect(writes.filter(value=>value.path==='items/1/produce')).toEqual([{method:'POST',path:'items/1/produce',body:{quantity:3}}]);expect(fixture.preps[0].quantity).toBe(15);expect(fixture.unhandled).toEqual([]);
});

test('preparation production blocks shortages and invalidates the previous preview after quantity changes',async({page})=>{
  const {fixture,writes}=await installPreparations(page);await page.goto('/1/kitchen/prep');await page.getByRole('button',{name:'Actions — Sauce tomate',exact:true}).click();await page.getByRole('menuitem',{name:'Produire',exact:true}).click();const modal=page.getByRole('dialog'),quantity=modal.getByRole('textbox',{name:'Quantité à produire (l)',exact:true});await quantity.fill('60');await modal.getByRole('button',{name:'Aperçu',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Stock insuffisant');await expect(modal.getByRole('button',{name:'Confirmer la production',exact:true})).toBeDisabled();await quantity.fill('6');await expect(modal.getByRole('button',{name:'Confirmer la production',exact:true})).toHaveCount(0);await modal.getByRole('button',{name:'Aperçu',exact:true}).click();await expect(modal.getByRole('button',{name:'Confirmer la production',exact:true})).toBeEnabled();expect(writes.filter(value=>value.path.endsWith('/produce'))).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('preparation adjustment preserves the existing negative delta with confirmed-write recovery',async({page})=>{
  const {fixture,writes}=await installPreparations(page);let fail=false;await page.route('**/api/v1/prep/items?*',route=>route.request().method()==='GET'&&fail?route.fulfill({status:503,json:{error:'Mouvement enregistré, actualisation interrompue'}}):route.fallback());await page.goto('/1/kitchen/prep');await page.getByRole('button',{name:'Actions — Sauce tomate',exact:true}).click();await page.getByRole('menuitem',{name:'Perte/Ajustement',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByRole('button',{name:'Ajustement',exact:true}).click();await modal.getByRole('textbox',{name:'Quantité (l)',exact:true}).fill('2.5');await modal.getByRole('textbox',{name:'Notes',exact:true}).fill('Correction démo');fail=true;await modal.getByRole('button',{name:'Confirmer',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Mouvement enregistré');fail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(modal).toHaveCount(0);expect(writes.filter(value=>value.path==='transactions')).toEqual([{method:'POST',path:'transactions',body:{prep_item_id:1,type:'adjust',quantity_delta:-2.5,notes:'Correction démo'}}]);expect(fixture.preps[0].quantity).toBe(9.5);expect(fixture.unhandled).toEqual([]);
});

test('preparation daily plan distinguishes failed requests and ignores an older weekday response',async({page},info)=>{
  const {fixture}=await installPreparations(page);let fail=true;await page.route('**/api/v1/prep/daily-plan?*',async route=>{if(fail)return route.fulfill({status:503,json:{error:'Plan indisponible'}});if(new URL(route.request().url()).searchParams.get('day_of_week')==='1')await new Promise(resolve=>setTimeout(resolve,500));return route.fallback();});await page.goto('/1/kitchen/prep');await page.getByRole('button',{name:'Plan journalier',exact:true}).click();const modal=page.getByRole('dialog');await expect(modal.getByRole('alert')).toContainText('Plan indisponible');fail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(modal.getByRole('table')).toBeVisible();await modal.getByRole('combobox',{name:'Jour',exact:true}).selectOption('1');await modal.getByRole('combobox',{name:'Jour',exact:true}).selectOption('2');await expect(modal).toContainText('Sauce tomate — jour 2');await page.waitForTimeout(650);await expect(modal).not.toContainText('Sauce tomate — jour 1');await page.setViewportSize({width:375,height:812});await page.screenshot({path:info.outputPath('prep-daily-plan.png'),fullPage:true,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(fixture.unhandled).toEqual([]);
});

test('preparation bulk deletion retries only the remaining preparation',async({page})=>{
  const {fixture,writes}=await installPreparations(page);let fail=true;await page.route('**/api/v1/prep/items/2?*',route=>route.request().method()==='DELETE'&&fail?route.fulfill({status:409,json:{error:'Préparation encore utilisée'}}):route.fallback());await page.goto('/1/kitchen/prep');await page.getByRole('row').filter({has:page.getByRole('button',{name:'Sauce tomate',exact:true})}).getByRole('checkbox').check();await page.getByRole('row').filter({has:page.getByRole('button',{name:'Légumes découpés',exact:true})}).getByRole('checkbox').check();await page.getByRole('button',{name:'Supprimer (2)',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByRole('button',{name:'Supprimer',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Préparation encore utilisée');await expect(modal.getByRole('status')).toContainText('1');fail=false;await modal.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(modal).toHaveCount(0);expect(writes.filter(value=>value.method==='DELETE').map(value=>value.path)).toEqual(['items/1','items/2']);expect(fixture.unhandled).toEqual([]);
});

test('preparation reader can inspect recipes but has no editing controls or mutations',async({page})=>{
  const {fixture,writes}=await installPreparations(page,{permissions:['kitchen.view']});await page.goto('/1/kitchen/prep');await expect(page.getByRole('button',{name:'Nouvelle préparation',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Sauce tomate',exact:true}).click();const editor=page.getByRole('dialog');await expect(editor.getByRole('textbox',{name:'Nom *',exact:true})).toBeDisabled();await editor.getByRole('tab',{name:'Recette',exact:true}).click();await expect(editor.getByLabel('Étape 1',{exact:true})).toBeDisabled();await expect(editor.getByRole('button',{name:'Ajouter un ingrédient',exact:true})).toHaveCount(0);await expect(editor.getByRole('button',{name:'Mettre à jour',exact:true})).toHaveCount(0);expect(writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('preparation new record retries a failed final metadata step without another creation',async({page})=>{
  const {fixture,writes}=await installPreparations(page);let fail=true;await page.route('**/api/v1/prep/items/4/recipe-meta',route=>fail?route.fulfill({status:503,json:{error:'Durée non enregistrée'}}):route.fallback());await page.goto('/1/kitchen/prep');await page.getByRole('button',{name:'Nouvelle préparation',exact:true}).click();const editor=page.getByRole('dialog');await editor.getByRole('textbox',{name:'Nom *',exact:true}).fill('Base démo nouvelle');await editor.getByRole('button',{name:'Créer',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Durée non enregistrée');await expect(editor.getByRole('textbox',{name:'Nom *',exact:true})).toBeDisabled();fail=false;await editor.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(editor).toHaveCount(0);expect(writes.filter(value=>value.method==='POST'&&value.path==='items')).toHaveLength(1);expect(writes.filter(value=>value.path==='items/4/ingredients')).toHaveLength(1);expect(fixture.preps.filter(item=>item.name==='Base démo nouvelle')).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
});

test('preparation category rename retries the same newly created metadata identity',async({page})=>{
  const {fixture,writes}=await installPreparations(page);let fail=true;await page.route('**/api/v1/prep/categories/2?*',route=>fail?route.fulfill({status:503,json:{error:'Renommage interrompu'}}):route.fallback());await page.goto('/1/kitchen/prep');await page.getByRole('button',{name:'Catégorie · Tous',exact:true}).click();await page.getByRole('button',{name:'Modifier — Mise en place',exact:true}).click();const modal=page.getByRole('dialog',{name:'Modifier',exact:true});await modal.getByRole('textbox',{name:'Nom de la catégorie',exact:true}).fill('Préparations froides');await modal.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('Renommage interrompu');fail=false;await modal.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(modal).toHaveCount(0);expect(writes.filter(value=>value.path==='categories'&&value.method==='POST')).toHaveLength(1);expect(fixture.preps[1].category).toBe('Préparations froides');expect(fixture.unhandled).toEqual([]);
});

test('preparation list preserves loaded rows and valuation through a failed refresh',async({page})=>{
  const {fixture}=await installPreparations(page);let fail=true;await page.route('**/api/v1/prep/items?*',route=>fail?route.fulfill({status:503,json:{error:'Préparations indisponibles'}}):route.fallback());await page.goto('/1/kitchen/prep');await expect(page.getByRole('alert').filter({hasText:'Préparations indisponibles'})).toBeVisible();await expect(page.getByRole('button',{name:'Sauce tomate',exact:true})).toHaveCount(0);fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('button',{name:'Sauce tomate',exact:true})).toBeVisible();await expect(page.getByText('₪148.08',{exact:true})).toBeVisible();fail=true;await page.getByRole('button',{name:'Actions',exact:true}).click();await page.getByRole('menuitem',{name:'Actualiser',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Préparations indisponibles'})).toBeVisible();await expect(page.getByRole('button',{name:'Sauce tomate',exact:true})).toBeVisible();expect(fixture.unhandled).toEqual([]);
});

test('preparation production without yield exposes a clear validation state',async({page})=>{
  const {fixture,writes}=await installPreparations(page);fixture.preps[0].yield_per_batch=0;await page.goto('/1/kitchen/prep');await page.getByRole('button',{name:'Actions — Sauce tomate',exact:true}).click();await page.getByRole('menuitem',{name:'Produire',exact:true}).click();const modal=page.getByRole('dialog');await expect(modal.getByRole('alert')).toContainText('rendement par lot supérieur à zéro');await expect(modal.getByRole('button',{name:'Aperçu',exact:true})).toBeDisabled();await expect(modal).not.toContainText('Infinity');expect(writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

for (const variant of [
  {locale:'fr',theme:'light',width:375,height:900,title:'Comparer les coûts',cost:'Afficher le détail du coût alimentaire',costTitle:'Détail du coût alimentaire',ratio:'Afficher le détail du coût',ratioTitle:'Comment le % Coût est calculé'},
  {locale:'he',theme:'dark',width:1440,height:1000,title:'השוואת עלויות',cost:'הצג פירוט עלות מזון',costTitle:'פירוט עלות המזון',ratio:'הצג פירוט עלות',ratioTitle:'איך מחושב אחוז עלות המזון'},
]) {
  test(`cost comparison table and nested calculations ${variant.locale}`,async({page},info)=>{
    const fixture=await install(page,variant);await page.setViewportSize(variant);await page.goto('/1/kitchen/food-cost/compare?ids=1,2,3');
    const workspace=page.getByRole('dialog',{name:variant.title,exact:true});await expect(workspace.getByRole('table')).toBeVisible();await expect(workspace.getByRole('columnheader')).toHaveCount(4);
    await page.screenshot({path:info.outputPath(`comparison-${variant.locale}.png`),fullPage:true,animations:'disabled'});const region=workspace.getByRole('region',{name:variant.title,exact:true});await region.focus();await page.keyboard.press(variant.locale==='he'?'ArrowLeft':'ArrowRight');expect(await region.evaluate(element=>element.scrollWidth>element.clientWidth)).toBe(variant.locale==='fr');
    const cost=workspace.getByRole('button',{name:`${variant.cost} — ${fixture.items[0].name}`,exact:true});await cost.click();let modal=page.getByRole('dialog',{name:variant.costTitle,exact:true});await expect(modal).toContainText('₪6.52');await expect(modal).toContainText('₪16.0000/kg');
    for(let i=0;i<8;i++){await page.keyboard.press('Tab');expect(await modal.evaluate(element=>element.contains(document.activeElement))).toBe(true);}
    await page.screenshot({path:info.outputPath(`comparison-cost-${variant.locale}.png`),fullPage:true,animations:'disabled'});await page.keyboard.press('Escape');await expect(cost).toBeFocused();
    const ratio=workspace.getByRole('button',{name:`${variant.ratio} — ${fixture.items[0].name}`,exact:true});await ratio.click();modal=page.getByRole('dialog',{name:variant.ratioTitle,exact:true});await expect(modal).toContainText('₪40.68');await expect(modal).toContainText('16.0%');await page.keyboard.press('Escape');await expect(ratio).toBeFocused();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
  });
}

test('cost comparison retains per-stock VAT and the first active variant override',async({page})=>{
  const fixture=await install(page);Object.assign(fixture.items[0],{option_sets:[fixture.optionSets[0]]});
  await page.route('**/api/v1/menu/items/1/option-prices?*',route=>route.fulfill({json:{item_options:[{option_set_id:1,option_id:1,price:59}]}}));
  await page.goto('/1/kitchen/food-cost/compare?ids=1,2');const workspace=page.getByRole('dialog');let table=workspace.getByRole('table');await expect(table.getByRole('row').filter({has:page.getByRole('rowheader',{name:'Prix',exact:true})})).toContainText('₪50.00');await expect(table.getByRole('columnheader').filter({hasText:fixture.items[0].name})).toContainText('Individuelle');
  await workspace.getByRole('button',{name:'Afficher TTC',exact:true}).click();await expect(table.getByRole('row').filter({has:page.getByRole('rowheader',{name:'Prix',exact:true})})).toContainText('₪59.00');await workspace.getByRole('button',{name:`Afficher le détail du coût alimentaire — ${fixture.items[0].name}`,exact:true}).click();const modal=page.getByRole('dialog',{name:'Détail du coût alimentaire',exact:true});await expect(modal).toContainText('₪6.97');await expect(modal.getByRole('row').filter({hasText:'Tomates de saison'})).toContainText('₪4.00');await expect(modal.getByRole('row').filter({hasText:'Tahini'})).toContainText('₪2.97');await page.keyboard.press('Escape');await workspace.getByRole('button',{name:`Afficher le détail du coût — ${fixture.items[0].name}`,exact:true}).click();await expect(page.getByRole('dialog').last()).toContainText('₪59.00');await expect(page.getByRole('dialog').last()).toContainText('11.8%');expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('cost comparison loading failure is retryable and never produces zero metrics',async({page})=>{
  const fixture=await install(page);let fail=true;await page.route('**/api/v1/stock/menu-items/2/ingredients?*',route=>fail?route.fulfill({status:503,json:{error:'Recette indisponible'}}):route.fallback());await page.goto('/1/kitchen/food-cost/compare?ids=1,2');const workspace=page.getByRole('dialog');await expect(workspace.getByRole('alert')).toBeVisible();await expect(workspace.getByRole('table')).toHaveCount(0);fail=false;await workspace.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(workspace.getByRole('table')).toBeVisible();expect(fixture.unhandled).toEqual([]);
});

test('cost comparison normalizes selection and preserves context on close',async({page})=>{
  const fixture=await install(page);await page.goto('/1/kitchen/food-cost/compare?ids=1,1,2,0,-1,NaN,1.5&q=tahini');const workspace=page.getByRole('dialog');await expect(workspace.getByRole('columnheader')).toHaveCount(3);await page.keyboard.press('Escape');await expect(page).toHaveURL('/1/kitchen/food-cost?q=tahini');
  await page.goto('/1/kitchen/food-cost/compare?ids=1,2,3,4,5,6,7');await expect(page).toHaveURL('/1/kitchen/food-cost');expect(fixture.unhandled).toEqual([]);
});

test('cost comparison explains missing catalog items before requesting their recipes',async({page})=>{
  const fixture=await install(page);await page.goto('/1/kitchen/food-cost/compare?ids=1,999');const workspace=page.getByRole('dialog');await expect(workspace.getByRole('alert')).toContainText('Certains articles sélectionnés');await expect(workspace.getByRole('table')).toHaveCount(0);await workspace.getByRole('button',{name:'Retour',exact:true}).click();await expect(page).toHaveURL('/1/kitchen/food-cost');expect(fixture.unhandled).toEqual([]);
});

test('cost comparison keeps absent recipes and invalid preparations out of ranking',async({page})=>{
  const fixture=await install(page);fixture.recipeByItem[3]=[];fixture.recipeByItem[2]=[{id:31,menu_item_id:2,created_at:'2026-01-01T00:00:00Z',quantity_needed:1,unit:'l',prep_item_id:1,prep_item:{...fixture.preps[0],unit:'l',yield_per_batch:0,cost_per_unit:0}}];await page.goto('/1/kitchen/food-cost/compare?ids=1,2,3');const workspace=page.getByRole('dialog');const costRow=workspace.getByRole('row').filter({has:page.getByRole('rowheader',{name:'Coût alimentaire',exact:true})});await expect(costRow).toContainText('₪6.52');await expect(costRow).not.toContainText('Le plus bas');await expect(costRow.getByRole('cell').last()).toHaveText('—');await expect(workspace.getByRole('link',{name:'Corriger — Sauce tomate',exact:true})).toHaveAttribute('href','/1/kitchen/prep?edit=1');expect(fixture.unhandled).toEqual([]);
});

test('cost comparison read-only role retains calculations but no edit links',async({page})=>{
  const fixture=await install(page,{permissions:['kitchen.view']});await page.goto('/1/kitchen/food-cost/compare?ids=1,2');const workspace=page.getByRole('dialog');await expect(workspace.getByRole('table')).toBeVisible();await expect(workspace.getByRole('link')).toHaveCount(0);await workspace.getByRole('button',{name:`Afficher le détail du coût alimentaire — ${fixture.items[0].name}`,exact:true}).click();await expect(page.getByRole('dialog').last()).toContainText('₪6.52');expect(fixture.writes).toEqual([]);expect(fixture.unhandled).toEqual([]);
});

test('cost comparison ignores a recipe response after changing selected items',async({page})=>{
  const fixture=await install(page);let started=false,release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});await page.route('**/api/v1/stock/menu-items/1/ingredients?*',async route=>{started=true;await gate;return route.fallback();});await page.goto('/1/kitchen/food-cost/compare?ids=1,2');await expect.poll(()=>started).toBe(true);await page.evaluate(()=>window.history.pushState(null,'','/1/kitchen/food-cost/compare?ids=2,3'));const workspace=page.getByRole('dialog');await expect(workspace.getByRole('table')).toBeVisible();release();await page.waitForTimeout(150);await expect(workspace.getByRole('columnheader')).toHaveCount(3);await expect(workspace.getByRole('columnheader').filter({hasText:fixture.items[0].name})).toHaveCount(0);await expect(workspace.getByRole('columnheader').filter({hasText:fixture.items[2].name})).toBeVisible();expect(fixture.unhandled).toEqual([]);
});

test('preparation mobile help remembers an explicit expanded preference',async({page},info)=>{
  await installPreparations(page);await page.setViewportSize({width:375,height:900});await page.goto('/1/kitchen/prep');await expect(page.getByRole('note')).toHaveCount(0);await page.getByRole('button',{name:'Préparations',exact:true}).click();await expect(page.getByRole('note')).toBeVisible();await page.reload();await expect(page.getByRole('note')).toBeVisible();await page.getByRole('button',{name:'Masquer',exact:true}).click();await expect(page.getByRole('note')).toHaveCount(0);await page.screenshot({path:info.outputPath('prep-mobile-dense.png'),fullPage:true,animations:'disabled'});
});

async function installKitchenData(page:Page,options:Parameters<typeof install>[1]={}) {
  const fixture=await install(page,options);
  const operations:import('../../src/lib/api').KitchenDataDetail[]=[];
  const writes:Array<{path:string;body:any}>=[];
  const rows:import('../../src/lib/api').KitchenDataRow[]=[{date:'2026-09-24',kind:'sale',name:'Vente importée · מכירה',source:'csv',item_id:0,quantity:12,unit:'unit',line_total:240},{date:'2026-09-25',kind:'sale',name:'Vente importée · מכירה',source:'csv',item_id:0,quantity:3,unit:'unit',line_total:60}];
  await page.route('**/api/v1/stock/data-workspace**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname.replace('/api/v1/stock/data-workspace','');const body=request.headers()['content-type']?.includes('application/json')?(request.postDataJSON()??{}):{};
    if(request.method()!=='GET')writes.push({path,body});
    if(path==='')return route.fulfill({json:{items:fixture.items,stocks:[{kind:'stock',item_id:1,name:'Tomates de saison',unit:'kg',before:12,after:12}],preps:[{kind:'prep',item_id:1,name:'Sauce tomate',unit:'l',before:8,after:8}],operations}});
    if(path==='/parse')return route.fulfill({json:{rows,skipped_files:0}});
    if(path==='/preview'){
      const plan=body as import('../../src/lib/api').KitchenDataPlan;
      const op:import('../../src/lib/api').KitchenDataDetail={id:`data-${operations.length+1}`,kind:plan.kind,name:plan.name,status:'draft',created_at:'2026-10-01T10:00:00Z',plan,review:{days:[{date:'2026-09-24',status:plan.kind==='simulation'?'simulation':plan.kind==='history'?(plan.replace_dates.includes('2026-09-24')?'replace':'skip'):'remove',rows:2,sales:12,unlinked:0,receipts:1,production:1,waste:0,stockouts:0,forecast:10,samples:3}],quantities:plan.kind==='history'?[]:[{kind:'stock',item_id:1,name:'Tomates de saison',unit:'kg',before:12,after:plan.overrides.find(row=>row.kind==='stock'&&row.item_id===1)?.quantity??plan.unit_defaults.kg??plan.default_stock??12}],reports:1,sales:1,movements:1,preserved_movements:2,unlinked:0,warnings:[],simulation_rows:plan.kind==='simulation'?[{...rows[0],name:'Tomates de saison',kind:'stock_receive',unit:'kg',quantity:5}]:undefined}};
      operations.push(op);return route.fulfill({json:op});
    }
    const parts=path.split('/'),op=operations.find(value=>value.id===parts[2]);if(!op)return route.fulfill({status:404,json:{error:'not_found'}});
    if(parts[3]==='backup')return route.fulfill({json:{demo:true,operation_id:op.id}});
    if(request.method()==='POST')op.status=parts[3]==='apply'?'applied':parts[3]==='restore'?'restored':'archived';return route.fulfill({json:op});
  });
  return {fixture,writes,operations};
}
for(const variant of [
  {locale:'fr',theme:'light',width:375,height:950,title:'Données du compagnon',mode:'Stock de départ',name:'Nom de l’opération',stock:'Valeur par défaut des ingrédients',preview:'Vérifier les effets',confirm:'J’ai vérifié les journées et quantités ci-dessous.',apply:'Appliquer cette opération'},
  {locale:'he',theme:'dark',width:1440,height:1000,title:'נתוני מלווה המטבח',mode:'מלאי פתיחה',name:'שם הפעולה',stock:'כמות ברירת מחדל לחומרי גלם',preview:'בדיקת השפעות',confirm:'בדקתי את הימים והכמויות המוצגים.',apply:'החלת הפעולה'},
])test(`kitchen data opening review and confirmation ${variant.locale}`,async({page},info)=>{
  const {fixture,writes}=await installKitchenData(page,variant);await page.setViewportSize(variant);await page.goto('/1/kitchen/data');await expect(page.getByRole('heading',{name:variant.title,exact:true})).toBeVisible();await page.getByRole('button',{name:variant.mode,exact:true}).click();await page.getByLabel(variant.name,{exact:true}).fill('Ouverture · פתיחה');await page.getByLabel(variant.stock,{exact:true}).fill('0');await page.screenshot({path:info.outputPath(`data-opening-${variant.locale}.png`),fullPage:true,animations:'disabled'});await page.getByRole('button',{name:variant.preview,exact:true}).click();await expect(page.getByRole('button',{name:variant.apply,exact:true})).toBeDisabled();await expect(page.getByRole('region').filter({has:page.getByRole('table')})).toContainText('Tomates de saison');await page.screenshot({path:info.outputPath(`data-review-${variant.locale}.png`),fullPage:true,animations:'disabled'});await page.getByRole('checkbox',{name:variant.confirm,exact:true}).check();await page.getByRole('button',{name:variant.apply,exact:true}).click();await expect.poll(()=>writes.filter(value=>value.path.endsWith('/apply')).length).toBe(1);expect(writes[0].body.default_stock).toBe(0);expect(writes[1].body).toEqual({confirm:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(fixture.unhandled).toEqual([]);
});

test('kitchen data apply and restore retry only their journal after a confirmed response',async({page})=>{
  const {fixture,writes}=await installKitchenData(page);let fail=false;await page.route('**/api/v1/stock/data-workspace',route=>route.request().method()==='GET'&&fail?route.fulfill({status:503,json:{error:'journal_failed'}}):route.fallback());await page.goto('/1/kitchen/data');await page.getByRole('button',{name:'Stock de départ',exact:true}).click();await page.getByLabel('Valeur par défaut des ingrédients',{exact:true}).fill('10');await page.getByRole('button',{name:'Vérifier les effets',exact:true}).click();await page.getByRole('checkbox',{name:'J’ai vérifié les journées et quantités ci-dessous.',exact:true}).check();fail=true;await page.getByRole('button',{name:'Appliquer cette opération',exact:true}).click();await expect(page.locator('main [role=alert]')).toContainText('opération est enregistrée');await expect(page.getByRole('button',{name:'Appliquer cette opération',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Télécharger la sauvegarde',exact:true})).toBeDisabled();fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.locator('main [role=alert]')).toHaveCount(0);await page.getByRole('checkbox',{name:/Restaurer l’état précédant/}).check();fail=true;await page.getByRole('button',{name:'Restaurer la sauvegarde',exact:true}).click();await expect(page.locator('main [role=alert]')).toContainText('opération est enregistrée');fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.locator('main [role=alert]')).toHaveCount(0);expect(writes.filter(value=>value.path.endsWith('/apply'))).toHaveLength(1);expect(writes.filter(value=>value.path.endsWith('/restore'))).toHaveLength(1);expect(fixture.unhandled).toEqual([]);
});

test('kitchen data mode and journal navigation protect unreviewed parameters',async({page})=>{
  await installKitchenData(page);await page.goto('/1/kitchen/data');await page.getByRole('textbox',{name:'Nom de l’opération',exact:true}).fill('Import encore en brouillon');await page.getByRole('button',{name:'Simuler une cuisine',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('textbox',{name:'Nom de l’opération',exact:true})).toHaveValue('Import encore en brouillon');await page.getByRole('button',{name:'Simuler une cuisine',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Abandonner les modifications',exact:true}).click();await expect(page.getByRole('textbox',{name:'Nom de l’opération',exact:true})).toHaveValue('Simuler une cuisine');await page.getByRole('button',{name:'Vérifier les effets',exact:true}).click();await page.getByRole('button',{name:'Stock de départ',exact:true}).click();await page.getByRole('spinbutton',{name:'Valeur par défaut des ingrédients',exact:true}).fill('4');await page.getByRole('complementary',{name:'Historique des opérations',exact:true}).getByRole('button',{name:/Simuler une cuisine/}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('spinbutton',{name:'Valeur par défaut des ingrédients',exact:true})).toHaveValue('4');
});

test('kitchen data archive keeps the returned status through a failed journal reload',async({page})=>{
  const {writes}=await installKitchenData(page);let fail=false;await page.route('**/api/v1/stock/data-workspace',route=>fail?route.fulfill({status:503,json:{error:'journal_failed'}}):route.fallback());await page.goto('/1/kitchen/data');await page.getByRole('button',{name:'Simuler une cuisine',exact:true}).click();await page.getByRole('button',{name:'Vérifier les effets',exact:true}).click();fail=true;await page.getByRole('button',{name:'Archiver',exact:true}).click();await expect(page.locator('main [role=alert]')).toContainText('opération est enregistrée');await expect(page.getByRole('button',{name:'Archiver',exact:true})).toHaveCount(0);fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('complementary',{name:'Historique des opérations',exact:true})).toContainText('Aucune opération pour le moment.');expect(writes.filter(value=>value.path.endsWith('/archive'))).toHaveLength(1);
});

test('kitchen data import preserves grouped mapping, dates and preview replacements',async({page})=>{
  const {writes,fixture}=await installKitchenData(page);await page.goto('/1/kitchen/data');await page.getByLabel('Choisir plusieurs fichiers',{exact:true}).setInputFiles({name:'demo.csv',mimeType:'text/csv',buffer:Buffer.from('date,kind,name,item_id,quantity,unit,line_total\n2026-09-24,sale,Vente,,12,unit,240')});await page.getByRole('combobox',{name:'Vente importée · מכירה 2026-09-24',exact:true}).selectOption('1');await expect(page.getByRole('combobox',{name:'Vente importée · מכירה 2026-09-25',exact:true})).toHaveValue('1');await expect(page.getByLabel('Du',{exact:true})).toHaveValue('2026-09-24');await expect(page.getByLabel('Au',{exact:true})).toHaveValue('2026-09-25');await page.getByRole('button',{name:'Vérifier les effets',exact:true}).click();await page.getByRole('checkbox',{name:'2026-09-24 · Remplacer cet import historique',exact:true}).click();await expect.poll(()=>writes.filter(value=>value.path==='/preview').length).toBe(2);const previews=writes.filter(value=>value.path==='/preview');expect(previews[0].body.rows.every((row:any)=>row.item_id===1)).toBe(true);expect(previews[1].body.replace_dates).toEqual(['2026-09-24']);await expect(page.getByRole('checkbox',{name:'J’ai vérifié les journées et quantités ci-dessous.',exact:true})).not.toBeChecked();expect(fixture.unhandled).toEqual([]);
});

test('kitchen data refuses invalid files before sending and retries an initial load',async({page})=>{
  const {writes}=await installKitchenData(page);let fail=true;await page.route('**/api/v1/stock/data-workspace',route=>fail?route.fulfill({status:503,json:{error:'unavailable'}}):route.fallback());await page.goto('/1/kitchen/data');await expect(page.locator('main [role=alert]')).toBeVisible();await expect(page.getByRole('status')).toHaveCount(0);fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await page.getByLabel('Choisir plusieurs fichiers',{exact:true}).setInputFiles({name:'demo.exe',mimeType:'application/octet-stream',buffer:Buffer.from('demo')});await expect(page.locator('main [role=alert]')).toContainText('PDF, CSV ou Excel');await page.getByLabel('Choisir plusieurs fichiers',{exact:true}).setInputFiles({name:'big.csv',mimeType:'text/csv',buffer:Buffer.alloc(10*1024*1024+1)});await expect(page.locator('main [role=alert]')).toContainText('10 Mo par fichier');expect(writes).toEqual([]);
});

test('kitchen data stock overrides retain zero, unit defaults and validation',async({page})=>{
  const {writes}=await installKitchenData(page);await page.goto('/1/kitchen/data');await page.getByRole('button',{name:'Stock de départ',exact:true}).click();await page.getByLabel('Valeur par défaut des ingrédients',{exact:true}).fill('-1');await page.getByRole('button',{name:'Vérifier les effets',exact:true}).click();expect(writes).toEqual([]);await page.getByLabel('Valeur par défaut des ingrédients',{exact:true}).fill('10');await page.getByText('Valeurs par unité de stock',{exact:true}).click();await page.getByRole('spinbutton',{name:'kg',exact:true}).fill('5');await page.getByText('Exceptions par produit',{exact:false}).click();await page.getByRole('spinbutton',{name:'Tomates de saison Après',exact:true}).fill('0');await page.getByRole('button',{name:'Vérifier les effets',exact:true}).click();await expect.poll(()=>writes.length).toBe(1);expect(writes[0].body).toMatchObject({default_stock:10,default_prep:null,unit_defaults:{kg:5},overrides:[{kind:'stock',item_id:1,quantity:0}]});
});

test('kitchen data permission is distinct from kitchen management',async({page})=>{
  const {writes}=await installKitchenData(page,{permissions:['kitchen.view','kitchen.manage']});await page.goto('/1/kitchen/data');await expect(page.getByRole('heading',{name:"Vous n'avez pas accès à cette section",exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Vérifier les effets',exact:true})).toHaveCount(0);expect(writes).toEqual([]);
});

test('kitchen data failed replacement review preserves selection and blocks applying the old preview',async({page})=>{
  const {writes}=await installKitchenData(page);let fail=false;await page.route('**/api/v1/stock/data-workspace/preview',route=>fail?route.fulfill({status:503,json:{error:'unavailable'}}):route.fallback());await page.goto('/1/kitchen/data');await page.getByLabel('Choisir plusieurs fichiers',{exact:true}).setInputFiles({name:'demo.csv',mimeType:'text/csv',buffer:Buffer.from('demo')});await page.getByRole('button',{name:'Vérifier les effets',exact:true}).click();await page.getByRole('checkbox',{name:'J’ai vérifié les journées et quantités ci-dessous.',exact:true}).check();fail=true;const replacement=page.getByRole('checkbox',{name:'2026-09-24 · Remplacer cet import historique',exact:true});await replacement.click();await expect(page.locator('main [role=alert]')).toBeVisible();await expect(replacement).toBeChecked();await page.getByRole('checkbox',{name:'J’ai vérifié les journées et quantités ci-dessous.',exact:true}).check();await expect(page.getByRole('button',{name:'Appliquer cette opération',exact:true})).toBeDisabled();fail=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.locator('main [role=alert]')).toHaveCount(0);await expect(page.getByRole('checkbox',{name:'J’ai vérifié les journées et quantités ci-dessous.',exact:true})).not.toBeChecked();expect(writes.filter(value=>value.path==='/preview')).toHaveLength(2);expect(writes.filter(value=>value.path.endsWith('/apply'))).toHaveLength(0);
});

test('kitchen data simulation preserves its scenario and exposes daily forecast details',async({page},info)=>{
  const {writes}=await installKitchenData(page);await page.setViewportSize({width:375,height:950});await page.goto('/1/kitchen/data');await page.getByRole('button',{name:'Simuler une cuisine',exact:true}).click();await page.getByLabel('Numéro du scénario',{exact:true}).fill('17');await page.getByRole('combobox',{name:'Activité',exact:true}).selectOption('busy');await page.getByRole('checkbox',{name:'dim.',exact:true}).check();await page.getByLabel('Du',{exact:true}).fill('2026-09-20');await page.getByLabel('Au',{exact:true}).fill('2026-09-24');await page.getByRole('button',{name:'Vérifier les effets',exact:true}).click();await expect(page.getByText('Simulation · données isolées de votre cuisine réelle',{exact:true})).toBeVisible();const daily=page.getByRole('region',{name:'Détail de la journée',exact:true}).first();await expect(daily.getByRole('columnheader',{name:'Prévision du jour',exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Détail de la journée',exact:true}).selectOption('2026-09-24');await expect(page.getByRole('region',{name:'Détail de la journée',exact:true}).last()).toContainText('Tomates de saison');await page.screenshot({path:info.outputPath('data-simulation-mobile.png'),fullPage:true,animations:'disabled'});expect(writes[0].body).toMatchObject({kind:'simulation',volume:'busy',seed:17,closed_weekdays:[0],from:'2026-09-20',to:'2026-09-24'});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});

for(const [section,target] of [['analytics','analytics/overview'],['kitchen','kitchen/daily-operations'],['menu','menu/items'],['orders','orders/all']]){
  test(`section redirect preserves restaurant and query ${section}`,async({page})=>{
    const fixture=await install(page);await page.goto(`/2/${section}?q=demo&source=direct&tag=a&tag=b`);await expect(page).toHaveURL(`/2/${target}?q=demo&source=direct&tag=a&tag=b`);await expect(page.getByRole('heading').first()).toBeVisible();expect(fixture.writes.filter(path=>!(section==='kitchen'&&path==='/api/v1/stock/daily-reports/1/compute'))).toEqual([]);expect(fixture.unhandled).toEqual([]);
  });
}
test('root redirect opens the branded guest login',async({page})=>{
  const fixture=await install(page,{authenticated:false});await page.goto('/');await expect(page).toHaveURL('/login');await expect(page.getByRole('button',{name:'Se connecter',exact:true})).toBeVisible();expect(fixture.writes).toEqual([]);
});
