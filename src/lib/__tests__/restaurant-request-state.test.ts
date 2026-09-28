import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RestaurantRequestGuard,
  readyRestaurantState,
  stateForRestaurant,
} from '@/lib/restaurant-request-state';

test('a restaurant switch invalidates an in-flight response synchronously', () => {
  const guard = new RestaurantRequestGuard();
  const mamieRequest = guard.begin(5);

  guard.enterRestaurant(12);

  assert.equal(guard.isCurrent(mamieRequest), false);
});

test('a newer request wins within the same restaurant', () => {
  const guard = new RestaurantRequestGuard();
  const first = guard.begin(5);
  const second = guard.begin(5);

  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
});

test('state from another restaurant is replaced by a loading state', () => {
  const previous = readyRestaurantState(5, { customer: 'previous restaurant' });

  const visible = stateForRestaurant(previous, 12);

  assert.equal(visible.restaurantId, 12);
  assert.equal(visible.status, 'loading');
  assert.equal(visible.data, null);
});
