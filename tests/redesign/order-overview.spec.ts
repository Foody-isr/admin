import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

test.use({ timezoneId: 'Pacific/Honolulu' });
const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
async function install(page: Page, options: { locale?: string; permissions?: string[] } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions }, fixture = createFixture(fixtureOptions);
  const week = Object.fromEntries(days.map(day => [day,{ open: '09:00', close: '22:00', closed: false }]));
  const control = { settings: { orders_paused: false, orders_paused_until: null, rush_mode: false, scheduling_enabled: true, batch_fulfillment_enabled: false } as Record<string, any>, restaurant: { dine_in_enabled: true, pickup_enabled: true, delivery_enabled: false, timezone: 'Asia/Jerusalem', opening_hours_config: { pickup: structuredClone(week), dine_in: structuredClone(week) } } as Record<string, any>, reads: 0, failRead: false, failSave: 0, applyAndFail: false, gate: null as Promise<void> | null };
  const writes: { body: any; restaurant?: string }[] = [];
  await page.clock.setFixedTime(new Date('2026-10-04T12:00:00Z'));
  await page.addInitScript(({ locale }) => { localStorage.setItem('foody_restaurant_token','isolated-ui-fixture'); localStorage.setItem('foody_restaurant_user',JSON.stringify({ id:1, full_name:'Équipe démo',role:'owner',email:'demo@foody.test' })); localStorage.setItem('foody_restaurant_ids','[1,2]'); localStorage.setItem('foody-admin-locale',locale); localStorage.setItem('foody_admin_theme',locale === 'he' ? 'dark' : 'light'); }, { locale: options.locale ?? 'fr' });
  await page.route('**/api/v1/**',async route => {
    const req=route.request(), path=new URL(req.url()).pathname, method=req.method(), body=req.postDataJSON() ?? {}, restaurant=req.headers()['x-restaurant-id'];
    if (/\/restaurants\/\d+\/settings$/.test(path)) {
      if (method === 'GET') { control.reads++; if (control.failRead) return route.fulfill({ status:503,json:{error:'Synthetic overview failure'} }); }
      else { writes.push({body,restaurant}); if(control.gate) await control.gate; if(control.applyAndFail) Object.assign(control.settings,body); if(control.failSave){control.failSave--;return route.fulfill({status:503,json:{error:'Synthetic pause failure'}});} Object.assign(control.settings,body); }
      return route.fulfill({json:{settings:control.settings}});
    }
    const result=fixture.response(req.url(),method,body,Number(restaurant)||1);
    if (/\/restaurants\/\d+$/.test(path)) return route.fulfill({json:{restaurant:{...(result.json as any)?.restaurant,...control.restaurant}}});
    return route.fulfill({json:result.json??{},status:result.status??200});
  });
  await page.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.fallback():route.abort());
  return {fixture,control,writes};
}
const pause=(page:Page)=>page.getByRole('switch',{name:'Mettre en pause les commandes en ligne',exact:true});
const apply=(page:Page)=>page.getByRole('button',{name:'Appliquer la pause et sa reprise',exact:true});
const draftMode=(page:Page)=>page.getByRole('combobox',{name:'Reprise des commandes',exact:true});
const reopen=(page:Page)=>page.locator('#orders-reopen');
const status=(page:Page)=>page.getByRole('region',{name:'État actuel des commandes',exact:true});

for(const locale of ['fr','he']) test(`ordering hub responsive and scoped status ${locale}`,async({page},info)=>{
  const state=await install(page,{locale});state.control.settings.orders_paused=true;state.control.settings.orders_paused_until='2026-10-06T22:00:00Z';await page.setViewportSize({width:locale==='fr'?375:1440,height:1000});await page.goto('/1/settings/orders');await expect(page.locator('#orders-reopen')).toHaveValue('2026-10-06T12:00');await page.screenshot({path:info.outputPath(`orders-overview-${locale}.png`)});await page.locator('#orders-reopen').evaluate(el=>el.scrollIntoView({block:'center'}));await page.screenshot({path:info.outputPath(`orders-pause-${locale}.png`)});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(state.fixture.unhandled).toEqual([]);
});

test('ordering hub calculates hours in restaurant time rather than browser time',async({page})=>{
  const state=await install(page);await page.goto('/1/settings/orders');await expect(status(page).locator('dl > div').first()).toContainText('Ouvert');await expect(status(page).locator('dl > div').last()).toContainText('Mode non activé');expect(state.writes).toHaveLength(0);
});

test('ordering hub follows current-day overnight semantics and exclusive closing',async({page})=>{
  const state=await install(page);state.control.restaurant.opening_hours_config.pickup.saturday={open:'22:00',close:'02:00',closed:false};state.control.restaurant.opening_hours_config.pickup.sunday={open:'09:00',close:'22:00',closed:true};await page.clock.setFixedTime(new Date('2026-10-03T21:30:00Z'));await page.goto('/1/settings/orders');await expect(status(page).locator('dl > div').first()).toContainText('Fermé');
  state.control.restaurant.opening_hours_config.pickup.sunday={open:'09:00',close:'22:00',closed:false};await page.clock.setFixedTime(new Date('2026-10-04T19:00:00Z'));await page.reload();await expect(status(page).locator('dl > div').first()).toContainText('Fermé');expect(state.writes).toHaveLength(0);
});

