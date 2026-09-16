'use client';

/* eslint-disable @next/next/no-img-element */

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { EyeOffIcon, ImagePlusIcon, LibraryIcon, PackageOpenIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon, UtensilsCrossedIcon } from 'lucide-react';
import Modal from '@/components/Modal';
import { Button } from '@/components/ds';
import CateringItemGalleryEditor from '@/components/catering/CateringItemGalleryEditor';
import { useCurrency, useI18n } from '@/lib/i18n';
import {
  archiveCateringGroup,
  archiveCateringItem,
  createCateringGroup,
  createCateringItem,
  listCateringArticleLibrary,
  updateCateringItem,
  uploadSectionImage,
  type CateringCatalogGroup,
  type CateringCatalogItem,
  type CateringCatalogItemImageInput,
  type CateringCatalogItemInput,
  type CateringLibraryItem,
} from '@/lib/api';

type Props = {
  restaurantId: number;
  serviceId: number;
  offerId: number;
  pricingModel: 'per_unit' | 'per_person';
  groups: CateringCatalogGroup[];
  items: CateringCatalogItem[];
  canEdit: boolean;
  onChanged: () => void | Promise<void>;
};

type ArticleSource = 'library' | 'local';

export default function CateringGroupArticlesEditor({
  restaurantId,
  serviceId,
  offerId,
  pricingModel,
  groups,
  items,
  canEdit,
  onChanged,
}: Props) {
  const { t } = useI18n();
  const { money } = useCurrency();
  const [activeGroupId, setActiveGroupId] = useState<number | null>(groups[0]?.id ?? null);
  const [newGroupName, setNewGroupName] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);
  const [editingItem, setEditingItem] = useState<CateringCatalogItem | null | undefined>(undefined);

  useEffect(() => {
    if (activeGroupId !== null && groups.some((group) => group.id === activeGroupId)) return;
    setActiveGroupId(groups[0]?.id ?? null);
  }, [activeGroupId, groups]);

  const visibleItems = useMemo(
    () => items.filter((item) => (item.group_id ?? null) === activeGroupId),
    [activeGroupId, items],
  );
  const ungroupedCount = items.filter((item) => !item.group_id).length;

  const addGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setSavingGroup(true);
    try {
      const group = await createCateringGroup(restaurantId, serviceId, {
        name,
        offer_id: offerId,
        is_active: true,
        sort_order: groups.length,
      });
      setNewGroupName('');
      await onChanged();
      setActiveGroupId(group.id);
    } finally {
      setSavingGroup(false);
    }
  };

  const removeGroup = async (group: CateringCatalogGroup) => {
    if (!confirm(t('catering_group_articles_delete_group').replace('{name}', group.name))) return;
    await archiveCateringGroup(restaurantId, group.id);
    onChanged();
  };

  const removeItem = async (item: CateringCatalogItem) => {
    if (!confirm(t('catering_group_articles_delete_item').replace('{name}', item.name))) return;
    await archiveCateringItem(restaurantId, item.id);
    onChanged();
  };

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-[var(--divider)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--divider)] px-5 py-5 sm:px-6">
          <h2 className="text-lg font-semibold text-fg-primary">{t('catering_group_articles_title')}</h2>
          <p className="mt-1 text-sm text-fg-secondary">{t(pricingModel === 'per_person' ? 'catering_group_articles_hint_per_person' : 'catering_group_articles_hint')}</p>
        </div>

        <div className="border-b border-[var(--divider)] bg-[var(--surface-subtle)] px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                aria-pressed={activeGroupId === group.id}
                onClick={() => setActiveGroupId(group.id)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  activeGroupId === group.id
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-[var(--divider)] bg-[var(--surface)] text-fg-secondary hover:text-fg-primary'
                }`}
              >
                {group.name}
                <span className="ms-2 opacity-70">{items.filter((item) => item.group_id === group.id).length}</span>
              </button>
            ))}
            {ungroupedCount > 0 && (
              <button
                type="button"
                aria-pressed={activeGroupId === null}
                onClick={() => setActiveGroupId(null)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  activeGroupId === null
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-[var(--divider)] bg-[var(--surface)] text-fg-secondary hover:text-fg-primary'
                }`}
              >
                {t('catering_group_articles_ungrouped')} <span className="ms-2 opacity-70">{ungroupedCount}</span>
              </button>
            )}
          </div>

          {canEdit && (
            <div className="mt-4 flex max-w-lg gap-2">
              <input
                className="input"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void addGroup(); }}
                placeholder={t('catering_group_articles_group_placeholder')}
              />
              <Button variant="secondary" size="sm" disabled={savingGroup || !newGroupName.trim()} onClick={addGroup}>
                <PlusIcon />{t('catering_group_articles_add_group')}
              </Button>
            </div>
          )}
        </div>

        {activeGroupId === null && groups.length === 0 && visibleItems.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <PackageOpenIcon className="mx-auto h-8 w-8 text-fg-tertiary" />
            <h3 className="mt-3 font-semibold text-fg-primary">{t('catering_group_articles_empty_groups')}</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-fg-secondary">{t('catering_group_articles_empty_groups_hint')}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--divider)] px-5 py-4 sm:px-6">
              <div>
                <h3 className="font-semibold text-fg-primary">
                  {groups.find((group) => group.id === activeGroupId)?.name ?? t('catering_group_articles_ungrouped')}
                </h3>
                <p className="mt-0.5 text-sm text-fg-secondary">{t(pricingModel === 'per_person' ? 'catering_group_articles_group_hint_per_person' : 'catering_group_articles_group_hint')}</p>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && activeGroupId !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      const group = groups.find((candidate) => candidate.id === activeGroupId);
                      if (group) void removeGroup(group);
                    }}
                    className="rounded-lg p-2 text-fg-secondary hover:bg-red-500/10 hover:text-red-500"
                    aria-label={t('delete')}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
                {canEdit && activeGroupId !== null && (
                  <Button variant="primary" size="sm" onClick={() => setEditingItem(null)}>
                    <PlusIcon />{t('catering_group_articles_add_item')}
                  </Button>
                )}
              </div>
            </div>

            {visibleItems.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-fg-secondary">
                {activeGroupId === null ? t('catering_group_articles_move_legacy') : t('catering_group_articles_empty_items')}
              </div>
            ) : (
              <div className="divide-y divide-[var(--divider)]">
                {visibleItems.map((item) => (
                  <article key={item.id} className="grid gap-3 p-4 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center sm:px-6">
                    <div className="h-[72px] overflow-hidden rounded-xl bg-[var(--surface-subtle)]">
                      {item.menu_item?.image_url || item.image_url ? (
                        <img src={item.menu_item?.image_url || item.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-fg-tertiary"><UtensilsCrossedIcon className="h-5 w-5" /></div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-fg-primary">{item.menu_item?.name || item.name}</h4>
                        {item.menu_item_id && <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600">{t('catering_group_articles_library_badge')}</span>}
                        {!item.is_active && <EyeOffIcon className="h-4 w-4 text-fg-tertiary" />}
                      </div>
                      <p className="mt-1 line-clamp-1 text-sm text-fg-secondary">{item.menu_item?.description || item.description}</p>
                      <p className="mt-2 text-sm font-bold text-brand-600">{money(item.base_price)} · {t(pricingModel === 'per_person' ? 'catering_offer_per_guest' : 'catering_offer_per_unit')}</p>
                    </div>
                    {canEdit && (
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => setEditingItem(item)} className="rounded-lg p-2 text-fg-secondary hover:bg-brand-500/10 hover:text-brand-600" aria-label={t('edit')}><PencilIcon className="h-4 w-4" /></button>
                        <button type="button" onClick={() => void removeItem(item)} className="rounded-lg p-2 text-fg-secondary hover:bg-red-500/10 hover:text-red-500" aria-label={t('delete')}><TrashIcon className="h-4 w-4" /></button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {editingItem !== undefined && (activeGroupId !== null || groups.length > 0) && (
        <GroupArticleModal
          restaurantId={restaurantId}
          serviceId={serviceId}
          offerId={offerId}
          pricingModel={pricingModel}
          groups={groups}
          initialGroupId={editingItem?.group_id ?? activeGroupId ?? groups[0].id}
          editing={editingItem ?? undefined}
          onClose={() => setEditingItem(undefined)}
          onSaved={() => {
            setEditingItem(undefined);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function GroupArticleModal({ restaurantId, serviceId, offerId, pricingModel, groups, initialGroupId, editing, onClose, onSaved }: {
  restaurantId: number;
  serviceId: number;
  offerId: number;
  pricingModel: 'per_unit' | 'per_person';
  groups: CateringCatalogGroup[];
  initialGroupId: number;
  editing?: CateringCatalogItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [source, setSource] = useState<ArticleSource>(editing?.menu_item_id ? 'library' : 'local');
  const [groupId, setGroupId] = useState(initialGroupId);
  const [library, setLibrary] = useState<CateringLibraryItem[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedLibraryId, setSelectedLibraryId] = useState<number | undefined>(editing?.menu_item_id);
  const [name, setName] = useState(editing?.menu_item?.name ?? editing?.name ?? '');
  const [description, setDescription] = useState(editing?.menu_item?.description ?? editing?.description ?? '');
  const [portion, setPortion] = useState(editing?.portion || editing?.menu_item?.portion || '');
  const [imageURL, setImageURL] = useState(editing?.menu_item?.image_url ?? editing?.image_url ?? '');
  const [galleryImages, setGalleryImages] = useState<CateringCatalogItemImageInput[]>(() => (
    editing?.gallery_images?.map((image) => ({
      image_url: image.image_url,
      alt_text: image.alt_text,
      translations: image.translations,
    })) ?? []
  ));
  const [price, setPrice] = useState(editing ? String(editing.base_price) : '');
  const [minimum, setMinimum] = useState(String(pricingModel === 'per_person' ? editing?.min_guests ?? 0 : editing?.min_quantity ?? 0));
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    listCateringArticleLibrary(restaurantId)
      .then((rows) => { if (live) setLibrary(rows); })
      .catch(() => { if (live) setError(t('catering_group_articles_library_error')); })
      .finally(() => { if (live) setLoadingLibrary(false); });
    return () => { live = false; };
  }, [restaurantId, t]);

  const filteredLibrary = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return library.filter((item) => item.is_active && (!query
      || item.name.toLocaleLowerCase().includes(query)
      || item.category_name.toLocaleLowerCase().includes(query)));
  }, [library, search]);
  const selectedLibraryItem = library.find((item) => item.id === selectedLibraryId);
  const numericPrice = Number(price);
  const numericMinimum = Math.max(0, Math.floor(Number(minimum) || 0));
  const valid = Number.isFinite(numericPrice) && numericPrice >= 0
    && (pricingModel !== 'per_unit' || portion.trim().length > 0)
    && (source === 'library' ? Boolean(selectedLibraryItem) : name.trim().length > 0);

  const uploadCover = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    setError('');
    try {
      setImageURL(await uploadSectionImage(restaurantId, file));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('catering_group_articles_image_upload_error'));
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  };

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError('');
    try {
      const body: CateringCatalogItemInput = {
        name: source === 'library' ? selectedLibraryItem!.name : name.trim(),
        offer_id: offerId,
        description: source === 'library' ? '' : description.trim(),
        portion: portion.trim(),
        image_url: source === 'library' ? '' : imageURL.trim(),
        menu_item_id: source === 'library' ? selectedLibraryItem!.id : 0,
        group_id: groupId,
        base_price: numericPrice,
        min_quantity: pricingModel === 'per_unit' ? numericMinimum : 0,
        min_guests: pricingModel === 'per_person' ? numericMinimum : 0,
        is_active: isActive,
        available_weekdays: editing?.available_weekdays ?? [],
        gallery_images: galleryImages,
      };
      if (editing) await updateCateringItem(restaurantId, editing.id, body);
      else await createCateringItem(restaurantId, serviceId, body);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('catering_group_articles_save_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? t('catering_group_articles_edit_item') : t('catering_group_articles_add_item')}
      subtitle={t('catering_group_articles_modal_hint')}
      icon={<PackageOpenIcon />}
      onClose={onClose}
      size="3xl"
      footer={<div className="flex items-center justify-between gap-3">
        <p className="text-sm text-red-500">{error}</p>
        <div className="ms-auto flex gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" size="md" disabled={!valid || saving || uploadingCover || uploadingGallery} onClick={save}>{saving ? t('saving') : t('save')}</Button>
        </div>
      </div>}
    >
      <div className="space-y-5">
        <label>
          <span className="text-sm font-semibold text-fg-secondary">{t('catering_group_articles_group_label')}</span>
          <select className="input mt-1" value={groupId} onChange={(event) => setGroupId(Number(event.target.value))}>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--surface-subtle)] p-1">
          <button type="button" onClick={() => setSource('library')} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${
            source === 'library' ? 'bg-[var(--surface)] text-fg-primary shadow-sm' : 'text-fg-secondary'
          }`}><LibraryIcon className="h-4 w-4" />{t('catering_group_articles_from_library')}</button>
          <button type="button" onClick={() => setSource('local')} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${
            source === 'local' ? 'bg-[var(--surface)] text-fg-primary shadow-sm' : 'text-fg-secondary'
          }`}><PlusIcon className="h-4 w-4" />{t('catering_group_articles_create_local')}</button>
        </div>

        {source === 'library' ? (
          <div>
            <label className="relative block">
              <SearchIcon className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-fg-tertiary" />
              <input className="input ps-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('catering_group_articles_search')} />
            </label>
            <div className="mt-3 max-h-72 divide-y divide-[var(--divider)] overflow-y-auto rounded-xl border border-[var(--divider)]">
              {loadingLibrary ? <p className="p-4 text-sm text-fg-secondary">{t('loading')}</p> : filteredLibrary.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedLibraryId(item.id);
                    if (!price) setPrice(String(item.price ?? 0));
                    if (!portion && item.portion) setPortion(item.portion);
                  }}
                  className={`flex w-full items-center gap-3 p-3 text-start transition hover:bg-[var(--surface-subtle)] ${selectedLibraryId === item.id ? 'bg-brand-500/10' : ''}`}
                >
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-subtle)]">
                    {item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><UtensilsCrossedIcon className="h-4 w-4 text-fg-tertiary" /></div>}
                  </div>
                  <span className="min-w-0"><span className="block truncate font-medium text-fg-primary">{item.name}</span><span className="block truncate text-xs text-fg-secondary">{item.category_name}</span></span>
                  {selectedLibraryId === item.id && <span className="ms-auto text-sm font-bold text-brand-600">✓</span>}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <label><span className="text-sm font-semibold text-fg-secondary">{t('catering_group_articles_item_name')}</span><input className="input mt-1" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label><span className="text-sm font-semibold text-fg-secondary">{t('description')}</span><textarea className="input mt-1 min-h-24" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            <div>
              <span className="text-sm font-semibold text-fg-secondary">{t('catering_group_articles_cover_image')}</span>
              {imageURL ? (
                <div className="mt-2 overflow-hidden rounded-xl border border-[var(--divider)] bg-[var(--surface-subtle)] sm:grid sm:grid-cols-[180px_minmax(0,1fr)]">
                  <img src={imageURL} alt="" className="aspect-[4/3] h-full w-full object-cover" />
                  <div className="flex flex-col justify-center gap-2 p-4">
                    <p className="text-sm text-fg-secondary">{t('catering_group_articles_cover_hint')}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" disabled={uploadingCover} onClick={() => coverInputRef.current?.click()}>
                        <ImagePlusIcon />{uploadingCover ? t('catering_group_articles_image_uploading') : t('catering_group_articles_replace_image')}
                      </Button>
                      <Button variant="ghost" size="sm" disabled={uploadingCover} onClick={() => setImageURL('')}>
                        <TrashIcon />{t('catering_remove_image')}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={uploadingCover}
                  onClick={() => coverInputRef.current?.click()}
                  className="mt-2 flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--divider)] bg-[var(--surface-subtle)] px-4 text-sm font-semibold text-fg-secondary transition hover:border-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ImagePlusIcon className="h-6 w-6" />
                  {uploadingCover ? t('catering_group_articles_image_uploading') : t('catering_upload_image')}
                </button>
              )}
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={uploadCover} />
              <label className="mt-3 block">
                <span className="text-xs font-medium text-fg-secondary">{t('catering_group_articles_image_url')}</span>
                <input className="input mt-1" value={imageURL} onChange={(event) => setImageURL(event.target.value)} />
              </label>
            </div>
          </div>
        )}

        {pricingModel === 'per_unit' && (
          <label>
            <span className="text-sm font-semibold text-fg-secondary">{t('catering_group_articles_portion')} *</span>
            <input
              className="input mt-1"
              required
              value={portion}
              onChange={(event) => setPortion(event.target.value)}
              placeholder={t('catering_group_articles_portion_placeholder')}
            />
            <span className="mt-1 block text-xs text-fg-tertiary">{t('catering_group_articles_portion_hint')}</span>
          </label>
        )}

        <CateringItemGalleryEditor
          restaurantId={restaurantId}
          coverUrl={source === 'library' ? selectedLibraryItem?.image_url ?? '' : imageURL}
          images={galleryImages}
          onChange={setGalleryImages}
          onUploadingChange={setUploadingGallery}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="text-sm font-semibold text-fg-secondary">{t(pricingModel === 'per_person' ? 'catering_group_articles_guest_price' : 'catering_group_articles_unit_price')}</span><input type="number" min="0" step="0.01" className="input mt-1" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
          <label><span className="text-sm font-semibold text-fg-secondary">{t(pricingModel === 'per_person' ? 'catering_group_articles_min_guests' : 'catering_group_articles_min_quantity')}</span><input type="number" min="0" step="1" className="input mt-1" value={minimum} onChange={(event) => setMinimum(event.target.value)} /></label>
          <label className="flex items-center gap-3 self-end rounded-xl border border-[var(--divider)] px-4 py-3"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /><span className="text-sm font-semibold text-fg-primary">{t('catering_group_articles_visible')}</span></label>
        </div>
      </div>
    </Modal>
  );
}
