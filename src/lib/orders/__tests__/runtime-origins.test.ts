import assert from 'node:assert/strict';
import test from 'node:test';
import { adminRuntimeOrigins } from '../../runtime-origins';

test('promoting the same Admin bundle changes API and guest links by public host', () => {
  const development = adminRuntimeOrigins('dev-admin.foody-pos.co.il', 'http://fixture', 'http://fixture');
  const production = adminRuntimeOrigins('admin.foody-pos.co.il', development.api, development.web);
  assert.equal(development.api, 'https://dev-api.foody-pos.co.il');
  assert.equal(production.api, 'https://api.foody-pos.co.il');
  assert.equal(production.web, 'https://app.foody-pos.co.il');
  for (const host of [undefined, 'localhost', 'admin.foody-pos.co.il.attacker.test', 'preview.vercel.app']) {
    assert.deepEqual(adminRuntimeOrigins(host, 'http://fixture', 'http://guest'), { api: 'http://fixture', web: 'http://guest' });
  }
});
