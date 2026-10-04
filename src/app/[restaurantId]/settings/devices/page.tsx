'use client';

import FoodyLogo from '@/components/brand/FoodyLogo';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  BatteryMedium,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Globe2,
  Filter,
  Laptop,
  MonitorSmartphone,
  MonitorUp,
  Plus,
  Printer,
  RefreshCw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Tablet,
  Trash2,
} from 'lucide-react';
import {
  cancelPendingPrintJobs,
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
  deviceManagementPermissions,
  checkedDeviceInventory,
  hasDeviceCapability,
  hasInstalledApplication,
  latestDeviceApplication,
  type ManagedDevice,
  type ManagedDeviceApplication,
  type ManagedDeviceKind,
  type ManagedDeviceStatus,
  deviceMatchesKind,
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

type TypeFilter = 'all' | ManagedDeviceKind;
type StatusFilter = 'all' | ManagedDeviceStatus;
type AppFilter = 'all' | 'foodypos';
type SortKey = 'name' | 'status' | 'battery' | 'application' | 'lastSeen' | 'displayName' | 'identifier';
type SortDirection = 'asc' | 'desc';
type ColumnId = 'status' | 'battery' | 'location' | 'lastApplication' | 'applications' | 'lastSeen' | 'displayName' | 'identifier';

const COLUMN_IDS: ColumnId[] = ['status', 'battery', 'location', 'lastApplication', 'applications', 'lastSeen', 'displayName', 'identifier'];
const STATUS_TONES: Record<ManagedDeviceStatus, 'success' | 'neutral' | 'warning' | 'danger'> = {
  online: 'success',
  offline: 'neutral',
  attention: 'danger',
  unconfigured: 'warning',
};
const PAGE_SIZES = [10, 25, 50];

/** Inspect physical devices without interrupting drafts or repeating uncertain hardware actions. */
export default function DeviceManagementPage() {
  const { restaurantId } = useParams();
  return <DeviceWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}
function DeviceWorkspace({ rid }: { rid: number }) {
  const { locale, t } = useI18n(), { hasAnyPermission } = usePermissions();
  const canManagePrinters = hasAnyPermission('printers.manage'), canManagePosAccess = hasAnyPermission('shifts.manage');
  const canManageDevice = (device: ManagedDevice) => { const permissions = deviceManagementPermissions(device); return permissions !== null && permissions.every(permission => hasAnyPermission(permission)); };
  const [inventory, setInventory] = useState<RestaurantDevice[]>([]), [restaurantName, setRestaurantName] = useState('');
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<{ key: string; count?: number; name?: string } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState(''), [typeFilter, setTypeFilter] = useState<TypeFilter>('all'), [statusFilter, setStatusFilter] = useState<StatusFilter>('all'), [appFilter, setAppFilter] = useState<AppFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('lastSeen'), [sortDirection, setSortDirection] = useState<SortDirection>('desc'), [page, setPage] = useState(0), [pageSize, setPageSize] = useState(10);
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnId, boolean>>({ status: true, battery: true, location: false, lastApplication: true, applications: false, lastSeen: true, displayName: false, identifier: false });
  const [selectedId, setSelectedId] = useState<string | null>(null), [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()), [showConnectHelp, setShowConnectHelp] = useState(false);
  const [rename, setRename] = useState<{ id: string; draft: string; initial: string; observed?: string } | null>(null), [leaveRename, setLeaveRename] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<ManagedDevice[] | null>(null), [queueTarget, setQueueTarget] = useState<ManagedDevice | null>(null);
  type Pending = { kind: 'rename'; id: string; name: string } | { kind: 'forget'; ids: string[]; protectedErrors: string[] } | { kind: 'queue' } | { kind: 'test' };
  const [pending, setPendingState] = useState<Pending | null>(null), [busy, setBusy] = useState(false), [readError, setReadError] = useState(false);
  const lock = useRef(false), pendingRef = useRef<Pending | null>(null), lifetime = useRef({ generation: 0, sequence: 0 });
  const setPending = (next: Pending | null) => { pendingRef.current = next; setPendingState(next); };
  const frozen = busy || !!pending, nameDirty = !!rename && rename.draft.trim() !== rename.initial;
  const readInventory = useCallback(async () => {
    const [rows, restaurant] = await Promise.all([listDevices(rid), getRestaurant(rid)]);
    if (restaurant.id !== rid) throw new Error('Incorrect restaurant');
    return { rows: checkedDeviceInventory(rows, rid), name: restaurant.name };
  }, [rid]);
  const applyInventory = useCallback((rows: RestaurantDevice[]) => { setInventory(rows); setSelectedIds(previous => new Set(Array.from(previous).filter(id => rows.some(row => row.id === id)))); }, []);
  const load = useCallback(async (initial = false) => {
    if (lock.current || pendingRef.current) return;
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    if (initial) setLoading(true); else setRefreshing(true);
    try { const result = await readInventory(); if (current()) { applyInventory(result.rows); setRestaurantName(result.name); setLoaded(true); setError(null); } }
    catch { if (current()) setError('deviceManagementLoadError'); }
    finally { if (current()) { setLoading(false); setRefreshing(false); } }
  }, [readInventory, applyInventory]);
  useEffect(() => { const current = lifetime.current; void load(true); const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30_000); return () => { current.generation++; window.clearInterval(timer); }; }, [load]);
  useEffect(() => { const unload = (event: BeforeUnloadEvent) => { if (nameDirty || lock.current || pendingRef.current) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload); }, [nameDirty]);
  const devices = useMemo(() => buildManagedDevices({ devices: inventory }), [inventory]);
  const renameDevice = devices.find(device => device.id === rename?.id), renameFrozen = frozen || !renameDevice || !canManageDevice(renameDevice);
  const selected = devices.find(device => device.id === selectedId) ?? null, selectedDevices = devices.filter(device => selectedIds.has(device.id));
  const sortedDevices = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    return devices.filter(device => (typeFilter === 'all' || deviceMatchesKind(device, typeFilter)) && (statusFilter === 'all' || device.status === statusFilter) && (appFilter === 'all' || hasInstalledApplication(device, 'foody_pos')) && (!query || [device.deviceName, device.displayName, device.model, device.osName, device.osVersion, device.platform, device.host, device.identifier, ...device.profileNames, ...device.applicationNames].some(value => value?.toLocaleLowerCase(locale).includes(query)))).sort((a, b) => (sortDirection === 'asc' ? 1 : -1) * compareDevices(a, b, sortKey, locale));
  }, [devices, typeFilter, statusFilter, appFilter, search, locale, sortDirection, sortKey]);
  useEffect(() => { setPage(0); }, [appFilter, pageSize, search, statusFilter, typeFilter]);
  const pageCount = Math.max(1, Math.ceil(sortedDevices.length / pageSize)), safePage = Math.min(page, pageCount - 1), pageDevices = sortedDevices.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const pageSelectedCount = pageDevices.filter(device => selectedIds.has(device.id)).length, allPageSelected = pageDevices.length > 0 && pageSelectedCount === pageDevices.length;
  const dateTime = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }), [locale]);
  const toggleDevice = (id: string) => setSelectedIds(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const togglePage = () => setSelectedIds(previous => { const next = new Set(previous); pageDevices.forEach(device => allPageSelected ? next.delete(device.id) : next.add(device.id)); return next; });
  const toggleSort = (key: SortKey) => { if (sortKey === key) setSortDirection(value => value === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDirection('asc'); } };
  const begin = () => { if (lock.current || pendingRef.current) return null; lock.current = true; lifetime.current.sequence++; setRefreshing(false); setBusy(true); setError(null); setNotice(null); setReadError(false); return lifetime.current.generation; };
  const finish = (generation: number) => { if (generation === lifetime.current.generation) { lock.current = false; setBusy(false); } };
  const saveName = async () => {
    const draft = rename, device = devices.find(row => row.id === draft?.id); if (!draft || !device || !canManageDevice(device) || !nameDirty) return;
    if (Array.from(draft.draft.trim()).length > 120) { setError('deviceNameTooLong'); return; }
    const generation = begin(); if (generation === null) return;
    try { const row = checkedDeviceInventory([await updateDeviceDisplayName(rid, draft.id, draft.draft.trim())], rid)[0]; if (row.id !== draft.id) throw new Error('Incorrect device'); if (generation === lifetime.current.generation) { setInventory(previous => previous.map(item => item.id === row.id ? row : item)); setRename(null); setNotice({ key: 'deviceManagementRenameSuccess' }); } }
    catch { if (generation === lifetime.current.generation) setPending({ kind: 'rename', id: draft.id, name: draft.draft.trim() }); }
    finally { finish(generation); }
  };
  const testSelectedPrinter = async () => {
    if (!selected?.printerResourceId || !hasDeviceCapability(selected, 'printer') || !canManagePrinters) return;
    const generation = begin(); if (generation === null) return;
    try { const job = await testPrinter(rid, selected.printerResourceId, locale); if (!job?.id || job.current_printer_id !== selected.printerResourceId || job.kind !== 'test') throw new Error('Incomplete test response'); if (generation === lifetime.current.generation) setNotice({ key: 'deviceManagementTestQueued' }); }
    catch { if (generation === lifetime.current.generation) setPending({ kind: 'test' }); }
    finally { finish(generation); }
  };
  const cancelQueue = async () => {
    const target = queueTarget; setQueueTarget(null); if (!target?.printerResourceId || !canManagePrinters) return;
    const generation = begin(); if (generation === null) return;
    try { const result = await cancelPendingPrintJobs(rid, target.printerResourceId); if (!Number.isSafeInteger(result.cancelled_count) || result.cancelled_count < 0 || !Array.isArray(result.cancelled_job_ids) || result.cancelled_count !== result.cancelled_job_ids.length) throw new Error('Incomplete cancellation response'); if (generation === lifetime.current.generation) { setNotice({ key: 'deviceQueueCancelled', count: result.cancelled_count }); try { const next = await readInventory(); if (generation === lifetime.current.generation) applyInventory(next.rows); } catch { if (generation === lifetime.current.generation) setError('deviceRefreshConfirmed'); } } }
    catch { if (generation === lifetime.current.generation) setPending({ kind: 'queue' }); }
    finally { finish(generation); }
  };
  const forgetSelected = async () => {
    const targets = deleteTargets; setDeleteTargets(null); if (!targets?.length || !targets.every(canManageDevice)) return;
    const generation = begin(); if (generation === null) return;
    const results = await Promise.allSettled(targets.map(device => forgetDevice(rid, device.id)));
    if (generation === lifetime.current.generation) {
      const confirmed = targets.filter((_, index) => results[index].status === 'fulfilled').map(device => device.id), failed = targets.filter((_, index) => results[index].status === 'rejected').map(device => device.id);
      const messages = results.flatMap(result => result.status === 'rejected' ? [deviceForgetErrorMessage(result.reason, '', key => key)].filter(Boolean) : []);
      setInventory(previous => previous.filter(row => !confirmed.includes(row.id))); setSelectedIds(previous => new Set(Array.from(previous).filter(id => !confirmed.includes(id))));
      if (confirmed.length) setNotice({ key: 'deviceForgetCount', count: confirmed.length });
      if (failed.length) setPending({ kind: 'forget', ids: failed, protectedErrors: Array.from(new Set(messages)) });
    }
    finish(generation);
  };
  const verify = async () => {
    const operation = pendingRef.current; if (!operation || lock.current || operation.kind === 'test') return;
    lock.current = true; lifetime.current.sequence++; setBusy(true); setReadError(false); const generation = lifetime.current.generation;
    try {
      const result = await readInventory(); if (generation !== lifetime.current.generation) return;
      applyInventory(result.rows); setRestaurantName(result.name); setPending(null); setError(null);
      if (operation.kind === 'rename') { const row = result.rows.find(device => device.id === operation.id); if (row?.display_name === operation.name) { setRename(null); setNotice({ key: 'deviceNameVerified' }); } else if (row) { setRename(previous => previous && previous.id === row.id ? { ...previous, observed: row.display_name } : previous); setNotice({ key: 'deviceNameDifferent', name: row.display_name || t('deviceNoAlias') }); } else { setRename(null); setNotice({ key: 'deviceNoLongerPresent' }); } }
      else if (operation.kind === 'forget') { const remaining = result.rows.filter(row => operation.ids.includes(row.id)).length; setNotice({ key: remaining ? 'deviceForgetRemaining' : 'deviceForgetAbsent', count: remaining }); }
      else setNotice({ key: 'deviceQueueRefreshed' });
    } catch { if (generation === lifetime.current.generation) setReadError(true); }
    finally { finish(generation); }
  };
  const closeRename = () => { if (lock.current) return; if (nameDirty || pending?.kind === 'rename') setLeaveRename(true); else setRename(null); };
  const message = notice ? t(notice.key).replace('{n}', String(notice.count ?? '')).replace('{name}', notice.name ?? '') : '';
  useEffect(() => {
    if (!error && !notice && !pending && !readError) return;
    const frame = window.requestAnimationFrame(() => {
      const target = Array.from(document.querySelectorAll<HTMLElement>('[data-device-feedback]')).reverse().find(element => !element.closest('[aria-hidden="true"]'));
      target?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [error, notice, pending, readError]);
  const feedback = <div data-device-feedback tabIndex={-1} className="space-y-3 outline-none">
    {error && <div role="alert" className="space-y-3 rounded-r-md border border-[var(--danger-500)] p-4 text-sm"><p>{t(error)}</p>{!frozen && !rename && <Button variant="secondary" disabled={refreshing} onClick={() => void load()}>{t('retry')}</Button>}</div>}
    {notice && <p role="status" className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]">{message}</p>}
    {pending && <div role="alert" className="space-y-3 rounded-r-md border border-[var(--danger-500)] p-4 text-sm leading-6"><p>{t(pending.kind === 'test' ? 'deviceTestUnconfirmed' : 'deviceChangeUnconfirmed')}</p>{pending.kind === 'forget' && pending.protectedErrors.map(key => <p key={key}>{t(key)}</p>)}{readError && <p>{t('deviceReadError')}</p>}{pending.kind === 'test' ? <Button type="button" variant="secondary" className="whitespace-normal py-2 leading-5" onClick={() => { setPending(null); setNotice({ key: 'deviceTestCheckAcknowledged' }); }}>{t('deviceTestChecked')}</Button> : <Button type="button" variant="secondary" disabled={busy} onClick={() => void verify()}>{t('deviceVerifyInventory')}</Button>}</div>}
  </div>;
  const columnLabels: Record<ColumnId, string> = { status: t('status'), battery: t('deviceManagementBattery'), location: t('deviceManagementLocation'), lastApplication: t('deviceManagementLastApplication'), applications: t('deviceManagementInstalledApplications'), lastSeen: t('deviceManagementLastUpdated'), displayName: t('displayName'), identifier: t('deviceManagementIdentifier') };
  const sortLabels: Record<SortKey, string> = { name: t('name'), status: t('status'), battery: columnLabels.battery, application: columnLabels.lastApplication, lastSeen: columnLabels.lastSeen, displayName: columnLabels.displayName, identifier: columnLabels.identifier };
  return <div className="mx-auto max-w-[1200px] space-y-6 pb-4">
    <PageHead title={t('deviceManagementTitle')} desc={t('deviceManagementDesc')} actions={<Button disabled={busy} onClick={() => setShowConnectHelp(true)}><Plus />{t('deviceManagementAdd')}</Button>} />
    {feedback}
    {loaded && <div className="flex flex-wrap items-center justify-between gap-4 rounded-r-lg bg-[var(--summary-bg)] p-5 text-[var(--summary-fg)]"><div><p className="font-semibold" dir="auto">{restaurantName}</p><p className="mt-1 text-sm">{t('deviceInventorySummary').replace('{n}', String(devices.length)).replace('{online}', String(devices.filter(device => device.status === 'online').length))}</p></div><p className="max-w-sm text-xs leading-5">{t('deviceAutoRefreshHint')}</p></div>}
    <div className="flex flex-wrap items-end gap-2"><Field label={t('deviceManagementSearch')} className="min-w-[200px] flex-1"><Input type="search" value={search} onChange={event => setSearch(event.target.value)} /></Field><Button variant="secondary" icon onClick={() => void load()} disabled={refreshing || frozen || loading} aria-label={t('refresh')}><RefreshCw className={refreshing ? 'animate-spin' : ''} /></Button><Button variant="secondary" className="md:hidden" aria-expanded={filtersOpen} aria-controls="device-filters" onClick={() => setFiltersOpen(value => !value)}><Filter />{t('deviceManagementFilters')}{[typeFilter !== 'all', statusFilter !== 'all', appFilter !== 'all'].filter(Boolean).length > 0 && ` · ${[typeFilter !== 'all', statusFilter !== 'all', appFilter !== 'all'].filter(Boolean).length}`}</Button></div>
    <div id="device-filters" className={`${filtersOpen ? 'grid' : 'hidden'} gap-4 sm:grid-cols-2 md:grid lg:grid-cols-3`}><Field label={t('status')}><Select value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)}><option value="all">{t('deviceManagementStatusAll')}</option>{(['online', 'offline', 'attention', 'unconfigured'] as const).map(value => <option key={value} value={value}>{t(`deviceStatus${value[0].toUpperCase()}${value.slice(1)}`)}</option>)}</Select></Field><Field label={t('deviceManagementType')}><Select value={typeFilter} onChange={event => setTypeFilter(event.target.value as TypeFilter)}><option value="all">{t('deviceManagementTypeAll')}</option>{(['tablet', 'phone', 'payment_terminal', 'printer', 'computer', 'display', 'unknown'] as const).map(value => <option key={value} value={value}>{deviceTypeLabel(value, t)}</option>)}</Select></Field><Field label={t('deviceManagementInstalledApplications')}><Select value={appFilter} onChange={event => setAppFilter(event.target.value as AppFilter)}><option value="all">{t('deviceManagementAppsAll')}</option><option value="foodypos">FoodyPOS</option></Select></Field></div>
    <div className={`${filtersOpen ? 'flex' : 'hidden'} flex-wrap items-end justify-between gap-3 md:flex`}><div className="flex min-w-0 flex-wrap items-end gap-2"><Field label={t('deviceSortBy')}><Select value={sortKey} onChange={event => setSortKey(event.target.value as SortKey)}>{Object.entries(sortLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field><Button variant="secondary" icon aria-label={t(sortDirection === 'asc' ? 'deviceSortDescending' : 'deviceSortAscending')} onClick={() => setSortDirection(value => value === 'asc' ? 'desc' : 'asc')}>{sortDirection === 'asc' ? <ArrowUp /> : <ArrowDown />}</Button></div><div className="flex flex-wrap gap-2">{(typeFilter !== 'all' || statusFilter !== 'all' || appFilter !== 'all' || search) && <Button variant="ghost" onClick={() => { setTypeFilter('all'); setStatusFilter('all'); setAppFilter('all'); setSearch(''); }}>{t('reset')}</Button>}<div className="hidden md:block"><ColumnMenu labels={columnLabels} visible={visibleColumns} onChange={setVisibleColumns} t={t} /></div></div></div>
    {loading ? <p role="status" className="py-12 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : !loaded ? null : devices.length === 0 ? <EmptyState icon={<MonitorSmartphone />} title={t('deviceManagementEmptyTitle')} desc={t('deviceManagementEmptyDesc')} /> : <>
      <TableShell className="hidden overflow-x-auto md:block"><Table className="min-w-[800px]"><Thead><Tr><Th className="w-12"><SelectionCheckbox checked={allPageSelected} indeterminate={pageSelectedCount > 0 && !allPageSelected} onChange={togglePage} label={t('selectAll')} /></Th><SortableHeader label={t('name')} column="name" active={sortKey} direction={sortDirection} onSort={toggleSort} />{visibleColumns.status && <SortableHeader label={t('status')} column="status" active={sortKey} direction={sortDirection} onSort={toggleSort} />}{visibleColumns.battery && <SortableHeader label={columnLabels.battery} column="battery" active={sortKey} direction={sortDirection} onSort={toggleSort} />}{visibleColumns.location && <Th>{columnLabels.location}</Th>}{visibleColumns.lastApplication && <SortableHeader label={columnLabels.lastApplication} column="application" active={sortKey} direction={sortDirection} onSort={toggleSort} />}{visibleColumns.applications && <Th>{columnLabels.applications}</Th>}{visibleColumns.lastSeen && <SortableHeader label={columnLabels.lastSeen} column="lastSeen" active={sortKey} direction={sortDirection} onSort={toggleSort} />}{visibleColumns.displayName && <SortableHeader label={columnLabels.displayName} column="displayName" active={sortKey} direction={sortDirection} onSort={toggleSort} />}{visibleColumns.identifier && <SortableHeader label={columnLabels.identifier} column="identifier" active={sortKey} direction={sortDirection} onSort={toggleSort} />}</Tr></Thead><Tbody>{pageDevices.map(device => <Tr key={device.id}><Td><SelectionCheckbox checked={selectedIds.has(device.id)} onChange={() => toggleDevice(device.id)} label={`${t('select')} ${device.deviceName}`} /></Td><Td className="min-w-[200px] max-w-[300px]"><div className="flex items-center gap-3"><DeviceIcon kind={device.kind} /><div className="min-w-0"><button type="button" disabled={busy} dir="auto" className="break-words text-start font-semibold text-[var(--brand-ink)] underline underline-offset-4" onClick={() => setSelectedId(device.id)}>{device.deviceName}</button><p dir="auto" className="mt-1 break-words text-xs text-[var(--fg-muted)]">{device.displayName || deviceCapabilitySummary(device, t)}</p></div></div></Td>{visibleColumns.status && <Td><div className="flex flex-col items-start gap-2"><DeviceStatusBadge status={device.status} t={t} /><PendingPrintJobsBadge count={device.pendingJobCount} t={t} /></div></Td>}{visibleColumns.battery && <Td><BatteryValue device={device} fallback={t('deviceManagementBatteryUnavailable')} /></Td>}{visibleColumns.location && <Td><bdi>{restaurantName || '—'}</bdi></Td>}{visibleColumns.lastApplication && <Td><ApplicationActivity application={latestDeviceApplication(device)} dateTime={dateTime} fallback={t('never')} /></Td>}{visibleColumns.applications && <Td><ApplicationBadges names={device.applicationNames} /></Td>}{visibleColumns.lastSeen && <Td className="whitespace-nowrap"><bdi>{formatDate(device.lastSeenAt, dateTime, t('never'))}</bdi></Td>}{visibleColumns.displayName && <Td><bdi>{device.displayName || '—'}</bdi></Td>}{visibleColumns.identifier && <Td className="max-w-[220px] break-all text-xs"><bdi>{device.identifier || '—'}</bdi></Td>}</Tr>)}</Tbody></Table></TableShell>
      <div className="space-y-3 md:hidden">{pageDevices.map(device => <article key={device.id} className="space-y-3 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4"><div className="flex items-start gap-3"><SelectionCheckbox checked={selectedIds.has(device.id)} onChange={() => toggleDevice(device.id)} label={`${t('select')} ${device.deviceName}`} /><DeviceIcon kind={device.kind} /><div className="min-w-0 flex-1"><button type="button" disabled={busy} dir="auto" className="break-words text-start font-semibold text-[var(--brand-ink)] underline underline-offset-4" onClick={() => setSelectedId(device.id)}>{device.deviceName}</button><p dir="auto" className="mt-1 break-words text-xs text-[var(--fg-muted)]">{device.displayName || deviceCapabilitySummary(device, t)}</p></div></div><div className="flex flex-wrap items-center gap-2"><DeviceStatusBadge status={device.status} t={t} /><PendingPrintJobsBadge count={device.pendingJobCount} t={t} /><BatteryValue device={device} fallback={t('deviceManagementBatteryUnavailable')} /></div><p className="text-xs text-[var(--fg-muted)]"><bdi>{formatDate(device.lastSeenAt, dateTime, t('never'))}</bdi></p></article>)}</div>
      {sortedDevices.length === 0 && <p role="status" className="py-8 text-sm text-[var(--fg-muted)]">{t('deviceManagementNoResults')}</p>}
      <div className="flex flex-wrap items-center justify-between gap-4"><Field label={t('deviceManagementResultsPerPage')}><Select value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>{PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</Select></Field><div className="flex items-center gap-2"><span className="text-xs text-[var(--fg-muted)]"><bdi>{sortedDevices.length ? `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, sortedDevices.length)} / ${sortedDevices.length}` : '0 / 0'}</bdi></span><Button variant="secondary" icon disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label={t('previous')}><ChevronLeft className="rtl:rotate-180" /></Button><Button variant="secondary" icon disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label={t('next')}><ChevronRight className="rtl:rotate-180" /></Button></div></div>
    </>}
    {selectedDevices.length > 0 && <SelectionBar devices={selectedDevices} canManageDevice={device => !frozen && canManageDevice(device)} canManagePosAccess={canManagePosAccess} rid={rid} t={t} onForget={setDeleteTargets} onReset={() => setSelectedIds(new Set())} />}
    <Drawer open={!!selected} closeDisabled={busy} onOpenChange={open => { if (!open) setSelectedId(null); }} title={selected ? <bdi className="break-words">{selected.displayName || selected.deviceName}</bdi> : ''} subtitle={selected?.displayName ? selected.deviceName : undefined} width={620} primaryAction={selected && <DeviceActions device={selected} canManagePrinters={canManagePrinters} canManagePosAccess={canManagePosAccess} canManageDevice={canManageDevice(selected)} rid={rid} testing={busy} blocked={frozen} t={t} onTest={() => void testSelectedPrinter()} onForget={() => setDeleteTargets([selected])} />}>
      {selected && <div className="space-y-5">{feedback}<DeviceDrawerContent device={selected} devices={devices} dateTime={dateTime} restaurantName={restaurantName} canManageDevice={canManageDevice(selected)} canManagePosAccess={canManagePosAccess} blocked={frozen} rid={rid} t={t} onRename={() => { setRename({ id: selected.id, draft: selected.displayName, initial: selected.displayName }); setError(null); setNotice(null); }} onSelectDevice={id => { if (!busy) setSelectedId(id); }} /><PrintQueueSection device={selected} canManage={canManagePrinters} cancelling={frozen} t={t} onCancel={() => setQueueTarget(selected)} /><p className="text-xs leading-5 text-[var(--fg-muted)]">{t('billingDatesZone')} <bdi>{Intl.DateTimeFormat().resolvedOptions().timeZone}</bdi></p></div>}
    </Drawer>
    {rename && <Modal title={t('deviceManagementRenamePrinter')} size="lg" onClose={closeRename} closeDisabled={busy} footer={<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={closeRename}>{t('cancel')}</Button><Button type="submit" form="device-rename-form" disabled={renameFrozen || !nameDirty}>{t('save')}</Button></div>}><form id="device-rename-form" className="space-y-5" onSubmit={event => { event.preventDefault(); void saveName(); }}>{feedback}{!renameDevice && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('deviceNoLongerPresent')}</p>}<Field label={t('displayName')} hint={t('deviceAliasHint')}><Input autoFocus aria-label={t('displayName')} dir="auto" value={rename.draft} readOnly={renameFrozen} onChange={event => { setRename({ ...rename, draft: event.target.value }); setError(null); }} /></Field>{rename.observed != null && <div className="space-y-3 rounded-r-md bg-[var(--surface-2)] p-4 text-sm"><p>{t('deviceSavedName')} <bdi>{rename.observed || t('deviceNoAlias')}</bdi></p><Button type="button" variant="secondary" onClick={() => setRename({ ...rename, draft: rename.observed!, initial: rename.observed!, observed: undefined })}>{t('deviceUseSavedName')}</Button></div>}</form></Modal>}
    {showConnectHelp && <Modal title={t('deviceManagementAddTitle')} subtitle={t('deviceManagementAddSubtitle')} icon={<MonitorSmartphone />} size="lg" onClose={() => setShowConnectHelp(false)} footer={<div className="flex justify-end"><Button onClick={() => setShowConnectHelp(false)}>{t('done')}</Button></div>}><ol className="space-y-5"><ConnectStep number="1" title={t('deviceManagementAddStep1')} desc={t('deviceManagementAddStep1Desc')} /><ConnectStep number="2" title={t('deviceManagementAddStep2')} desc={t('deviceManagementAddStep2Desc')} /><ConnectStep number="3" title={t('deviceManagementAddStep3')} desc={t('deviceManagementAddStep3Desc')} /></ol>{canManagePosAccess && <Button asChild variant="secondary" className="mt-5 whitespace-normal py-2 leading-5"><Link href={`/${rid}/staff/devices`}>{t('deviceManagementManagePosAccess')}</Link></Button>}</Modal>}
    <ConfirmDialog open={!!deleteTargets} onOpenChange={open => { if (!open) setDeleteTargets(null); }} title={t('deviceManagementForgetTitle')} description={<span className="break-words">{t('deviceForgetFullHint')} {deleteTargets?.map(devicePrimaryName).join(', ')}</span>} confirmLabel={t('deviceManagementForget')} cancelLabel={t('cancel')} danger onConfirm={() => void forgetSelected()} />
    <ConfirmDialog open={!!queueTarget} onOpenChange={open => { if (!open) setQueueTarget(null); }} title={t('deviceManagementCancelPendingJobsTitle')} description={t('deviceQueueCancelHint')} confirmLabel={t('deviceManagementCancelPendingJobs')} cancelLabel={t('cancel')} danger onConfirm={() => void cancelQueue()} />
    <ConfirmDialog open={leaveRename} onOpenChange={setLeaveRename} title={t('discardUnsavedChanges')} description={t(pending?.kind === 'rename' ? 'deviceLeaveUnconfirmed' : 'discountDiscardHint')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { setLeaveRename(false); setRename(null); }} />
  </div>;
}

function SortableHeader({ label, column, active, direction, onSort }: { label: string; column: SortKey; active: SortKey; direction: SortDirection; onSort: (column: SortKey) => void }) {
  const Icon = active !== column ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown;
  return <Th aria-sort={active === column ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" className="flex items-center gap-1.5 whitespace-nowrap" onClick={() => onSort(column)}>{label}<Icon className={active === column ? 'h-4 w-4 text-[var(--fg)]' : 'h-4 w-4 text-[var(--fg-subtle)]'} /></button></Th>;
}

function SelectionCheckbox({ checked, indeterminate = false, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label} className="h-5 w-5 cursor-pointer rounded border-[var(--line-strong)] accent-[var(--brand-500)]" />;
}

function ColumnMenu({ labels, visible, onChange, t }: { labels: Record<ColumnId, string>; visible: Record<ColumnId, boolean>; onChange: React.Dispatch<React.SetStateAction<Record<ColumnId, boolean>>>; t: (key: string) => string }) {
  return <Menu><MenuTrigger asChild><Button variant="ghost" size="lg" icon className="shrink-0 rounded-full bg-[var(--surface-2)]" aria-label={t('columns')} title={t('columns')}><SlidersHorizontal /></Button></MenuTrigger><MenuContent align="end"><MenuLabel>{t('deviceManagementVisibleColumns')}</MenuLabel>{COLUMN_IDS.map((column) => <MenuItem key={column} role="menuitemcheckbox" aria-checked={visible[column]} onSelect={(event) => { event.preventDefault(); onChange((current) => ({ ...current, [column]: !current[column] })); }}><span className={`grid h-4 w-4 place-items-center rounded border ${visible[column] ? 'border-[var(--brand-500)] bg-[var(--brand-500)] text-white' : 'border-[var(--line-strong)]'}`}>{visible[column] && <Check className="h-3 w-3" />}</span>{labels[column]}</MenuItem>)}</MenuContent></Menu>;
}

function SelectionBar({ devices, canManageDevice, canManagePosAccess, rid, t, onForget, onReset }: { devices: ManagedDevice[]; canManageDevice: (device: ManagedDevice) => boolean; canManagePosAccess: boolean; rid: number; t: (key: string) => string; onForget: (devices: ManagedDevice[]) => void; onReset: () => void }) {
  const hasPos = devices.some((device) => hasInstalledApplication(device, 'foody_pos'));
  const canManageAll = devices.every(canManageDevice);
  return <div className="sticky bottom-4 z-30 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] px-5 py-4 shadow-3"><strong>{devices.length} {t('selected')}</strong><div className="flex flex-wrap items-center gap-2"><Menu><MenuTrigger asChild><Button variant="secondary" size="lg">{t('actions')}<ArrowUp /></Button></MenuTrigger><MenuContent align="end" side="top">{canManageAll && <MenuItem danger onSelect={() => onForget(devices)}><Trash2 />{t('deviceManagementForget')} ({devices.length})</MenuItem>}{hasPos && canManagePosAccess && <MenuItem asChild><Link href={`/${rid}/staff/devices`}><ShieldCheck />{t('deviceManagementManagePosAccess')}</Link></MenuItem>}</MenuContent></Menu><Button variant="ghost" size="lg" onClick={onReset}>{t('deviceManagementClearSelection')}</Button></div></div>;
}

function DeviceActions({ device, canManagePrinters, canManagePosAccess, canManageDevice, rid, testing, blocked, t, onTest, onForget }: { device: ManagedDevice; canManagePrinters: boolean; canManagePosAccess: boolean; canManageDevice: boolean; rid: number; testing: boolean; blocked: boolean; t: (key: string) => string; onTest: () => void; onForget: () => void }) {
  const isPrinter = hasDeviceCapability(device, 'printer');
  const isPos = hasInstalledApplication(device, 'foody_pos');
  return <Menu><MenuTrigger asChild><Button variant="secondary" size="sm" disabled={blocked}>{t('actions')}<ArrowDown /></Button></MenuTrigger><MenuContent align="end">{isPrinter && canManagePrinters && <MenuItem disabled={testing} onSelect={onTest}><Printer />{testing ? t('printerTestSending') : t('printerTestTicket')}</MenuItem>}{isPrinter && <MenuItem asChild><Link href={`/${rid}/settings/printers`}><Settings2 />{t('deviceManagementManageProfiles')}</Link></MenuItem>}{isPos && canManagePosAccess && <MenuItem asChild><Link href={`/${rid}/staff/devices`}><ShieldCheck />{t('deviceManagementManagePosAccess')}</Link></MenuItem>}{canManageDevice && <><MenuSeparator /><MenuItem danger onSelect={onForget}><Trash2 />{t('deviceManagementForget')}</MenuItem></>}</MenuContent></Menu>;
}

function DeviceDrawerContent({ device, devices, dateTime, restaurantName, canManageDevice, canManagePosAccess, blocked, rid, t, onRename, onSelectDevice }: { device: ManagedDevice; devices: ManagedDevice[]; dateTime: Intl.DateTimeFormat; restaurantName: string; canManageDevice: boolean; canManagePosAccess: boolean; blocked: boolean; rid: number; t: (key: string) => string; onRename: () => void; onSelectDevice: (id: string) => void }) {
  const connected = device.connectedDeviceIds.map((id) => devices.find((candidate) => candidate.id === id)).filter((candidate): candidate is ManagedDevice => Boolean(candidate));
  const isPrinter = hasDeviceCapability(device, 'printer');
  const isPos = hasInstalledApplication(device, 'foody_pos');
  return <div className="-m-[var(--s-5)]"><div className="px-[var(--s-5)] py-5"><p className="text-fs-sm text-[var(--fg-muted)]">{t('deviceManagementDataUpdated')} {formatDate(device.lastSeenAt, dateTime, t('never'))}</p><div className="mt-4 flex items-center gap-3"><DeviceStatusBadge status={device.status} t={t} /><BatteryValue device={device} fallback={t('deviceManagementBatteryUnavailable')} /></div></div><DrawerSection title={t('deviceManagementConnectedDevices')}>{connected.length ? connected.map((candidate) => <button type="button" key={candidate.id} disabled={blocked} className="flex w-full items-center gap-3 border-b border-[var(--line)] py-4 text-start last:border-0" onClick={() => onSelectDevice(candidate.id)}><DeviceIcon kind={candidate.kind} /><div className="min-w-0 flex-1"><div dir="auto" className="break-words font-semibold">{devicePrimaryName(candidate)}</div><div className="mt-1 text-fs-xs text-[var(--fg-muted)]">{deviceDisplayName(candidate) || deviceCapabilitySummary(candidate, t)}</div></div><DeviceStatusBadge status={candidate.status} t={t} /><ChevronRight className="h-4 w-4 text-[var(--fg-subtle)] rtl:rotate-180" /></button>) : <p className="py-2 text-fs-sm text-[var(--fg-muted)]">{isPrinter ? t('deviceManagementNoConnectedDevices') : t('deviceManagementNoLinkedPrinter')}</p>}</DrawerSection><DrawerSection title={t('deviceManagementConnectivity')}><div className="flex items-center gap-3 py-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-r-md bg-[var(--surface-2)]"><Globe2 className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="font-semibold">{isPrinter ? t(device.printerConnectionType === 'integrated' ? 'printerIntegratedConnection' : 'deviceManagementNetwork') : ([device.osName, device.osVersion].filter(Boolean).join(' ') || device.platform || deviceCapabilitySummary(device, t))}</div><div className="mt-1 text-fs-xs text-[var(--fg-muted)]">{isPrinter && device.printerConnectionType === 'integrated' ? t('printerIntegratedConnection') : isPrinter ? `${t('deviceManagementIpAddress')} ${[device.host, device.port].filter(Boolean).join(':') || '—'}` : `${t('deviceManagementLocation')}: ${restaurantName || '—'}`}</div></div>{device.status === 'online' && <Badge tone="success">{t('active')}</Badge>}</div></DrawerSection>{device.applications.length > 0 && <DrawerSection title={t('deviceManagementInstalledApplications')}>{device.applications.map((application) => <ApplicationCard key={application.name} application={application} dateTime={dateTime} fallback={t('never')} t={t} />)}</DrawerSection>}<DrawerSection title={isPrinter ? t('deviceManagementPrinterDetails') : t('deviceManagementDetails')}><Property label={t('deviceManagementType')} value={deviceTypeLabel(device.kind, t)} /><Property label={t('name')} value={device.deviceName} /><Property label={t('displayName')} value={device.displayName || '—'} />{isPrinter && <Property label={t('deviceManagementPaperWidth')} value={formatPaperWidth(device.paperWidthDots, t('deviceManagementNotAvailable'))} />}<Property label={t('model')} value={device.model || t('deviceManagementUnknownModel')} />{device.vendor && <Property label={t('deviceManagementManufacturer')} value={device.vendor} />}{(device.osName || device.osVersion) && <Property label={t('deviceManagementOperatingSystem')} value={[device.osName, device.osVersion].filter(Boolean).join(' ')} />}{device.identifier && <Property label={t('deviceManagementIdentifier')} value={device.identifier} />}{isPrinter && <Property label={t('deviceManagementActiveMode')} value={device.profileNames.join(', ') || t('deviceManagementNoProfile')} />}</DrawerSection>{device.lastError && <div className="mx-[var(--s-5)] my-5 rounded-r-md bg-[var(--danger-50)] px-4 py-3 text-fs-xs text-[var(--danger-500)]">{t('deviceLastError')}</div>}{canManageDevice && <DrawerSection title={t('deviceManagementRenamePrinter')}><Button variant="secondary" disabled={blocked} onClick={onRename}>{t('edit')}</Button></DrawerSection>}{isPos && canManagePosAccess && <div className="border-t-8 border-[var(--surface-2)] px-[var(--s-5)] py-5"><div className="flex items-start gap-3 rounded-r-lg border border-[var(--line)] bg-[var(--surface-2)] p-4"><ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--fg-muted)]" /><div className="min-w-0 flex-1"><div className="text-fs-sm font-semibold">{t('posAccess')}</div><p className="mt-1 text-fs-xs text-[var(--fg-muted)]">{t('deviceManagementPosAccessHint')}</p><Button variant="secondary" size="sm" className="mt-3" asChild><Link href={`/${rid}/staff/devices`}>{t('deviceManagementManagePosAccess')}</Link></Button></div></div></div>}</div>;
}

function PrintQueueSection({ device, canManage, cancelling, t, onCancel }: { device: ManagedDevice; canManage: boolean; cancelling: boolean; t: (key: string) => string; onCancel: () => void }) {
  if (!hasDeviceCapability(device, 'printer') || device.pendingJobCount < 1) return null;
  return <section className="mt-5 rounded-r-lg border border-[var(--warning-500)]/30 bg-[var(--warning-50)] p-4"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning-500)]" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-fs-sm font-semibold">{t('deviceManagementPrintQueue')}</h3><PendingPrintJobsBadge count={device.pendingJobCount} t={t} /></div><p className="mt-2 text-fs-xs leading-relaxed text-[var(--fg-muted)]">{t('deviceManagementPrintQueueDesc')}</p>{canManage && <Button variant="danger" size="sm" className="mt-3 whitespace-normal py-2 leading-5" disabled={cancelling} onClick={onCancel}>{cancelling ? t('deviceManagementCancellingPendingJobs') : t('deviceManagementCancelPendingJobs')}</Button>}</div></div></section>;
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="border-t-8 border-[var(--surface-2)] px-[var(--s-5)] py-5"><h3 className="mb-3 text-fs-lg font-semibold">{title}</h3>{children}</section>; }
function Property({ label, value }: { label: string; value: string }) { return <div className="py-3"><div className="text-fs-sm font-semibold">{label}</div><div dir="auto" className="mt-1 break-words text-fs-sm text-[var(--fg-muted)]">{value}</div></div>; }
function DeviceIcon({ kind }: { kind: ManagedDeviceKind }) { const Icon = kind === 'tablet' ? Tablet : kind === 'phone' ? Smartphone : kind === 'computer' ? Laptop : kind === 'printer' ? Printer : kind === 'payment_terminal' ? CreditCard : kind === 'display' ? MonitorUp : MonitorSmartphone; return <div className="grid h-11 w-11 shrink-0 place-items-center rounded-r-md bg-[var(--surface-2)] text-[var(--fg)]"><Icon className="h-5 w-5" /></div>; }
function DeviceStatusBadge({ status, t }: { status: ManagedDeviceStatus; t: (key: string) => string }) { return <Badge tone={STATUS_TONES[status]} dot>{t(`deviceStatus${status[0].toUpperCase()}${status.slice(1)}`)}</Badge>; }
function PendingPrintJobsBadge({ count, t }: { count: number; t: (key: string) => string }) { return count > 0 ? <Badge tone="warning">{pendingPrintJobsLabel(count, t)}</Badge> : null; }
function pendingPrintJobsLabel(count: number, t: (key: string) => string): string { return `${count} ${t(count === 1 ? 'deviceManagementPendingJob' : 'deviceManagementPendingJobs')}`; }
function BatteryValue({ device, fallback }: { device: ManagedDevice; fallback: string }) { return device.batteryLevel === undefined ? <span className="text-[var(--fg-subtle)]" title={fallback}>—</span> : <span className="inline-flex items-center gap-1.5" title={device.batteryState}><BatteryMedium className="h-4 w-4" />{device.batteryLevel}%</span>; }
function ApplicationActivity({ application, dateTime, fallback }: { application: ManagedDeviceApplication | undefined; dateTime: Intl.DateTimeFormat; fallback: string }) { return application ? <div><div className="font-medium">{applicationLabel(application.name)}</div><div className="mt-1 text-fs-xs text-[var(--fg-muted)]">{formatDate(application.lastActiveAt, dateTime, fallback)}</div></div> : <span className="text-[var(--fg-subtle)]">—</span>; }
function ApplicationBadges({ names }: { names: string[] }) { return names.length ? <div className="flex max-w-[220px] flex-wrap gap-1">{names.map((name) => <Badge key={name}>{applicationLabel(name)}</Badge>)}</div> : <span className="text-[var(--fg-subtle)]">—</span>; }
function ApplicationCard({ application, dateTime, fallback, t }: { application: ManagedDeviceApplication; dateTime: Intl.DateTimeFormat; fallback: string; t: (key: string) => string }) { return <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] py-4 last:border-0"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-r-md bg-[var(--surface-2)] font-bold"><FoodyLogo variant="symbol" width={24} /></div><div className="min-w-0 flex-1"><div className="font-semibold">{applicationLabel(application.name)}</div><div className="mt-1 text-fs-xs text-[var(--fg-muted)]">{[application.platform, application.version].filter(Boolean).join(' · ') || '—'} · {formatDate(application.lastActiveAt, dateTime, fallback)}</div></div><Badge tone={application.status === 'active' ? 'success' : 'neutral'}>{t(application.status === 'active' ? 'active' : 'inactive')}</Badge></div>; }
function ConnectStep({ number, title, desc }: { number: string; title: string; desc: string }) { return <li className="grid grid-cols-[36px_minmax(0,1fr)] gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface-2)] text-fs-sm font-semibold">{number}</span><div><div className="text-fs-sm font-semibold">{title}</div><p className="mt-1 text-fs-xs leading-relaxed text-[var(--fg-muted)]">{desc}</p></div></li>; }

