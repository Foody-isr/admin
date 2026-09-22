import type {
  PrintAgent,
  PrinterConfiguration,
  PrinterProfile,
  PrinterStatus,
} from '@/lib/api';

export type ManagedDeviceKind = 'pos' | 'printer';
export type ManagedDeviceStatus = 'online' | 'offline' | 'attention' | 'unconfigured';

export interface ManagedDevice {
  id: string;
  kind: ManagedDeviceKind;
  name: string;
  status: ManagedDeviceStatus;
  model?: string;
  platform?: string;
  lastSeenAt?: string;
  profileNames: string[];
  printerIds: string[];
  printerNames: string[];
  host?: string;
  port?: number;
  protocol?: string;
  enabled?: boolean;
  lastError?: string;
}

export interface BuildManagedDevicesInput {
  agents: PrintAgent[];
  printers: PrinterConfiguration[];
  profiles: PrinterProfile[];
  now?: Date;
  agentOnlineWindowMs?: number;
}

const DEFAULT_AGENT_ONLINE_WINDOW_MS = 60_000;

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function printerStatus(status: PrinterStatus, enabled: boolean): ManagedDeviceStatus {
  if (!enabled || status === 'unknown') return 'unconfigured';
  if (status === 'error') return 'attention';
  return status;
}

/** Builds the single device inventory shown by Admin from POS heartbeats and printers. */
export function buildManagedDevices({
  agents,
  printers,
  profiles,
  now = new Date(),
  agentOnlineWindowMs = DEFAULT_AGENT_ONLINE_WINDOW_MS,
}: BuildManagedDevicesInput): ManagedDevice[] {
  const printerById = new Map(printers.map((printer) => [printer.id, printer]));
  const profileNamesByAgent = new Map<string, string[]>();
  const profileNamesByPrinter = new Map<string, string[]>();

  for (const profile of profiles) {
    for (const assignment of profile.assignments) {
      profileNamesByAgent.set(
        assignment.device_id,
        unique([...(profileNamesByAgent.get(assignment.device_id) ?? []), profile.name]),
      );
      profileNamesByPrinter.set(
        assignment.printer_id,
        unique([...(profileNamesByPrinter.get(assignment.printer_id) ?? []), profile.name]),
      );
    }
  }

  const posDevices = agents.map<ManagedDevice>((agent) => {
    const lastSeen = Date.parse(agent.last_seen_at);
    const online = Number.isFinite(lastSeen) && now.getTime() - lastSeen <= agentOnlineWindowMs;
    const linkedPrinters = agent.printer_ids
      .map((id) => printerById.get(id))
      .filter((printer): printer is PrinterConfiguration => Boolean(printer));
    return {
      id: `pos:${agent.spooler_id}`,
      kind: 'pos',
      name: agent.name,
      status: online ? 'online' : 'offline',
      model: agent.model,
      platform: agent.platform,
      lastSeenAt: agent.last_seen_at,
      profileNames: unique(profileNamesByAgent.get(agent.spooler_id) ?? []),
      printerIds: linkedPrinters.map((printer) => printer.id),
      printerNames: linkedPrinters.map((printer) => printer.name),
    };
  });

  const physicalPrinters = printers.map<ManagedDevice>((printer) => ({
    id: `printer:${printer.id}`,
    kind: 'printer',
    name: printer.name,
    status: printerStatus(printer.status, printer.enabled),
    model: printer.model,
    lastSeenAt: printer.last_seen_at,
    profileNames: unique([
      ...(profileNamesByPrinter.get(printer.id) ?? []),
      ...(printer.profiles ?? []).map((profile) => profile.name),
    ]),
    printerIds: [printer.id],
    printerNames: [printer.name],
    host: printer.host,
    port: printer.port,
    protocol: printer.protocol,
    enabled: printer.enabled,
    lastError: printer.last_error,
  }));

  return [...posDevices, ...physicalPrinters].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
  );
}
