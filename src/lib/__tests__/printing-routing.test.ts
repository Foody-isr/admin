import assert from 'node:assert/strict';
import test from 'node:test';
import { isPrintingConfigurationReady } from '@/lib/printing-routing';

const testedPrinter = {
  id: 'printer-u220',
  enabled: true,
  last_test_succeeded_at: '2026-09-18T12:00:00Z',
};

const station = {
  id: 'station-pizza',
  enabled: true,
  primary_printer_id: testedPrinter.id,
  receives_full_order: false,
};

test('printing becomes ready when one category is routed to a tested station', () => {
  assert.equal(isPrintingConfigurationReady({
    printers: [testedPrinter],
    stations: [station],
    routingRules: [
      { station_id: station.id, component_type: 'category', category_id: 1 },
    ],
  }), true);
});

test('a full-order station covers every category', () => {
  assert.equal(isPrintingConfigurationReady({
    printers: [testedPrinter],
    stations: [{ ...station, receives_full_order: true }],
    routingRules: [],
  }), true);
});

test('printing stays off until the printer is tested and at least one route is saved', () => {
  assert.equal(isPrintingConfigurationReady({
    printers: [{ ...testedPrinter, last_test_succeeded_at: undefined }],
    stations: [station],
    routingRules: [{ station_id: station.id, component_type: 'category', category_id: 1 }],
  }), false);

  assert.equal(isPrintingConfigurationReady({
    printers: [testedPrinter],
    stations: [station],
    routingRules: [],
  }), false);
});

test('routes to an untested station do not activate printing', () => {
  const untestedStation = {
    ...station,
    id: 'station-bar',
    primary_printer_id: 'printer-bar',
  };
  assert.equal(isPrintingConfigurationReady({
    printers: [
      testedPrinter,
      { id: 'printer-bar', enabled: true, last_test_succeeded_at: undefined },
    ],
    stations: [station, untestedStation],
    routingRules: [
      { station_id: untestedStation.id, component_type: 'category', category_id: 2 },
    ],
  }), false);
});

test('an item override can activate printing without a category route', () => {
  assert.equal(isPrintingConfigurationReady({
    printers: [testedPrinter],
    stations: [station],
    routingRules: [{ station_id: station.id, component_type: 'item', menu_item_id: 42 }],
  }), true);
});
