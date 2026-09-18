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

test('printing becomes ready when a tested station covers every category', () => {
  assert.equal(isPrintingConfigurationReady({
    printers: [testedPrinter],
    stations: [station],
    categoryIds: [1, 2],
    routingRules: [
      { station_id: station.id, component_type: 'category', category_id: 1 },
      { station_id: station.id, component_type: 'category', category_id: 2 },
    ],
  }), true);
});

test('a full-order station covers every category', () => {
  assert.equal(isPrintingConfigurationReady({
    printers: [testedPrinter],
    stations: [{ ...station, receives_full_order: true }],
    categoryIds: [1, 2],
    routingRules: [],
  }), true);
});

test('printing stays off until the printer is tested and every category is routed', () => {
  assert.equal(isPrintingConfigurationReady({
    printers: [{ ...testedPrinter, last_test_succeeded_at: undefined }],
    stations: [station],
    categoryIds: [1, 2],
    routingRules: [{ station_id: station.id, component_type: 'category', category_id: 1 }],
  }), false);

  assert.equal(isPrintingConfigurationReady({
    printers: [testedPrinter],
    stations: [station],
    categoryIds: [1, 2],
    routingRules: [{ station_id: station.id, component_type: 'category', category_id: 1 }],
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
    categoryIds: [1, 2],
    routingRules: [
      { station_id: station.id, component_type: 'category', category_id: 1 },
      { station_id: untestedStation.id, component_type: 'category', category_id: 2 },
    ],
  }), false);
});
