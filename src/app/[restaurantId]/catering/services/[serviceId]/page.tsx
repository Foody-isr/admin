'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PencilIcon, TrashIcon, PlusIcon, ArrowLeftIcon, ChevronUpIcon, ChevronDownIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell,
  DataTableBody, DataTableRow, DataTableCell,
} from '@/components/data-table';
import { PageHead, Button, Tabs, TabsList, Tab, TabsContent } from '@/components/ds';
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
import { type Locale } from '@/components/i18n/LocaleTabs';
import {
  listCateringServices, listCateringItems, createCateringItem, updateCateringItem, updateCateringItemGallery, archiveCateringItem, reorderCateringItems,
  listCateringGroups, createCateringGroup, updateCateringGroup, archiveCateringGroup,
  listCateringOptions, createCateringOption, updateCateringOption, archiveCateringOption,
  uploadSectionImage, getRestaurant,
  type CateringService, type CateringPricingModel,
  type CateringCatalogItem, type CateringCatalogItemInput,
  type CateringIncludedItemInput,
  type CateringCatalogItemImageInput,
  type CateringCatalogGroup,
  type CateringOption, type CateringOptionInput, type CateringOptionPriceMode,
} from '@/lib/api';

const PRICING_KEYS: Record<CateringPricingModel, string> = {
  per_unit: 'catering_pricing_per_unit',
  per_person: 'catering_pricing_per_person',
  custom_quote: 'catering_pricing_custom',
};

function itemPriceLabel(pricingModel: CateringPricingModel, t: (key: string) => string): string {
  if (pricingModel === 'per_unit') return t('catering_item_price_per_unit');
  if (pricingModel === 'per_person') return t('catering_item_price_per_person');
  return t('catering_item_price');
}

