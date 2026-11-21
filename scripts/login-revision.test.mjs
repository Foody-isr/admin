import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/portal-session.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

function form(current, published, status = 200) {
  let reloads = 0;
  const requests = [];
  const context = {
    exports: {}, process: { env: { NEXT_PUBLIC_FOODY_LOGIN_REVISION: current } }, AbortSignal,
    window: { location: { reload: () => { reloads++; } } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return new Response(null, { status, headers: published ? { 'X-Foody-Login-Revision': published } : {} });
    },
  };
  vm.runInNewContext(compiled, context);
  return { check: context.exports.refreshOutdatedLogin, requests, reloads: () => reloads };
}

test('an old open form reloads before credentials are submitted', async () => {
  const old = form('previous-build', 'current-build');
  assert.equal(await old.check(), true);
  assert.equal(old.reloads(), 1);
  const [{ url, options }] = old.requests;
  assert.equal(url, '/login');
  assert.equal(options.method, 'HEAD');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.redirect, 'error');
  assert.equal(options.body, undefined);
});

test('the current form and older deployments without a revision keep the normal sign-in flow', async () => {
  for (const published of ['current-build', undefined]) {
    const current = form('current-build', published);
    assert.equal(await current.check(), false);
    assert.equal(current.reloads(), 0);
  }
  const local = form('', undefined);
  assert.equal(await local.check(), false);
  assert.equal(local.requests.length, 0);
});

test('a failed version check is retryable and does not refresh the form', async () => {
  const unavailable = form('current-build', undefined, 503);
  await assert.rejects(unavailable.check(), /Could not load the sign-in page/);
  assert.equal(unavailable.reloads(), 0);
});
