import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, options: { locale?: string; connected?: boolean; permissions?: string[]; sdk?: boolean } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions }, fixture = createFixture(fixtureOptions);
  const control = { connection: { connected: options.connected ?? true, enabled: true, server_configured: true, handle: 'atelier_foody_demo', last_synced_at: '2026-10-04T09:30:00Z', last_sync_error: '' }, storiesEnabled: true, reels: [{ id: 1, restaurant_id: 1, provider: 'instagram', external_id: 'demo-1', media_url: '', embed_url: '', thumbnail_url: '/synthetic-reel.svg', caption: 'Préparation du service : légumes de saison, gestes précis et attentions particulières pour chaque commande. שלום מהמטבח', permalink: '', sort_order: 0, is_visible: true }, { id: 2, restaurant_id: 1, provider: 'instagram', external_id: 'demo-2', media_url: '', embed_url: '', thumbnail_url: '', caption: 'Les coulisses du restaurant — ce reel reste dans la bibliothèque même lorsqu’il est masqué.', permalink: '', sort_order: 1, is_visible: false }], reads: 0, failRead: false, failPublic: false, failure: '', applyAndFail: false, failAfterWrite: false, connectSyncError: false, gate: null as Promise<void> | null };
  const writes: { kind: string; method: string; body: any; restaurant?: string; path: string }[] = [];
  await page.addInitScript(({ locale, sdk }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture'); localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' })); localStorage.setItem('foody_restaurant_ids', '[1,2]'); localStorage.setItem('foody-admin-locale', locale); localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
    (window as any).__igCallbacks = []; (window as any).__igOptions = []; (window as any).__igFallback = {};
    if (sdk) (window as any).FB = { init: () => {}, login: (callback: unknown, options: unknown) => { (window as any).__igCallbacks.push(callback); (window as any).__igOptions.push(options); }, getLoginStatus: (callback: (value: unknown) => void) => callback((window as any).__igFallback) };
  }, { locale: options.locale ?? 'fr', sdk: options.sdk !== false });
  await page.route('**/synthetic-reel.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><rect width="360" height="640" fill="#d9b89d"/><circle cx="180" cy="290" r="125" fill="#fff7ef"/><circle cx="180" cy="290" r="82" fill="#637950"/><text x="180" y="540" fill="#33251d" text-anchor="middle" font-family="sans-serif" font-size="20">ATELIER · DÉMO</text></svg>' }));
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method(), body = request.postDataJSON() ?? {}, restaurant = request.headers()['x-restaurant-id'];
    const scopedReels = () => control.reels.map(reel => ({ ...reel, restaurant_id: Number(restaurant) || 1 }));
    if (/\/public\/restaurants\/\d+$/.test(path)) return control.failPublic ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { restaurant: { stories_navigation_available: control.storiesEnabled && control.connection.connected && control.connection.enabled && control.reels.some(reel => reel.is_visible) } } });
    if (/\/(social\/instagram|reels|website-config)$/.test(path) && method === 'GET') {
      control.reads++; if (control.failRead) return route.fulfill({ status: 503, json: { error: 'Synthetic Stories read failure' } });
      return route.fulfill({ json: path.endsWith('/social/instagram') ? control.connection : path.endsWith('/reels') ? { reels: scopedReels() } : { website_config: { stories_enabled: control.storiesEnabled } } });
    }
    let kind = '';
    if (path.endsWith('/social/instagram/connect')) kind = 'connect';
    else if (path.endsWith('/social/instagram/sync')) kind = 'sync';
    else if (path.endsWith('/social/instagram') && method === 'DELETE') kind = 'disconnect';
    else if (path.endsWith('/website-config') && method === 'PUT') kind = 'visibility';
    else if (path.endsWith('/reels-reorder')) kind = 'reorder';
    else if (/\/reels\/\d+$/.test(path)) kind = method === 'DELETE' ? 'delete' : 'reel';
    if (kind) {
      writes.push({ kind, method, body, restaurant, path }); if (control.gate) await control.gate;
      const id = Number(path.split('/').at(-1)), before = scopedReels().find(reel => reel.id === id);
      if (control.failure !== kind || control.applyAndFail) {
        if (kind === 'connect') control.connection.connected = true;
        if (kind === 'disconnect') { control.connection.connected = false; control.reels = control.reels.filter(reel => reel.provider !== 'instagram'); }
        if (kind === 'visibility') control.storiesEnabled = body.stories_enabled;
        if (kind === 'reel') control.reels = control.reels.map(reel => reel.id === id ? { ...reel, ...body } : reel);
        if (kind === 'delete') control.reels = control.reels.filter(reel => reel.id !== id);
        if (kind === 'reorder') control.reels = body.ids.map((id: number) => control.reels.find(reel => reel.id === id));
      }
      if (control.failAfterWrite) control.failRead = true;
      if (control.failure === kind) return route.fulfill({ status: 503, json: { error: 'Synthetic uncertain Stories mutation' } });
      return route.fulfill({ json: kind === 'connect' ? { connected: true, handle: control.connection.handle, synced: 2, ...(control.connectSyncError ? { sync_error: 'Synthetic initial sync failure' } : {}) } : kind === 'sync' ? { synced: 2 } : kind === 'visibility' ? { website_config: { stories_enabled: control.storiesEnabled } } : kind === 'reel' ? before : { ok: true } });
    }
    const result = fixture.response(request.url(), method, body, Number(restaurant) || 1); return route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { control, writes, fixture };
}
const reel = (page: Page, id: number) => page.locator(`[data-reel-id="${id}"]`);
const stories = (page: Page) => page.getByRole('switch', { name: 'Afficher les Stories sur mon site', exact: true });
const connect = (page: Page) => page.getByRole('button', { name: 'Connecter Instagram', exact: true });
const verify = (page: Page) => page.locator('main [role=alert]').getByRole('button', { name: 'Actualiser l’état', exact: true });
async function auth(page: Page, token = true) { await page.evaluate(token => (window as any).__igCallbacks.at(-1)(token ? { authResponse: { accessToken: 'synthetic-instagram-credential' } } : {}), token); }

