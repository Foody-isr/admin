import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, { dark = false, locale = 'fr', legacyApi = false } = {}) {
  const fixture = createFixture();
  const tables = Array.from({length:9}, (_,i) => ({id:i+1, name:`Table ${i+1}`, code:`t-${i+1}`, section_id:1, restaurant_id:1}));
  const plan = { id:16, restaurant_id:1, name:'Salle 2', layout_geometry_version:legacyApi ? undefined : 2,
    placements:tables.slice(0,8).map((table,i) => ({id:i+1,floor_plan_id:16,table_id:table.id,table,x:1+i%4*7.2,y:1+Math.floor(i/4)*13,width:6.25,height:10.875,shape:'square',rotation:0,geometry_version:2})), decorations:[] };
  const writes: any[] = [];
  await page.addInitScript(({dark,locale}) => {
    localStorage.setItem('foody_restaurant_token','isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user',JSON.stringify({id:1,full_name:'Équipe démo',role:'owner',email:'demo@foody.test'}));
    localStorage.setItem('foody_restaurant_ids','[1]');
    localStorage.setItem('foody-admin-locale',locale);
    localStorage.setItem('foody_admin_theme',dark?'dark':'light');
  }, {dark,locale});
  await page.route('**/api/v1/**', async route => {
    const req=route.request(), path=new URL(req.url()).pathname;
    if (path.endsWith('/floor-plans/16/layout')) {
      writes.push({body:req.postDataJSON(), restaurant:req.headers()['x-restaurant-id']});
      const body = req.postDataJSON();
      Object.assign(plan, {...body, placements:body.placements.map((p:any) => ({...p,table:tables.find(t => t.id === p.table_id)}))});
      return route.fulfill({json:{floor_plan:plan}});
    }
    if (path.endsWith('/floor-plans/16')) return route.fulfill({json:{floor_plan:plan}});
    if (path.endsWith('/sections')) return route.fulfill({json:{sections:[{id:1,restaurant_id:1,name:'Salle à manger',tables}]}});
    const response=fixture.response(req.url(),req.method(),req.postDataJSON()??{},1);
    return route.fulfill({status:response.status??200,json:response.json??{}});
  });
  await page.route('**/*', route => ['localhost','127.0.0.1','square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.goto('/1/restaurant/floor-plans/16');
  await expect(page.getByTestId('floor-table-1')).toBeVisible({timeout:30_000});
  return {writes, plan};
}

for (const dark of [false,true]) test(`floor editor size, rotation, drag, undo and save, dark=${dark}`, async ({page}, info) => {
  const {writes}=await install(page,{dark});
  await page.getByTestId('floor-table-1').click();
  await expect(page.getByLabel('Largeur',{exact:true})).toHaveValue('8');
  await expect(page.getByLabel('Hauteur',{exact:true})).toHaveValue('8');
  const before=await page.getByTestId('floor-table-1').boundingBox();
  await page.getByLabel('Largeur',{exact:true}).fill('12');
  await page.getByLabel('Largeur',{exact:true}).blur();
  const resized=await page.getByTestId('floor-table-1').boundingBox();
  expect(resized!.width).toBeCloseTo(before!.width*1.5,0);
  await page.getByRole('button',{name:'Annuler',exact:true}).click();
  await expect(page.getByTestId('floor-table-1')).toHaveCSS('width',`${before!.width}px`);
  await page.getByRole('button',{name:'Rétablir',exact:true}).click();
  await page.getByTestId('floor-table-1').click();
  await page.getByRole('button',{name:'Rotation',exact:true}).focus();
  for(let i=0;i<3;i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('floor-table-1')).not.toHaveCSS('transform','none');
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect.poll(()=>writes.length).toBe(1);
  expect(writes[0].restaurant).toBe('1');
  expect(writes[0].body.placements[0]).toMatchObject({geometry_version:2,width:9.375,height:10.875,rotation:45});
  await expect(page).toHaveURL(/\/1\/restaurant\/floor-plans$/);
  await page.goto('/1/restaurant/floor-plans/16');
  await page.getByTestId('floor-table-1').click();
  await page.screenshot({path:info.outputPath(`floor-editor-${dark?'dark':'light'}.png`)});
});

test('palette and pointer gestures create one undo step and never delete the table entity', async ({page}) => {
  const {writes}=await install(page);
  await expect(page.getByTestId('palette-table-1')).toBeDisabled();
  await page.getByTestId('palette-table-9').click();
  await expect(page.getByTestId('floor-table-9')).toBeVisible();
  await expect(page.getByTestId('palette-table-9')).toBeDisabled();
  const box=await page.getByTestId('floor-table-9').boundingBox();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
  await page.mouse.down(); await page.mouse.move(box!.x+box!.width/2+90,box!.y+box!.height/2+90,{steps:8}); await page.mouse.up();
  await page.getByRole('button',{name:'Annuler',exact:true}).click();
  await expect(page.getByTestId('floor-table-9')).toBeVisible();
  const reverted=await page.getByTestId('floor-table-9').boundingBox();
  expect(reverted!.x).toBeCloseTo(box!.x,0); expect(reverted!.y).toBeCloseTo(box!.y,0);
  await page.getByTestId('floor-table-9').click();
  await page.getByRole('button',{name:'Retirer du plan de salle'}).click();
  await expect(page.getByTestId('floor-table-9')).toHaveCount(0);
  await expect(page.getByTestId('palette-table-9')).toBeEnabled();
  expect(writes).toHaveLength(0);
});

test('old APIs are rejected before any layout write', async ({page}) => {
  const {writes}=await install(page,{legacyApi:true});
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page.getByTestId('floor-editor').getByRole('alert')).toContainText('L’API doit être mise à jour');
  expect(writes).toHaveLength(0);
});

for (const width of [390,768]) test(`responsive dark editor at ${width}px`, async ({page},info) => {
  await page.setViewportSize({width,height:900}); await install(page,{dark:true});
  await page.getByTestId('palette-table-9').scrollIntoViewIfNeeded();
  await page.getByTestId('palette-table-9').click();
  await expect(page.getByRole('button',{name:'Enregistrer',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`floor-editor-${width}.png`)});
});
