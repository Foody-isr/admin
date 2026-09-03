import assert from 'node:assert/strict';
import test from 'node:test';

import { CsvParseError, parseColumnarCsv } from './columnar';

test('parses the legacy category-column format', () => {
  const parsed = parseColumnarCsv('LEGUMES,POISSON\nTomate,Saumon\nCarotte,');

  assert.deepEqual(parsed, {
    categories: [
      { name: 'LEGUMES', items: [{ name: 'Tomate' }, { name: 'Carotte' }] },
      { name: 'POISSON', items: [{ name: 'Saumon' }] },
    ],
  });
});

test('parses structured item rows with prices and image URLs', () => {
  const parsed = parseColumnarCsv([
    'category,name,price,image_url',
    'Mעדניה,Huile d’olive,49.90,https://images.example.com/oil.png',
    'Mעדניה,Harissa,₪12,https://images.example.com/harissa.jpg',
  ].join('\n'));

  assert.deepEqual(parsed.categories[0], {
    name: 'Mעדניה',
    items: [
      { name: 'Huile d’olive', price: 49.9, image_url: 'https://images.example.com/oil.png' },
      { name: 'Harissa', price: 12, image_url: 'https://images.example.com/harissa.jpg' },
    ],
  });
});

test('accepts localized structured headers', () => {
  const parsed = parseColumnarCsv('catégorie,nom,prix,photo\nDesserts,Tarte,12,https://example.com/tarte.jpg');
  assert.equal(parsed.categories[0].items[0].price, 12);
});

test('rejects invalid prices and non-http image URLs', () => {
  assert.throws(
    () => parseColumnarCsv('category,name,price\nDesserts,Tarte,gratuit'),
    CsvParseError,
  );
  assert.throws(
    () => parseColumnarCsv('category,name,image_url\nDesserts,Tarte,file:///tmp/tarte.jpg'),
    CsvParseError,
  );
});