export default function CateringServiceCatalogPage() {
  const { restaurantId, serviceId } = useParams();
  const rid = Number(restaurantId);
  const sid = Number(serviceId);
  const router = useRouter();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('catering.manage');

  const [service, setService] = useState<CateringService | undefined>(undefined);
  const [sourceLocale, setSourceLocale] = useState<Locale>('en');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'items' | 'options'>('items');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([listCateringServices(rid), getRestaurant(rid)])
      .then(([services, restaurant]) => {
        if (!active) return;
        setService(services.find((s) => s.id === sid));
        const loc = restaurant.default_locale;
        if (loc === 'en' || loc === 'he' || loc === 'fr') setSourceLocale(loc);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [rid, sid]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-[var(--s-5)]">
      <button
        onClick={() => router.push(`/${rid}/catering/services`)}
        className="flex items-center gap-1 text-fs-sm text-fg-secondary hover:text-fg-primary transition-colors"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        {t('catering_back_to_services')}
      </button>

      <PageHead
        title={service?.name ?? t('catering_catalog_title')}
        desc={service ? t(PRICING_KEYS[service.pricing_model]) : undefined}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'items' | 'options')}>
        <TabsList>
          <Tab value="items">{t('catering_items_tab')}</Tab>
          <Tab value="options">{t('catering_options_tab')}</Tab>
        </TabsList>

        <TabsContent value="items">
          {service && (
            <ItemsTab restaurantId={rid} serviceId={sid} pricingModel={service.pricing_model} canEdit={canEdit} sourceLocale={sourceLocale} />
          )}
        </TabsContent>

        <TabsContent value="options">
          <OptionsTab restaurantId={rid} serviceId={sid} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ItemsTab({ restaurantId, serviceId, pricingModel, canEdit, sourceLocale }: {
  restaurantId: number;
  serviceId: number;
  pricingModel: CateringPricingModel;
  canEdit: boolean;
  sourceLocale: Locale;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<CateringCatalogItem[]>([]);
  const [groups, setGroups] = useState<CateringCatalogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ open: boolean; editing?: CateringCatalogItem }>({ open: false });
  const [groupModal, setGroupModal] = useState<{ open: boolean; editing?: CateringCatalogGroup }>({ open: false });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextItems, nextGroups] = await Promise.all([
        listCateringItems(restaurantId, serviceId),
        listCateringGroups(restaurantId, serviceId),
      ]);
      setItems(nextItems);
      setGroups(nextGroups);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, serviceId]);

  useEffect(() => { reload(); }, [reload]);

  const handleArchive = async (item: CateringCatalogItem) => {
    if (!confirm(t('catering_item_archive_confirm'))) return;
    await archiveCateringItem(restaurantId, item.id);
    reload();
  };

  const handleArchiveGroup = async (group: CateringCatalogGroup) => {
    if (!confirm(t('catering_group_archive_confirm'))) return;
    await archiveCateringGroup(restaurantId, group.id);
    reload();
  };

  // Move an item one slot up/down, optimistically, then persist the new order.
  const handleMove = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    try {
      await reorderCateringItems(restaurantId, serviceId, next.map((i) => i.id));
    } catch {
      reload(); // revert to server order on failure
    }
  };

  const handleGallerySaved = useCallback((updated: CateringCatalogItem) => {
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
  }, []);

  const priceLabel = itemPriceLabel(pricingModel, t);
  const minLabel = pricingModel === 'per_unit' ? t('catering_item_min_qty') : t('catering_item_min_guests');

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-[var(--s-4)]">
      <section className="rounded-xl border border-[var(--divider)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-fg-primary">{t('catering_groups_title')}</h3>
            <p className="text-sm text-fg-secondary">{t('catering_groups_hint')}</p>
          </div>
          {canEdit && (
            <Button variant="secondary" size="sm" onClick={() => setGroupModal({ open: true })}>
              <PlusIcon />
              {t('catering_new_group')}
            </Button>
          )}
        </div>
        {groups.length === 0 ? (
          <p className="mt-3 text-sm text-fg-tertiary">{t('catering_empty_groups')}</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {groups.map((group) => (
              <div key={group.id} className="flex items-center gap-1 rounded-full border border-[var(--divider)] bg-[var(--surface-subtle)] py-1 ps-3 pe-1 text-sm">
                <span className="font-medium text-fg-primary">{group.name}</span>
                {!group.is_active && <span className="text-fg-tertiary">({t('catering_group_hidden')})</span>}
                {canEdit && (
                  <>
                    <button type="button" aria-label={t('catering_edit_group')} onClick={() => setGroupModal({ open: true, editing: group })} className="rounded-full p-1 text-fg-secondary hover:bg-[var(--surface)] hover:text-fg-primary">
                      <PencilIcon className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" aria-label={t('catering_archive')} onClick={() => handleArchiveGroup(group)} className="rounded-full p-1 text-fg-secondary hover:bg-red-500/10 hover:text-red-500">
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {canEdit && (
        <div className="flex justify-end">
          <Button variant="primary" size="md" onClick={() => setEditModal({ open: true })}>
            <PlusIcon />
            {t('catering_new_item')}
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-fg-secondary">{t('catering_empty_items')}</p>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>{t('catering_field_name')}</DataTableHeadCell>
            <DataTableHeadCell>{t('catering_item_group')}</DataTableHeadCell>
            <DataTableHeadCell align="right">{priceLabel}</DataTableHeadCell>
            {pricingModel !== 'custom_quote' && (
              <DataTableHeadCell align="right">{minLabel}</DataTableHeadCell>
            )}
            <DataTableHeadCell align="right">{t('catering_field_active')}</DataTableHeadCell>
            <DataTableHeadSpacerCell />
          </DataTableHead>
          <DataTableBody>
            {items.map((item, index) => (
              <DataTableRow key={item.id} index={index}>
                <DataTableCell mobilePrimary className="font-medium text-fg-primary">
                  {item.name}
                </DataTableCell>
                <DataTableCell mobileLabel={t('catering_item_group')}>
                  {groups.find((group) => group.id === item.group_id)?.name ?? t('catering_group_ungrouped')}
                </DataTableCell>
                <DataTableCell align="right" mobileLabel={priceLabel}>
                  {`₪${item.base_price.toFixed(2)}`}
                </DataTableCell>
                {pricingModel !== 'custom_quote' && (
                  <DataTableCell align="right" mobileLabel={minLabel}>
                    {pricingModel === 'per_unit' ? item.min_quantity : item.min_guests}
                  </DataTableCell>
                )}
                <DataTableCell align="right" mobileLabel={t('catering_field_active')}>
                  {item.is_active ? '✓' : '—'}
                </DataTableCell>
                <DataTableCell>
                  {canEdit && (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        aria-label={t('catering_move_up')}
                        disabled={index === 0}
                        onClick={() => handleMove(index, -1)}
                        className="p-1.5 rounded hover:bg-[var(--surface-subtle)] text-fg-secondary hover:text-fg-primary disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                      >
                        <ChevronUpIcon className="w-4 h-4" />
                      </button>
                      <button
                        aria-label={t('catering_move_down')}
                        disabled={index === items.length - 1}
                        onClick={() => handleMove(index, 1)}
                        className="p-1.5 rounded hover:bg-[var(--surface-subtle)] text-fg-secondary hover:text-fg-primary disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                      >
                        <ChevronDownIcon className="w-4 h-4" />
                      </button>
                      <button
                        aria-label={t('catering_edit_item')}
                        onClick={() => setEditModal({ open: true, editing: item })}
                        className="p-1.5 rounded hover:bg-[var(--surface-subtle)] text-fg-secondary hover:text-fg-primary"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        aria-label={t('catering_archive')}
                        onClick={() => handleArchive(item)}
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
        <ItemEditModal
          restaurantId={restaurantId}
          serviceId={serviceId}
          pricingModel={pricingModel}
          sourceLocale={sourceLocale}
          groups={groups}
          editing={editModal.editing}
          onClose={() => setEditModal({ open: false })}
          onSaved={() => { setEditModal({ open: false }); reload(); }}
          onGallerySaved={handleGallerySaved}
        />
      )}

      {groupModal.open && (
        <GroupEditModal
          restaurantId={restaurantId}
          serviceId={serviceId}
          editing={groupModal.editing}
          onClose={() => setGroupModal({ open: false })}
          onSaved={() => { setGroupModal({ open: false }); reload(); }}
        />
      )}
    </div>
  );
}

function GroupEditModal({ restaurantId, serviceId, editing, onClose, onSaved }: {
  restaurantId: number;
  serviceId: number;
  editing?: CateringCatalogGroup;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), is_active: isActive, sort_order: editing?.sort_order ?? 0 };
      if (editing) await updateCateringGroup(restaurantId, editing.id, body);
      else await createCateringGroup(restaurantId, serviceId, body);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? t('catering_edit_group') : t('catering_new_group')} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-fg-secondary">{t('catering_group_name')}</label>
          <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }} />
        </div>
        <label className="flex items-center gap-2 text-sm text-fg-primary">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          {t('catering_field_active')}
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>{t('catering_cancel')}</Button>
          <Button variant="primary" size="md" disabled={saving || !name.trim()} onClick={handleSave}>{t('catering_save')}</Button>
        </div>
      </div>
    </Modal>
  );
}

function ItemEditModal({ restaurantId, serviceId, pricingModel, sourceLocale, groups, editing, onClose, onSaved, onGallerySaved }: {
  restaurantId: number;
  serviceId: number;
  pricingModel: CateringPricingModel;
  sourceLocale: Locale;
  groups: CateringCatalogGroup[];
  editing?: CateringCatalogItem;
  onClose: () => void;
  onSaved: () => void;
  onGallerySaved: (item: CateringCatalogItem) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [overview, setOverview] = useState(editing?.overview ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [translations, setTranslations] = useState<Record<string, Record<string, string>>>(editing?.translations ?? {});
  const [basePrice, setBasePrice] = useState(editing ? String(editing.base_price) : '');
  const [minQuantity, setMinQuantity] = useState(editing ? String(editing.min_quantity ?? '') : '');
  const [minGuests, setMinGuests] = useState(editing ? String(editing.min_guests ?? '') : '');
  // Per-person price tiers: from N guests, the rate is X/person. Empty → flat base price.
  const [tiers, setTiers] = useState<{ min_guests: string; price: string }[]>(
    () => (editing?.price_tiers ?? []).map((t) => ({ min_guests: String(t.min_guests), price: String(t.price) })),
  );
  const [imageUrl, setImageUrl] = useState(editing?.image_url ?? '');
  const [galleryImages, setGalleryImages] = useState<CateringCatalogItemImageInput[]>(() =>
    (editing?.gallery_images ?? []).map((image) => ({
      image_url: image.image_url,
      alt_text: image.alt_text ?? '',
      translations: image.translations ?? {},
    })),
  );
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [gallerySaveStatus, setGallerySaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(editing ? 'saved' : 'idle');
  const [galleryRetryToken, setGalleryRetryToken] = useState(0);
  const [closeAfterGallerySave, setCloseAfterGallerySave] = useState(false);
  const galleryAutosaveReadyRef = useRef(false);
  const gallerySaveRevisionRef = useRef(0);
  const gallerySaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [groupId, setGroupId] = useState(editing?.group_id ? String(editing.group_id) : '');
  const [uploading, setUploading] = useState(false);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [formTab, setFormTab] = useState<'details' | 'composition'>('details');
  const [choiceGroups, setChoiceGroups] = useState<CateringChoiceGroupDraft[]>(() =>
    (editing?.choice_groups ?? []).map((group, index) => ({
      ...newChoiceGroupDraft(index, group.name),
      description: group.description ?? '',
      translations: group.translations ?? {},
      min_selections: group.min_selections,
      max_selections: group.max_selections,
      max_per_item: group.max_per_item,
      items: (group.items ?? []).map((item) => ({
        menu_item_id: item.menu_item_id,
        price_delta: item.price_delta,
        default_quantity: item.default_quantity,
      })),
    })),
  );
  const [includedItems, setIncludedItems] = useState<CateringIncludedItemInput[]>(() =>
    (editing?.included_items ?? []).filter((item) => !item.section_id).map((item) => ({
      ...(item.menu_item_id ? { menu_item_id: item.menu_item_id } : { name: item.name }),
      description: item.description ?? '',
    })),
  );
  const [includedSections, setIncludedSections] = useState<CateringIncludedSectionDraft[]>(() =>
    (editing?.included_sections ?? []).map((section, index) => ({
      ...newIncludedSectionDraft(index, section.name),
      description: section.description ?? '',
      translations: section.translations ?? {},
      items: (section.items ?? []).map((item) => ({
        ...(item.menu_item_id ? { menu_item_id: item.menu_item_id } : { name: item.name }),
        description: item.description ?? '',
      })),
    })),
  );

  const handleGalleryImagesChange = useCallback((next: CateringCatalogItemImageInput[]) => {
    setGalleryImages(next);
    if (editing) setGallerySaveStatus('saving');
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    if (!galleryAutosaveReadyRef.current) {
      galleryAutosaveReadyRef.current = true;
      return;
    }

    const revision = ++gallerySaveRevisionRef.current;
    const snapshot = galleryImages.map((image) => ({
      ...image,
      translations: image.translations ? { ...image.translations } : undefined,
    }));
    setGallerySaveStatus('saving');
    const timer = window.setTimeout(() => {
      gallerySaveQueueRef.current = gallerySaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const updated = await updateCateringItemGallery(restaurantId, editing.id, snapshot);
          if (gallerySaveRevisionRef.current !== revision) return;
          onGallerySaved(updated);
          setGallerySaveStatus('saved');
        })
        .catch(() => {
          if (gallerySaveRevisionRef.current === revision) setGallerySaveStatus('error');
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [editing, galleryImages, galleryRetryToken, onGallerySaved, restaurantId]);

  useEffect(() => {
    if (closeAfterGallerySave && !galleryUploading && gallerySaveStatus === 'saved') onClose();
  }, [closeAfterGallerySave, gallerySaveStatus, galleryUploading, onClose]);

  const requestClose = useCallback(() => {
    if (editing && (galleryUploading || gallerySaveStatus === 'saving')) {
      setCloseAfterGallerySave(true);
      return;
    }
    if (editing && gallerySaveStatus === 'error' && !confirm(t('discardUnsavedChanges'))) return;
    onClose();
  }, [editing, gallerySaveStatus, galleryUploading, onClose, t]);

  const priceLabel = itemPriceLabel(pricingModel, t);
  const compositionValid = useMemo(() => choiceGroups.every((group) => {
    const defaults = group.items.reduce((sum, item) => sum + item.default_quantity, 0);
    const capacity = group.max_per_item === 0 ? Number.POSITIVE_INFINITY : group.items.length * group.max_per_item;
    return group.name.trim().length > 0 && group.items.length > 0 && group.min_selections >= 0 &&
      group.max_selections >= Math.max(1, group.min_selections) && capacity >= group.min_selections && defaults <= group.max_selections;
  }) && includedItems.every((item) => Boolean(item.menu_item_id || item.name?.trim())) &&
    includedSections.every((section) => section.name.trim().length > 0 && section.items.every((item) => Boolean(item.menu_item_id || item.name?.trim()))),
  [choiceGroups, includedItems, includedSections]);

  const handleImage = async (file: File) => {
    setUploading(true);
    try {
      setImageUrl(await uploadSectionImage(restaurantId, file));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    if (!compositionValid) {
      setFormTab('composition');
      return;
    }
    setSaving(true);
    try {
      const body: CateringCatalogItemInput = {
        name: name.trim(),
        group_id: groupId ? Number(groupId) : 0,
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
        ...(pricingModel === 'per_unit' ? { min_quantity: Number(minQuantity) || 0 } : {}),
        ...(pricingModel === 'per_person'
          ? {
              min_guests: Number(minGuests) || 0,
              price_tiers: tiers
                .filter((t) => t.min_guests.trim() !== '' && t.price.trim() !== '')
                .map((t) => ({ min_guests: Number(t.min_guests) || 0, price: Number(t.price) || 0 }))
                .sort((a, b) => a.min_guests - b.min_guests),
            }
          : {}),
      };
      if (editing) {
        await updateCateringItem(restaurantId, editing.id, body);
      } else {
        await createCateringItem(restaurantId, serviceId, body);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const modalFooter = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-h-5">
        {!compositionValid && <p className="text-sm text-red-500">{t('catering_choice_invalid')}</p>}
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={requestClose}>{t('catering_cancel')}</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving || galleryUploading || gallerySaveStatus === 'saving' || !name.trim() || !compositionValid}>
          {t('catering_save')}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      title={editing ? t('catering_edit_item') : t('catering_new_item')}
      onClose={requestClose}
      size="5xl"
      bodyClassName="!overflow-hidden !p-0"
      footer={modalFooter}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="mx-4 mt-4 flex shrink-0 rounded-xl bg-[var(--surface-subtle)] p-1 sm:mx-6">
          <button type="button" onClick={() => setFormTab('details')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${formTab === 'details' ? 'bg-[var(--surface)] text-fg-primary shadow-sm' : 'text-fg-secondary'}`}>
            {t('catering_formula_details_tab')}
          </button>
          <button type="button" onClick={() => setFormTab('composition')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${formTab === 'composition' ? 'bg-[var(--surface)] text-fg-primary shadow-sm' : 'text-fg-secondary'}`}>
            {t('catering_formula_composition')} {(choiceGroups.length + includedSections.length + includedItems.length) > 0 && <span className="ms-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-xs text-brand-600">{choiceGroups.length + includedSections.length + includedItems.length}</span>}
          </button>
        </div>

        {formTab === 'details' && <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        <CateringLocaleFields
          sourceLocale={sourceLocale}
          name={name}
          onName={setName}
          overview={overview}
          onOverview={setOverview}
          overviewLabel={t('catering_field_overview')}
          overviewHint={t('catering_field_overview_hint')}
          description={description}
          onDescription={setDescription}
          translations={translations}
          onTranslations={setTranslations}
          nameLabel={t('catering_field_name')}
          descLabel={t('catering_field_contents')}
          descHint={t('catering_field_contents_hint')}
          onEnter={handleSave}
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-fg-secondary">{t('catering_item_group')}</label>
          <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">{t('catering_group_ungrouped')}</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('catering_field_image')}</label>
          <div className="flex items-center gap-3">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="h-16 w-16 rounded-lg object-cover border border-[var(--divider)]" />
            ) : (
              <div className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-[var(--divider)] text-fg-tertiary text-xs">—</div>
            )}
            <label className="cursor-pointer rounded-lg border border-[var(--divider)] px-3 py-2 text-sm font-medium text-fg-primary hover:border-brand-500">
              {uploading ? '…' : t('catering_upload_image')}
              <input type="file" accept="image/*" className="hidden" disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImage(f); e.currentTarget.value = ''; }} />
            </label>
            {imageUrl && (
              <button type="button" onClick={() => setImageUrl('')} className="text-sm text-red-500 hover:text-red-700">
                {t('catering_remove_image')}
              </button>
            )}
          </div>
        </div>

        <CateringItemGalleryEditor
          restaurantId={restaurantId}
          coverUrl={imageUrl}
          images={galleryImages}
          onChange={handleGalleryImagesChange}
          onUploadingChange={setGalleryUploading}
          saveStatus={gallerySaveStatus}
          onRetrySave={editing ? () => setGalleryRetryToken((current) => current + 1) : undefined}
        />

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{priceLabel}</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className="input"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
          />
        </div>

        {pricingModel === 'per_unit' && (
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">{t('catering_item_min_qty')}</label>
            <input
              type="number"
              min={0}
              step="1"
              className="input"
              value={minQuantity}
              onChange={(e) => setMinQuantity(e.target.value)}
            />
          </div>
        )}

        {pricingModel === 'per_person' && (
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">{t('catering_item_min_guests')}</label>
            <input
              type="number"
              min={0}
              step="1"
              className="input"
              value={minGuests}
              onChange={(e) => setMinGuests(e.target.value)}
            />
          </div>
        )}

        {pricingModel === 'per_person' && (
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">{t('catering_item_tiers_title')}</label>
            <p className="text-fs-xs text-fg-secondary mb-2">{t('catering_item_tiers_hint')}</p>
            <div className="space-y-2">
              {tiers.map((tier, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="number" min={0} step="1" className="input flex-1"
                    placeholder={t('catering_item_tier_from')}
                    value={tier.min_guests}
                    onChange={(e) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, min_guests: e.target.value } : x)))}
                  />
                  <input
                    type="number" min={0} step="0.01" className="input flex-1"
                    placeholder={t('catering_item_tier_price')}
                    value={tier.price}
                    onChange={(e) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                  />
                  <button type="button" aria-label="remove" onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))} className="px-2 text-red-500 hover:text-red-700">✕</button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setTiers((ts) => [...ts, { min_guests: '', price: '' }])}
              className="mt-2 text-sm font-medium text-brand-500 hover:text-brand-600"
            >
              + {t('catering_item_tier_add')}
            </button>
          </div>
        )}

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span className="text-sm text-fg-secondary">{t('catering_field_active')}</span>
        </label>
        </div>}

        {formTab === 'composition' && (
          <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:overflow-hidden sm:p-6">
            <CateringFormulaComposer
              restaurantId={restaurantId}
              groups={choiceGroups}
              onChange={setChoiceGroups}
              includedItems={includedItems}
              onIncludedItemsChange={setIncludedItems}
              includedSections={includedSections}
              onIncludedSectionsChange={setIncludedSections}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

function OptionsTab({ restaurantId, serviceId, canEdit }: {
  restaurantId: number;
  serviceId: number;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const [options, setOptions] = useState<CateringOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ open: boolean; editing?: CateringOption }>({ open: false });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setOptions(await listCateringOptions(restaurantId, serviceId));
    } finally {
      setLoading(false);
    }
  }, [restaurantId, serviceId]);

  useEffect(() => { reload(); }, [reload]);

  const handleArchive = async (option: CateringOption) => {
    if (!confirm(t('catering_option_archive_confirm'))) return;
    await archiveCateringOption(restaurantId, option.id);
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
    <div className="space-y-[var(--s-4)]">
      {canEdit && (
        <div className="flex justify-end">
          <Button variant="primary" size="md" onClick={() => setEditModal({ open: true })}>
            <PlusIcon />
            {t('catering_new_option')}
          </Button>
        </div>
      )}

      {options.length === 0 ? (
        <p className="text-fg-secondary">{t('catering_empty_options')}</p>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>{t('catering_field_name')}</DataTableHeadCell>
            <DataTableHeadCell align="right">{t('catering_option_price')}</DataTableHeadCell>
            <DataTableHeadCell align="right">{t('catering_option_mode')}</DataTableHeadCell>
            <DataTableHeadCell align="right">{t('catering_field_active')}</DataTableHeadCell>
            <DataTableHeadSpacerCell />
          </DataTableHead>
          <DataTableBody>
            {options.map((option, index) => (
              <DataTableRow key={option.id} index={index}>
                <DataTableCell mobilePrimary className="font-medium text-fg-primary">
                  {option.name}
                </DataTableCell>
                <DataTableCell align="right" mobileLabel={t('catering_option_price')}>
                  {`₪${option.price.toFixed(2)}`}
                </DataTableCell>
                <DataTableCell align="right" mobileLabel={t('catering_option_mode')}>
                  {option.price_mode === 'fixed' ? t('catering_option_mode_fixed') : t('catering_option_mode_per_person')}
                </DataTableCell>
                <DataTableCell align="right" mobileLabel={t('catering_field_active')}>
                  {option.is_active ? '✓' : '—'}
                </DataTableCell>
                <DataTableCell>
                  {canEdit && (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        aria-label={t('catering_edit_option')}
                        onClick={() => setEditModal({ open: true, editing: option })}
                        className="p-1.5 rounded hover:bg-[var(--surface-subtle)] text-fg-secondary hover:text-fg-primary"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        aria-label={t('catering_archive')}
                        onClick={() => handleArchive(option)}
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
        <OptionEditModal
          restaurantId={restaurantId}
          serviceId={serviceId}
          editing={editModal.editing}
          onClose={() => setEditModal({ open: false })}
          onSaved={() => { setEditModal({ open: false }); reload(); }}
        />
      )}
    </div>
  );
}

function OptionEditModal({ restaurantId, serviceId, editing, onClose, onSaved }: {
  restaurantId: number;
  serviceId: number;
  editing?: CateringOption;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [price, setPrice] = useState(editing ? String(editing.price) : '');
  const [priceMode, setPriceMode] = useState<CateringOptionPriceMode>(editing?.price_mode ?? 'fixed');
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body: CateringOptionInput = {
        name: name.trim(),
        price: Number(price) || 0,
        price_mode: priceMode,
        is_active: isActive,
      };
      if (editing) {
        await updateCateringOption(restaurantId, editing.id, body);
      } else {
        await createCateringOption(restaurantId, serviceId, body);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? t('catering_edit_option') : t('catering_new_option')} onClose={onClose}>
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
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('catering_option_price')}</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className="input"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('catering_option_mode')}</label>
          <select
            className="input"
            value={priceMode}
            onChange={(e) => setPriceMode(e.target.value as CateringOptionPriceMode)}
          >
            <option value="fixed">{t('catering_option_mode_fixed')}</option>
            <option value="per_person">{t('catering_option_mode_per_person')}</option>
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
