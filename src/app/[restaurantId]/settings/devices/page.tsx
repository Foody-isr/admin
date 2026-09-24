'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Filter,
  Globe2,
  MonitorSmartphone,
  MonitorUp,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import {
  forgetDevice,
  getRestaurant,
  listDevices,
  testPrinter,
  updateDeviceDisplayName,
  type RestaurantDevice,
} from '@/lib/api';
import {
  buildManagedDevices,
  deviceForgetErrorMessage,
  hasDeviceCapability,
  type ManagedDevice,
  type ManagedDeviceKind,
  type ManagedDeviceStatus,
} from '@/lib/device-management';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import {
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  EmptyState,
  Field,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
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

type TypeFilter = 'all' | 'pos' | 'printer';
type StatusFilter = 'all' | ManagedDeviceStatus;
type AppFilter = 'all' | 'foodypos' | 'foodyprint';
type SortKey = 'name' | 'status' | 'battery' | 'mode' | 'lastSeen' | 'displayName' | 'identifier';
type SortDirection = 'asc' | 'desc';
type ColumnId = 'status' | 'battery' | 'location' | 'mode' | 'lastSeen' | 'displayName' | 'identifier';

const COLUMN_IDS: ColumnId[] = ['status', 'battery', 'location', 'mode', 'lastSeen', 'displayName', 'identifier'];
const STATUS_TONES: Record<ManagedDeviceStatus, 'success' | 'neutral' | 'warning' | 'danger'> = {
  online: 'success',
  offline: 'neutral',
  attention: 'danger',
  unconfigured: 'warning',
};
const PAGE_SIZES = [10, 25, 50];

export default function DeviceManagementPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { locale, t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManagePrinters = hasAnyPermission('printers.manage');
  const canManagePosAccess = hasAnyPermission('shifts.manage');
  const canManagePayments = hasAnyPermission('payments.manage');
  const canManageKitchen = hasAnyPermission('kitchen.manage');
  const canEditSettings = hasAnyPermission('settings.edit');
  const [inventory, setInventory] = useState<RestaurantDevice[]>([]);
  const [restaurantName, setRestaurantName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [appFilter, setAppFilter] = useState<AppFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('lastSeen');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnId, boolean>>({
    status: true,
    battery: true,
    location: true,
    mode: true,
    lastSeen: true,
    displayName: true,
    identifier: true,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConnectHelp, setShowConnectHelp] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [testingPrinter, setTestingPrinter] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<ManagedDevice[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [knownDevices, restaurant] = await Promise.all([
        listDevices(rid),
        getRestaurant(rid),
      ]);
      setInventory(knownDevices);
      setRestaurantName(restaurant.name);
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
    () => buildManagedDevices({ devices: inventory }),
    [inventory],
  );
  const selected = useMemo(
    () => devices.find((device) => device.id === selectedId) ?? null,
    [devices, selectedId],
  );
  const selectedDevices = useMemo(
    () => devices.filter((device) => selectedIds.has(device.id)),
    [devices, selectedIds],
  );
  const canManageDevice = useCallback((device: ManagedDevice) => {
    return device.capabilities.length > 0 && device.capabilities.every((capability) => {
      switch (capability) {
        case 'printer':
        case 'print_spooler': return canManagePrinters;
        case 'pos': return canManagePosAccess;
        case 'payment_terminal': return canManagePayments;
        case 'kitchen_display': return canManageKitchen;
        case 'customer_display': return canEditSettings;
      }
    });
  }, [canEditSettings, canManageKitchen, canManagePayments, canManagePosAccess, canManagePrinters]);

  useEffect(() => {
    setDisplayName(selected?.displayName ?? '');
  }, [selected?.displayName, selected?.id]);

  const filteredDevices = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    return devices.filter((device) => {
      if (typeFilter !== 'all' && !hasDeviceCapability(device, typeFilter)) return false;
      if (statusFilter !== 'all' && device.status !== statusFilter) return false;
      if (appFilter === 'foodypos' && !device.applicationNames.includes('foody_pos')) return false;
      if (appFilter === 'foodyprint' && !hasDeviceCapability(device, 'printer') && !hasDeviceCapability(device, 'print_spooler')) return false;
      if (!query) return true;
      return [device.deviceName, device.displayName, device.model, device.platform, device.host, device.identifier, ...device.profileNames]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase(locale).includes(query));
    });
  }, [appFilter, devices, locale, search, statusFilter, typeFilter]);

  const sortedDevices = useMemo(() => [...filteredDevices].sort((left, right) => {
    const comparison = compareDevices(left, right, sortKey, locale);
    return sortDirection === 'asc' ? comparison : -comparison;
  }), [filteredDevices, locale, sortDirection, sortKey]);

  useEffect(() => { setPage(0); }, [appFilter, pageSize, search, statusFilter, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(sortedDevices.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageDevices = sortedDevices.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const pageSelectedCount = pageDevices.filter((device) => selectedIds.has(device.id)).length;
  const allPageSelected = pageDevices.length > 0 && pageSelectedCount === pageDevices.length;
  const activeFilterCount = Number(typeFilter !== 'all') + Number(statusFilter !== 'all') + Number(appFilter !== 'all');
  const dateTime = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );

  const saveSelectedDisplayName = async () => {
    if (!selected) return;
    setSavingName(true);
    setError(null);
    try {
      const updated = await updateDeviceDisplayName(rid, selected.id, displayName.trim());
      setInventory((current) => current.map((device) => device.id === updated.id ? updated : device));
      setNotice(t('deviceManagementRenameSuccess'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('deviceManagementRenameError'));
    } finally {
      setSavingName(false);
    }
  };

  const testSelectedPrinter = async () => {
    if (!selected || !hasDeviceCapability(selected, 'printer') || !selected.printerResourceId) return;
    setTestingPrinter(true);
    setError(null);
    try {
      await testPrinter(rid, selected.printerResourceId, locale);
      setNotice(t('deviceManagementTestQueued'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('deviceManagementTestError'));
    } finally {
      setTestingPrinter(false);
    }
  };

  const forgetDevices = async () => {
    const targets = deleteTargets ?? [];
    if (!targets.length) return;
    setDeleting(true);
    setError(null);
    try {
      await Promise.all(targets.map((device) => forgetDevice(rid, device.id)));
      setSelectedId(null);
      setSelectedIds((current) => {
        const next = new Set(current);
        targets.forEach((device) => next.delete(device.id));
        return next;
      });
      setDeleteTargets(null);
      setNotice(t('deviceManagementForgetSuccess'));
      await load(false);
    } catch (cause) {
      setError(deviceForgetErrorMessage(cause, t('deviceManagementForgetError'), t));
    } finally {
      setDeleting(false);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const toggleDevice = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePage = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      pageDevices.forEach((device) => {
        if (allPageSelected) next.delete(device.id);
        else next.add(device.id);
      });
      return next;
    });
  };

  const resetFilters = () => {
    setTypeFilter('all');
    setStatusFilter('all');
    setAppFilter('all');
  };

  const columnLabels: Record<ColumnId, string> = {
    status: t('status'),
    battery: t('deviceManagementBattery'),
    location: t('deviceManagementLocation'),
    mode: t('deviceManagementActiveMode'),
    lastSeen: t('deviceManagementLastUpdated'),
    displayName: t('displayName'),
    identifier: t('deviceManagementIdentifier'),
  };

  return (
    <div className="min-w-0 max-w-[1560px] pb-4">
      <PageHead
        title={t('deviceManagementTitle')}
        className="mb-8"
        actions={
          <Button variant="primary" size="lg" onClick={() => setShowConnectHelp(true)}>
            <Plus />{t('deviceManagementAdd')}
          </Button>
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

      <div className="mb-6 flex items-center gap-3 overflow-x-auto pb-1">
        <div className="relative min-w-[260px] flex-1 lg:max-w-[380px]">
          <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--fg-subtle)]" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('deviceManagementSearch')} className="h-11 rounded-r-lg ps-12" />
        </div>
        <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-11 w-auto min-w-40 rounded-r-lg">
          <option value="all">{t('deviceManagementStatusAll')}</option>
          <option value="online">{t('deviceStatusOnline')}</option>
          <option value="offline">{t('deviceStatusOffline')}</option>
          <option value="attention">{t('deviceStatusAttention')}</option>
          <option value="unconfigured">{t('deviceStatusUnconfigured')}</option>
        </Select>
        <Select aria-label={t('deviceManagementLocation')} className="h-11 w-auto min-w-44 rounded-r-lg">
          <option>{t('deviceManagementLocationAll')}</option>
          {restaurantName && <option>{restaurantName}</option>}
        </Select>
        <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)} className="h-11 w-auto min-w-48 rounded-r-lg">
          <option value="all">{t('deviceManagementTypeAll')}</option>
          <option value="pos">{t('deviceManagementPosDevices')}</option>
          <option value="printer">{t('deviceManagementPrinters')}</option>
        </Select>
        <Select value={appFilter} onChange={(event) => setAppFilter(event.target.value as AppFilter)} className="h-11 w-auto min-w-52 rounded-r-lg">
          <option value="all">{t('deviceManagementAppsAll')}</option>
          <option value="foodypos">FoodyPOS</option>
          <option value="foodyprint">Foody Print</option>
        </Select>
        <Button variant="ghost" size="lg" icon className="relative shrink-0 rounded-full bg-[var(--surface-2)]" aria-label={t('deviceManagementFilters')} title={activeFilterCount ? t('reset') : t('deviceManagementFilters')} disabled={activeFilterCount === 0} onClick={resetFilters}>
          <Filter />
          {activeFilterCount > 0 && <span className="absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--brand-500)] px-1 text-[9px] text-white">{activeFilterCount}</span>}
        </Button>
        <ColumnMenu labels={columnLabels} visible={visibleColumns} onChange={setVisibleColumns} t={t} />
        <Button variant="ghost" size="lg" icon className="shrink-0 rounded-full" onClick={() => void load(false)} disabled={refreshing} aria-label={t('refresh')} title={t('refresh')}><RefreshCw className={refreshing ? 'animate-spin' : ''} /></Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 border-y border-[var(--line)] py-20 text-fs-sm text-[var(--fg-muted)]"><RefreshCw className="h-4 w-4 animate-spin" />{t('loading')}</div>
      ) : devices.length === 0 ? (
        <div className="border-y border-[var(--line)] py-8"><EmptyState icon={<MonitorSmartphone />} title={t('deviceManagementEmptyTitle')} desc={t('deviceManagementEmptyDesc')} action={<Button variant="primary" onClick={() => setShowConnectHelp(true)}><Plus />{t('deviceManagementAdd')}</Button>} /></div>
      ) : (
        <>
          <TableShell className="hidden overflow-x-auto rounded-none border-x-0 md:block">
            <Table className="min-w-[1120px]">
              <Thead className="[&_th]:bg-transparent [&_th]:py-5 [&_th]:text-fs-sm [&_th]:font-semibold [&_th]:normal-case [&_th]:tracking-normal [&_th]:text-[var(--fg)]">
                <Tr>
                  <Th className="w-12 px-3"><SelectionCheckbox checked={allPageSelected} indeterminate={pageSelectedCount > 0 && !allPageSelected} onChange={togglePage} label={t('selectAll')} /></Th>
                  <SortableHeader label={t('name')} column="name" active={sortKey} direction={sortDirection} onSort={toggleSort} />
                  {visibleColumns.status && <SortableHeader label={t('status')} column="status" active={sortKey} direction={sortDirection} onSort={toggleSort} />}
                  {visibleColumns.battery && <SortableHeader label={t('deviceManagementBattery')} column="battery" active={sortKey} direction={sortDirection} onSort={toggleSort} />}
                  {visibleColumns.location && <Th>{t('deviceManagementLocation')}</Th>}
                  {visibleColumns.mode && <SortableHeader label={t('deviceManagementActiveMode')} column="mode" active={sortKey} direction={sortDirection} onSort={toggleSort} />}
                  {visibleColumns.lastSeen && <SortableHeader label={t('deviceManagementLastUpdated')} column="lastSeen" active={sortKey} direction={sortDirection} onSort={toggleSort} />}
                  {visibleColumns.displayName && <SortableHeader label={t('displayName')} column="displayName" active={sortKey} direction={sortDirection} onSort={toggleSort} />}
                  {visibleColumns.identifier && <SortableHeader label={t('deviceManagementIdentifier')} column="identifier" active={sortKey} direction={sortDirection} onSort={toggleSort} />}
                </Tr>
              </Thead>
              <Tbody className="[&_td]:h-[92px] [&_td]:py-4">
                {pageDevices.map((device) => {
                  const primaryName = devicePrimaryName(device);
                  const displayName = deviceDisplayName(device);
                  return (
                    <Tr key={device.id} className="cursor-pointer" onClick={() => setSelectedId(device.id)}>
                      <Td className="w-12 px-3" onClick={(event) => event.stopPropagation()}><SelectionCheckbox checked={selectedIds.has(device.id)} onChange={() => toggleDevice(device.id)} label={`${t('select')} ${primaryName}`} /></Td>
                      <Td><div className="flex min-w-[190px] items-center gap-3"><DeviceIcon kind={device.kind} /><div className="min-w-0"><button type="button" className="text-start font-semibold underline underline-offset-4" onClick={() => setSelectedId(device.id)}>{primaryName}</button><div className="mt-1 text-fs-xs text-[var(--fg-muted)]">{deviceCapabilitySummary(device, t)}</div></div></div></Td>
                      {visibleColumns.status && <Td><DeviceStatusBadge status={device.status} t={t} /></Td>}
                      {visibleColumns.battery && <Td className="text-[var(--fg-subtle)]" title={t('deviceManagementBatteryUnavailable')}>—</Td>}
                      {visibleColumns.location && <Td className="min-w-[150px]">{restaurantName || '—'}</Td>}
                      {visibleColumns.mode && <Td className="min-w-[180px]">{device.profileNames.length ? <ProfileSummary names={device.profileNames} /> : <span className="text-[var(--fg-subtle)]">—</span>}</Td>}
                      {visibleColumns.lastSeen && <Td className="min-w-[180px] whitespace-nowrap">{formatDate(device.lastSeenAt, dateTime, t('never'))}</Td>}
                      {visibleColumns.displayName && <Td className="min-w-[170px]">{displayName || <span className="text-[var(--fg-subtle)]">—</span>}</Td>}
                      {visibleColumns.identifier && <Td className="max-w-[220px] break-all font-mono text-fs-xs">{device.identifier || <span className="text-[var(--fg-subtle)]">—</span>}</Td>}
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </TableShell>

          <div className="divide-y divide-[var(--line)] border-y border-[var(--line)] md:hidden">
            {pageDevices.map((device) => (
              <div key={device.id} className="flex gap-3 py-4" onClick={() => setSelectedId(device.id)}>
                <div onClick={(event) => event.stopPropagation()}><SelectionCheckbox checked={selectedIds.has(device.id)} onChange={() => toggleDevice(device.id)} label={`${t('select')} ${devicePrimaryName(device)}`} /></div>
                <DeviceIcon kind={device.kind} />
                <button type="button" className="min-w-0 flex-1 text-start"><span className="block font-semibold underline underline-offset-4">{devicePrimaryName(device)}</span><span className="mt-1 block text-fs-xs text-[var(--fg-muted)]">{deviceDisplayName(device) || deviceCapabilitySummary(device, t)}</span><span className="mt-2 block text-fs-xs text-[var(--fg-muted)]">{formatDate(device.lastSeenAt, dateTime, t('never'))}</span></button>
                <DeviceStatusBadge status={device.status} t={t} />
              </div>
            ))}
          </div>

          {sortedDevices.length === 0 && <div className="py-12 text-center text-fs-sm text-[var(--fg-muted)]">{t('deviceManagementNoResults')}</div>}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <label className="flex items-center gap-2 rounded-r-md border border-[var(--line-strong)] px-3 text-fs-sm text-[var(--fg-muted)]"><span>{t('deviceManagementResultsPerPage')}</span><Select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="w-16 border-0 bg-transparent px-1 font-semibold shadow-none">{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</Select></label>
            <div className="flex items-center gap-2"><span className="me-2 text-fs-xs text-[var(--fg-muted)]">{sortedDevices.length ? `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, sortedDevices.length)} / ${sortedDevices.length}` : '0 / 0'}</span><Button variant="ghost" size="lg" icon className="rounded-full bg-[var(--surface-2)]" disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} aria-label={t('previous')}><ChevronLeft /></Button><Button variant="ghost" size="lg" icon className="rounded-full bg-[var(--surface-2)]" disabled={safePage >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} aria-label={t('next')}><ChevronRight /></Button></div>
          </div>
        </>
      )}

      {selectedDevices.length > 0 && <SelectionBar devices={selectedDevices} canManageDevice={canManageDevice} canManagePosAccess={canManagePosAccess} rid={rid} t={t} onForget={setDeleteTargets} onReset={() => setSelectedIds(new Set())} />}

      <Drawer open={selected !== null} onOpenChange={(open) => { if (!open) setSelectedId(null); }} title={selected ? deviceDisplayName(selected) || devicePrimaryName(selected) : ''} subtitle={selected && deviceDisplayName(selected) ? devicePrimaryName(selected) : undefined} width={620} primaryAction={selected ? <DeviceActions device={selected} canManagePrinters={canManagePrinters} canManagePosAccess={canManagePosAccess} canManageDevice={canManageDevice(selected)} rid={rid} testing={testingPrinter} t={t} onTest={() => void testSelectedPrinter()} onForget={() => setDeleteTargets([selected])} /> : undefined}>
        {selected && <DeviceDrawerContent device={selected} devices={devices} dateTime={dateTime} restaurantName={restaurantName} canManageDevice={canManageDevice(selected)} canManagePosAccess={canManagePosAccess} displayName={displayName} savingName={savingName} rid={rid} t={t} onDisplayNameChange={setDisplayName} onRename={() => void saveSelectedDisplayName()} />}
      </Drawer>

      {showConnectHelp && (
        <Modal title={t('deviceManagementAddTitle')} subtitle={t('deviceManagementAddSubtitle')} icon={<MonitorSmartphone />} size="lg" onClose={() => setShowConnectHelp(false)} footer={<div className="flex justify-end"><Button onClick={() => setShowConnectHelp(false)}>{t('done')}</Button></div>}>
          <ol className="space-y-5"><ConnectStep number="1" title={t('deviceManagementAddStep1')} desc={t('deviceManagementAddStep1Desc')} /><ConnectStep number="2" title={t('deviceManagementAddStep2')} desc={t('deviceManagementAddStep2Desc')} /><ConnectStep number="3" title={t('deviceManagementAddStep3')} desc={t('deviceManagementAddStep3Desc')} /></ol>
          {canManagePosAccess && <Button variant="secondary" size="md" className="mt-6" asChild><Link href={`/${rid}/staff/devices`}>{t('deviceManagementManagePosAccess')}</Link></Button>}
        </Modal>
      )}

      <ConfirmDialog open={deleteTargets !== null} onOpenChange={(open) => { if (!open && !deleting) setDeleteTargets(null); }} title={t('deviceManagementForgetTitle')} description={deleteTargets ? `${t('deviceManagementForgetConfirm')} ${deleteTargets.map(devicePrimaryName).join(', ')}` : undefined} confirmLabel={deleting ? t('deviceManagementForgetting') : t('deviceManagementForget')} cancelLabel={t('cancel')} danger onConfirm={() => void forgetDevices()} />
    </div>
  );
}

function SortableHeader({ label, column, active, direction, onSort }: { label: string; column: SortKey; active: SortKey; direction: SortDirection; onSort: (column: SortKey) => void }) {
  const Icon = active !== column ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown;
  return <Th><button type="button" className="flex items-center gap-1.5 whitespace-nowrap" onClick={() => onSort(column)}>{label}<Icon className={active === column ? 'h-4 w-4 text-[var(--fg)]' : 'h-4 w-4 text-[var(--fg-subtle)]'} /></button></Th>;
}

function SelectionCheckbox({ checked, indeterminate = false, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label} className="h-5 w-5 cursor-pointer rounded border-[var(--line-strong)] accent-[var(--brand-500)]" />;
}

function ColumnMenu({ labels, visible, onChange, t }: { labels: Record<ColumnId, string>; visible: Record<ColumnId, boolean>; onChange: React.Dispatch<React.SetStateAction<Record<ColumnId, boolean>>>; t: (key: string) => string }) {
  return <Menu><MenuTrigger asChild><Button variant="ghost" size="lg" icon className="shrink-0 rounded-full bg-[var(--surface-2)]" aria-label={t('columns')} title={t('columns')}><SlidersHorizontal /></Button></MenuTrigger><MenuContent align="end"><MenuLabel>{t('deviceManagementVisibleColumns')}</MenuLabel>{COLUMN_IDS.map((column) => <MenuItem key={column} onSelect={(event) => { event.preventDefault(); onChange((current) => ({ ...current, [column]: !current[column] })); }}><span className={`grid h-4 w-4 place-items-center rounded border ${visible[column] ? 'border-[var(--brand-500)] bg-[var(--brand-500)] text-white' : 'border-[var(--line-strong)]'}`}>{visible[column] && <Check className="h-3 w-3" />}</span>{labels[column]}</MenuItem>)}</MenuContent></Menu>;
}

function SelectionBar({ devices, canManageDevice, canManagePosAccess, rid, t, onForget, onReset }: { devices: ManagedDevice[]; canManageDevice: (device: ManagedDevice) => boolean; canManagePosAccess: boolean; rid: number; t: (key: string) => string; onForget: (devices: ManagedDevice[]) => void; onReset: () => void }) {
  const hasPos = devices.some((device) => hasDeviceCapability(device, 'pos'));
  const canManageAll = devices.every(canManageDevice);
  return <div className="sticky bottom-4 z-30 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] px-5 py-4 shadow-3"><strong>{devices.length} {t('selected')}</strong><div className="flex items-center gap-2"><Menu><MenuTrigger asChild><Button variant="secondary" size="lg">{t('actions')}<ArrowUp /></Button></MenuTrigger><MenuContent align="end" side="top">{canManageAll && <MenuItem danger onSelect={() => onForget(devices)}><Trash2 />{t('deviceManagementForget')} ({devices.length})</MenuItem>}{hasPos && canManagePosAccess && <MenuItem asChild><Link href={`/${rid}/staff/devices`}><ShieldCheck />{t('deviceManagementManagePosAccess')}</Link></MenuItem>}</MenuContent></Menu><Button variant="ghost" size="lg" onClick={onReset}>{t('reset')}</Button></div></div>;
}

function DeviceActions({ device, canManagePrinters, canManagePosAccess, canManageDevice, rid, testing, t, onTest, onForget }: { device: ManagedDevice; canManagePrinters: boolean; canManagePosAccess: boolean; canManageDevice: boolean; rid: number; testing: boolean; t: (key: string) => string; onTest: () => void; onForget: () => void }) {
  const isPrinter = hasDeviceCapability(device, 'printer');
  const isPos = hasDeviceCapability(device, 'pos');
  return <Menu><MenuTrigger asChild><Button variant="secondary" size="sm">{t('actions')}<ArrowDown /></Button></MenuTrigger><MenuContent align="end">{isPrinter && canManagePrinters && <MenuItem disabled={testing} onSelect={onTest}><Printer />{testing ? t('printerTestSending') : t('printerTestTicket')}</MenuItem>}{isPrinter && <MenuItem asChild><Link href={`/${rid}/settings/printers`}><Settings2 />{t('deviceManagementManageProfiles')}</Link></MenuItem>}{isPos && canManagePosAccess && <MenuItem asChild><Link href={`/${rid}/staff/devices`}><ShieldCheck />{t('deviceManagementManagePosAccess')}</Link></MenuItem>}{canManageDevice && <><MenuSeparator /><MenuItem danger onSelect={onForget}><Trash2 />{t('deviceManagementForget')}</MenuItem></>}</MenuContent></Menu>;
}

function DeviceDrawerContent({ device, devices, dateTime, restaurantName, canManageDevice, canManagePosAccess, displayName, savingName, rid, t, onDisplayNameChange, onRename }: { device: ManagedDevice; devices: ManagedDevice[]; dateTime: Intl.DateTimeFormat; restaurantName: string; canManageDevice: boolean; canManagePosAccess: boolean; displayName: string; savingName: boolean; rid: number; t: (key: string) => string; onDisplayNameChange: (value: string) => void; onRename: () => void }) {
  const connected = device.connectedDeviceIds.map((id) => devices.find((candidate) => candidate.id === id)).filter((candidate): candidate is ManagedDevice => Boolean(candidate));
  const isPrinter = hasDeviceCapability(device, 'printer');
  const isPos = hasDeviceCapability(device, 'pos');
  return <div className="-m-[var(--s-5)]"><div className="px-[var(--s-5)] py-5"><p className="text-fs-sm text-[var(--fg-muted)]">{t('deviceManagementDataUpdated')} {formatDate(device.lastSeenAt, dateTime, t('never'))}</p><div className="mt-4"><DeviceStatusBadge status={device.status} t={t} /></div></div><DrawerSection title={t('deviceManagementConnectedDevices')}>{connected.length ? connected.map((candidate) => <div key={candidate.id} className="flex items-center gap-3 border-b border-[var(--line)] py-4 last:border-0"><DeviceIcon kind={candidate.kind} /><div className="min-w-0 flex-1"><div className="font-semibold">{devicePrimaryName(candidate)}</div><div className="mt-1 text-fs-xs text-[var(--fg-muted)]">{deviceDisplayName(candidate) || deviceCapabilitySummary(candidate, t)}</div></div><DeviceStatusBadge status={candidate.status} t={t} /></div>) : <p className="py-2 text-fs-sm text-[var(--fg-muted)]">{isPrinter ? t('deviceManagementNoConnectedDevices') : t('deviceManagementNoLinkedPrinter')}</p>}</DrawerSection><DrawerSection title={t('deviceManagementConnectivity')}><div className="flex items-center gap-3 py-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-r-md bg-[var(--surface-2)]"><Globe2 className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="font-semibold">{isPrinter ? t('deviceManagementNetwork') : (device.platform || deviceCapabilitySummary(device, t))}</div><div className="mt-1 text-fs-xs text-[var(--fg-muted)]">{isPrinter ? `${t('deviceManagementIpAddress')} ${[device.host, device.port].filter(Boolean).join(':') || '—'}` : `${t('deviceManagementLocation')}: ${restaurantName || '—'}`}</div></div>{device.status === 'online' && <Badge tone="success">{t('active')}</Badge>}</div></DrawerSection><DrawerSection title={isPrinter ? t('deviceManagementPrinterDetails') : t('deviceManagementDetails')}><Property label={t('deviceManagementType')} value={deviceCapabilitySummary(device, t)} /><Property label={t('name')} value={device.deviceName} /><Property label={t('displayName')} value={device.displayName || '—'} />{isPrinter && <Property label={t('deviceManagementPaperWidth')} value={formatPaperWidth(device.paperWidthDots, t('deviceManagementNotAvailable'))} />}<Property label={t('model')} value={device.model || t('deviceManagementUnknownModel')} />{device.vendor && <Property label={t('deviceManagementManufacturer')} value={device.vendor} />}{device.identifier && <Property label={t('deviceManagementIdentifier')} value={device.identifier} />}<Property label={t('deviceManagementActiveMode')} value={device.profileNames.join(', ') || t('deviceManagementNoProfile')} /></DrawerSection>{device.lastError && <div className="mx-[var(--s-5)] my-5 rounded-r-md bg-[var(--danger-50)] px-4 py-3 text-fs-xs text-[var(--danger-500)]">{device.lastError}</div>}{canManageDevice && <DrawerSection title={t('deviceManagementRenamePrinter')}><div className="flex items-end gap-3"><Field label={t('displayName')} grow><Input value={displayName} maxLength={120} onChange={(event) => onDisplayNameChange(event.target.value)} /></Field><Button variant="primary" size="md" disabled={savingName || displayName.trim() === device.displayName} onClick={onRename}>{savingName ? t('saving') : t('save')}</Button></div></DrawerSection>}{isPos && canManagePosAccess && <div className="border-t-8 border-[var(--surface-2)] px-[var(--s-5)] py-5"><div className="flex items-start gap-3 rounded-r-lg border border-[var(--line)] bg-[var(--surface-2)] p-4"><ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--fg-muted)]" /><div className="min-w-0 flex-1"><div className="text-fs-sm font-semibold">{t('posAccess')}</div><p className="mt-1 text-fs-xs text-[var(--fg-muted)]">{t('deviceManagementPosAccessHint')}</p><Button variant="secondary" size="sm" className="mt-3" asChild><Link href={`/${rid}/staff/devices`}>{t('deviceManagementManagePosAccess')}</Link></Button></div></div></div>}</div>;
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="border-t-8 border-[var(--surface-2)] px-[var(--s-5)] py-5"><h3 className="mb-3 text-fs-lg font-semibold">{title}</h3>{children}</section>; }
function Property({ label, value }: { label: string; value: string }) { return <div className="py-3"><div className="text-fs-sm font-semibold">{label}</div><div className="mt-1 break-words text-fs-sm text-[var(--fg-muted)]">{value}</div></div>; }
function DeviceIcon({ kind }: { kind: ManagedDeviceKind }) { const Icon = kind === 'pos' ? MonitorSmartphone : kind === 'printer' ? Printer : kind === 'payment_terminal' ? CreditCard : kind === 'kitchen_display' ? ChefHat : MonitorUp; return <div className="grid h-11 w-11 shrink-0 place-items-center rounded-r-md bg-[var(--surface-2)] text-[var(--fg)]"><Icon className="h-5 w-5" /></div>; }
function DeviceStatusBadge({ status, t }: { status: ManagedDeviceStatus; t: (key: string) => string }) { return <Badge tone={STATUS_TONES[status]} dot>{t(`deviceStatus${status[0].toUpperCase()}${status.slice(1)}`)}</Badge>; }
function ProfileSummary({ names }: { names: string[] }) { return <div className="flex max-w-[220px] flex-wrap gap-1"><Badge>{names[0]}</Badge>{names.length > 1 && <Badge>+{names.length - 1}</Badge>}</div>; }
function ConnectStep({ number, title, desc }: { number: string; title: string; desc: string }) { return <li className="grid grid-cols-[36px_minmax(0,1fr)] gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface-2)] text-fs-sm font-semibold">{number}</span><div><div className="text-fs-sm font-semibold">{title}</div><p className="mt-1 text-fs-xs leading-relaxed text-[var(--fg-muted)]">{desc}</p></div></li>; }

function devicePrimaryName(device: ManagedDevice): string { return device.deviceName; }
function deviceDisplayName(device: ManagedDevice): string { return device.displayName; }

function deviceCapabilitySummary(device: ManagedDevice, t: (key: string) => string): string {
  return device.capabilities.map((capability) => capability === 'print_spooler' ? 'Foody Print' : deviceTypeLabel(capability, t)).join(' · ');
}

function deviceTypeLabel(kind: ManagedDeviceKind, t: (key: string) => string): string {
  switch (kind) {
    case 'pos': return t('deviceTypePos');
    case 'printer': return t('deviceTypePrinter');
    case 'payment_terminal': return t('deviceTypePaymentTerminal');
    case 'kitchen_display': return t('deviceTypeKitchenDisplay');
    case 'customer_display': return t('deviceTypeCustomerDisplay');
  }
}

function compareDevices(left: ManagedDevice, right: ManagedDevice, key: SortKey, locale: string): number {
  const text = (a: string, b: string) => a.localeCompare(b, locale, { sensitivity: 'base', numeric: true });
  switch (key) {
    case 'name': return text(devicePrimaryName(left), devicePrimaryName(right));
    case 'status': return text(left.status, right.status);
    case 'mode': return text(left.profileNames.join(' '), right.profileNames.join(' '));
    case 'lastSeen': return (Date.parse(left.lastSeenAt ?? '') || 0) - (Date.parse(right.lastSeenAt ?? '') || 0);
    case 'displayName': return text(deviceDisplayName(left), deviceDisplayName(right));
    case 'identifier': return text(left.identifier ?? '', right.identifier ?? '');
    case 'battery': return 0;
  }
}

function formatPaperWidth(dots: number | undefined, fallback: string): string { if (!dots) return fallback; if (dots >= 560) return '80 mm'; if (dots >= 370) return '58 mm'; return `${dots} dots`; }
function formatDate(value: string | undefined, formatter: Intl.DateTimeFormat, fallback: string): string { if (!value) return fallback; const date = new Date(value); return Number.isNaN(date.getTime()) ? fallback : formatter.format(date); }
