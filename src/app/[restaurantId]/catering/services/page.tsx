'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowRightIcon,
  EyeOffIcon,
  FolderOpenIcon,
  PackageOpenIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { PageHead, Button } from '@/components/ds';
import Modal from '@/components/Modal';
import {
  archiveCateringService,
  createCateringService,
  listCateringItems,
  listCateringServices,
  updateCateringService,
  type CateringCatalogItem,
  type CateringPricingModel,
  type CateringService,
} from '@/lib/api';

function priceLabel(item: CateringCatalogItem, model: CateringPricingModel, t: (key: string) => string): string {
  if (model === 'custom_quote' && item.base_price <= 0) return t('catering_offer_on_request');
  if (item.base_price <= 0) return t('catering_offer_price_missing');
  const unit = model === 'per_person' ? t('catering_offer_per_guest') : model === 'per_unit' ? t('catering_offer_per_unit') : '';
  return `${model === 'custom_quote' ? t('catering_offer_from') : ''}₪${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(item.base_price)}${unit}`;
}

export default function CateringOfferCatalogPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('catering.manage');

  const [groups, setGroups] = useState<CateringService[]>([]);
  const [offers, setOffers] = useState<Record<number, CateringCatalogItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ open: boolean; editing?: CateringService }>({ open: false });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const services = await listCateringServices(rid);
      const itemLists = await Promise.all(services.map((service) => listCateringItems(rid, service.id)));
      setGroups(services);
      setOffers(Object.fromEntries(services.map((service, index) => [service.id, itemLists[index]])));
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  const handleArchive = async (group: CateringService) => {
    if (!confirm(t('catering_offer_group_archive_confirm'))) return;
    await archiveCateringService(rid, group.id);
    reload();
  };

  if (loading) {
    return <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" /></div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHead
        title={t('catering_offer_catalog_title')}
        desc={t('catering_offer_catalog_hint')}
        actions={canEdit ? (
          <Button variant="primary" size="md" onClick={() => setEditModal({ open: true })}>
            <PlusIcon />
            {t('catering_offer_group_new')}
          </Button>
        ) : undefined}
      />

      {groups.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-[var(--divider)] bg-[var(--surface)] px-6 py-16 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/10 text-brand-600"><FolderOpenIcon className="h-7 w-7" /></div>
          <h2 className="mt-4 text-lg font-semibold text-fg-primary">{t('catering_offer_catalog_empty_title')}</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-fg-secondary">{t('catering_offer_catalog_empty_hint')}</p>
          {canEdit && <Button variant="primary" size="md" className="mt-5" onClick={() => setEditModal({ open: true })}><PlusIcon />{t('catering_offer_group_create_first')}</Button>}
        </section>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {groups.map((group) => {
            const groupOffers = offers[group.id] ?? [];
            return (
              <article key={group.id} className="relative overflow-hidden rounded-2xl border border-[var(--divider)] bg-[var(--surface)] shadow-sm transition-shadow hover:shadow-md">
                <div className="absolute inset-x-0 top-0 h-1 bg-brand-500" />
                <header className="flex items-start justify-between gap-4 px-5 pb-4 pt-6">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-fg-primary">{group.name}</h2>
                      {!group.is_active && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-subtle)] px-2 py-1 text-[11px] font-semibold text-fg-tertiary"><EyeOffIcon className="h-3 w-3" />{t('catering_offer_hidden')}</span>}
                    </div>
                    {group.description && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-fg-secondary">{group.description}</p>}
                    <p className="mt-3 text-xs font-semibold text-fg-secondary">{t('catering_offer_count').replace('{n}', String(groupOffers.length))}</p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => setEditModal({ open: true, editing: group })} aria-label={t('catering_offer_group_edit')} className="rounded-lg p-2 text-fg-secondary hover:bg-brand-500/10 hover:text-brand-600"><PencilIcon className="h-4 w-4" /></button>
                      <button type="button" onClick={() => handleArchive(group)} aria-label={t('catering_archive')} className="rounded-lg p-2 text-fg-secondary hover:bg-red-500/10 hover:text-red-500"><TrashIcon className="h-4 w-4" /></button>
                    </div>
                  )}
                </header>

                <div className="border-y border-[var(--divider)] bg-[var(--surface-subtle)] px-3 py-2">
                  {groupOffers.length === 0 ? (
                    <div className="flex items-center gap-3 rounded-xl px-2 py-4 text-sm text-fg-secondary">
                      <PackageOpenIcon className="h-5 w-5 text-fg-tertiary" />
                      {t('catering_offer_group_empty')}
                    </div>
                  ) : groupOffers.slice(0, 4).map((offer) => (
                    <div key={offer.id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 hover:bg-[var(--surface)]">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-fg-primary">{offer.name}</p>
                        {offer.overview && <p className="truncate text-xs text-fg-secondary">{offer.overview}</p>}
                      </div>
                      <span className="shrink-0 text-xs font-bold text-brand-600">{priceLabel(offer, group.pricing_model, t)}</span>
                    </div>
                  ))}
                  {groupOffers.length > 4 && <p className="px-2 pb-2 pt-1 text-xs font-medium text-fg-tertiary">{t('catering_offer_more').replace('{n}', String(groupOffers.length - 4))}</p>}
                </div>

                <footer className="flex items-center justify-between gap-3 px-5 py-4">
                  <p className="text-xs text-fg-tertiary">{t('catering_offer_group_footer_hint')}</p>
                  <Button variant="secondary" size="sm" onClick={() => router.push(`/${rid}/catering/services/${group.id}`)}>
                    {t('catering_offer_group_open')}
                    <ArrowRightIcon className="rtl:rotate-180" />
                  </Button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {editModal.open && (
        <OfferGroupEditor
          restaurantId={rid}
          editing={editModal.editing}
          onClose={() => setEditModal({ open: false })}
          onSaved={() => { setEditModal({ open: false }); reload(); }}
        />
      )}
    </div>
  );
}

function OfferGroupEditor({ restaurantId, editing, onClose, onSaved }: {
  restaurantId: number;
  editing?: CateringService;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [selectionMode, setSelectionMode] = useState<'single' | 'multiple'>(editing?.selection_mode === 'single' ? 'single' : 'multiple');
  const [allowExtraSessions, setAllowExtraSessions] = useState(editing?.allow_extra_sessions ?? false);
  const [maxSessions, setMaxSessions] = useState(Math.max(2, editing?.max_sessions ?? 3));
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        description,
        pricing_model: editing?.pricing_model ?? 'per_person' as const,
        quote_mode: editing?.quote_mode ?? 'review' as const,
        selection_mode: selectionMode,
        allow_extra_sessions: allowExtraSessions,
        max_sessions: maxSessions,
        is_active: isActive,
        display_order: editing?.display_order ?? 0,
      };
      if (editing) await updateCateringService(restaurantId, editing.id, body);
      else await createCateringService(restaurantId, body);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? t('catering_offer_group_edit') : t('catering_offer_group_new')} subtitle={t('catering_offer_group_editor_hint')} icon={<FolderOpenIcon />} onClose={onClose} size="lg">
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-fg-secondary">{t('catering_offer_group_name')}</label>
          <input autoFocus className="input mt-1" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleSave(); }} placeholder={t('catering_offer_group_name_example')} />
        </div>
        <div>
          <label className="block text-sm font-medium text-fg-secondary">{t('catering_offer_group_description')}</label>
          <textarea rows={3} className="input mt-1" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('catering_offer_group_description_example')} />
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-fg-secondary">{t('catering_offer_group_selection_title')}</legend>
          <p className="mt-1 text-sm text-fg-tertiary">{t('catering_offer_group_selection_hint')}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(['multiple', 'single'] as const).map((mode) => {
              const active = selectionMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectionMode(mode)}
                  className={`rounded-xl border p-4 text-start transition ${active ? 'border-brand-500 bg-brand-500/10 ring-1 ring-brand-500' : 'border-[var(--divider)] bg-[var(--surface-subtle)] hover:border-brand-400'}`}
                >
                  <span className="font-semibold text-fg-primary">{t(mode === 'multiple' ? 'catering_offer_group_selection_multiple' : 'catering_offer_group_selection_single')}</span>
                  <span className="mt-1 block text-sm leading-5 text-fg-secondary">{t(mode === 'multiple' ? 'catering_offer_group_selection_multiple_hint' : 'catering_offer_group_selection_single_hint')}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
        <section className="rounded-xl border border-[var(--divider)] bg-[var(--surface-subtle)] p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1" checked={allowExtraSessions} onChange={(event) => setAllowExtraSessions(event.target.checked)} />
            <span>
              <span className="block font-semibold text-fg-primary">{t('catering_offer_group_extra_sessions_title')}</span>
              <span className="mt-1 block text-sm leading-5 text-fg-secondary">{t('catering_offer_group_extra_sessions_hint')}</span>
            </span>
          </label>
          {allowExtraSessions && (
            <label className="mt-4 block border-t border-[var(--divider)] pt-4">
              <span className="text-sm font-medium text-fg-secondary">{t('catering_offer_group_max_sessions')}</span>
              <input
                type="number"
                min={2}
                max={10}
                className="input mt-1 max-w-40"
                value={maxSessions}
                onChange={(event) => setMaxSessions(Math.min(10, Math.max(2, Number(event.target.value) || 2)))}
              />
              <span className="mt-1 block text-xs text-fg-tertiary">{t('catering_offer_group_max_sessions_hint')}</span>
            </label>
          )}
        </section>
        <label className="flex items-center gap-2 text-sm font-medium text-fg-primary">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
          {t('catering_offer_group_visible')}
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="md" onClick={onClose}>{t('catering_cancel')}</Button>
          <Button variant="primary" size="md" disabled={saving || !name.trim()} onClick={handleSave}>{saving ? t('catering_offer_saving') : t('catering_offer_group_save')}</Button>
        </div>
      </div>
    </Modal>
  );
}
