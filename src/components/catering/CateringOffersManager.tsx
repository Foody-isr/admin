'use client';

import { useEffect, useState } from 'react';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EyeOffIcon,
  FileTextIcon,
  PencilIcon,
  PlusIcon,
  ReceiptTextIcon,
  TrashIcon,
  UsersIcon,
} from 'lucide-react';
import Modal from '@/components/Modal';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import {
  archiveCateringOffer,
  createCateringOffer,
  updateCateringOffer,
  type CateringCatalogGroup,
  type CateringCatalogItem,
  type CateringDateSelectionTiming,
  type CateringOffer,
  type CateringOfferInput,
} from '@/lib/api';
import CateringGroupArticlesEditor from './CateringGroupArticlesEditor';

type Props = {
  restaurantId: number;
  serviceId: number;
  offers: CateringOffer[];
  groups: CateringCatalogGroup[];
  items: CateringCatalogItem[];
  canEdit: boolean;
  onChanged: () => void | Promise<void>;
};

function pricingKey(model: CateringOffer['pricing_model']): string {
  if (model === 'per_person') return 'catering_offer_mode_per_person';
  if (model === 'custom_quote') return 'catering_offer_mode_custom_quote';
  return 'catering_offer_mode_per_unit';
}

export default function CateringOffersManager({ restaurantId, serviceId, offers, groups, items, canEdit, onChanged }: Props) {
  const { t } = useI18n();
  const [openOfferId, setOpenOfferId] = useState<number | null>(offers[0]?.id ?? null);
  const [modal, setModal] = useState<{ open: boolean; editing?: CateringOffer }>({ open: false });

  useEffect(() => {
    if (openOfferId !== null && offers.some((offer) => offer.id === openOfferId)) return;
    setOpenOfferId(offers[0]?.id ?? null);
  }, [offers, openOfferId]);

  const remove = async (offer: CateringOffer) => {
    if (!confirm(t('catering_configurable_offer_delete_confirm').replace('{name}', offer.name))) return;
    await archiveCateringOffer(restaurantId, offer.id);
    await onChanged();
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-[var(--divider)] bg-[var(--surface)] shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--divider)] px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-fg-primary">{t('catering_configurable_offers_title')}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-secondary">{t('catering_configurable_offers_hint')}</p>
          </div>
          {canEdit && (
            <Button variant="primary" size="sm" onClick={() => setModal({ open: true })}>
              <PlusIcon />{t('catering_configurable_offer_add')}
            </Button>
          )}
        </header>

        {offers.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <ReceiptTextIcon className="mx-auto h-9 w-9 text-fg-tertiary" />
            <h3 className="mt-3 font-semibold text-fg-primary">{t('catering_configurable_offers_empty')}</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-fg-secondary">{t('catering_configurable_offers_empty_hint')}</p>
            {canEdit && <Button variant="primary" size="sm" className="mt-5" onClick={() => setModal({ open: true })}><PlusIcon />{t('catering_configurable_offer_add')}</Button>}
          </div>
        ) : (
          <div className="divide-y divide-[var(--divider)]">
            {offers.map((offer) => {
              const expanded = openOfferId === offer.id;
              const offerGroups = groups.filter((group) => group.offer_id === offer.id);
              const offerItems = items.filter((item) => item.offer_id === offer.id);
              return (
                <div key={offer.id}>
                  <div className="flex items-start gap-3 px-4 py-4 sm:px-6">
                    <button
                      type="button"
                      onClick={() => setOpenOfferId(expanded ? null : offer.id)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-start"
                      aria-expanded={expanded}
                    >
                      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600">
                        {offer.pricing_model === 'custom_quote' ? <FileTextIcon className="h-4 w-4" /> : offer.pricing_model === 'per_person' ? <UsersIcon className="h-4 w-4" /> : <ReceiptTextIcon className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-fg-primary">{offer.name}</span>
                          <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-[11px] font-semibold text-fg-secondary">{t(pricingKey(offer.pricing_model))}</span>
                          {!offer.is_active && <span className="inline-flex items-center gap-1 text-xs text-fg-tertiary"><EyeOffIcon className="h-3.5 w-3.5" />{t('catering_offer_hidden')}</span>}
                        </span>
                        {offer.description && <span className="mt-1 block text-sm leading-5 text-fg-secondary">{offer.description}</span>}
                        {offer.pricing_model !== 'custom_quote' && <span className="mt-2 block text-xs font-medium text-fg-tertiary">{t('catering_configurable_offer_contents').replace('{groups}', String(offerGroups.length)).replace('{items}', String(offerItems.length))}</span>}
                      </span>
                    </button>
                    {canEdit && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => setModal({ open: true, editing: offer })} aria-label={t('edit')} className="rounded-lg p-2 text-fg-secondary hover:bg-brand-500/10 hover:text-brand-600"><PencilIcon className="h-4 w-4" /></button>
                        <button type="button" onClick={() => void remove(offer)} aria-label={t('delete')} className="rounded-lg p-2 text-fg-secondary hover:bg-red-500/10 hover:text-red-500"><TrashIcon className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setOpenOfferId(expanded ? null : offer.id)} aria-label={expanded ? t('catering_formula_collapse') : t('catering_formula_expand')} className="rounded-lg p-2 text-fg-secondary hover:bg-[var(--surface-subtle)]">{expanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}</button>
                      </div>
                    )}
                  </div>
                  {expanded && (
                    <div className="border-t border-[var(--divider)] bg-[var(--surface-subtle)] p-4 sm:p-6">
                      {offer.pricing_model === 'custom_quote' ? (
                        <div className="rounded-xl border border-dashed border-[var(--divider)] bg-[var(--surface)] px-5 py-8 text-center">
                          <FileTextIcon className="mx-auto h-7 w-7 text-brand-600" />
                          <p className="mt-3 font-semibold text-fg-primary">{t('catering_configurable_offer_custom_ready')}</p>
                          <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-fg-secondary">{t('catering_configurable_offer_custom_ready_hint')}</p>
                        </div>
                      ) : (
                        <CateringGroupArticlesEditor
                          restaurantId={restaurantId}
                          serviceId={serviceId}
                          offerId={offer.id}
                          pricingModel={offer.pricing_model}
                          groups={offerGroups}
                          items={offerItems}
                          canEdit={canEdit}
                          onChanged={onChanged}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {modal.open && (
        <OfferEditor
          restaurantId={restaurantId}
          serviceId={serviceId}
          position={offers.length}
          editing={modal.editing}
          onClose={() => setModal({ open: false })}
          onSaved={async (offer) => {
            setModal({ open: false });
            setOpenOfferId(offer.id);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

function OfferEditor({ restaurantId, serviceId, position, editing, onClose, onSaved }: {
  restaurantId: number;
  serviceId: number;
  position: number;
  editing?: CateringOffer;
  onClose: () => void;
  onSaved: (offer: CateringOffer) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [pricingModel, setPricingModel] = useState<CateringOffer['pricing_model']>(editing?.pricing_model ?? 'per_unit');
  const [dateTiming, setDateTiming] = useState<CateringDateSelectionTiming>(editing?.date_selection_timing ?? 'checkout');
  const [quoteMode, setQuoteMode] = useState<'auto' | 'review'>(editing?.quote_mode ?? 'review');
  const [selectionMode, setSelectionMode] = useState<'single' | 'multiple'>(editing?.selection_mode === 'single' ? 'single' : 'multiple');
  const [minGuests, setMinGuests] = useState(String(editing?.min_guests ?? 0));
  const [depositPct, setDepositPct] = useState(String(editing?.deposit_pct ?? 0));
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const valid = name.trim().length > 0
    && Number.isFinite(Number(minGuests)) && Number(minGuests) >= 0
    && Number.isFinite(Number(depositPct)) && Number(depositPct) >= 0 && Number(depositPct) <= 100;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError('');
    const body: CateringOfferInput = {
      name: name.trim(),
      description: description.trim(),
      translations: editing?.translations ?? {},
      pricing_model: pricingModel,
      date_selection_timing: pricingModel === 'custom_quote' ? 'checkout' : dateTiming,
      quote_mode: pricingModel === 'custom_quote' ? 'review' : quoteMode,
      selection_mode: pricingModel === 'custom_quote' ? '' : selectionMode,
      allow_extra_sessions: editing?.allow_extra_sessions ?? false,
      max_sessions: Math.max(2, editing?.max_sessions ?? 3),
      min_guests: Math.max(0, Math.floor(Number(minGuests))),
      deposit_pct: pricingModel === 'custom_quote' ? 0 : Number(depositPct),
      flow_config: editing?.flow_config ?? {},
      is_active: isActive,
      sort_order: editing?.sort_order ?? position,
    };
    try {
      const offer = editing
        ? await updateCateringOffer(restaurantId, editing.id, body)
        : await createCateringOffer(restaurantId, serviceId, body);
      await onSaved(offer);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('catering_configurable_offer_save_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? t('catering_configurable_offer_edit') : t('catering_configurable_offer_new')}
      subtitle={t('catering_configurable_offer_editor_hint')}
      icon={<ReceiptTextIcon />}
      onClose={onClose}
      size="2xl"
      footer={<div className="flex items-center gap-3"><p className="text-sm text-red-500">{error}</p><div className="ms-auto flex gap-2"><Button variant="secondary" size="md" onClick={onClose}>{t('cancel')}</Button><Button variant="primary" size="md" disabled={!valid || saving} onClick={save}>{saving ? t('saving') : t('save')}</Button></div></div>}
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="text-sm font-semibold text-fg-secondary">{t('catering_configurable_offer_name')}</span><input autoFocus className="input mt-1" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="sm:col-span-2"><span className="text-sm font-semibold text-fg-secondary">{t('description')}</span><textarea rows={3} className="input mt-1" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold text-fg-secondary">{t('catering_configurable_offer_pricing')}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {(['per_unit', 'per_person', 'custom_quote'] as const).map((model) => {
              const active = pricingModel === model;
              return <button key={model} type="button" aria-pressed={active} onClick={() => setPricingModel(model)} className={`rounded-xl border p-3 text-start transition ${active ? 'border-brand-500 bg-brand-500/10 ring-1 ring-brand-500' : 'border-[var(--divider)] bg-[var(--surface-subtle)] hover:border-brand-400'}`}><span className="block font-semibold text-fg-primary">{t(pricingKey(model))}</span><span className="mt-1 block text-xs leading-5 text-fg-secondary">{t(`catering_configurable_offer_${model}_hint`)}</span></button>;
            })}
          </div>
        </fieldset>

        <label><span className="text-sm font-semibold text-fg-secondary">{t('catering_service_min_guests')}</span><input type="number" min="0" step="1" className="input mt-1 max-w-40" value={minGuests} onChange={(event) => setMinGuests(event.target.value)} /></label>

        {pricingModel !== 'custom_quote' && (
          <div className="grid gap-5 rounded-xl border border-[var(--divider)] bg-[var(--surface-subtle)] p-4 sm:grid-cols-2">
            <fieldset><legend className="text-sm font-semibold text-fg-secondary">{t('catering_configurable_offer_validation')}</legend><div className="mt-2 space-y-2">{(['review', 'auto'] as const).map((mode) => <label key={mode} className="flex items-start gap-2 text-sm text-fg-primary"><input type="radio" name="offer-quote-mode" checked={quoteMode === mode} onChange={() => setQuoteMode(mode)} /><span><span className="font-semibold">{t(mode === 'review' ? 'catering_quote_mode_review' : 'catering_quote_mode_auto')}</span><span className="block text-xs text-fg-tertiary">{t(mode === 'review' ? 'catering_quote_mode_review_hint' : 'catering_quote_mode_auto_hint')}</span></span></label>)}</div></fieldset>
            <fieldset><legend className="text-sm font-semibold text-fg-secondary">{t('catering_offer_group_selection_title')}</legend><div className="mt-2 space-y-2">{(['multiple', 'single'] as const).map((mode) => <label key={mode} className="flex items-center gap-2 text-sm text-fg-primary"><input type="radio" name="offer-selection-mode" checked={selectionMode === mode} onChange={() => setSelectionMode(mode)} /><span>{t(mode === 'multiple' ? 'catering_offer_group_selection_multiple' : 'catering_offer_group_selection_single')}</span></label>)}</div></fieldset>
            <label><span className="text-sm font-semibold text-fg-secondary">{t('catering_offer_group_date_timing')}</span><select className="input mt-1" value={dateTiming} onChange={(event) => setDateTiming(event.target.value as CateringDateSelectionTiming)}><option value="before_catalog">{t('catering_offer_group_date_before_catalog')}</option><option value="checkout">{t('catering_offer_group_date_checkout')}</option></select></label>
            <label><span className="text-sm font-semibold text-fg-secondary">{t('catering_field_deposit_pct')}</span><div className="relative mt-1"><input type="number" min="0" max="100" className="input pe-8" value={depositPct} onChange={(event) => setDepositPct(event.target.value)} /><span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-fg-tertiary">%</span></div></label>
          </div>
        )}

        <label className="flex items-start gap-3 rounded-xl border border-brand-500/20 bg-brand-500/5 p-4"><input type="checkbox" className="mt-1" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /><span><span className="block font-semibold text-fg-primary">{t('catering_offer_group_visible')}</span><span className="mt-1 block text-sm text-fg-secondary">{t('catering_offer_group_visible_hint')}</span></span></label>
      </div>
    </Modal>
  );
}