for (const locale of ['fr', 'he']) test(`stories responsive library and live visibility ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale }); await page.setViewportSize({ width: locale === 'fr' ? 375 : 1440, height: 1000 }); await page.goto('/1/reels'); await expect(reel(page, 1)).toBeVisible(); await page.screenshot({ path: info.outputPath(`stories-overview-${locale}.png`) }); await reel(page, 1).evaluate(el => el.scrollIntoView({ block: 'center' })); await page.screenshot({ path: info.outputPath(`stories-library-${locale}.png`) }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(state.fixture.unhandled).toEqual([]);
});

test('stories initial error is distinct from an unconnected account and retries', async ({ page }) => {
  const state = await install(page); state.control.failRead = true; await page.goto('/1/reels'); await expect(page.locator('main [role=alert]')).toContainText('Impossible de charger'); await expect(connect(page)).toHaveCount(0); state.control.failRead = false; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(reel(page, 1)).toBeVisible(); expect(state.writes).toHaveLength(0);
});

test('stories missing public eligibility is explicit and does not block the library', async ({ page }) => {
  const state = await install(page); state.control.failPublic = true; await page.goto('/1/reels'); await expect(page.getByText('La disponibilité sur le site client n’a pas pu être vérifiée.', { exact: true })).toBeVisible(); await expect(reel(page, 1)).toBeVisible(); expect(state.writes).toHaveLength(0);
});

test('stories visibility waits for confirmation and prevents overlapping actions', async ({ page }) => {
  const state = await install(page); await page.goto('/2/reels'); let release!: () => void; state.control.gate = new Promise<void>(resolve => { release = resolve; }); await stories(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); }); await expect(stories(page)).toBeDisabled(); await expect(stories(page)).toHaveAttribute('aria-checked', 'true'); await expect(reel(page, 1).getByRole('switch')).toBeDisabled(); release(); state.control.gate = null; await expect(stories(page)).toHaveAttribute('aria-checked', 'false'); expect(state.writes).toHaveLength(1); expect(state.writes[0]).toMatchObject({ restaurant: '2', body: { stories_enabled: false } });
});

test('stories reel visibility is read after the write even if the returned reel is stale', async ({ page }) => {
  const state = await install(page); await page.goto('/1/reels'); await reel(page, 1).getByRole('switch').click(); await expect(reel(page, 1).getByRole('switch')).toHaveAttribute('aria-checked', 'false'); await expect(reel(page, 1).getByText('Masqué', { exact: true })).toBeVisible(); expect(state.writes[0].body).toEqual({ is_visible: false });
});

test('stories order changes preserve IDs and have accessible boundary controls', async ({ page }) => {
  const state = await install(page); await page.goto('/1/reels'); await expect(reel(page, 1).getByRole('button', { name: 'Monter le reel', exact: true })).toBeDisabled(); await reel(page, 1).getByRole('button', { name: 'Descendre le reel', exact: true }).click(); await expect(page.locator('[data-reel-id]').first()).toHaveAttribute('data-reel-id', '2'); expect(state.writes[0].body).toEqual({ ids: [2, 1] });
});

test('stories removal requires confirmation and cancellation restores trigger focus', async ({ page }, info) => {
  const state = await install(page); await page.goto('/1/reels'); const remove = reel(page, 1).getByRole('button', { name: 'Supprimer', exact: true }); await remove.click(); await expect(page.getByRole('alertdialog')).toHaveCSS('opacity', '1'); await page.screenshot({ path: info.outputPath('stories-remove-fr.png'), animations: 'disabled' }); await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(remove).toBeFocused(); expect(state.writes).toHaveLength(0); await remove.click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer', exact: true }).click(); await expect(reel(page, 1)).toHaveCount(0); expect(state.writes).toHaveLength(1);
});

test('stories uncertain applied write blocks further mutations until a read-only recovery', async ({ page }) => {
  const state = await install(page); state.control.failure = 'reel'; state.control.applyAndFail = true; await page.goto('/1/reels'); await reel(page, 1).getByRole('switch').click(); await expect(verify(page)).toBeVisible(); await expect(reel(page, 1).getByRole('switch')).toBeDisabled(); state.control.failRead = true; await verify(page).click(); await expect(page.getByText('L’actualisation a échoué. Réessayez pour vérifier l’état actuel.', { exact: true })).toBeVisible(); state.control.failRead = false; await verify(page).click(); await expect(reel(page, 1).getByRole('switch')).toHaveAttribute('aria-checked', 'false'); expect(state.writes).toHaveLength(1);
});

test('stories confirmed sync with failed refresh retries only GET', async ({ page }) => {
  const state = await install(page); state.control.failAfterWrite = true; await page.goto('/1/reels'); await page.getByRole('button', { name: 'Synchroniser', exact: true }).click(); await expect(page.locator('main [role=alert]')).toContainText('La modification est confirmée'); state.control.failRead = false; await verify(page).click(); await expect(reel(page, 1)).toBeVisible(); expect(state.writes.map(write => write.kind)).toEqual(['sync']);
});

test('stories disconnect followed by visibility failure can finish without a second disconnect', async ({ page }) => {
  const state = await install(page); state.control.failure = 'visibility'; await page.goto('/1/reels'); await page.getByRole('button', { name: 'Déconnecter', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Déconnecter', exact: true }).click(); await expect(page.locator('main [role=alert]')).toContainText('Instagram est déconnecté'); await verify(page).click(); await expect(stories(page)).toBeEnabled(); await expect(stories(page)).toHaveAttribute('aria-checked', 'true'); state.control.failure = ''; await stories(page).click(); await expect(stories(page)).toHaveAttribute('aria-checked', 'false'); expect(state.writes.map(write => write.kind)).toEqual(['disconnect', 'visibility', 'visibility']);
});

test('stories read-only mode disables toggles and never prepares social authorization', async ({ page }) => {
  const state = await install(page, { permissions: ['settings.view'], sdk: false }); let sdkRequests = 0; page.on('request', request => { if (request.url().includes('connect.facebook.net')) sdkRequests++; }); await page.goto('/1/reels'); await expect(stories(page)).toBeDisabled(); await expect(reel(page, 1).getByRole('switch')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Déconnecter', exact: true })).toHaveCount(0); expect(sdkRequests).toBe(0); expect(state.writes).toHaveLength(0);
});

test('stories connects with the existing token configuration and treats initial sync failure separately', async ({ page }) => {
  const state = await install(page, { connected: false }); state.control.connectSyncError = true; await page.goto('/2/reels'); await connect(page).click(); await auth(page); await expect(page.getByText(/Instagram est connecté. La première synchronisation a échoué/)).toBeVisible(); expect(state.writes).toHaveLength(1); expect(state.writes[0]).toMatchObject({ kind: 'connect', restaurant: '2' }); expect(await page.evaluate(() => (window as any).__igOptions[0])).toEqual({ config_id: '992572743780171' }); await expect(page.locator('body')).not.toContainText('synthetic-instagram-credential');
});

test('stories duplicate authorization callbacks cannot create two connections', async ({ page }) => {
  const state = await install(page, { connected: false }); await page.goto('/1/reels'); await connect(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); }); await page.evaluate(() => { const callback = (window as any).__igCallbacks[0]; callback({ authResponse: { accessToken: 'synthetic-instagram-credential' } }); callback({ authResponse: { accessToken: 'synthetic-instagram-credential' } }); }); await expect(page.getByRole('button', { name: 'Déconnecter', exact: true })).toBeVisible(); expect(state.writes).toHaveLength(1);
});

test('stories cancellation and leaving ignore late authorization callbacks', async ({ page }) => {
  const state = await install(page, { connected: false }); await page.goto('/1/reels'); await connect(page).click(); await page.getByRole('button', { name: 'Annuler', exact: true }).click(); await auth(page); expect(state.writes).toHaveLength(0); await connect(page).click(); await page.getByRole('link', { name: 'Accueil', exact: true }).click(); await expect(page).toHaveURL(/\/1\/dashboard$/); await auth(page); expect(state.writes).toHaveLength(0);
});

test('stories authorization can recover a token from the existing Facebook session', async ({ page }) => {
  const state = await install(page, { connected: false }); await page.goto('/1/reels'); await page.evaluate(() => { (window as any).__igFallback = { authResponse: { accessToken: 'synthetic-instagram-fallback' } }; }); await connect(page).click(); await auth(page, false); await expect(page.getByRole('button', { name: 'Déconnecter', exact: true })).toBeVisible(); expect(state.writes).toHaveLength(1);
});

test('stories SDK loading error has a retry and no implicit connect request', async ({ page }) => {
  const state = await install(page, { connected: false, sdk: false }); await page.goto('/1/reels'); await expect(page.getByText('Le module de connexion Instagram n’a pas pu être chargé. Réessayez.', { exact: true })).toBeVisible(); await page.evaluate(() => { (window as any).FB = { init: () => {}, login: (callback: unknown) => (window as any).__igCallbacks.push(callback), getLoginStatus: (callback: (value: unknown) => void) => callback({}) }; }); await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(connect(page)).toBeEnabled(); expect(state.writes).toHaveLength(0);
});

test('stories locale changes preserve state and unknown thumbnails never request unsafe URLs', async ({ page }) => {
  const state = await install(page); state.control.reels[0].thumbnail_url = 'javascript:alert(1)'; await page.goto('/1/reels'); await expect(reel(page, 1).getByRole('img')).toHaveCount(0); const reads = state.control.reads; await page.getByRole('button', { name: 'Atelier Foody', exact: true }).click(); await page.getByRole('dialog').getByRole('combobox').selectOption('he'); await page.keyboard.press('Escape'); await expect(reel(page, 1).getByText('אין תצוגה מקדימה', { exact: true })).toBeVisible(); expect(state.control.reads).toBe(reads); expect(state.writes).toHaveLength(0);
});

test('stories empty connected library distinguishes no media from an error', async ({ page }) => {
  const state = await install(page, { locale: 'en' }); state.control.reels = []; await page.goto('/1/reels'); await expect(page.getByText('No reels synced yet. Post a reel on Instagram, then hit “Sync now”.', { exact: true })).toBeVisible(); await expect(page.getByText('The Stories page is currently unavailable on the customer site.', { exact: true })).toBeVisible(); expect(state.writes).toHaveLength(0);
});

test('stories disconnected visibility can be cleared while a disabled server cannot connect', async ({ page }) => {
  const state = await install(page, { connected: false }); state.control.connection.server_configured = false; await page.goto('/1/reels'); await expect(connect(page)).toBeDisabled(); await expect(page.getByText('La visibilité reste activée sans connexion active. Vous pouvez la désactiver ici.', { exact: true })).toBeVisible(); await stories(page).click(); await expect(stories(page)).toHaveAttribute('aria-checked', 'false'); await expect(stories(page)).toBeDisabled(); expect(state.writes.map(write => write.kind)).toEqual(['visibility']);
});

test('stories timeout releases the authorization state and ignores its late callback', async ({ page }) => {
  const state = await install(page, { connected: false }); await page.goto('/1/reels'); await expect(connect(page)).toBeEnabled(); await page.clock.install(); await connect(page).click(); await page.clock.fastForward(120001); await expect(page.getByText('L’autorisation a expiré. Relancez la connexion pour continuer.', { exact: true })).toBeVisible(); await auth(page); await expect(connect(page)).toBeEnabled(); expect(state.writes).toHaveLength(0);
});

test('stories missing authorization token never submits a connection', async ({ page }) => {
  const state = await install(page, { connected: false }); await page.goto('/1/reels'); await connect(page).click(); await auth(page, false); await expect(page.locator('main [role=alert]')).toContainText('Instagram'); await expect(connect(page)).toBeEnabled(); expect(state.writes).toHaveLength(0);
});

test('stories disconnect retains media from other providers and clears the live visibility flag', async ({ page }) => {
  const state = await install(page); state.control.reels[1].provider = 'tiktok'; await page.goto('/1/reels'); await page.getByRole('button', { name: 'Déconnecter', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Déconnecter', exact: true }).click(); await expect(page.getByText('Instagram est déconnecté et la page Stories est désactivée.', { exact: true })).toBeVisible(); await expect(reel(page, 1)).toHaveCount(0); await expect(reel(page, 2)).toBeVisible(); await expect(stories(page)).toHaveAttribute('aria-checked', 'false'); expect(state.writes.map(write => write.kind)).toEqual(['disconnect', 'visibility']);
});

test('stories failed thumbnail offers an image retry without a business mutation', async ({ page }) => {
  const state = await install(page); let attempts = 0; await page.route('**/synthetic-reel.svg', route => { attempts++; return attempts === 1 ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#d9b89d"/></svg>' }); }); await page.goto('/1/reels'); await reel(page, 1).scrollIntoViewIfNeeded(); await reel(page, 1).getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(reel(page, 1).locator('img')).toBeVisible(); await expect.poll(() => attempts).toBe(2); expect(state.writes).toHaveLength(0);
});
