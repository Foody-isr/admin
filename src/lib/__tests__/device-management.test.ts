import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, type RestaurantDevice } from '@/lib/api';
import { buildManagedDevices, deviceForgetErrorMessage } from '@/lib/device-management';

const tablet: RestaurantDevice = {
  id: '11111111-1111-4111-8111-111111111111',
  restaurant_id: 19,
  kind: 'tablet',
  system_name: 'iPad cuisine',
  display_name: 'Caisse terrasse',
  manufacturer: 'Apple',
  model: 'iPad16,3',
  os_name: 'iPadOS',
  os_version: '26.2',
  battery_level: 72,
  battery_state: 'discharging',
  identifier: '11111111-1111-4111-8111-111111111111',
  status: 'online',
  last_seen_at: '2026-09-22T20:00:00.000Z',
  created_at: '2026-09-22T19:00:00.000Z',
  updated_at: '2026-09-22T20:00:00.000Z',
  capabilities: [],
  profile_names: ['Cuisine'],
  components: [{
    type: 'application',
    status: 'active',
    details: {
      application: 'foody_pos',
      installation_id: 'spooler-1',
      platform: 'ios',
      version: '1.1.6+20260924',
      last_active_at: '2026-09-22T20:00:00.000Z',
    },
  }],
  connections: [{
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'printer',
    system_name: 'Cuisine chaude',
    display_name: 'Imprimante pizza',
    status: 'online',
  }],
};

const printer: RestaurantDevice = {
  id: '22222222-2222-4222-8222-222222222222',
  restaurant_id: 19,
  kind: 'printer',
  system_name: 'Cuisine chaude',
  display_name: 'Imprimante pizza',
  manufacturer: 'epson',
  model: 'Epson TM-U220II',
  os_name: '',
  os_version: '',
  identifier: 'epson-1',
  status: 'online',
  last_seen_at: '2026-09-22T20:00:00.000Z',
  created_at: '2026-09-22T19:00:00.000Z',
  updated_at: '2026-09-22T20:00:00.000Z',
  capabilities: [{ type: 'printer', status: 'online' }],
  profile_names: ['Cuisine'],
  components: [
    { type: 'network', status: 'active', details: { ip_address: '192.168.1.150', port: 9100 } },
    { type: 'printer', status: 'online', details: { printer_id: 'legacy-printer-1', protocol: 'spooler', paper_width_dots: 384, enabled: true } },
  ],
  connections: [{
    id: tablet.id,
    kind: 'tablet',
    system_name: tablet.system_name,
    display_name: tablet.display_name,
    status: 'online',
  }],
};

test('buildManagedDevices preserves one physical identity and its capabilities', () => {
  const devices = buildManagedDevices({ devices: [tablet, printer] });

  assert.equal(devices.length, 2);
  assert.deepEqual(devices.find((device) => device.kind === 'tablet')?.profileNames, ['Cuisine']);
  assert.deepEqual(devices.find((device) => device.kind === 'printer')?.profileNames, ['Cuisine']);
  assert.deepEqual(devices.find((device) => device.kind === 'tablet')?.printerNames, ['Imprimante pizza']);
  assert.deepEqual(devices.find((device) => device.kind === 'printer')?.connectedDeviceNames, ['Caisse terrasse']);
  assert.equal(devices.find((device) => device.kind === 'tablet')?.deviceName, 'iPad cuisine');
  assert.equal(devices.find((device) => device.kind === 'tablet')?.displayName, 'Caisse terrasse');
  assert.equal(devices.find((device) => device.kind === 'tablet')?.platform, 'ios');
  assert.equal(devices.find((device) => device.kind === 'tablet')?.osName, 'iPadOS');
  assert.equal(devices.find((device) => device.kind === 'tablet')?.batteryLevel, 72);
  assert.deepEqual(devices.find((device) => device.kind === 'tablet')?.capabilities, []);
  assert.deepEqual(devices.find((device) => device.kind === 'tablet')?.applications, [{
    name: 'foody_pos',
    platform: 'ios',
    version: '1.1.6+20260924',
    status: 'active',
    lastActiveAt: '2026-09-22T20:00:00.000Z',
  }]);
  assert.equal(devices.find((device) => device.kind === 'printer')?.paperWidthDots, 384);
  assert.equal(devices.find((device) => device.kind === 'printer')?.printerResourceId, 'legacy-printer-1');
});

test('buildManagedDevices uses the server status and normalizes unknown', () => {
  const devices = buildManagedDevices({
    devices: [
      { ...tablet, id: 'offline', status: 'offline' },
      { ...printer, id: 'unknown', status: 'unknown' },
      { ...printer, id: 'error', status: 'attention' },
    ],
  });

  assert.equal(devices.find((device) => device.id === 'offline')?.status, 'offline');
  assert.equal(devices.find((device) => device.id === 'unknown')?.status, 'unconfigured');
  assert.equal(devices.find((device) => device.id === 'error')?.status, 'attention');
});

test('deviceForgetErrorMessage translates protected printer lifecycle failures', () => {
  const messages: Record<string, string> = {
    deviceManagementForgetGatewayError: 'Choose another gateway first.',
    deviceManagementForgetPendingJobsError: 'Finish the print jobs first.',
  };
  const t = (key: string) => messages[key] ?? key;

  assert.equal(
    deviceForgetErrorMessage(
      new ApiError('device operation failed', 400, 'printer is assigned as an Epson gateway'),
      'Could not forget the device.',
      t,
    ),
    messages.deviceManagementForgetGatewayError,
  );
  assert.equal(
    deviceForgetErrorMessage(
      new ApiError('device operation failed', 400, 'printer has unfinished print jobs'),
      'Could not forget the device.',
      t,
    ),
    messages.deviceManagementForgetPendingJobsError,
  );
});

test('deviceForgetErrorMessage does not expose unknown server details', () => {
  const fallback = 'Could not forget the device.';
  assert.equal(
    deviceForgetErrorMessage(
      new ApiError('device operation failed', 400, 'database connection refused'),
      fallback,
      (key) => key,
    ),
    fallback,
  );
});
