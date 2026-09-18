import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSharedPrinterSimulationStations } from '@/lib/printing-routing';

test('home simulation creates two logical stations on one physical printer', () => {
  const stations = buildSharedPrinterSimulationStations('printer-u220', []);

  assert.deepEqual(stations.map((station) => station.name), ['PIZZA', 'BAR']);
  assert.deepEqual(
    stations.map((station) => station.primary_printer_id),
    ['printer-u220', 'printer-u220'],
  );
  assert.ok(stations.every((station) => station.receives_full_order === false));
  assert.ok(stations.every((station) => station.show_table === true));
  assert.ok(stations.every((station) => station.show_order_type === true));
  assert.ok(stations.every((station) => station.ticket_split_mode === 'grouped'));
});

test('home simulation is idempotent and preserves existing stations', () => {
  const stations = buildSharedPrinterSimulationStations('printer-u220', [
    { name: ' Pizza ' },
  ]);

  assert.deepEqual(stations.map((station) => station.name), ['BAR']);
});
