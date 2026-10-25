import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRouteAddress } from '../route-address';

test('route endpoints retain formatted city and place suggestions without duplicated locality', () => {
  assert.equal(formatRouteAddress({ address: "Ra'anana, Israel", city: "Ra'anana" }), "Ra'anana, Israel");
  assert.equal(formatRouteAddress({ address: 'Raanana, Israel', city: "Ra'anana" }), 'Raanana, Israel');
  assert.equal(formatRouteAddress({ address: 'רעננה, ישראל', city: 'רעננה' }), 'רעננה, ישראל');
  assert.equal(formatRouteAddress({ address: "Park, Ra'anana, Israel", city: "Ra'anana" }), "Park, Ra'anana, Israel");
  assert.equal(formatRouteAddress({ address: 'Demo Street 14', city: 'Test City' }), 'Demo Street 14, Test City');
  assert.equal(formatRouteAddress({ address: 'Test City Road 14', city: 'Test City' }), 'Test City Road 14, Test City');
});
