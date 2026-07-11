'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { listDiscounts, deleteDiscount, Discount } from '@/lib/api';
import { discountStatus, formatDiscountValue } from '@/lib/discounts';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { PlusIcon, PencilIcon, TrashIcon, TagIcon } from 'lucide-react';
import { Button, PageHead } from '@/components/ds';
import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  DataTableHeadSpacerCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table';
import DiscountEditModal from '@/components/marketing/DiscountEditModal';

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'active': return 'badge badge-ready';
    case 'scheduled': return 'badge badge-accepted';
    case 'expired': return 'badge badge-neutral';
    case 'exhausted': return 'badge badge-neutral';
    case 'inactive': return 'badge badge-rejected';
    default: return 'badge badge-neutral';
  }
}

export default function DiscountsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('discounts.edit');

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ open: boolean; editing?: Discount }>({ open: false });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setDiscounts(await listDiscounts(rid));
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  const handleDelete = async (d: Discount) => {
    if (!confirm(t('deleteDiscountConfirm'))) return;
    await deleteDiscount(rid, d.id);
    reload();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-[var(--s-5)]">
      <PageHead
        title={t('discounts')}
        desc={t('discountsSubtitle')}
        actions={
          canEdit ? (
            <Button variant="primary" size="md" onClick={() => setEditModal({ open: true })}>
              <PlusIcon />
              {t('createDiscount')}
            </Button>
          ) : undefined
        }
      />

      {discounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="text-4xl"><TagIcon className="w-10 h-10 text-fg-tertiary" /></div>
          <h2 className="text-lg font-semibold text-fg-primary">{t('noDiscountsYet')}</h2>
          <p className="text-sm text-fg-secondary max-w-sm text-center">
            {t('noDiscountsHint')}
          </p>
          {canEdit && (
            <button
              onClick={() => setEditModal({ open: true })}
              className="btn-primary mt-2"
            >
              {t('createDiscount')}
            </button>
          )}
        </div>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>{t('discountCode')}</DataTableHeadCell>
            <DataTableHeadCell>{t('discountName')}</DataTableHeadCell>
            <DataTableHeadCell>{t('discountType')}</DataTableHeadCell>
            <DataTableHeadCell>{t('appliesTo')}</DataTableHeadCell>
            <DataTableHeadCell>{t('statusColumn')}</DataTableHeadCell>
            <DataTableHeadCell>{t('redemptions')}</DataTableHeadCell>
            <DataTableHeadCell>{t('endsAt')}</DataTableHeadCell>
            <DataTableHeadSpacerCell />
          </DataTableHead>
          <DataTableBody>
            {discounts.map((d, index) => {
              const v = formatDiscountValue(d);
              const st = discountStatus(d);
              const scopeKey = d.scope === 'whole_sale'
                ? 'scopeWholeSale'
                : d.scope === 'category'
                ? 'scopeCategory'
                : 'scopeSpecificItem';
              const redemptionText = d.total_cap != null
                ? `${d.redemption_count}/${d.total_cap}`
                : String(d.redemption_count);
              const endDateText = d.ends_at
                ? new Date(d.ends_at).toLocaleDateString()
                : '';

              return (
                <DataTableRow
                  key={d.id}
                  index={index}
                  onClick={() => setEditModal({ open: true, editing: d })}
                  className="cursor-pointer"
                >
                  <DataTableCell mobilePrimary className="font-mono font-medium text-fg-primary">
                    {d.code}
                  </DataTableCell>
                  <DataTableCell mobileLabel={t('discountName')} className="text-fg-secondary">
                    {d.name}
                  </DataTableCell>
                  <DataTableCell mobileLabel={t('discountType')} className="text-fg-secondary">
                    {v === 'freeDelivery' ? t('typeFreeDelivery') : v}
                  </DataTableCell>
                  <DataTableCell mobileLabel={t('appliesTo')} className="text-fg-secondary">
                    {t(scopeKey)}
                  </DataTableCell>
                  <DataTableCell mobileLabel={t('statusColumn')}>
                    <span className={statusBadgeClass(st)}>{t(st)}</span>
                  </DataTableCell>
                  <DataTableCell mobileLabel={t('redemptions')} className="text-fg-secondary">
                    {redemptionText}
                  </DataTableCell>
                  <DataTableCell mobileLabel={t('endsAt')} className="text-fg-secondary">
                    {endDateText}
                  </DataTableCell>
                  <DataTableCell>
                    {canEdit && (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditModal({ open: true, editing: d }); }}
                          className="p-1.5 rounded hover:bg-[var(--surface-subtle)] text-fg-secondary hover:text-fg-primary"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(d); }}
                          className="p-1.5 rounded hover:bg-red-500/10 text-fg-secondary hover:text-red-500"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </DataTableCell>
                </DataTableRow>
              );
            })}
          </DataTableBody>
        </DataTable>
      )}

      {editModal.open && (
        <DiscountEditModal
          key={editModal.editing?.id ?? 'new'}
          open
          editing={editModal.editing}
          restaurantId={rid}
          onClose={() => setEditModal({ open: false })}
          onSaved={() => { setEditModal({ open: false }); reload(); }}
        />
      )}
    </div>
  );
}
