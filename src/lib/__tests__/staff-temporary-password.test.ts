import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const staffPage = readFileSync(
  join(process.cwd(), 'src', 'app', '[restaurantId]', 'staff', 'page.tsx'),
  'utf8',
);

test('staff creation sends an invitation without an administrator-chosen password', () => {
  assert.doesNotMatch(staffPage, /password:\s*form\.password/);
  assert.doesNotMatch(staffPage, /autoComplete="new-password"/);
  assert.match(staffPage, /await inviteStaff\(rid/);
});