test('ordering hub preserves 24-hour and absent schedule behavior without defaulting to nine to twenty-two',async({page})=>{
  const state=await install(page);state.control.restaurant.opening_hours_config={};await page.clock.setFixedTime(new Date('2026-10-03T21:30:00Z'));await page.goto('/1/settings/orders');await expect(status(page).locator('dl > div').first()).toContainText('Ouvert');expect(state.writes).toHaveLength(0);
});

test('ordering hub expired pause is inactive while legacy rush remains authoritative',async({page})=>{
  const state=await install(page);state.control.settings.orders_paused=true;state.control.settings.orders_paused_until='2026-10-04T11:00:00Z';await page.goto('/1/settings/orders');await expect(pause(page)).toHaveAttribute('aria-checked','false');await expect(page.getByText(/La pause précédente a expiré/)).toBeVisible();expect(state.writes).toHaveLength(0);state.control.settings.rush_mode=true;await page.reload();await expect(pause(page)).toHaveAttribute('aria-checked','true');await pause(page).click();await expect(pause(page)).toHaveAttribute('aria-checked','false');expect(state.writes[0].body).toEqual({orders_paused:false,orders_paused_until:'',rush_mode:false});
});

test('ordering hub pause and resume are immediate serialized actions scoped to the restaurant',async({page})=>{
  const state=await install(page);await page.goto('/2/settings/orders');let release!:()=>void;state.control.gate=new Promise<void>(resolve=>{release=resolve;});await pause(page).evaluate((button:HTMLButtonElement)=>{button.click();button.click();});await expect(pause(page)).toBeDisabled();await expect(pause(page)).toHaveAttribute('aria-checked','false');release();state.control.gate=null;await expect(pause(page)).toHaveAttribute('aria-checked','true');expect(state.writes).toEqual([{restaurant:'2',body:{orders_paused:true,orders_paused_until:'',rush_mode:false}}]);await pause(page).click();await expect(pause(page)).toHaveAttribute('aria-checked','false');expect(state.writes).toHaveLength(2);
});

test('ordering hub timed reopening requires a valid future date and explicit application',async({page})=>{
  const state=await install(page);state.control.settings.orders_paused=true;await page.goto('/1/settings/orders');await draftMode(page).selectOption('time');await apply(page).click();await expect(reopen(page)).toBeFocused();expect(state.writes).toHaveLength(0);await reopen(page).fill('2026-10-04T01:00');await apply(page).click();await expect(reopen(page)).toHaveAttribute('aria-invalid','true');await reopen(page).fill('2026-10-06T12:00');await page.locator('h1').click();expect(state.writes).toHaveLength(0);await expect(page.getByText('Pacific/Honolulu',{exact:true})).toBeVisible();await apply(page).click();await expect(apply(page)).toBeDisabled();expect(state.writes[0].body).toEqual({orders_paused:true,orders_paused_until:'2026-10-06T22:00:00.000Z',rush_mode:false});
});

test('ordering hub a failed response does not claim rollback and readback does not repeat the mutation',async({page})=>{
  const state=await install(page);state.control.failSave=1;state.control.applyAndFail=true;await page.goto('/1/settings/orders');await pause(page).click();await expect(page.locator('main [role=alert]')).toContainText('dernier confirmé');await expect(pause(page)).toHaveAttribute('aria-checked','false');await page.getByRole('button',{name:'Relire le statut',exact:true}).click();await expect(pause(page)).toHaveAttribute('aria-checked','true');expect(state.writes).toHaveLength(1);
});

test('ordering hub draft survives locale changes and reset/navigation require confirmation',async({page})=>{
  const state=await install(page);state.control.settings.orders_paused=true;await page.goto('/1/settings/orders');await draftMode(page).selectOption('time');await reopen(page).fill('2026-10-06T12:00');const reads=state.control.reads;await page.locator('main nav').getByRole('link',{name:'Disponibilité',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await expect(reopen(page)).toHaveValue('2026-10-06T12:00');await page.getByRole('button',{name:'Réinitialiser',exact:true}).click();await page.getByRole('button',{name:'Abandonner les modifications',exact:true}).click();await expect(draftMode(page)).toHaveValue('manual');await draftMode(page).selectOption('time');await reopen(page).fill('2026-10-06T13:00');await page.getByRole('button',{name:'Foody · Profil',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'עברית',exact:true}).click();await page.keyboard.press('Escape');await expect(reopen(page)).toHaveValue('2026-10-06T13:00');expect(state.control.reads).toBe(reads);
});

test('ordering hub load failure retries without fabricated status and read-only users cannot pause',async({page})=>{
  const state=await install(page,{permissions:['settings.view']});state.control.failRead=true;await page.goto('/1/settings/orders');await expect(page.locator('main [role=alert]')).toContainText('Impossible de charger');await expect(pause(page)).toHaveCount(0);state.control.failRead=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(pause(page)).toBeDisabled();expect(state.writes).toHaveLength(0);
});
