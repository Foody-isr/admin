import assert from 'node:assert/strict';
import test from 'node:test';
import { googleNavigationUrl, hasNavigationCoordinates, wazeNavigationUrl } from '@/lib/delivery-links';

test('Waze receives the same GPS destination for Latin and Hebrew spellings', () => {
  const point = { lat: 32.07, lng: 34.79, city: 'Tel Aviv', navigation_verified: true };
  for (const address of ['Yoram Kaniuk 1', 'יורם קניוק 1']) {
    const url = new URL(wazeNavigationUrl({ ...point, address }));
    assert.equal(url.searchParams.get('ll'), '32.07,34.79');
    assert.equal(url.searchParams.get('q'), null);
    assert.equal(url.searchParams.get('navigate'), 'yes');
    assert.equal(url.searchParams.get('utm_source'), 'foody');
  }
});

test('unresolved or invalid coordinates require a textual destination', () => {
  for (const point of [{}, { lat: NaN, lng: 34 }, { lat: 91, lng: 34 }, { lat: 32, lng: Infinity }, { lat: 0, lng: 0 }, { lat: 32, lng: 34, needs_geocode: true }, { lat: 32, lng: 34, navigation_verified: false }]) {
    const destination = { address: 'יורם קניוק 1', city: 'תל אביב', ...point };
    assert.equal(hasNavigationCoordinates(destination), false);
    assert.equal(new URL(wazeNavigationUrl(destination)).searchParams.get('q'), 'יורם קניוק 1, תל אביב');
  }
});

test('Google Maps and Waze use the same located destination', () => {
  const point = { address: '', lat: 32.0853, lng: 34.7818 };
  assert.equal(new URL(googleNavigationUrl(point)).searchParams.get('destination'), '32.0853,34.7818');
  assert.equal(new URL(wazeNavigationUrl(point)).searchParams.get('ll'), '32.0853,34.7818');
});


test('legacy cached coordinates are not silently trusted by Waze before verification', () => {
  const url = new URL(wazeNavigationUrl({ address: '2 Archi Sherman', city: 'Netanya', lat: 32.0853, lng: 34.7818 }));
  assert.equal(url.searchParams.get('ll'), null);
  assert.equal(url.searchParams.get('q'), '2 Archi Sherman, Netanya');
});
