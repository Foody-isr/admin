import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Printer } from 'lucide-react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrinterProfileJobSection } from '@/app/[restaurantId]/settings/printers/PrinterProfileJobSection';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test('printer job options render only while their type is active', () => {
  const activeMarkup = renderToStaticMarkup(
    <PrinterProfileJobSection
      type="receipts"
      title="Receipts"
      description="Print customer receipts."
      icon={Printer}
      active
      onToggle={() => undefined}
    >
      <p>Receipt settings</p>
    </PrinterProfileJobSection>,
  );

  assert.match(activeMarkup, /id="printer-profile-receipts-options"/);
  assert.match(activeMarkup, /aria-expanded="true"/);
  assert.match(activeMarkup, /Receipt settings/);

  const inactiveMarkup = renderToStaticMarkup(
    <PrinterProfileJobSection
      type="receipts"
      title="Receipts"
      description="Print customer receipts."
      icon={Printer}
      active={false}
      onToggle={() => undefined}
    >
      <p>Receipt settings</p>
    </PrinterProfileJobSection>,
  );

  assert.doesNotMatch(
    inactiveMarkup,
    /id="printer-profile-receipts-options"/,
  );
  assert.match(inactiveMarkup, /aria-expanded="false"/);
  assert.doesNotMatch(inactiveMarkup, /Receipt settings/);
});
