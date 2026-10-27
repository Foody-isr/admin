import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemPhotos, validateItemPhotos } from './item-photos';

test('legacy covers stay first and duplicate photos are omitted', () => {
  assert.deepEqual(
    itemPhotos({
      image_url: 'cover',
      image_urls: ['detail', 'cover', 'detail'],
    }),
    ['cover', 'detail'],
  );
  assert.deepEqual(itemPhotos(), []);
});
test('photo batch validation enforces total count, allowed formats and per-file size', () => {
  const photo = new File(['photo'], 'photo.png', { type: 'image/png' });
  assert.equal(validateItemPhotos([photo], 9), null);
  assert.equal(validateItemPhotos([photo, photo], 9), 'itemPhotosLimit');
  assert.equal(
    validateItemPhotos(
      [new File(['text'], 'photo.svg', { type: 'image/svg+xml' })],
      0,
    ),
    'itemPhotosInvalid',
  );
  assert.equal(
    validateItemPhotos(
      [
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'photo.png', {
          type: 'image/png',
        }),
      ],
      0,
    ),
    'itemPhotosInvalid',
  );
});
