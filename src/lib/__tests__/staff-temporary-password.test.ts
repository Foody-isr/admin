import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const staffPage = readFileSync(
  join(process.cwd(), 'src', 'app', '[restaurantId]', 'staff', 'page.tsx'),
  'utf8',
);

test('staff creation requires and sends the administrator-chosen temporary password', () => {
  assert.match(staffPage, /password:\s*form\.password/);
  assert.match(
    staffPage,
    /required\s+minLength=\{8\}\s+type="password"\s+autoComplete="new-password"/,
  );
  assert.match(staffPage, /temporaryPasswordHint/);
});
