import assert from 'node:assert/strict';
import test from 'node:test';
import { moveGalleryImage } from './CateringItemGalleryEditor';

test('gallery photos keep the order chosen in admin', () => {
  const images = [
    { image_url: 'cover-detail.jpg', alt_text: 'Salle' },
    { image_url: 'buffet.jpg', alt_text: 'Buffet' },
    { image_url: 'dessert.jpg', alt_text: 'Desserts' },
  ];

  assert.deepEqual(moveGalleryImage(images, 2, 1).map((image) => image.image_url), [
    'cover-detail.jpg',
    'dessert.jpg',
    'buffet.jpg',
  ]);
  assert.equal(moveGalleryImage(images, 0, -1), images);
});
