import { ApiError, type DeviceKind, type DeviceStatus, type RestaurantDevice } from '@/lib/api';

export type ManagedDeviceKind = DeviceKind;
export type ManagedDeviceStatus = Exclude<DeviceStatus, 'unknown'>;

export interface ManagedDevice {
  id: string;
  kind: ManagedDeviceKind;
  deviceName: string;
  displayName: string;
  status: ManagedDeviceStatus;
  model?: string;
  platform?: string;
  lastSeenAt?: string;
  profileNames: string[];
  applicationNames: string[];
  printerResourceId?: string;
  printerIds: string[];
  printerNames: string[];
  connectedDeviceIds: string[];
  connectedDeviceNames: string[];
  host?: string;
  port?: number;
  protocol?: string;
  identifier?: string;
  vendor?: string;
  paperWidthDots?: number;
  enabled?: boolean;
  lastError?: string;
}

export interface BuildManagedDevicesInput {
  devices: RestaurantDevice[];
}

type Translate = (key: string) => string;

const FORGET_ERROR_KEYS: Record<string, string> = {
  'printer is assigned as an epson gateway': 'deviceManagementForgetGatewayError',
  'printer has unfinished print jobs': 'deviceManagementForgetPendingJobsError',
};

/** Converts protected printer lifecycle failures into actionable, localized copy. */
export function deviceForgetErrorMessage(error: unknown, fallback: string, t: Translate): string {
  if (error instanceof ApiError) {
    const detail = error.details?.trim().toLocaleLowerCase();
    const translationKey = detail ? FORGET_ERROR_KEYS[detail] : undefined;
    return translationKey ? t(translationKey) : fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

function stringDetail(details: Record<string, unknown>, key: string): string | undefined {
  const value = details[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberDetail(details: Record<string, unknown>, key: string): number | undefined {
  const value = details[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanDetail(details: Record<string, unknown>, key: string): boolean | undefined {
  const value = details[key];
  return typeof value === 'boolean' ? value : undefined;
}

function normalizedStatus(status: DeviceStatus): ManagedDeviceStatus {
  return status === 'unknown' ? 'unconfigured' : status;
}

/** Maps the server's physical-device inventory to the Square-style table view. */
export function buildManagedDevices({ devices }: BuildManagedDevicesInput): ManagedDevice[] {
  return devices.map<ManagedDevice>((device) => {
    const printer = device.components.find((component) => component.type === 'printer');
    const network = device.components.find((component) => component.type === 'network');
    const applications = device.components.filter((component) => component.type === 'application');
    const printerConnections = device.connections.filter((connection) => connection.kind === 'printer');
    return {
      id: device.id,
      kind: device.kind,
      deviceName: device.system_name,
      displayName: device.display_name?.trim() ?? '',
      status: normalizedStatus(device.status),
      model: device.model || undefined,
      platform: applications.map((application) => stringDetail(application.details, 'platform')).find(Boolean),
      lastSeenAt: device.last_seen_at,
      profileNames: device.profile_names ?? [],
      applicationNames: applications
        .map((application) => stringDetail(application.details, 'application'))
        .filter((application): application is string => Boolean(application)),
      printerResourceId: printer ? stringDetail(printer.details, 'printer_id') : undefined,
      printerIds: printerConnections.map((connection) => connection.id),
      printerNames: printerConnections.map((connection) => connection.display_name?.trim() || connection.system_name),
      connectedDeviceIds: device.connections.map((connection) => connection.id),
      connectedDeviceNames: device.connections.map((connection) => connection.display_name?.trim() || connection.system_name),
      host: network ? stringDetail(network.details, 'ip_address') : undefined,
      port: network ? numberDetail(network.details, 'port') : undefined,
      protocol: printer ? stringDetail(printer.details, 'protocol') : undefined,
      identifier: device.identifier || undefined,
      vendor: device.manufacturer || (printer ? stringDetail(printer.details, 'vendor') : undefined),
      paperWidthDots: printer ? numberDetail(printer.details, 'paper_width_dots') : undefined,
      enabled: printer ? booleanDetail(printer.details, 'enabled') : undefined,
      lastError: printer ? stringDetail(printer.details, 'last_error') : undefined,
    };
  }).sort((left, right) =>
    left.deviceName.localeCompare(right.deviceName, undefined, { sensitivity: 'base' }),
  );
}
