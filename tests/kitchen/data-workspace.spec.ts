import { test, expect, type Page } from '@playwright/test';
import type { KitchenDataDetail, KitchenDataPlan } from '../../src/lib/api';

async function workspace(page: Page, allowed = true, stale = false) {
  const operations: KitchenDataDetail[] = [];
  const writes: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('foody_restaurant_token', 'mock-kitchen-session');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({id:1,full_name:'Test manager',role:'manager'}));
    localStorage.setItem('foody_restaurant_ids','[1]');
    localStorage.setItem('foody_remember','1');
    localStorage.setItem('foody-admin-locale','fr');
  });
  await page.route('**/api/v1/**', async route => {
    const req=route.request(); const path=new URL(req.url()).pathname;
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'};
    if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
    let data:unknown={};
    if(path.endsWith('/users/me')) data={permissions:allowed?['kitchen.view','kitchen.manage','kitchen.data_manage']:['kitchen.view'],role_name:'Manager'};
    else if(path==='/api/v1/restaurants/1') data={restaurant:{id:1,name:'Cuisine test',currency:'ILS'}};
    else if(path.endsWith('/data-workspace')) data={items:[{id:42,name:'Burger',has_recipe:true}],stocks:[{item_id:11,kind:'stock',name:'Cabillaud',unit:'kg',before:12,after:12}],preps:[],operations};
    else if(path.endsWith('/preview')){
      writes.push('preview'); const plan=req.postDataJSON() as KitchenDataPlan;
      const op:KitchenDataDetail={id:`operation-${operations.length}`,kind:plan.kind,name:plan.name,status:'draft',created_at:new Date().toISOString(),plan,review:{days:[{date:'2026-09-24',status:plan.kind==='simulation'?'simulation':'remove',rows:1,sales:12,unlinked:0,receipts:1,production:1,waste:0,stockouts:0,forecast:10,samples:3}],quantities:[{kind:'stock',item_id:11,name:'Cabillaud',unit:'kg',before:12,after:plan.default_stock??10}],reports:1,sales:1,movements:1,preserved_movements:2,unlinked:0,warnings:[]}};
      operations.push(op); data=op;
    } else if(path.endsWith('/apply')){
      writes.push('apply');if(stale){await route.fulfill({status:409,headers,json:{error:'stale_preview'}});return;}
      operations.at(-1)!.status='applied';data=operations.at(-1);
    } else if(path.endsWith('/restore')) {writes.push('restore');await route.fulfill({status:409,headers,json:{error:'restore_conflict'}});return;}
    await route.fulfill({json:data,headers});
  });
  await page.goto('/1/kitchen/data');
  return writes;
}

test('reset is reviewed and explicitly confirmed; recovery conflict remains visible', async ({page})=>{
  const writes=await workspace(page);
  await page.getByRole('button',{name:'04 Réinitialiser'}).click();
  await page.getByLabel('Valeur par défaut des ingrédients',{exact:true}).fill('10');
  await page.getByRole('button',{name:'Vérifier les effets'}).click();
  await expect(page.getByRole('cell',{name:'Cabillaud'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Appliquer cette opération'})).toBeDisabled();
  expect(writes).toEqual(['preview']);
  await page.getByLabel('J’ai vérifié les journées et quantités ci-dessous.').check();
  await page.getByRole('button',{name:'Appliquer cette opération'}).click();
  await expect(page.getByRole('button',{name:'Télécharger la sauvegarde'})).toBeVisible();
  expect(writes).toEqual(['preview','apply']);
  await page.getByLabel('Restaurer l’état précédant cette opération.',{exact:false}).check();
  await page.getByRole('button',{name:'Restaurer la sauvegarde'}).click();
  await expect(page.locator('main [role=alert]')).toContainText('Restauration refusée');
  await page.screenshot({path:'/private/tmp/kitchen-data-admin-review.png',fullPage:true});
});
test('simulation label persists and stale previews cannot claim success', async ({page})=>{
  await workspace(page,true,true);
  await page.getByRole('button',{name:'02 Simuler une cuisine'}).click();
  await expect(page.getByText('Simulation · données isolées de votre cuisine réelle')).toBeVisible();
  await page.getByRole('button',{name:'Vérifier les effets'}).click();
  await expect(page.getByRole('columnheader',{name:'Prévision du jour'})).toBeVisible();
  await page.getByLabel('J’ai vérifié les journées et quantités ci-dessous.').check();
  await page.getByRole('button',{name:'Appliquer cette opération'}).click();
  await expect(page.locator('main [role=alert]')).toContainText('La cuisine a changé');
});
test('kitchen permission alone does not grant data administration', async ({page})=>{
  const writes=await workspace(page,false);
  await expect(page.getByRole('button',{name:'Vérifier les effets'})).toHaveCount(0);
  expect(writes).toEqual([]);
});
