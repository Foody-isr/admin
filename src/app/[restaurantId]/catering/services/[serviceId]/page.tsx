'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleDollarSignIcon,
  EyeOffIcon,
  ImageIcon,
  PackageOpenIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
  UtensilsCrossedIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { PageHead, Button } from '@/components/ds';
import Modal from '@/components/Modal';
import { CateringLocaleFields } from '@/components/catering/CateringLocaleFields';
import CateringItemGalleryEditor from '@/components/catering/CateringItemGalleryEditor';
import CateringFormulaComposer, {
  newChoiceGroupDraft,
  newIncludedSectionDraft,
  toChoiceGroupInputs,
  toIncludedSectionInputs,
  type CateringChoiceGroupDraft,
  type CateringIncludedSectionDraft,
} from '@/components/catering/CateringFormulaComposer';
import {
  applyOfferRateDrafts,
  normalizeCateringFlowConfig,
  offerRateDrafts,
  type CateringOfferRateDraft,
} from '@/components/catering/catering-offer-pricing';
import { type Locale } from '@/components/i18n/LocaleTabs';
import {
  archiveCateringItem,
  createCateringItem,
  getRestaurant,
  listCateringItems,
  listCateringServices,
  reorderCateringItems,
  updateCateringItem,
  updateCateringServiceFlow,
  uploadSectionImage,
  type CateringCatalogItem,
  type CateringCatalogItemImageInput,
  type CateringCatalogItemInput,
  type CateringFlowConfig,
  type CateringIncludedItemInput,
  type CateringPricingModel,
  type CateringService,
} from '@/lib/api';

type EditorSection = 'identity' | 'pricing' | 'menu' | 'photos';

const WEEKDAYS = [
  'catering_flow_weekday_sunday',
  'catering_flow_weekday_monday',
  'catering_flow_weekday_tuesday',
  'catering_flow_weekday_wednesday',
  'catering_flow_weekday_thursday',
  'catering_flow_weekday_friday',
  'catering_flow_weekday_saturday',
] as const;

function money(value: number): string {
  return `₪${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}`;
}

function priceUnit(model: CateringPricingModel, t: (key: string) => string): string {
  if (model === 'per_person') return t('catering_offer_per_guest');
  if (model === 'per_unit') return t('catering_offer_per_unit');
  return '';
}

function offerPriceSummary(
  item: CateringCatalogItem,
  model: CateringPricingModel,
  flow: CateringFlowConfig,
  t: (key: string) => string,
): string {
  if (model === 'custom_quote' && item.base_price <= 0) return t('catering_offer_on_request');
  const rates = offerRateDrafts(flow, item.id).map((rate) => Number(rate.price)).filter((price) => price > 0);
  const prices = [...rates, ...(item.base_price > 0 ? [item.base_price] : [])];
  if (!prices.length) return t('catering_offer_price_missing');
  const prefix = prices.length > 1 || model === 'custom_quote' ? t('catering_offer_from') : '';
  return `${prefix}${money(Math.min(...prices))}${priceUnit(model, t)}`;
}

