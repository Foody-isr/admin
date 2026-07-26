'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PencilIcon, TrashIcon, PlusIcon, ArrowLeftIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell,
  DataTableBody, DataTableRow, DataTableCell,
} from '@/components/data-table';
import { PageHead, Button, Tabs, TabsList, Tab, TabsContent } from '@/components/ds';
import Modal from '@/components/Modal';
import {
  listCateringServices, listCateringItems, createCateringItem, updateCateringItem, archiveCateringItem,
  listCateringOptions, createCateringOption, updateCateringOption, archiveCateringOption,
  uploadSectionImage,
  type CateringService, type CateringPricingModel,
  type CateringCatalogItem, type CateringCatalogItemInput,
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
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'items' | 'options'>('items');

  useEffect(() => {
    let active = true;
    setLoading(true);
    listCateringServices(rid)
      .then((services) => {
        if (!active) return;
        setService(services.find((s) => s.id === sid));
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
            <ItemsTab restaurantId={rid} serviceId={sid} pricingModel={service.pricing_model} canEdit={canEdit} />
          )}
        </TabsContent>

        <TabsContent value="options">
          <OptionsTab restaurantId={rid} serviceId={sid} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ItemsTab({ restaurantId, serviceId, pricingModel, canEdit }: {
  restaurantId: number;
  serviceId: number;
  pricingModel: CateringPricingModel;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<CateringCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ open: boolean; editing?: CateringCatalogItem }>({ open: false });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listCateringItems(restaurantId, serviceId));
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
          editing={editModal.editing}
          onClose={() => setEditModal({ open: false })}
          onSaved={() => { setEditModal({ open: false }); reload(); }}
        />
      )}
    </div>
  );
}

function ItemEditModal({ restaurantId, serviceId, pricingModel, editing, onClose, onSaved }: {
  restaurantId: number;
  serviceId: number;
  pricingModel: CateringPricingModel;
  editing?: CateringCatalogItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [basePrice, setBasePrice] = useState(editing ? String(editing.base_price) : '');
  const [minQuantity, setMinQuantity] = useState(editing ? String(editing.min_quantity ?? '') : '');
  const [minGuests, setMinGuests] = useState(editing ? String(editing.min_guests ?? '') : '');
  // Per-person price tiers: from N guests, the rate is X/person. Empty → flat base price.
  const [tiers, setTiers] = useState<{ min_guests: string; price: string }[]>(
    () => (editing?.price_tiers ?? []).map((t) => ({ min_guests: String(t.min_guests), price: String(t.price) })),
  );
  const [imageUrl, setImageUrl] = useState(editing?.image_url ?? '');
  const [uploading, setUploading] = useState(false);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const priceLabel = itemPriceLabel(pricingModel, t);

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
    setSaving(true);
    try {
      const body: CateringCatalogItemInput = {
        name: name.trim(),
        description,
        base_price: Number(basePrice) || 0,
        image_url: imageUrl,
        is_active: isActive,
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

  return (
    <Modal title={editing ? t('catering_edit_item') : t('catering_new_item')} onClose={onClose}>
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
