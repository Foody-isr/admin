import assert from 'node:assert/strict';
import test from 'node:test';
import { googleNavigationUrl, wazeNavigationUrl } from '@/lib/delivery-links';

test('Waze uses precise coordinates when available', () => {
  assert.equal(
    wazeNavigationUrl({ address: 'ignored', lat: 32.0853, lng: 34.7818 }),
    'https://www.waze.com/ul?ll=32.0853%2C34.7818&navigate=yes',
  );
});

test('Waze falls back to the full textual address', () => {
  const url = wazeNavigationUrl({ address: '2 Archi Sherman', city: 'Netanya' });
  assert.equal(url, 'https://www.waze.com/ul?q=2%20Archi%20Sherman%2C%20Netanya&navigate=yes');
});

test('Google Maps keeps the same coordinate destination contract', () => {
  const url = googleNavigationUrl({ address: 'ignored', lat: 32.0853, lng: 34.7818 });
  assert.equal(url, 'https://www.google.com/maps/dir/?api=1&destination=32.0853%2C34.7818');
});
