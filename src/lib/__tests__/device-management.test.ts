import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrintAgent, PrinterConfiguration, PrinterProfile } from '@/lib/api';
import { buildManagedDevices } from '@/lib/device-management';

const agent: PrintAgent = {
  id: 'agent-1',
  restaurant_id: 19,
  spooler_id: 'ipad-kitchen',
  name: 'iPad cuisine',
  platform: 'ios',
  model: 'iPad',
  last_seen_at: '2026-09-22T20:00:00.000Z',
  printer_ids: ['printer-1'],
};

const printer: PrinterConfiguration = {
  id: 'printer-1',
  restaurant_id: 19,
  name: 'Cuisine chaude',
  identifier: 'epson-1',
  vendor: 'epson',
  model: 'Epson TM-U220II',
  profile: 'tm_u220iib',
  host: '192.168.1.150',
  port: 9100,
  use_https: false,
  device_id: 'local_printer',
  compatibility_port: 0,
  receives_receipts: false,
  receipt_order_types: [],
  receipt_copies: 1,
  protocol: 'spooler',
  enabled: true,
  status: 'online',
  last_seen_at: '2026-09-22T20:00:00.000Z',
  expected_poll_seconds: 5,
  offline_after_seconds: 30,
  paper_width_dots: 384,
};

const profile: PrinterProfile = {
  id: 'profile-1',
  restaurant_id: 19,
  name: 'Cuisine',
  job_types: ['dine_in_tickets'],
  dine_in_category_ids: [1],
  online_category_ids: [],
  auto_print_new_categories: true,
  one_item_per_ticket: false,
  print_recipient_information: true,
  hide_ticket_footer: true,
  ticket_margins: 'both',
  print_kitchen_names: true,
  combine_identical_items: false,
  ticket_layout: 'classic',
  font_size: 'medium',
  item_sort_order: 'default',
  copies: 1,
  enabled: true,
  assignments: [{
    id: 'assignment-1',
    device_id: agent.spooler_id,
    device_name: agent.name,
    printer_id: printer.id,
    printer_name: printer.name,
    printer_model: printer.model ?? '',
  }],
  created_at: '2026-09-22T19:00:00.000Z',
  updated_at: '2026-09-22T19:00:00.000Z',
};

test('buildManagedDevices links profiles to both the POS and physical printer', () => {
  const devices = buildManagedDevices({
    agents: [agent],
    printers: [printer],
    profiles: [profile],
    now: new Date('2026-09-22T20:00:30.000Z'),
  });

  assert.equal(devices.length, 2);
  assert.deepEqual(devices.find((device) => device.kind === 'pos')?.profileNames, ['Cuisine']);
  assert.deepEqual(devices.find((device) => device.kind === 'printer')?.profileNames, ['Cuisine']);
  assert.deepEqual(devices.find((device) => device.kind === 'pos')?.printerNames, ['Cuisine chaude']);
});

test('buildManagedDevices marks a stale POS heartbeat offline', () => {
  const [device] = buildManagedDevices({
    agents: [agent],
    printers: [],
    profiles: [],
    now: new Date('2026-09-22T20:01:01.000Z'),
  });

  assert.equal(device.status, 'offline');
});

test('buildManagedDevices exposes disabled and errored printers accurately', () => {
  const devices = buildManagedDevices({
    agents: [],
    printers: [
      { ...printer, id: 'disabled', enabled: false },
      { ...printer, id: 'error', status: 'error', last_error: 'Paper out' },
    ],
    profiles: [],
  });

  assert.equal(devices.find((device) => device.id === 'printer:disabled')?.status, 'unconfigured');
  assert.equal(devices.find((device) => device.id === 'printer:error')?.status, 'attention');
});
