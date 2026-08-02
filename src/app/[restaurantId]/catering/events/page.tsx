'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import {
  DataTable, DataTableHead, DataTableHeadCell,
  DataTableBody, DataTableRow, DataTableCell,
} from '@/components/data-table';
import { PageHead, Badge } from '@/components/ds';
import { listCateringEvents, type CateringEvent } from '@/lib/api';

function formatEventDate(d: string | null): string {
  if (!d) return '-';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString();
}

export default function CateringEventsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [events, setEvents] = useState<CateringEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await listCateringEvents(rid));
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-[var(--s-5)]">
      <PageHead title={t('catering_events_title')} desc={t('catering_events_desc')} />

      {events.length === 0 ? (
        <p className="text-fg-secondary mt-6">{t('catering_events_empty')}</p>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>{t('catering_quote_customer')}</DataTableHeadCell>
            <DataTableHeadCell>{t('catering_quote_event_date')}</DataTableHeadCell>
            <DataTableHeadCell>{t('catering_quote_event_city')}</DataTableHeadCell>
            <DataTableHeadCell>{t('catering_events_service')}</DataTableHeadCell>
            <DataTableHeadCell>{t('catering_events_branch')}</DataTableHeadCell>
            <DataTableHeadCell align="right">{t('catering_deposit')}</DataTableHeadCell>
          </DataTableHead>
          <DataTableBody>
            {events.map((ev, index) => (
              <DataTableRow key={ev.id} index={index}>
                <DataTableCell mobilePrimary className="font-medium text-fg-primary">
                  {ev.customer_name || '-'}
                  {ev.customer_phone && <span className="block text-fg-secondary text-fs-xs">{ev.customer_phone}</span>}
                </DataTableCell>
                <DataTableCell mobileLabel={t('catering_quote_event_date')} className="text-fg-secondary">
                  {formatEventDate(ev.event_date)}
                </DataTableCell>
                <DataTableCell mobileLabel={t('catering_quote_event_city')} className="text-fg-secondary">
                  {ev.event_city || '-'}
                </DataTableCell>
                <DataTableCell mobileLabel={t('catering_events_service')} className="text-fg-secondary">
                  {ev.service_name || '-'}
                </DataTableCell>
                <DataTableCell mobileLabel={t('catering_events_branch')}>
                  {ev.assigned_location_name
                    ? <span className="text-fg-primary">{ev.assigned_location_name}</span>
                    : <Badge tone="warning">{t('catering_events_unassigned')}</Badge>}
                </DataTableCell>
                <DataTableCell align="right" mobileLabel={t('catering_deposit')}>
                  {`₪${ev.deposit_amount.toFixed(2)}`}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </div>
  );
}