export default function CateringOfferGroupPage() {
  const { restaurantId, serviceId } = useParams();
  const rid = Number(restaurantId);
  const sid = Number(serviceId);
  const router = useRouter();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('catering.manage');

  const [service, setService] = useState<CateringService>();
  const [items, setItems] = useState<CateringCatalogItem[]>([]);
  const [sourceLocale, setSourceLocale] = useState<Locale>('en');
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<{ open: boolean; item?: CateringCatalogItem }>({ open: false });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [services, nextItems, restaurant] = await Promise.all([
        listCateringServices(rid),
        listCateringItems(rid, sid),
        getRestaurant(rid),
      ]);
      setService(services.find((candidate) => candidate.id === sid));
      setItems(nextItems);
      if (restaurant.default_locale === 'en' || restaurant.default_locale === 'he' || restaurant.default_locale === 'fr') {
        setSourceLocale(restaurant.default_locale);
      }
    } finally {
      setLoading(false);
    }
  }, [rid, sid]);

  useEffect(() => { reload(); }, [reload]);

  const handleArchive = async (item: CateringCatalogItem) => {
    if (!confirm(t('catering_offer_archive_confirm'))) return;
    await archiveCateringItem(rid, item.id);
    reload();
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    try {
      await reorderCateringItems(rid, sid, next.map((item) => item.id));
    } catch {
      reload();
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" /></div>;
  }

  const flow = normalizeCateringFlowConfig(service?.flow_config);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <button
        onClick={() => router.push(`/${rid}/catering/services`)}
        className="flex items-center gap-1.5 text-sm font-medium text-fg-secondary transition-colors hover:text-fg-primary"
      >
        <ArrowLeftIcon className="h-4 w-4 rtl:rotate-180" />
        {t('catering_offer_back_to_catalog')}
      </button>

      <PageHead
        title={service?.name ?? t('catering_offer_group_title')}
        desc={service?.description || t('catering_offer_group_hint')}
        actions={canEdit ? (
          <Button variant="primary" size="md" onClick={() => setEditor({ open: true })}>
            <PlusIcon />
            {t('catering_offer_new')}
          </Button>
        ) : undefined}
      />

      <section className="overflow-hidden rounded-2xl border border-[var(--divider)] bg-[var(--surface)] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--divider)] px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-fg-primary">{t('catering_offer_list_title')}</h2>
            <p className="mt-0.5 text-sm text-fg-secondary">{t('catering_offer_list_hint')}</p>
          </div>
          <span className="rounded-full bg-[var(--surface-subtle)] px-3 py-1 text-xs font-semibold text-fg-secondary">
            {t('catering_offer_count').replace('{n}', String(items.length))}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-600">
              <PackageOpenIcon className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-semibold text-fg-primary">{t('catering_offer_empty_title')}</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-fg-secondary">{t('catering_offer_empty_hint')}</p>
            {canEdit && (
              <Button variant="primary" size="md" className="mt-5" onClick={() => setEditor({ open: true })}>
                <PlusIcon />
                {t('catering_offer_create_first')}
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[var(--divider)]">
            {items.map((item, index) => {
              const rates = offerRateDrafts(flow, item.id);
              const contentCount = (item.included_sections?.length ?? 0) + (item.choice_groups?.length ?? 0);
              return (
                <article key={item.id} className="group grid gap-4 p-4 transition-colors hover:bg-[var(--surface-subtle)] sm:grid-cols-[112px_minmax(0,1fr)_auto] sm:p-5">
                  <div className="aspect-[4/3] overflow-hidden rounded-xl bg-[var(--surface-subtle)] sm:aspect-square">
                    {item.image_url ? (
                      <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-fg-tertiary"><UtensilsCrossedIcon className="h-7 w-7" /></div>
                    )}
                  </div>

                  <div className="min-w-0 self-center">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-fg-primary">{item.name}</h3>
                      {!item.is_active && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-subtle)] px-2 py-1 text-[11px] font-semibold text-fg-tertiary">
                          <EyeOffIcon className="h-3 w-3" /> {t('catering_offer_hidden')}
                        </span>
                      )}
                    </div>
                    {item.overview && <p className="mt-1 line-clamp-2 max-w-2xl text-sm leading-relaxed text-fg-secondary">{item.overview}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fg-secondary">
                      <span className="font-bold text-brand-600">{offerPriceSummary(item, service?.pricing_model ?? 'per_person', flow, t)}</span>
                      {(item.min_guests > 0 || item.min_quantity > 0) && (
                        <span className="inline-flex items-center gap-1"><UsersIcon className="h-3.5 w-3.5" />{t('catering_offer_minimum_short').replace('{n}', String(item.min_guests || item.min_quantity))}</span>
                      )}
                      {rates.length > 0 && (
                        <span className="inline-flex items-center gap-1"><CalendarDaysIcon className="h-3.5 w-3.5" />{t('catering_offer_rate_count').replace('{n}', String(rates.length))}</span>
                      )}
                      {contentCount > 0 && (
                        <span className="inline-flex items-center gap-1"><UtensilsCrossedIcon className="h-3.5 w-3.5" />{t('catering_offer_content_ready')}</span>
                      )}
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex items-center justify-end gap-1 self-center">
                      <button type="button" disabled={index === 0} onClick={() => handleMove(index, -1)} aria-label={t('catering_move_up')} className="rounded-lg p-2 text-fg-secondary hover:bg-[var(--surface)] hover:text-fg-primary disabled:opacity-25"><ChevronUpIcon className="h-4 w-4" /></button>
                      <button type="button" disabled={index === items.length - 1} onClick={() => handleMove(index, 1)} aria-label={t('catering_move_down')} className="rounded-lg p-2 text-fg-secondary hover:bg-[var(--surface)] hover:text-fg-primary disabled:opacity-25"><ChevronDownIcon className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setEditor({ open: true, item })} aria-label={t('catering_offer_edit')} className="rounded-lg p-2 text-fg-secondary hover:bg-brand-500/10 hover:text-brand-600"><PencilIcon className="h-4 w-4" /></button>
                      <button type="button" onClick={() => handleArchive(item)} aria-label={t('catering_archive')} className="rounded-lg p-2 text-fg-secondary hover:bg-red-500/10 hover:text-red-500"><TrashIcon className="h-4 w-4" /></button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {editor.open && service && (
        <OfferEditor
          restaurantId={rid}
          service={service}
          sourceLocale={sourceLocale}
          editing={editor.item}
          onClose={() => setEditor({ open: false })}
          onSaved={(updatedService) => {
            if (updatedService) setService(updatedService);
            setEditor({ open: false });
            reload();
          }}
        />
      )}
    </div>
  );
}

function newRate(index: number): CateringOfferRateDraft {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `rate-${Date.now()}-${index}`,
    label: '',
    weekday: '',
    startTime: '',
    endTime: '',
    minGuests: '',
    maxGuests: '',
    price: '',
  };
}

function OfferEditor({ restaurantId, service, sourceLocale, editing, onClose, onSaved }: {
  restaurantId: number;
  service: CateringService;
  sourceLocale: Locale;
  editing?: CateringCatalogItem;
  onClose: () => void;
  onSaved: (updatedService?: CateringService) => void;
}) {
  const { t } = useI18n();
  const flow = useMemo(() => normalizeCateringFlowConfig(service.flow_config), [service.flow_config]);
  const [openSection, setOpenSection] = useState<EditorSection>('identity');
  const [name, setName] = useState(editing?.name ?? '');
  const [overview, setOverview] = useState(editing?.overview ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [translations, setTranslations] = useState<Record<string, Record<string, string>>>(editing?.translations ?? {});
  const [basePrice, setBasePrice] = useState(editing ? String(editing.base_price) : '');
  const [minQuantity, setMinQuantity] = useState(editing ? String(editing.min_quantity || '') : '');
  const [minGuests, setMinGuests] = useState(editing ? String(editing.min_guests || '') : '');
  const [tiers, setTiers] = useState<{ min_guests: string; price: string }[]>(
    () => (editing?.price_tiers ?? []).map((tier) => ({ min_guests: String(tier.min_guests), price: String(tier.price) })),
  );
  const [rates, setRates] = useState<CateringOfferRateDraft[]>(() => editing ? offerRateDrafts(flow, editing.id) : []);
  const [imageUrl, setImageUrl] = useState(editing?.image_url ?? '');
  const [galleryImages, setGalleryImages] = useState<CateringCatalogItemImageInput[]>(
    () => (editing?.gallery_images ?? []).map((image) => ({ image_url: image.image_url, alt_text: image.alt_text, translations: image.translations })),
  );
  const [choiceGroups, setChoiceGroups] = useState<CateringChoiceGroupDraft[]>(
    () => (editing?.choice_groups ?? []).map((group, index) => ({
      ...newChoiceGroupDraft(index, group.name),
      description: group.description ?? '',
      translations: group.translations ?? {},
      min_selections: group.min_selections,
      max_selections: group.max_selections,
      max_per_item: group.max_per_item,
      items: (group.items ?? []).map((item) => ({ menu_item_id: item.menu_item_id, price_delta: item.price_delta, default_quantity: item.default_quantity })),
    })),
  );
  const [includedItems, setIncludedItems] = useState<CateringIncludedItemInput[]>(
    () => (editing?.included_items ?? []).filter((item) => !item.section_id).map((item) => ({
      ...(item.menu_item_id ? { menu_item_id: item.menu_item_id } : { name: item.name }),
      description: item.description ?? '',
    })),
  );
  const [includedSections, setIncludedSections] = useState<CateringIncludedSectionDraft[]>(
    () => (editing?.included_sections ?? []).map((section, index) => ({
      ...newIncludedSectionDraft(index, section.name),
      description: section.description ?? '',
      translations: section.translations ?? {},
      items: (section.items ?? []).map((item) => ({
        ...(item.menu_item_id ? { menu_item_id: item.menu_item_id } : { name: item.name }),
        description: item.description ?? '',
      })),
    })),
  );
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [uploading, setUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const compositionValid = useMemo(() => choiceGroups.every((group) => {
    const defaults = group.items.reduce((sum, item) => sum + item.default_quantity, 0);
    const capacity = group.max_per_item === 0 ? Number.POSITIVE_INFINITY : group.items.length * group.max_per_item;
    return group.name.trim().length > 0 && group.items.length > 0 && group.min_selections >= 0 &&
      group.max_selections >= Math.max(1, group.min_selections) && capacity >= group.min_selections && defaults <= group.max_selections;
  }) && includedItems.every((item) => Boolean(item.menu_item_id || item.name?.trim())) &&
    includedSections.every((section) => section.name.trim().length > 0 && section.items.every((item) => Boolean(item.menu_item_id || item.name?.trim()))),
  [choiceGroups, includedItems, includedSections]);

  const handleCover = async (file: File) => {
    setUploading(true);
    try {
      setImageUrl(await uploadSectionImage(restaurantId, file));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setOpenSection('identity');
      return;
    }
    if (!compositionValid) {
      setOpenSection('menu');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const body: CateringCatalogItemInput = {
        name: name.trim(),
        overview,
        description,
        base_price: Number(basePrice) || 0,
        image_url: imageUrl,
        gallery_images: galleryImages,
        translations,
        is_active: isActive,
        choice_groups: toChoiceGroupInputs(choiceGroups),
        included_sections: toIncludedSectionInputs(includedSections),
        included_items: includedItems,
        ...(service.pricing_model === 'per_unit' ? { min_quantity: Number(minQuantity) || 0 } : {}),
        ...(service.pricing_model === 'per_person' ? {
          min_guests: Number(minGuests) || 0,
          price_tiers: tiers
            .filter((tier) => tier.min_guests.trim() && tier.price.trim())
            .map((tier) => ({ min_guests: Number(tier.min_guests) || 0, price: Number(tier.price) || 0 }))
            .sort((a, b) => a.min_guests - b.min_guests),
        } : {}),
      };
      const item = editing
        ? await updateCateringItem(restaurantId, editing.id, body)
        : await createCateringItem(restaurantId, service.id, body);
      let updatedService: CateringService | undefined;
      if (service.pricing_model === 'per_person') {
        updatedService = await updateCateringServiceFlow(
          restaurantId,
          service.id,
          applyOfferRateDrafts(flow, item.id, rates),
        );
      }
      onSaved(updatedService);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('catering_offer_save_error'));
    } finally {
      setSaving(false);
    }
  };

  const menuCount = includedSections.length + includedItems.length + choiceGroups.length;
  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>{saveError && <p className="text-sm text-red-500">{saveError}</p>}</div>
      <div className="flex gap-2">
        <Button variant="secondary" size="md" onClick={onClose}>{t('catering_cancel')}</Button>
        <Button variant="primary" size="md" disabled={saving || uploading || galleryUploading || !name.trim()} onClick={handleSave}>
          {saving ? t('catering_offer_saving') : t('catering_offer_save')}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      title={editing ? t('catering_offer_edit') : t('catering_offer_new')}
      subtitle={service.name}
      icon={<PackageOpenIcon />}
      onClose={onClose}
      size="5xl"
      bodyClassName="!p-0"
      footer={footer}
    >
      <div className="divide-y divide-[var(--divider)]">
        <EditorAccordion id="identity" open={openSection === 'identity'} onOpen={setOpenSection} icon={<PackageOpenIcon />} title={t('catering_offer_section_identity')} summary={name || t('catering_offer_section_identity_hint')}>
          <CateringLocaleFields
            sourceLocale={sourceLocale}
            name={name}
            onName={setName}
            overview={overview}
            onOverview={setOverview}
            description={description}
            onDescription={setDescription}
            translations={translations}
            onTranslations={setTranslations}
            nameLabel={t('catering_offer_name')}
            overviewLabel={t('catering_offer_short_description')}
            overviewHint={t('catering_offer_short_description_hint')}
            descLabel={t('catering_offer_conditions')}
            descHint={t('catering_offer_conditions_hint')}
          />
          <label className="mt-4 flex items-center gap-2 text-sm font-medium text-fg-primary">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            {t('catering_offer_visible')}
          </label>
        </EditorAccordion>

        <EditorAccordion id="pricing" open={openSection === 'pricing'} onOpen={setOpenSection} icon={<CircleDollarSignIcon />} title={t('catering_offer_section_pricing')} summary={editing ? offerPriceSummary(editing, service.pricing_model, flow, t) : t('catering_offer_section_pricing_hint')}>
          {service.pricing_model === 'custom_quote' ? (
            <div className="rounded-xl border border-[var(--divider)] bg-[var(--surface-subtle)] p-4">
              <p className="font-medium text-fg-primary">{t('catering_offer_custom_quote_title')}</p>
              <p className="mt-1 text-sm text-fg-secondary">{t('catering_offer_custom_quote_hint')}</p>
              <label className="mt-4 block text-sm font-medium text-fg-secondary">{t('catering_offer_starting_price')}</label>
              <input type="number" min={0} step="0.01" className="input mt-1 max-w-xs" value={basePrice} onChange={(event) => setBasePrice(event.target.value)} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-fg-secondary">{service.pricing_model === 'per_person' ? t('catering_offer_base_price_guest') : t('catering_offer_base_price_unit')}</label>
                <input type="number" min={0} step="0.01" className="input mt-1" value={basePrice} onChange={(event) => setBasePrice(event.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-fg-secondary">{service.pricing_model === 'per_person' ? t('catering_offer_min_guests') : t('catering_offer_min_quantity')}</label>
                <input type="number" min={0} step="1" className="input mt-1" value={service.pricing_model === 'per_person' ? minGuests : minQuantity} onChange={(event) => service.pricing_model === 'per_person' ? setMinGuests(event.target.value) : setMinQuantity(event.target.value)} />
              </div>
            </div>
          )}

          {service.pricing_model === 'per_person' && (
            <div className="mt-6 space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-fg-primary">{t('catering_offer_special_rates')}</h4>
                  <p className="mt-0.5 text-sm text-fg-secondary">{t('catering_offer_special_rates_hint')}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setRates((current) => [...current, newRate(current.length)])}>
                  <PlusIcon /> {t('catering_offer_add_rate')}
                </Button>
              </div>
              {rates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--divider)] px-4 py-5 text-center text-sm text-fg-secondary">{t('catering_offer_no_special_rate')}</div>
              ) : rates.map((rate, index) => (
                <div key={rate.id} className="rounded-xl border border-[var(--divider)] bg-[var(--surface-subtle)] p-4">
                  <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr_1fr_1fr_auto]">
                    <div><label className="block text-xs font-semibold text-fg-secondary">{t('catering_offer_rate_name')}</label><input className="input mt-1" value={rate.label} placeholder={t('catering_offer_rate_example')} onChange={(event) => setRates((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, label: event.target.value } : candidate))} /></div>
                    <div><label className="block text-xs font-semibold text-fg-secondary">{t('catering_pricing_day')}</label><select className="input mt-1" value={rate.weekday} onChange={(event) => setRates((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, weekday: event.target.value } : candidate))}><option value="">{t('catering_pricing_any')}</option>{WEEKDAYS.map((key, weekday) => <option key={key} value={weekday}>{t(key)}</option>)}</select></div>
                    <div><label className="block text-xs font-semibold text-fg-secondary">{t('catering_offer_from_guests')}</label><input type="number" min={0} className="input mt-1" value={rate.minGuests} onChange={(event) => setRates((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, minGuests: event.target.value } : candidate))} /></div>
                    <div><label className="block text-xs font-semibold text-fg-secondary">{t('catering_offer_rate_price')}</label><input type="number" min={0} step="0.01" className="input mt-1" value={rate.price} onChange={(event) => setRates((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, price: event.target.value } : candidate))} /></div>
                    <button type="button" onClick={() => setRates((current) => current.filter((_, candidateIndex) => candidateIndex !== index))} aria-label={t('catering_archive')} className="mt-5 self-center rounded-lg p-2 text-fg-secondary hover:bg-red-500/10 hover:text-red-500"><TrashIcon className="h-4 w-4" /></button>
                  </div>
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-medium text-fg-secondary">{t('catering_offer_rate_optional_conditions')}</summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div><label className="block text-xs font-semibold text-fg-secondary">{t('catering_offer_until_guests')}</label><input type="number" min={0} className="input mt-1" value={rate.maxGuests} onChange={(event) => setRates((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, maxGuests: event.target.value } : candidate))} /></div>
                      <div><label className="block text-xs font-semibold text-fg-secondary">{t('catering_offer_start_time')}</label><input type="time" className="input mt-1" value={rate.startTime} onChange={(event) => setRates((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, startTime: event.target.value } : candidate))} /></div>
                      <div><label className="block text-xs font-semibold text-fg-secondary">{t('catering_offer_end_time')}</label><input type="time" className="input mt-1" value={rate.endTime} onChange={(event) => setRates((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, endTime: event.target.value } : candidate))} /></div>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}

          {service.pricing_model === 'per_person' && (
            <details className="mt-6 rounded-xl border border-[var(--divider)] p-4">
              <summary className="cursor-pointer font-semibold text-fg-primary">{t('catering_offer_guest_tiers')}</summary>
              <p className="mt-2 text-sm text-fg-secondary">{t('catering_offer_guest_tiers_hint')}</p>
              <div className="mt-3 space-y-2">
                {tiers.map((tier, index) => (
                  <div key={index} className="flex gap-2">
                    <input type="number" min={0} className="input" placeholder={t('catering_item_tier_from')} value={tier.min_guests} onChange={(event) => setTiers((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, min_guests: event.target.value } : candidate))} />
                    <input type="number" min={0} step="0.01" className="input" placeholder={t('catering_item_tier_price')} value={tier.price} onChange={(event) => setTiers((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, price: event.target.value } : candidate))} />
                    <button type="button" onClick={() => setTiers((current) => current.filter((_, candidateIndex) => candidateIndex !== index))} className="rounded-lg px-3 text-red-500 hover:bg-red-500/10">×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setTiers((current) => [...current, { min_guests: '', price: '' }])} className="mt-3 text-sm font-semibold text-brand-600 hover:text-brand-700">+ {t('catering_item_tier_add')}</button>
            </details>
          )}
        </EditorAccordion>

        <EditorAccordion id="menu" open={openSection === 'menu'} onOpen={setOpenSection} icon={<UtensilsCrossedIcon />} title={t('catering_offer_section_menu')} summary={menuCount ? t('catering_offer_menu_count').replace('{n}', String(menuCount)) : t('catering_offer_section_menu_hint')}>
          {!compositionValid && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{t('catering_choice_invalid')}</p>}
          <div className="min-h-[520px] lg:h-[560px]">
            <CateringFormulaComposer restaurantId={restaurantId} groups={choiceGroups} onChange={setChoiceGroups} includedItems={includedItems} onIncludedItemsChange={setIncludedItems} includedSections={includedSections} onIncludedSectionsChange={setIncludedSections} />
          </div>
        </EditorAccordion>

        <EditorAccordion id="photos" open={openSection === 'photos'} onOpen={setOpenSection} icon={<ImageIcon />} title={t('catering_offer_section_photos')} summary={t('catering_offer_photo_count').replace('{n}', String((imageUrl ? 1 : 0) + galleryImages.length))}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-fg-secondary">{t('catering_offer_cover')}</label>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {imageUrl ? <img src={imageUrl} alt="" className="h-20 w-28 rounded-xl border border-[var(--divider)] object-cover" /> : <div className="grid h-20 w-28 place-items-center rounded-xl border border-dashed border-[var(--divider)] text-fg-tertiary"><ImageIcon className="h-5 w-5" /></div>}
              <label className="cursor-pointer rounded-lg border border-[var(--divider)] px-3 py-2 text-sm font-semibold text-fg-primary hover:border-brand-500">
                {uploading ? '…' : t('catering_upload_image')}
                <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) handleCover(file); event.currentTarget.value = ''; }} />
              </label>
              {imageUrl && <button type="button" onClick={() => setImageUrl('')} className="text-sm font-medium text-red-500">{t('catering_remove_image')}</button>}
            </div>
          </div>
          <CateringItemGalleryEditor restaurantId={restaurantId} coverUrl={imageUrl} images={galleryImages} onChange={setGalleryImages} onUploadingChange={setGalleryUploading} />
        </EditorAccordion>
      </div>
    </Modal>
  );
}

function EditorAccordion({ id, open, onOpen, icon, title, summary, children }: {
  id: EditorSection;
  open: boolean;
  onOpen: (id: EditorSection) => void;
  icon: React.ReactNode;
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <button type="button" onClick={() => onOpen(id)} className="flex w-full items-center gap-3 px-5 py-4 text-start transition-colors hover:bg-[var(--surface-subtle)] sm:px-6">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl [&_svg]:h-[18px] [&_svg]:w-[18px] ${open ? 'bg-brand-500 text-white' : 'bg-brand-500/10 text-brand-600'}`}>{icon}</span>
        <span className="min-w-0 flex-1"><span className="block font-semibold text-fg-primary">{title}</span><span className="block truncate text-xs text-fg-secondary">{summary}</span></span>
        <ChevronDownIcon className={`h-5 w-5 shrink-0 text-fg-tertiary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-[var(--divider)] bg-[var(--surface)] px-5 py-5 sm:px-6">{children}</div>}
    </section>
  );
}
