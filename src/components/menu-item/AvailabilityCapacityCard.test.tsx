import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AvailabilityPreview } from '@/lib/api';
import { LocaleProvider } from '@/lib/i18n';
import { AvailabilityCapacityCard } from './AvailabilityCapacityCard';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const preview: AvailabilityPreview = {
  buildable: 84,
  unlimited: false,
  bottleneck: 'Préparation Signature',
  state: 'available',
  count: null,
  basis: 'recipe',
  ingredients: [
    {
      name: 'Préparation Signature',
      kind: 'preparation',
      required_per_sale: 1,
      required_unit: 'unit',
      available: 84,
      available_unit: 'unit',
      capacity: 84,
      limiting: true,
    },
    {
      name: 'Cheddar',
      kind: 'stock',
      required_per_sale: 20,
      required_unit: 'g',
      available: 2,
      available_unit: 'kg',
      capacity: 100,
      limiting: false,
    },
  ],
};

test('shows the sales capacity and an auditable recipe breakdown', () => {
  const markup = renderToStaticMarkup(
    <LocaleProvider>
      <AvailabilityCapacityCard preview={preview} />
    </LocaleProvider>,
  );

  assert.match(markup, /Current sales capacity/);
  assert.match(markup, />84</);
  assert.match(markup, /sales possible/);
  assert.match(markup, /Préparation Signature/);
  assert.match(markup, /Cheddar/);
  assert.match(markup, /100/);
  assert.match(markup, /View calculation details/);
});

test('shows a useful error instead of an endless loading state', () => {
  const markup = renderToStaticMarkup(
    <LocaleProvider>
      <AvailabilityCapacityCard preview={null} failed />
    </LocaleProvider>,
  );

  assert.match(markup, /Capacity is temporarily unavailable/);
  assert.match(markup, /Unavailable/);
});
