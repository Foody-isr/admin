'use client';

import ActionsDropdown from '@/components/common/ActionsDropdown';
import { ListToolbar } from '@/components/data-table';
import { ListFilterButton, ListStateFilter, ListFiltersDrawer } from '@/components/data-table/ListFilters';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ListFilter, ShieldOff } from 'lucide-react';
import { Badge, Button } from '@/components/ds';
import Modal from '@/components/Modal';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeadCell,
  DataTableHeadSpacerCell,
  DataTableRow,
} from '@/components/data-table';
import {
  listPOSAccessCredentials,
  POSAccessCredential,
  revokePOSAccessCredential,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';

type DeviceStatus = 'active' | 'expired' | 'revoked';

function statusOf(device: POSAccessCredential): DeviceStatus {
  if (device.revoked_at) return 'revoked';
  if (new Date(device.expires_at).getTime() <= Date.now()) return 'expired';
  return 'active';
}

export default function POSAccessCredentialsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [filterView, setFilterView] = useState<string | null>(null);

  const { t, locale } = useI18n();
  const [devices, setDevices] = useState<POSAccessCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<POSAccessCredential | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState('');
  const requestGuard = useRef(new RestaurantRequestGuard());
  requestGuard.current.enterRestaurant(rid);

  const load = useCallback(async () => {
    const guard = requestGuard.current;
    const token = guard.begin(rid);
    setLoading(true);
    setError('');
    try {
      const result = await listPOSAccessCredentials(rid);
      if (guard.isCurrent(token)) setDevices(result);
    } catch (cause) {
      if (guard.isCurrent(token)) setError(cause instanceof Error ? cause.message : t('failedToLoadPOSTerminals'));
    } finally {
      if (guard.isCurrent(token)) setLoading(false);
    }
  }, [rid, t]);

  useEffect(() => { const guard = requestGuard.current; void load(); return () => guard.invalidate(); }, [load]);

  const dateTime = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );
  const statusOptions = ['active', 'expired', 'revoked'].map(value => ({ value, label: t(`posTerminalStatus_${value}`) }));
  const groupOptions = Array.from(new Set(devices.map(device => device.enrolled_by_name).filter(Boolean))).map(name => ({ value: name!, label: name! }));
  const filtered = devices.filter(device => device.name.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)) && (!selectedGroups.size || selectedGroups.has(device.enrolled_by_name ?? '')) && (!selectedStatuses.size || selectedStatuses.has(statusOf(device))));
  const listFilters = [{ id: 'group', label: t('authorizedBy'), options: groupOptions, selected: selectedGroups }, { id: 'status', label: t('listState'), options: statusOptions, selected: selectedStatuses }];

  const revoke = async () => {
    if (!selected || revoking) return;
    setRevokeError('');
    setRevoking(true);
    try {
      await revokePOSAccessCredential(rid, selected.id);
      setSelected(null);
      await load();
    } catch (cause) {
      setRevokeError(cause instanceof Error ? cause.message : t('failedToRevokePOSTerminal'));
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-[var(--s-5)]">
      <h1 className="sr-only">{t('posAccess')}</h1>
      <ListToolbar search={{ value: search, onChange: setSearch, label: t('search') }}
        filters={<>
          <ListFilterButton label={t('authorizedBy')} value={selectedGroups.size || undefined} onClick={() => setFilterView('group')} />
          <ListStateFilter label={t('listState')} options={statusOptions} selected={selectedStatuses} onChange={setSelectedStatuses} />
          <ListFilterButton label={t('allFilters')} icon={<ListFilter />} onClick={() => setFilterView('index')} />
        </>}
        actions={<ActionsDropdown actions={[
          { label: t('refresh'), disabled: loading, onClick: () => void load() },
          { label: t('staff'), onClick: () => router.push(`/${rid}/staff`) },
        ]} />}
      />
      <ListFiltersDrawer open={filterView !== null} initialView={filterView ?? 'index'} onClose={() => setFilterView(null)} filters={listFilters}
        onApply={values => { setSelectedGroups(values.group); setSelectedStatuses(values.status); }} />
      {error && <div role="alert" className="rounded-r-lg bg-[var(--danger-50)] p-4 text-sm text-[var(--danger-500)] flex flex-wrap items-center justify-between gap-3"><span>{error}</span><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div>}
      {loading && <p role="status" className="py-12 text-center text-sm text-fg-secondary">{t('loading')}</p>}

      {!loading && !error && <DataTable className="list-table">
        <DataTableHead>
          <DataTableHeadCell>{t('terminalName')}</DataTableHeadCell>
          <DataTableHeadCell>{t('status')}</DataTableHeadCell>
          <DataTableHeadCell>{t('authorizedBy')}</DataTableHeadCell>
          <DataTableHeadCell>{t('lastUsed')}</DataTableHeadCell>
          <DataTableHeadCell>{t('expires')}</DataTableHeadCell>
          <DataTableHeadSpacerCell />
        </DataTableHead>
        <DataTableBody>
          {!loading && filtered.map((device, index) => {
            const status = statusOf(device);
            return (
              <DataTableRow key={device.id} index={index}>
                <DataTableCell mobilePrimary>
                  <div className="font-medium text-fg-primary">{device.name}</div>
                  <div className="text-xs text-fg-muted">#{device.id}</div>
                </DataTableCell>
                <DataTableCell mobileLabel={t('status')}>
                  <Badge tone={status === 'active' ? 'success' : 'neutral'}>
                    {t(`posTerminalStatus_${status}`)}
                  </Badge>
                </DataTableCell>
                <DataTableCell mobileLabel={t('authorizedBy')}>{device.enrolled_by_name || '—'}</DataTableCell>
                <DataTableCell mobileLabel={t('lastUsed')}>
                  {device.last_used_at ? dateTime.format(new Date(device.last_used_at)) : t('never')}
                </DataTableCell>
                <DataTableCell mobileLabel={t('expires')}>{dateTime.format(new Date(device.expires_at))}</DataTableCell>
                <DataTableCell align="right">
                  {status === 'active' && (
                    <Button variant="ghost" size="sm" onClick={() => { setRevokeError(''); setSelected(device); }}>
                      <ShieldOff />{t('revokeAccess')}
                    </Button>
                  )}
                </DataTableCell>
              </DataTableRow>
            );
          })}
          {!loading && filtered.length === 0 && (
            <DataTableRow index={0}>
              <DataTableCell colSpan={6} className="py-12 text-center text-fg-muted">{t('noPOSTerminals')}</DataTableCell>
            </DataTableRow>
          )}
        </DataTableBody>
      </DataTable>}
      <p className="mt-6 text-sm text-fg-secondary">{t('posTerminalSecurityHint')}</p>

      {selected && (
        <Modal
          title={t('revokePOSTerminalTitle')}
          subtitle={selected.name}
          icon={<ShieldOff />}
          onClose={() => !revoking && setSelected(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSelected(null)} disabled={revoking}>{t('cancel')}</Button>
              <Button variant="danger" onClick={() => void revoke()} disabled={revoking}>
                {revoking ? t('revoking') : t('revokeAccess')}
              </Button>
            </div>
          }
        >
          <p className="text-sm text-fg-secondary">{t('revokePOSTerminalConfirm')}</p>
          {revokeError && <p role="alert" className="mt-4 rounded-r-md bg-[var(--danger-50)] p-3 text-sm text-[var(--danger-500)]">{revokeError}</p>}
        </Modal>
      )}
    </div>
  );
}
