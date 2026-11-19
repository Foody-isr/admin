import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryCityKey, formatRouteAddress, matchesDeliverySearch, numberForSelectedStreet, selectedNumberedAddress } from '../route-address';

test('a numbered choice keeps its original postal label and discards street-level coordinates', () => {
  for (const [address, street, number, city, selectedCity] of [
    ['Demo Street 6', 'Demo Street', '6', 'Netanya', 'Netanya, Israel'],
    ['אצ״ד 14א', 'אצ"ד', '14א', 'נתניה', 'Netanya, Israel'],
    ['18 bis rue du Test', 'rue du Test', '18 bis', 'Paris', 'Paris, France'],
    ['Rue du 8 Mai 9', 'Rue du 8 Mai', '9', 'Paris', 'Paris, France'],
  ]) {
    const prediction = { id: 'choice', kind: 'prediction', address, city: selectedCity, lookup_token: 'fixture' };
    const details = { id: 'canonical-street', kind: 'street', address: street, street, city, lat: 31, lng: 34 };
    assert.deepEqual(selectedNumberedAddress(prediction, details), { id: 'choice', address, city, street, house_number: number });
  }
});

test('a bare street, different street or different city cannot supply a building number', () => {
  const prediction = { id: 'choice', address: 'Rue du 8 Mai', city: 'Paris, France', lookup_token: 'fixture' };
  const details = { id: 'route', address: 'Rue du 8 Mai', street: 'Rue du 8 Mai', city: 'Paris', kind: 'street' };
  assert.equal(selectedNumberedAddress(prediction, details), undefined);
  assert.equal(selectedNumberedAddress({ ...prediction, address: 'Rue Exemple 9' }, details), undefined);
  assert.equal(selectedNumberedAddress({ ...prediction, address: 'Rue du 8 Mai 9', city: 'Lyon, France' }, details), undefined);
  assert.equal(selectedNumberedAddress({ ...prediction, address: 'Rue du 8 Mai 9' }, { ...details, house_number: '9' }), undefined);
});

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

test('a selected street can reuse a known building number only on the same street and in the same city', () => {
  const choice = { id: 'route', address: 'שדרת הדגמה', street: 'Example Avenue', city: 'נתניה' };
  assert.equal(numberForSelectedStreet('שדרת הדגמה 9א', 'Netanya', choice), '9א');
  assert.equal(numberForSelectedStreet('9 Example Avenue', 'Netanya', choice), '9');
  assert.equal(numberForSelectedStreet('Example Avenue 9', 'Herzlya', choice), '');
  assert.equal(numberForSelectedStreet('Other Avenue 9', 'Netanya', choice), '');
  assert.equal(numberForSelectedStreet('Example Avenue', 'Netanya', choice), '');
  assert.equal(deliveryCityKey('Herzlya'), deliveryCityKey('הרצליה'));
  assert.equal(deliveryCityKey('Guivat Shmuel'), deliveryCityKey('גבעת שמואל'));
});
