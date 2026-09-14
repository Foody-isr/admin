'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRightIcon, EyeOffIcon, FolderOpenIcon, PencilIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, PageHead } from '@/components/ds';
import Modal from '@/components/Modal';
import {
  archiveCateringService,
  createCateringService,
  listCateringOffers,
  listCateringServices,
  updateCateringService,
  type CateringOffer,
  type CateringService,
  type CateringServiceInput,
} from '@/lib/api';

function offerModeKey(offer: CateringOffer): string {
  if (offer.pricing_model === 'per_person') return 'catering_offer_mode_per_person';
  if (offer.pricing_model === 'custom_quote') return 'catering_offer_mode_custom_quote';
  return 'catering_offer_mode_per_unit';
}

export default function CateringServicesPage() {
  const { restaurantId } = useParams();
  const restaurantID = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('catering.manage');
  const [services, setServices] = useState<CateringService[]>([]);
  const [offersByService, setOffersByService] = useState<Record<number, CateringOffer[]>>({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing?: CateringService }>({ open: false });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nextServices = await listCateringServices(restaurantID);
      const offerLists = await Promise.all(nextServices.map((service) => listCateringOffers(restaurantID, service.id)));
      setServices(nextServices);
      setOffersByService(Object.fromEntries(nextServices.map((service, index) => [service.id, offerLists[index]])));
    } finally {
      setLoading(false);
    }
  }, [restaurantID]);

  useEffect(() => { void reload(); }, [reload]);

  const archive = async (service: CateringService) => {
    if (!confirm(t('catering_offer_group_archive_confirm'))) return;
    await archiveCateringService(restaurantID, service.id);
    await reload();
  };

  if (loading) {
    return <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" /></div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHead
        title={t('catering_offer_catalog_title')}
        desc={t('catering_configurable_services_hint')}
        actions={canEdit ? <Button variant="primary" size="md" onClick={() => setModal({ open: true })}><PlusIcon />{t('catering_offer_group_new')}</Button> : undefined}
      />

      {services.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-[var(--divider)] bg-[var(--surface)] px-6 py-16 text-center">
          <FolderOpenIcon className="mx-auto h-10 w-10 text-fg-tertiary" />
          <h2 className="mt-4 text-lg font-semibold text-fg-primary">{t('catering_offer_catalog_empty_title')}</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-fg-secondary">{t('catering_offer_catalog_empty_hint')}</p>
          {canEdit && <Button variant="primary" size="md" className="mt-5" onClick={() => setModal({ open: true })}><PlusIcon />{t('catering_offer_group_create_first')}</Button>}
        </section>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {services.map((service) => {
            const offers = offersByService[service.id] ?? [];
            return (
              <article key={service.id} className="overflow-hidden rounded-2xl border border-[var(--divider)] bg-[var(--surface)] shadow-sm">
                <header className="flex items-start justify-between gap-4 border-t-4 border-brand-500 px-5 py-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-fg-primary">{service.name}</h2>
                      {!service.is_active && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-subtle)] px-2 py-1 text-[11px] font-semibold text-fg-tertiary"><EyeOffIcon className="h-3 w-3" />{t('catering_offer_hidden')}</span>}
                    </div>
                    {service.description && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-fg-secondary">{service.description}</p>}
                  </div>
                  {canEdit && <div className="flex shrink-0 gap-1"><button type="button" onClick={() => setModal({ open: true, editing: service })} aria-label={t('edit')} className="rounded-lg p-2 text-fg-secondary hover:bg-brand-500/10 hover:text-brand-600"><PencilIcon className="h-4 w-4" /></button><button type="button" onClick={() => void archive(service)} aria-label={t('delete')} className="rounded-lg p-2 text-fg-secondary hover:bg-red-500/10 hover:text-red-500"><TrashIcon className="h-4 w-4" /></button></div>}
                </header>
                <div className="border-y border-[var(--divider)] bg-[var(--surface-subtle)] px-4 py-3">
                  {offers.length === 0 ? <p className="py-3 text-sm text-fg-secondary">{t('catering_configurable_offers_empty')}</p> : <div className="space-y-1">{offers.map((offer) => <div key={offer.id} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--surface)] px-3 py-2"><span className="min-w-0 truncate text-sm font-semibold text-fg-primary">{offer.name}</span><span className="shrink-0 rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600">{t(offerModeKey(offer))}</span></div>)}</div>}
                </div>
                <footer className="flex items-center justify-between gap-3 px-5 py-4">
                  <p className="text-xs text-fg-tertiary">{t('catering_configurable_offer_count').replace('{n}', String(offers.length))}</p>
                  <Button variant="secondary" size="sm" onClick={() => router.push(`/${restaurantID}/catering/services/${service.id}`)}>{t('catering_configurable_manage_offers')}<ArrowRightIcon className="rtl:rotate-180" /></Button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {modal.open && <ServiceEditor restaurantId={restaurantID} editing={modal.editing} onClose={() => setModal({ open: false })} onSaved={async () => { setModal({ open: false }); await reload(); }} />}
    </div>
  );
}

function ServiceEditor({ restaurantId, editing, onClose, onSaved }: { restaurantId: number; editing?: CateringService; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [visible, setVisible] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const body: CateringServiceInput = {
      name: name.trim(), description: description.trim(),
      pricing_model: editing?.pricing_model ?? 'per_unit',
      date_selection_timing: editing?.date_selection_timing ?? 'checkout',
      quote_mode: editing?.quote_mode ?? 'review',
      selection_mode: editing?.selection_mode ?? 'multiple',
      allow_extra_sessions: editing?.allow_extra_sessions ?? false,
      max_sessions: Math.max(2, editing?.max_sessions ?? 3),
      min_guests: editing?.min_guests ?? 0,
      deposit_pct: editing?.deposit_pct ?? 0,
      is_active: visible, display_order: editing?.display_order ?? 0,
    };
    try {
      if (editing) await updateCateringService(restaurantId, editing.id, body);
      else await createCateringService(restaurantId, body);
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? t('catering_offer_group_edit') : t('catering_offer_group_new')} subtitle={t('catering_configurable_service_editor_hint')} icon={<FolderOpenIcon />} onClose={onClose} size="lg" footer={<div className="flex justify-end gap-2"><Button variant="secondary" size="md" onClick={onClose}>{t('cancel')}</Button><Button variant="primary" size="md" disabled={saving || !name.trim()} onClick={save}>{saving ? t('saving') : t('save')}</Button></div>}>
      <div className="space-y-5">
        <label><span className="text-sm font-semibold text-fg-secondary">{t('catering_offer_group_name')}</span><input autoFocus className="input mt-1" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><span className="text-sm font-semibold text-fg-secondary">{t('description')}</span><textarea rows={3} className="input mt-1" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label className="flex items-start gap-3 rounded-xl border border-brand-500/20 bg-brand-500/5 p-4"><input type="checkbox" className="mt-1" checked={visible} onChange={(event) => setVisible(event.target.checked)} /><span><span className="block font-semibold text-fg-primary">{t('catering_offer_group_visible')}</span><span className="mt-1 block text-sm text-fg-secondary">{t('catering_offer_group_visible_hint')}</span></span></label>
      </div>
    </Modal>
  );
}
