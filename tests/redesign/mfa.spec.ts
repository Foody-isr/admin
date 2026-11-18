import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

const challenge = { mfa_required: true, enrollment_required: true, challenge: 'synthetic-one-use-proof', secret: 'JBSWY3DPEHPK3PXP' };
const recovery = ['synthetic-recovery-code-one', 'synthetic-recovery-code-two'];
async function install(page: Page, enrolled = false) {
  const fixture = createFixture();
  await page.addInitScript(() => localStorage.setItem('foody-admin-locale', 'en'));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['localhost','127.0.0.1'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/v1/')) return route.continue();
    const body = route.request().postDataJSON() ?? {};
    if (url.pathname === '/api/v1/auth/login') return route.fulfill({status:202,json:{...challenge,enrollment_required:!enrolled,secret:enrolled?undefined:challenge.secret}});
    if (url.pathname === '/api/v1/auth/mfa/verify') {
      expect(body.challenge).toBe(challenge.challenge);
      if (body.code !== '123456') return route.fulfill({status:401,json:{error:'second_factor_failed'}});
      const result = fixture.response('http://localhost/api/v1/auth/login','POST',{email:'demo@foody.test',password:'demo-local'});
      return route.fulfill({json:{...result.json, recovery_codes:enrolled?undefined:recovery}});
    }
    const result=fixture.response(route.request().url(),route.request().method(),body);
    return route.fulfill({status:result.status??200,json:result.json??{}});
  });
  await page.goto('/login');
  await page.getByLabel('Email',{exact:true}).fill('demo@foody.test');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Password',{exact:true}).fill('synthetic-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
async function storage(page:Page) {
  return page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));
}
test('enrollment withholds stored session until recovery codes are acknowledged',async({page})=>{
  await install(page);
  const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText(challenge.secret);
  expect(await storage(page)).not.toContain(challenge.secret);
  expect(await storage(page)).not.toContain('foody_restaurant_token');
  await dialog.getByLabel('Authenticator code or recovery code').fill('wrong');
  await dialog.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(await storage(page)).not.toContain('foody_restaurant_token');
  await dialog.getByLabel('Authenticator code or recovery code').fill('123456');
  await dialog.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(dialog).toContainText(recovery[0]);
  expect(await storage(page)).not.toContain('foody_restaurant_token');
  expect(await storage(page)).not.toContain(recovery[0]);
  await expect(dialog.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page).toHaveURL(/select-restaurant/, {timeout:30000});
  expect(await storage(page)).toContain('foody_restaurant_token');
  expect(await storage(page)).not.toContain(recovery[0]);
});
test('cancellation clears the challenge without persisting a session',async({page})=>{
  await install(page);
  await page.getByRole('dialog').getByRole('button',{name:'Cancel'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await storage(page)).not.toContain('foody_restaurant_token');
  expect(await storage(page)).not.toContain(challenge.secret);
});
test('an enrolled account cannot sign in before its factor succeeds',async({page})=>{
  await install(page,true);
  const dialog=page.getByRole('dialog');
  await expect(dialog).not.toContainText(challenge.secret);
  expect(await storage(page)).not.toContain('foody_restaurant_token');
  await dialog.getByLabel('Authenticator code or recovery code').fill('123456');
  await dialog.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page).toHaveURL(/select-restaurant/, {timeout:30000});
});
