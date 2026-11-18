import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryCityKey, formatRouteAddress, matchesDeliverySearch } from '../route-address';

test('route endpoints retain formatted city and place suggestions without duplicated locality', () => {
  assert.equal(formatRouteAddress({ address: "Ra'anana, Israel", city: "Ra'anana" }), "Ra'anana, Israel");
  assert.equal(formatRouteAddress({ address: 'Raanana, Israel', city: "Ra'anana" }), 'Raanana, Israel');
  assert.equal(formatRouteAddress({ address: 'רעננה, ישראל', city: 'רעננה' }), 'רעננה, ישראל');
  assert.equal(formatRouteAddress({ address: "Park, Ra'anana, Israel", city: "Ra'anana" }), "Park, Ra'anana, Israel");
  assert.equal(formatRouteAddress({ address: 'Demo Street 14', city: 'Test City' }), 'Demo Street 14, Test City');
  assert.equal(formatRouteAddress({ address: 'Test City Road 14', city: 'Test City' }), 'Test City Road 14, Test City');
});

test('dispatch compares whole city aliases across scripts without merging districts', () => {
  for (const city of ['Tel Aviv', 'TEL-AVIV', 'Tel Aviv–Yafo', 'tel aviv jaffa', 'תל אביב־יפו', 'תֵּל אָבִיב']) {
    assert.equal(deliveryCityKey(city), 'telaviv');
  }
  assert.equal(deliveryCityKey('Jérusalem'), deliveryCityKey('ירושלים'));
  assert.notEqual(deliveryCityKey('Tel Mond'), deliveryCityKey('Tel Aviv'));
  assert.notEqual(deliveryCityKey('Paris 12'), deliveryCityKey('Paris 13'));
  assert.equal(formatRouteAddress({ address: 'Herzl 12, תל אביב', city: 'Tel Aviv Yafo' }), 'Herzl 12, תל אביב');
});

test('delivery search retains partial input in either script, literal labels and order numbers', () => {
  assert.ok(matchesDeliverySearch('תל א', 'Tel-Aviv Yafo'));
  assert.ok(matchesDeliverySearch('Jaffa', 'תל אביב-יפו'));
  assert.ok(matchesDeliverySearch('Yafo', 'Tel Aviv-Yafo'));
  assert.ok(matchesDeliverySearch('#418', 418));
  assert.ok(matchesDeliverySearch('lea', 'Léa Demo'));
  assert.equal(matchesDeliverySearch('ירושלים', 'Tel Aviv', 418), false);
});