function devicePrimaryName(device: ManagedDevice): string { return device.deviceName; }
function deviceDisplayName(device: ManagedDevice): string { return device.displayName; }

function deviceCapabilitySummary(device: ManagedDevice, t: (key: string) => string): string {
  const labels = [deviceTypeLabel(device.kind, t)];
  for (const capability of device.capabilities) {
    if (capability === device.kind) continue;
    labels.push(capability === 'kitchen_display'
      ? t('deviceTypeKitchenDisplay')
      : capability === 'customer_display'
        ? t('deviceTypeCustomerDisplay')
        : deviceTypeLabel(capability, t));
  }
  return labels.join(' · ');
}

function deviceTypeLabel(kind: ManagedDeviceKind, t: (key: string) => string): string {
  switch (kind) {
    case 'unknown': return t('deviceTypeUnknown');
    case 'tablet': return t('deviceTypeTablet');
    case 'phone': return t('deviceTypePhone');
    case 'computer': return t('deviceTypeComputer');
    case 'display': return t('deviceTypeDisplay');
    case 'printer': return t('deviceTypePrinter');
    case 'payment_terminal': return t('deviceTypePaymentTerminal');
  }
}

function applicationLabel(application: string): string {
  if (application === 'foody_pos') return 'FoodyPOS';
  return application.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compareDevices(left: ManagedDevice, right: ManagedDevice, key: SortKey, locale: string): number {
  const text = (a: string, b: string) => a.localeCompare(b, locale, { sensitivity: 'base', numeric: true });
  switch (key) {
    case 'name': return text(devicePrimaryName(left), devicePrimaryName(right));
    case 'status': return text(left.status, right.status);
    case 'application': return text(latestDeviceApplication(left)?.name ?? '', latestDeviceApplication(right)?.name ?? '');
    case 'lastSeen': return (Date.parse(left.lastSeenAt ?? '') || 0) - (Date.parse(right.lastSeenAt ?? '') || 0);
    case 'displayName': return text(deviceDisplayName(left), deviceDisplayName(right));
    case 'identifier': return text(left.identifier ?? '', right.identifier ?? '');
    case 'battery': return (left.batteryLevel ?? -1) - (right.batteryLevel ?? -1);
  }
}

function formatPaperWidth(dots: number | undefined, fallback: string): string { if (!dots) return fallback; if (dots >= 560) return '80 mm'; if (dots >= 370) return '58 mm'; return `${dots} dots`; }
function formatDate(value: string | undefined, formatter: Intl.DateTimeFormat, fallback: string): string { if (!value) return fallback; const date = new Date(value); return Number.isNaN(date.getTime()) ? fallback : formatter.format(date); }
