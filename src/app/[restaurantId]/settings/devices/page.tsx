'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Cable,
  CircleAlert,
  Clock3,
  MonitorSmartphone,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import {
  listPrintAgents,
  listPrinterConfigurations,
  listPrinterProfiles,
  testPrinter,
  updatePrinter,
  type PrintAgent,
  type PrinterConfiguration,
  type PrinterProfile,
} from '@/lib/api';
import {
  buildManagedDevices,
  type ManagedDevice,
  type ManagedDeviceKind,
  type ManagedDeviceStatus,
} from '@/lib/device-management';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  Field,
  Input,
  PageHead,
  Select,
  Table,
  TableShell,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ds';
import Modal from '@/components/Modal';

type TypeFilter = 'all' | ManagedDeviceKind;
type StatusFilter = 'all' | ManagedDeviceStatus;

const STATUS_TONES: Record<ManagedDeviceStatus, 'success' | 'neutral' | 'warning' | 'danger'> = {
  online: 'success',
  offline: 'neutral',
  attention: 'danger',
  unconfigured: 'warning',
};

export default function DeviceManagementPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { locale, t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManagePrinters = hasAnyPermission('printers.manage');
  const canManagePosAccess = hasAnyPermission('shifts.manage');
  const [agents, setAgents] = useState<PrintAgent[]>([]);
  const [printers, setPrinters] = useState<PrinterConfiguration[]>([]);
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showConnectHelp, setShowConnectHelp] = useState(false);
  const [printerName, setPrinterName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [testingPrinter, setTestingPrinter] = useState(false);

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [knownAgents, physicalPrinters, savedProfiles] = await Promise.all([
        listPrintAgents(rid),
        listPrinterConfigurations(rid),
        listPrinterProfiles(rid),
      ]);
      setAgents(knownAgents);
      setPrinters(physicalPrinters);
      setProfiles(savedProfiles);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('deviceManagementLoadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rid, t]);

  useEffect(() => { void load(true); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(false), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const devices = useMemo(
    () => buildManagedDevices({ agents, printers, profiles }),
    [agents, printers, profiles],
  );
  const selected = useMemo(
    () => devices.find((device) => device.id === selectedId) ?? null,
    [devices, selectedId],
  );

  useEffect(() => {
    setPrinterName(selected?.kind === 'printer' ? selected.name : '');
  }, [selected?.id, selected?.kind, selected?.name]);

  const filteredDevices = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    return devices.filter((device) => {
      if (typeFilter !== 'all' && device.kind !== typeFilter) return false;
      if (statusFilter !== 'all' && device.status !== statusFilter) return false;
      if (!query) return true;
      return [device.name, device.model, device.platform, device.host, ...device.profileNames]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase(locale).includes(query));
    });
  }, [devices, locale, search, statusFilter, typeFilter]);

  const dateTime = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );
  const onlineCount = devices.filter((device) => device.status === 'online').length;
  const attentionCount = devices.filter((device) => device.status === 'attention').length;
  const posCount = devices.filter((device) => device.kind === 'pos').length;
  const printerCount = devices.filter((device) => device.kind === 'printer').length;

  const renameSelectedPrinter = async () => {
    if (!selected || selected.kind !== 'printer' || !printerName.trim()) return;
    setSavingName(true);
    setError(null);
    try {
      const printerId = selected.printerIds[0];
      const updated = await updatePrinter(rid, printerId, { name: printerName.trim() });
      setPrinters((current) => current.map((printer) =>
        printer.id === updated.id ? { ...printer, ...updated } : printer,
      ));
      setNotice(t('deviceManagementRenameSuccess'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('deviceManagementRenameError'));
    } finally {
      setSavingName(false);
    }
  };

  const testSelectedPrinter = async () => {
    if (!selected || selected.kind !== 'printer') return;
    setTestingPrinter(true);
    setError(null);
    try {
      await testPrinter(rid, selected.printerIds[0], locale);
      setNotice(t('deviceManagementTestQueued'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('deviceManagementTestError'));
    } finally {
      setTestingPrinter(false);
    }
  };

  return (
    <div className="max-w-[1320px]">
      <PageHead
        title={t('deviceManagementTitle')}
        desc={t('deviceManagementDesc')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="md" asChild>
              <Link href={`/${rid}/settings/printers`}><Settings2 />{t('printerProfilesTitle')}</Link>
            </Button>
            <Button variant="primary" size="md" onClick={() => setShowConnectHelp(true)}>
              <Plus />{t('deviceManagementAdd')}
            </Button>
          </div>
        }
      />

      {notice && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-r-md border border-[var(--success-500)]/30 bg-[var(--success-50)] px-4 py-3 text-fs-sm text-[var(--success-500)]">
          <span>{notice}</span>
          <button type="button" className="font-semibold" onClick={() => setNotice(null)}>{t('close')}</button>
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-r-md border border-[var(--danger-500)]/30 bg-[var(--danger-50)] px-4 py-3 text-fs-sm text-[var(--danger-500)]">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 border-y border-[var(--line)] md:grid-cols-4">
        <InventoryMetric label={t('deviceManagementAll')} value={devices.length} icon={<MonitorSmartphone />} />
        <InventoryMetric label={t('deviceManagementOnline')} value={onlineCount} icon={<Wifi />} />
        <InventoryMetric label={t('deviceManagementPosDevices')} value={posCount} icon={<MonitorSmartphone />} />
        <InventoryMetric
          label={attentionCount ? t('deviceManagementNeedsAttention') : t('deviceManagementPrinters')}
          value={attentionCount || printerCount}
          icon={attentionCount ? <CircleAlert /> : <Printer />}
          danger={attentionCount > 0}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:max-w-[420px]">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('deviceManagementSearch')}
            className="ps-10"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)} className="sm:w-48">
            <option value="all">{t('deviceManagementTypeAll')}</option>
            <option value="pos">{t('deviceManagementPosDevices')}</option>
            <option value="printer">{t('deviceManagementPrinters')}</option>
          </Select>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="sm:w-48">
            <option value="all">{t('deviceManagementStatusAll')}</option>
            <option value="online">{t('deviceStatusOnline')}</option>
            <option value="offline">{t('deviceStatusOffline')}</option>
            <option value="attention">{t('deviceStatusAttention')}</option>
            <option value="unconfigured">{t('deviceStatusUnconfigured')}</option>
          </Select>
        </div>
        <Button variant="ghost" size="md" onClick={() => void load(false)} disabled={refreshing}>
          <RefreshCw className={refreshing ? 'animate-spin' : ''} />{t('refresh')}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 border-y border-[var(--line)] py-20 text-fs-sm text-[var(--fg-muted)]">
          <RefreshCw className="h-4 w-4 animate-spin" />{t('loading')}
        </div>
      ) : devices.length === 0 ? (
        <div className="border-y border-[var(--line)] py-8">
          <EmptyState
            icon={<MonitorSmartphone />}
            title={t('deviceManagementEmptyTitle')}
            desc={t('deviceManagementEmptyDesc')}
            action={<Button variant="primary" onClick={() => setShowConnectHelp(true)}><Plus />{t('deviceManagementAdd')}</Button>}
          />
        </div>
      ) : (
        <>
          <TableShell className="overflow-x-auto">
            <Table className="min-w-[980px]">
              <Thead>
                <Tr>
                  <Th>{t('name')}</Th>
                  <Th>{t('deviceManagementType')}</Th>
                  <Th>{t('status')}</Th>
                  <Th>{t('deviceManagementConnection')}</Th>
                  <Th>{t('deviceLastActive')}</Th>
                  <Th>{t('printerProfilesTitle')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredDevices.map((device) => (
                  <Tr key={device.id} className="cursor-pointer" onClick={() => setSelectedId(device.id)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <DeviceIcon kind={device.kind} />
                        <div className="min-w-0">
                          <button type="button" className="font-semibold underline-offset-4 hover:underline" onClick={() => setSelectedId(device.id)}>
                            {device.name}
                          </button>
                          <div className="mt-0.5 text-fs-xs text-[var(--fg-muted)]">{device.model || device.platform || '—'}</div>
                        </div>
                      </div>
                    </Td>
                    <Td>{device.kind === 'pos' ? t('deviceTypePos') : t('deviceTypePrinter')}</Td>
                    <Td><DeviceStatusBadge status={device.status} t={t} /></Td>
                    <Td>
                      <div className="text-fs-xs">
                        {device.kind === 'printer'
                          ? [device.host, device.port].filter(Boolean).join(':') || t('deviceManagementLocalConnection')
                          : device.printerNames.length
                            ? `${device.printerNames.length} ${t('deviceManagementLinkedPrinters')}`
                            : t('deviceManagementNoLinkedPrinter')}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-fs-xs text-[var(--fg-muted)]">
                      {formatDate(device.lastSeenAt, dateTime, t('never'))}
                    </Td>
                    <Td>
                      {device.profileNames.length ? (
                        <div className="flex max-w-[280px] flex-wrap gap-1">
                          {device.profileNames.map((profile) => <Badge key={profile}>{profile}</Badge>)}
                        </div>
                      ) : <span className="text-fs-xs text-[var(--fg-subtle)]">{t('deviceManagementNoProfile')}</span>}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableShell>
          {filteredDevices.length === 0 && (
            <div className="py-12 text-center text-fs-sm text-[var(--fg-muted)]">{t('deviceManagementNoResults')}</div>
          )}
        </>
      )}

      <Drawer
        open={selected !== null}
        onOpenChange={(open) => { if (!open) setSelectedId(null); }}
        title={selected?.name ?? ''}
        subtitle={selected ? (selected.kind === 'pos' ? t('deviceTypePos') : t('deviceTypePrinter')) : undefined}
        width={640}
        primaryAction={selected?.kind === 'printer' && canManagePrinters ? (
          <Button variant="secondary" size="sm" onClick={() => void testSelectedPrinter()} disabled={testingPrinter}>
            <Printer />{testingPrinter ? t('printerTestSending') : t('printerTestTicket')}
          </Button>
        ) : undefined}
      >
        {selected && (
          <div className="space-y-7">
            <section>
              <div className="flex items-center gap-3 border-b border-[var(--line)] pb-5">
                <DeviceIcon kind={selected.kind} large />
                <div className="min-w-0 flex-1">
                  <div className="text-fs-lg font-semibold">{selected.name}</div>
                  <div className="mt-1 text-fs-xs text-[var(--fg-muted)]">{selected.model || selected.platform || t('deviceManagementUnknownModel')}</div>
                </div>
                <DeviceStatusBadge status={selected.status} t={t} />
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-fs-md font-semibold">{t('deviceManagementDetails')}</h3>
              <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
                <DetailRow icon={<Clock3 />} label={t('deviceLastActive')} value={formatDate(selected.lastSeenAt, dateTime, t('never'))} />
                {selected.kind === 'printer' ? (
                  <>
                    <DetailRow icon={<Cable />} label={t('deviceManagementConnection')} value={[selected.host, selected.port].filter(Boolean).join(':') || t('deviceManagementLocalConnection')} />
                    <DetailRow icon={<Wifi />} label={t('deviceManagementProtocol')} value={selected.protocol?.toUpperCase() || '—'} />
                  </>
                ) : (
                  <DetailRow icon={<Printer />} label={t('deviceManagementLinkedPrinters')} value={selected.printerNames.join(', ') || t('deviceManagementNoLinkedPrinter')} />
                )}
              </div>
              {selected.lastError && (
                <div className="mt-3 rounded-r-md bg-[var(--danger-50)] px-4 py-3 text-fs-xs text-[var(--danger-500)]">{selected.lastError}</div>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-fs-md font-semibold">{t('printerProfilesTitle')}</h3>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/${rid}/settings/printers`}>{t('deviceManagementManageProfiles')}</Link>
                </Button>
              </div>
              <div className="border-y border-[var(--line)] py-3">
                {selected.profileNames.length
                  ? <div className="flex flex-wrap gap-2">{selected.profileNames.map((profile) => <Badge key={profile} tone="brand">{profile}</Badge>)}</div>
                  : <p className="text-fs-sm text-[var(--fg-muted)]">{t('deviceManagementNoProfile')}</p>}
              </div>
            </section>

            {selected.kind === 'printer' && canManagePrinters && (
              <section>
                <h3 className="mb-3 text-fs-md font-semibold">{t('deviceManagementRenamePrinter')}</h3>
                <div className="flex items-end gap-3">
                  <Field label={t('name')} grow>
                    <Input value={printerName} maxLength={120} onChange={(event) => setPrinterName(event.target.value)} />
                  </Field>
                  <Button
                    variant="primary"
                    size="md"
                    disabled={savingName || !printerName.trim() || printerName.trim() === selected.name}
                    onClick={() => void renameSelectedPrinter()}
                  >
                    {savingName ? t('saving') : t('save')}
                  </Button>
                </div>
              </section>
            )}

            {selected.kind === 'pos' && canManagePosAccess && (
              <section className="rounded-r-lg border border-[var(--line)] bg-[var(--surface-2)] p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--fg-muted)]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-fs-sm font-semibold">{t('posAccess')}</div>
                    <p className="mt-1 text-fs-xs text-[var(--fg-muted)]">{t('deviceManagementPosAccessHint')}</p>
                    <Button variant="secondary" size="sm" className="mt-3" asChild>
                      <Link href={`/${rid}/staff/devices`}>{t('deviceManagementManagePosAccess')}</Link>
                    </Button>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </Drawer>

      {showConnectHelp && (
        <Modal
          title={t('deviceManagementAddTitle')}
          subtitle={t('deviceManagementAddSubtitle')}
          icon={<MonitorSmartphone />}
          size="lg"
          onClose={() => setShowConnectHelp(false)}
          footer={<div className="flex justify-end"><Button onClick={() => setShowConnectHelp(false)}>{t('done')}</Button></div>}
        >
          <ol className="space-y-5">
            <ConnectStep number="1" title={t('deviceManagementAddStep1')} desc={t('deviceManagementAddStep1Desc')} />
            <ConnectStep number="2" title={t('deviceManagementAddStep2')} desc={t('deviceManagementAddStep2Desc')} />
            <ConnectStep number="3" title={t('deviceManagementAddStep3')} desc={t('deviceManagementAddStep3Desc')} />
          </ol>
          {canManagePosAccess && (
            <Button variant="secondary" size="md" className="mt-6" asChild>
              <Link href={`/${rid}/staff/devices`}>{t('deviceManagementManagePosAccess')}</Link>
            </Button>
          )}
        </Modal>
      )}
    </div>
  );
}

function InventoryMetric({ label, value, icon, danger = false }: { label: string; value: number; icon: React.ReactNode; danger?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-e border-[var(--line)] px-4 py-4 last:border-e-0 md:px-5">
      <div className={danger ? 'text-[var(--danger-500)]' : 'text-[var(--fg-muted)]'}>{icon}</div>
      <div>
        <div className={danger ? 'text-fs-xl font-semibold tabular-nums text-[var(--danger-500)]' : 'text-fs-xl font-semibold tabular-nums'}>{value}</div>
        <div className="text-fs-xs text-[var(--fg-muted)]">{label}</div>
      </div>
    </div>
  );
}

function DeviceIcon({ kind, large = false }: { kind: ManagedDeviceKind; large?: boolean }) {
  const Icon = kind === 'pos' ? MonitorSmartphone : Printer;
  return (
    <div className={`grid shrink-0 place-items-center rounded-r-md bg-[var(--surface-2)] text-[var(--fg-muted)] ${large ? 'h-12 w-12' : 'h-9 w-9'}`}>
      <Icon className={large ? 'h-5 w-5' : 'h-4 w-4'} />
    </div>
  );
}

function DeviceStatusBadge({ status, t }: { status: ManagedDeviceStatus; t: (key: string) => string }) {
  return <Badge tone={STATUS_TONES[status]} dot>{t(`deviceStatus${status[0].toUpperCase()}${status.slice(1)}`)}</Badge>;
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[32px_150px_minmax(0,1fr)] items-center gap-3 py-3 text-fs-sm">
      <span className="text-[var(--fg-subtle)] [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <span className="text-[var(--fg-muted)]">{label}</span>
      <span className="break-words font-medium">{value}</span>
    </div>
  );
}

function ConnectStep({ number, title, desc }: { number: string; title: string; desc: string }) {
  return (
    <li className="grid grid-cols-[36px_minmax(0,1fr)] gap-3">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface-2)] text-fs-sm font-semibold">{number}</span>
      <div>
        <div className="text-fs-sm font-semibold">{title}</div>
        <p className="mt-1 text-fs-xs leading-relaxed text-[var(--fg-muted)]">{desc}</p>
      </div>
    </li>
  );
}

function formatDate(value: string | undefined, formatter: Intl.DateTimeFormat, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : formatter.format(date);
}
