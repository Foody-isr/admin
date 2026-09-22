'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, RefreshCw, ShieldOff, TabletSmartphone } from 'lucide-react';
import { Button, PageHead } from '@/components/ds';
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
import { listPOSDevices, POSDevice, revokePOSDevice } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type DeviceStatus = 'active' | 'expired' | 'revoked';

function statusOf(device: POSDevice): DeviceStatus {
  if (device.revoked_at) return 'revoked';
  if (new Date(device.expires_at).getTime() <= Date.now()) return 'expired';
  return 'active';
}

export default function POSDevicesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t, locale } = useI18n();
  const [devices, setDevices] = useState<POSDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<POSDevice | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDevices(await listPOSDevices(rid));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('failedToLoadPOSTerminals'));
    } finally {
      setLoading(false);
    }
  }, [rid, t]);

  useEffect(() => { void load(); }, [load]);

  const dateTime = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );
  const activeCount = devices.filter((device) => statusOf(device) === 'active').length;

  const revoke = async () => {
    if (!selected) return;
    setRevoking(true);
    try {
      await revokePOSDevice(rid, selected.id);
      setSelected(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('failedToRevokePOSTerminal'));
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-[var(--s-5)]">
      <PageHead
        title={t('posAccess')}
        desc={t('posAccessDesc')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="md" asChild>
              <Link href={`/${rid}/staff`}><ArrowLeft />{t('back')}</Link>
            </Button>
            <Button variant="secondary" size="md" onClick={() => void load()} disabled={loading}>
              <RefreshCw />{t('refresh')}
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-4 border-y border-[var(--divider)] py-4">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-500/10 text-brand-600">
          <TabletSmartphone className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold text-fg-primary">{activeCount}</div>
          <div className="text-sm text-fg-muted">{t('activePOSTerminals')}</div>
        </div>
        <p className="ml-auto max-w-xl text-sm text-fg-secondary">{t('posTerminalSecurityHint')}</p>
      </div>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <DataTable>
        <DataTableHead>
          <DataTableHeadCell>{t('terminalName')}</DataTableHeadCell>
          <DataTableHeadCell>{t('status')}</DataTableHeadCell>
          <DataTableHeadCell>{t('authorizedBy')}</DataTableHeadCell>
          <DataTableHeadCell>{t('lastUsed')}</DataTableHeadCell>
          <DataTableHeadCell>{t('expires')}</DataTableHeadCell>
          <DataTableHeadSpacerCell />
        </DataTableHead>
        <DataTableBody>
          {!loading && devices.map((device, index) => {
            const status = statusOf(device);
            return (
              <DataTableRow key={device.id} index={index}>
                <DataTableCell mobilePrimary>
                  <div className="font-medium text-fg-primary">{device.name}</div>
                  <div className="text-xs text-fg-muted">#{device.id}</div>
                </DataTableCell>
                <DataTableCell mobileLabel={t('status')}>
                  <span className={status === 'active' ? 'text-green-600 font-medium' : 'text-fg-muted'}>
                    {t(`posTerminalStatus_${status}`)}
                  </span>
                </DataTableCell>
                <DataTableCell mobileLabel={t('authorizedBy')}>{device.enrolled_by_name || '—'}</DataTableCell>
                <DataTableCell mobileLabel={t('lastUsed')}>
                  {device.last_used_at ? dateTime.format(new Date(device.last_used_at)) : t('never')}
                </DataTableCell>
                <DataTableCell mobileLabel={t('expires')}>{dateTime.format(new Date(device.expires_at))}</DataTableCell>
                <DataTableCell align="right">
                  {status === 'active' && (
                    <Button variant="ghost" size="sm" onClick={() => setSelected(device)}>
                      <ShieldOff />{t('revokeAccess')}
                    </Button>
                  )}
                </DataTableCell>
              </DataTableRow>
            );
          })}
          {!loading && devices.length === 0 && (
            <DataTableRow index={0}>
              <DataTableCell colSpan={6} className="py-12 text-center text-fg-muted">{t('noPOSTerminals')}</DataTableCell>
            </DataTableRow>
          )}
        </DataTableBody>
      </DataTable>

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
        </Modal>
      )}
    </div>
  );
}
