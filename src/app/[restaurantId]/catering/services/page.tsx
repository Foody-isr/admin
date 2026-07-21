'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PencilIcon, TrashIcon, PlusIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell,
  DataTableBody, DataTableRow, DataTableCell,
} from '@/components/data-table';
import { PageHead, Button } from '@/components/ds';
import Modal from '@/components/Modal';
import {
  listCateringServices, createCateringService, updateCateringService, archiveCateringService,
  type CateringService, type CateringPricingModel,
} from '@/lib/api';

const PRICING_KEYS: Record<CateringPricingModel, string> = {
  per_unit: 'catering_pricing_per_unit',
  per_person: 'catering_pricing_per_person',
  custom_quote: 'catering_pricing_custom',
};

export default function CateringServicesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('catering.manage');

  const [services, setServices] = useState<CateringService[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ open: boolean; editing?: CateringService }>({ open: false });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setServices(await listCateringServices(rid));
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  const handleArchive = async (service: CateringService) => {
    if (!confirm(t('catering_archive_confirm'))) return;
    await archiveCateringService(rid, service.id);
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
        title={t('catering_services_title')}
        desc={t('catering_services_desc')}
        actions={
          canEdit ? (
            <Button variant="primary" size="md" onClick={() => setEditModal({ open: true })}>
              <PlusIcon />
              {t('catering_new_service')}
            </Button>
          ) : undefined
        }
      />

      {services.length === 0 ? (
        <p className="text-fg-secondary mt-6">{t('catering_empty_services')}</p>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>{t('catering_field_name')}</DataTableHeadCell>
            <DataTableHeadCell>{t('catering_field_pricing')}</DataTableHeadCell>
            <DataTableHeadCell align="right">{t('catering_field_active')}</DataTableHeadCell>
            <DataTableHeadSpacerCell />
          </DataTableHead>
          <DataTableBody>
            {services.map((service, index) => (
              <DataTableRow
                key={service.id}
                index={index}
                onClick={() => router.push(`/${rid}/catering/services/${service.id}`)}
                className="cursor-pointer"
              >
                <DataTableCell mobilePrimary className="font-medium text-fg-primary">
                  {service.name}
                </DataTableCell>
                <DataTableCell mobileLabel={t('catering_field_pricing')} className="text-fg-secondary">
                  {t(PRICING_KEYS[service.pricing_model])}
                </DataTableCell>
                <DataTableCell align="right" mobileLabel={t('catering_field_active')}>
                  {service.is_active ? '✓' : '—'}
                </DataTableCell>
                <DataTableCell>
                  {canEdit && (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        aria-label={t('catering_edit_service')}
                        onClick={(e) => { e.stopPropagation(); setEditModal({ open: true, editing: service }); }}
                        className="p-1.5 rounded hover:bg-[var(--surface-subtle)] text-fg-secondary hover:text-fg-primary"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        aria-label={t('catering_archive')}
                        onClick={(e) => { e.stopPropagation(); handleArchive(service); }}
                        className="p-1.5 rounded hover:bg-red-500/10 text-fg-secondary hover:text-red-500"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      {editModal.open && (
        <ServiceEditModal
          restaurantId={rid}
          editing={editModal.editing}
          onClose={() => setEditModal({ open: false })}
          onSaved={() => { setEditModal({ open: false }); reload(); }}
        />
      )}
    </div>
  );
}

function ServiceEditModal({ restaurantId, editing, onClose, onSaved }: {
  restaurantId: number;
  editing?: CateringService;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [pricingModel, setPricingModel] = useState<CateringPricingModel>(editing?.pricing_model ?? 'per_unit');
  const [quoteMode, setQuoteMode] = useState<'auto' | 'review'>(editing?.quote_mode ?? 'auto');
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), description, pricing_model: pricingModel, quote_mode: quoteMode, is_active: isActive };
      if (editing) {
        await updateCateringService(restaurantId, editing.id, body);
      } else {
        await createCateringService(restaurantId, body);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? t('catering_edit_service') : t('catering_new_service')} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('catering_field_name')}</label>
          <input
            autoFocus
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('catering_field_desc')}</label>
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('catering_field_pricing')}</label>
          <select
            className="input"
            value={pricingModel}
            onChange={(e) => setPricingModel(e.target.value as CateringPricingModel)}
          >
            <option value="per_unit">{t('catering_pricing_per_unit')}</option>
            <option value="per_person">{t('catering_pricing_per_person')}</option>
            <option value="custom_quote">{t('catering_pricing_custom')}</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('catering_service_quote_mode')}</label>
          <select
            className="input"
            value={quoteMode}
            onChange={(e) => setQuoteMode(e.target.value as 'auto' | 'review')}
          >
            <option value="auto">{t('catering_quote_mode_auto')}</option>
            <option value="review">{t('catering_quote_mode_review')}</option>
          </select>
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span className="text-sm text-fg-secondary">{t('catering_field_active')}</span>
        </label>

        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>{t('catering_cancel')}</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {t('catering_save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
