import assert from 'node:assert/strict';
import test from 'node:test';
import { cn } from './utils';

test('Foody size tokens preserve semantic foreground colors in every primitive', () => {
  const result = cn('bg-[var(--action)] text-[var(--action-fg)] text-fs-sm', 'text-fs-md');
  assert.ok(result.includes('text-[var(--action-fg)]'));
  assert.ok(result.includes('text-fs-md'));
  assert.ok(!result.includes('text-fs-sm'));
});
