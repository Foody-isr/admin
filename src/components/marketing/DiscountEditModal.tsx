'use client';

import { useEffect, useState } from 'react';
import {
  createDiscount,
  updateDiscount,
  getAllCategories,
  listAllItems,
  ApiError,
  Discount,
  DiscountInput,
  MenuCategory,
  MenuItem,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import Modal from '@/components/Modal';

export interface DiscountEditModalProps {
  open: boolean;
  editing?: Discount;
  restaurantId: number;
  onClose: () => void;
  /** Called after a successful create or update. */
  onSaved: () => void;
}

type DiscountType = 'fixed' | 'percent' | 'free_delivery';
type DiscountScope = 'whole_sale' | 'category' | 'specific_item';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DiscountEditModal({
  open,
  editing,
  restaurantId,
  onClose,
  onSaved,
}: DiscountEditModalProps) {
  const { t } = useI18n();

  // --- Form fields ---
  const [code, setCode] = useState(editing?.code ?? '');
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [type, setType] = useState<DiscountType>(editing?.type ?? 'fixed');
  const [value, setValue] = useState(editing?.value != null ? String(editing.value) : '');
  const [scope, setScope] = useState<DiscountScope>(editing?.scope ?? 'whole_sale');
  const [scopeIds, setScopeIds] = useState<number[]>(editing?.scope_ids ?? []);
  const [minPurchase, setMinPurchase] = useState(
    editing?.min_purchase != null && editing.min_purchase !== 0
      ? String(editing.min_purchase)
      : '',
  );
  const [totalCap, setTotalCap] = useState(
    editing?.total_cap != null ? String(editing.total_cap) : '',
  );
  const [perCustomerCap, setPerCustomerCap] = useState(
    editing?.per_customer_cap != null ? String(editing.per_customer_cap) : '',
  );
  const [startsAt, setStartsAt] = useState(
    editing?.starts_at ? editing.starts_at.slice(0, 10) : todayISO(),
  );
  const [hasEndDate, setHasEndDate] = useState(!!editing?.ends_at);
  const [endsAt, setEndsAt] = useState(
    editing?.ends_at ? editing.ends_at.slice(0, 10) : '',
  );
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);

  // --- Scope picker data ---
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);

  // --- UI state ---
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Load categories and items once, for the scope pickers
  useEffect(() => {
    getAllCategories(restaurantId).then(setCategories).catch(() => {});
    listAllItems(restaurantId).then(setItems).catch(() => {});
  }, [restaurantId]);

  // Re-initialize all form fields whenever the modal opens or the editing target changes
  useEffect(() => {
    if (!open) return;
    setCode(editing?.code ?? '');
    setName(editing?.name ?? '');
    setDescription(editing?.description ?? '');
    setType(editing?.type ?? 'fixed');
    setValue(editing?.value != null ? String(editing.value) : '');
    setScope(editing?.scope ?? 'whole_sale');
    setScopeIds(editing?.scope_ids ?? []);
    setMinPurchase(
      editing?.min_purchase != null && editing.min_purchase !== 0
        ? String(editing.min_purchase)
        : '',
    );
    setTotalCap(editing?.total_cap != null ? String(editing.total_cap) : '');
    setPerCustomerCap(
      editing?.per_customer_cap != null ? String(editing.per_customer_cap) : '',
    );
    setStartsAt(editing?.starts_at ? editing.starts_at.slice(0, 10) : todayISO());
    setHasEndDate(!!editing?.ends_at);
    setEndsAt(editing?.ends_at ? editing.ends_at.slice(0, 10) : '');
    setIsActive(editing?.is_active ?? true);
    setSaveError('');
  }, [open, editing]);

  // Reset scope_ids when scope type changes
  useEffect(() => {
    setScopeIds([]);
  }, [scope]);

  if (!open) return null;

  function toggleScopeId(id: number) {
    setScopeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSave() {
    setSaveError('');

    const numValue = value === '' ? 0 : parseFloat(value);
    if (isNaN(numValue)) {
      setSaveError(t('invalidValue'));
      return;
    }

    const input: DiscountInput = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description.trim(),
      type,
      value: numValue,
      scope: type === 'free_delivery' ? 'whole_sale' : scope,
      scope_ids: type === 'free_delivery' ? [] : scopeIds,
      min_purchase: minPurchase === '' ? 0 : parseFloat(minPurchase) || 0,
      total_cap: totalCap === '' ? null : parseInt(totalCap, 10) || null,
      per_customer_cap:
        perCustomerCap === '' ? null : parseInt(perCustomerCap, 10) || null,
      starts_at: startsAt || null,
      ends_at: hasEndDate && endsAt ? endsAt : null,
      is_active: isActive,
    };

    setSaving(true);
    try {
      if (editing) {
        await updateDiscount(restaurantId, editing.id, input);
      } else {
        await createDiscount(restaurantId, input);
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError && err.details
          ? err.details
          : err instanceof Error
            ? err.message
            : String(err);
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }

  const showValueAndScope = type !== 'free_delivery';

  return (
    <Modal
      title={editing ? t('editDiscountTitle') : t('newDiscountTitle')}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-5">

        {/* Code + Name */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">
              {t('discountCode')}
            </label>
            <input
              autoFocus
              className="input uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={(e) => setCode(e.target.value.trim().toUpperCase())}
              placeholder="SUMMER20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">
              {t('discountName')}
            </label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">
            {t('discountDescription')}
          </label>
          <textarea
            className="input min-h-[72px] resize-none"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>

        {/* Type */}
        <div>
          <fieldset>
            <legend className="block text-sm font-medium text-fg-secondary mb-2">
              {t('discountType')}
            </legend>
            <div className="flex flex-col gap-2">
              {(['fixed', 'percent', 'free_delivery'] as const).map((opt) => (
                <label key={opt} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="discount-type"
                    value={opt}
                    checked={type === opt}
                    onChange={() => setType(opt)}
                    className="accent-brand-500"
                  />
                  <span className="text-sm text-fg-primary">
                    {opt === 'fixed'
                      ? t('typeFixed')
                      : opt === 'percent'
                        ? t('typePercent')
                        : t('typeFreeDelivery')}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {/* Value — hidden for free_delivery */}
        {showValueAndScope && (
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">
              {t('discountValue')}
            </label>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={type === 'percent' ? 100 : undefined}
                step={type === 'fixed' ? '0.01' : '1'}
                className="input pe-8"
                value={value}
                onChange={(e) => {
                  let v = e.target.value;
                  if (type === 'percent') {
                    const n = parseFloat(v);
                    if (!isNaN(n) && n > 100) v = '100';
                    if (!isNaN(n) && n < 0) v = '0';
                  }
                  setValue(v);
                }}
              />
              <span className="absolute end-3 top-1/2 -translate-y-1/2 text-sm text-fg-tertiary pointer-events-none">
                {type === 'fixed' ? '₪' : '%'}
              </span>
            </div>
          </div>
        )}

        {/* Applies to — hidden for free_delivery */}
        {showValueAndScope && (
          <div>
            <fieldset>
              <legend className="block text-sm font-medium text-fg-secondary mb-2">
                {t('appliesTo')}
              </legend>
              <div className="flex flex-col gap-2">
                {(['whole_sale', 'category', 'specific_item'] as const).map((opt) => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="discount-scope"
                      value={opt}
                      checked={scope === opt}
                      onChange={() => setScope(opt)}
                      className="accent-brand-500"
                    />
                    <span className="text-sm text-fg-primary">
                      {opt === 'whole_sale'
                        ? t('scopeWholeSale')
                        : opt === 'category'
                          ? t('scopeCategory')
                          : t('scopeSpecificItem')}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Category multi-select */}
            {scope === 'category' && categories.length > 0 && (
              <div className="mt-3 border border-[var(--divider)] rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                {categories.map((cat) => (
                  <label
                    key={cat.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--surface-subtle)] cursor-pointer border-b border-[var(--divider)] last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={scopeIds.includes(cat.id)}
                      onChange={() => toggleScopeId(cat.id)}
                      className="accent-brand-500"
                    />
                    <span className="text-sm text-fg-primary">{cat.name}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Item multi-select */}
            {scope === 'specific_item' && items.length > 0 && (
              <div className="mt-3 border border-[var(--divider)] rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                {items.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--surface-subtle)] cursor-pointer border-b border-[var(--divider)] last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={scopeIds.includes(item.id)}
                      onChange={() => toggleScopeId(item.id)}
                      className="accent-brand-500"
                    />
                    <span className="text-sm text-fg-primary">{item.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Conditions */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-fg-secondary">{t('conditions')}</p>

          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-0.5">
              {t('minPurchase')}
            </label>
            <p className="text-xs text-fg-tertiary mb-1">{t('minPurchaseHelp')}</p>
            <div className="relative">
              <input
                type="number"
                min={0}
                step="0.01"
                className="input pe-8"
                value={minPurchase}
                onChange={(e) => setMinPurchase(e.target.value)}
                placeholder="0"
              />
              <span className="absolute end-3 top-1/2 -translate-y-1/2 text-sm text-fg-tertiary pointer-events-none">
                ₪
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-0.5">
              {t('totalCap')}
            </label>
            <p className="text-xs text-fg-tertiary mb-1">{t('totalCapHelp')}</p>
            <input
              type="number"
              min={1}
              step="1"
              className="input"
              value={totalCap}
              onChange={(e) => setTotalCap(e.target.value)}
              placeholder="∞"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-0.5">
              {t('perCustomerCap')}
            </label>
            <p className="text-xs text-fg-tertiary mb-1">{t('perCustomerCapHelp')}</p>
            <input
              type="number"
              min={1}
              step="1"
              className="input"
              value={perCustomerCap}
              onChange={(e) => setPerCustomerCap(e.target.value)}
              placeholder="∞"
            />
          </div>
        </div>

        {/* Active dates */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">
              {t('startsAt')}
            </label>
            <input
              type="date"
              className="input"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasEndDate}
              onChange={(e) => {
                setHasEndDate(e.target.checked);
                if (!e.target.checked) setEndsAt('');
              }}
              className="accent-brand-500"
            />
            <span className="text-sm text-fg-primary">{t('setEndDate')}</span>
          </label>

          {hasEndDate && (
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1">
                {t('endsAt')}
              </label>
              <input
                type="date"
                className="input"
                value={endsAt}
                min={startsAt || undefined}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Active toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            role="switch"
            aria-checked={isActive}
            onClick={() => setIsActive((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
              isActive ? 'bg-brand-500' : 'bg-[var(--surface-muted)]'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform mt-0.5 ${
                isActive ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </div>
          <span className="text-sm text-fg-primary">{t('active')}</span>
        </label>

        {/* Error */}
        {saveError && (
          <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">
            {saveError}
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondary" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
