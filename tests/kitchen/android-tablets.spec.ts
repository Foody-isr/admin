import { expect, test, type Page } from '@playwright/test';

const path = '/api/v1/restaurants/1/kds-tablets';

async function openSettings(page: Page, manager: boolean, ipad = false) {
  const prep = '00000000-0000-4000-8000-000000000001';
  const pass = '00000000-0000-4000-8000-000000000002';
  const deviceName = ipad ? 'Kitchen iPad' : 'Kitchen tablet';
  const policy = {
    role: 'prep', completion_scope: 'all', columns: 5, yellow_minutes: 5, red_minutes: 10,
    sort_items: 'entry', text_size: 'medium', order_types: ['dine_in'], category_ids: [],
    show_pos: true, show_online: true, show_held: false, separate_held_counts: false,
  };
  let assignment = {enabled:true, can_act:true, default_station_id:prep, all_stations:false, station_ids:[prep]};
  let expires: string | null = null;
  const writes: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('foody_restaurant_portal_session', 'fp1p.e30.fixture.00');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({id:1,full_name:'Kitchen demo',role:'owner'}));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', 'en');
  });
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url()).pathname;
    if (request.method() !== 'GET') writes.push(url);
    if (url === '/api/v1/users/me') return route.fulfill({json:{permissions:['settings.view','settings.edit'],role_name:'Owner'}});
    if (url === '/api/v1/restaurants/1') return route.fulfill({json:{restaurant:{id:1,name:'Kitchen demo',timezone:'Asia/Jerusalem'}}});
    if (url === path) return route.fulfill({json:{
      manager, enabled:true, categories:[],
      devices:[{id:prep,kind:'tablet',system_name:deviceName,display_name:deviceName,os_name:ipad ? 'iPadOS' : ''}],
      stations:[{device_id:prep,name:'Grill',settings:policy},{device_id:pass,name:'Pass',settings:{...policy,role:'expo'}}],
      tablets:[{device_id:prep,...assignment,active_station_id:prep,code_expiry:expires,paired_at:null,revoked_at:null,last_seen_at:null}],
    }});
    if (url === path+'/'+prep+'/assignment') {
      assignment=request.postDataJSON();
      return route.fulfill({status:204});
    }
    if (url === path+'/'+prep+'/code') {
      expires=new Date(Date.now()+600000).toISOString();
      return route.fulfill({json:{code:'DEMO2345',expires_at:expires}});
    }
    return route.fulfill({json:{}});
  });
  await page.goto('/1/settings/kitchen-displays');
  const tablet = page.getByRole('combobox').filter({has:page.getByRole('option',{name:ipad ? deviceName+' · iPadOS' : deviceName,exact:true})}).last();
  await tablet.selectOption(prep);
  return {writes,prep,pass,assignment:()=>assignment};
}

test('manager saves multiple stations, grants view-only and issues one code', async ({page})=>{
  const demo=await openSettings(page,true);
  await page.getByLabel('All current and future stations in this location').check();
  await page.getByLabel('Allow completion, recall and Expo priority').uncheck();
  await page.getByRole('button',{name:/save changes/i}).last().click();
  await expect.poll(()=>demo.assignment().can_act).toBe(false);
  expect(demo.assignment().all_stations).toBe(true);
  await page.getByRole('button',{name:'Generate a pairing code'}).click();
  await expect(page.getByText('DEMO2345')).toBeVisible();
  expect(demo.writes.filter(p=>p.endsWith('/code'))).toHaveLength(1);
});

test('a settings reader can view a tablet with no pairing or reassignment controls', async ({page})=>{
  const demo=await openSettings(page,false);
  await expect(page.getByLabel('All current and future stations in this location')).toBeDisabled();
  await expect(page.getByRole('button',{name:'Generate a pairing code'})).toHaveCount(0);
  expect(demo.writes.filter(p=>p.startsWith(path))).toEqual([]);
});

test('manager assigns an iPad to two named stations and issues its code', async ({page}) => {
  const demo = await openSettings(page, true, true);
  await expect(page.getByRole('heading', {name:'Dedicated kitchen tablets'})).toBeVisible();
  await page.getByRole('checkbox', {name:'Pass', exact:true}).check();
  await page.getByRole('button', {name:/save changes/i}).last().click();
  await expect.poll(() => demo.assignment().station_ids).toEqual([demo.prep, demo.pass]);
  expect(demo.assignment().default_station_id).toBe(demo.prep);
  expect(demo.assignment().all_stations).toBe(false);
  await page.getByRole('button', {name:'Generate a pairing code'}).click();
  await expect(page.getByText('DEMO2345')).toBeVisible();
  expect(demo.writes.filter(p => p.endsWith('/code'))).toHaveLength(1);
});
