'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getCombo, createCombo, updateCombo, uploadComboImage,
  getMenu, ComboMenu, ComboStep, ComboStepInput, MenuItem, MenuCategory,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  PlusIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon, PhotoIcon,
} from '@heroicons/react/24/outline';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface StepDraft {
  id?: number;
  name: string;
  min_picks: number;
  max_picks: number;
  sort_order: number;
  fixed_modifier_name: string;
  items: { menu_item_id: number; price_delta: number; item_name?: string }[];
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ComboEditorPage() {
  const { restaurantId, comboId } = useParams();
  const rid = Number(restaurantId);
  const isNew = comboId === 'new';
  const router = useRouter();
  const { t } = useI18n();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [uploading, setUploading] = useState(false);

  // Menu items for item picker
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [savedComboId, setSavedComboId] = useState<number | null>(null);

  const allItems = categories.flatMap((c) => (c.items ?? []).map((i) => ({ ...i, category_name: c.name })));

  // ─── Load data ─────────────────────────────────────────────────────────────

  const loadMenu = useCallback(() => {
    getMenu(rid).then(setCategories).catch(() => {});
  }, [rid]);

  useEffect(() => {
    loadMenu();
    if (!isNew) {
      getCombo(rid, Number(comboId))
        .then((combo: ComboMenu) => {
          setName(combo.name);
          setDescription(combo.description ?? '');
          setPrice(String(combo.price));
          setIsActive(combo.is_active);
          setImageUrl(combo.image_url ?? '');
          setSavedComboId(combo.id);
          setSteps(
            combo.steps.map((s: ComboStep) => ({
              id: s.id,
              name: s.name,
              min_picks: s.min_picks,
              max_picks: s.max_picks,
              sort_order: s.sort_order,
              fixed_modifier_name: s.fixed_modifier_name ?? '',
              items: s.items.map((i) => ({
                menu_item_id: i.menu_item_id,
                price_delta: i.price_delta,
                item_name: i.menu_item?.name,
              })),
            }))
          );
        })
        .finally(() => setLoading(false));
    }
  }, [rid, comboId, isNew, loadMenu]);

  // ─── Step helpers ──────────────────────────────────────────────────────────

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      { name: '', min_picks: 1, max_picks: 1, sort_order: prev.length, fixed_modifier_name: '', items: [] },
    ]);
  };

  const removeStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const arr = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return prev;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr.map((s, i) => ({ ...s, sort_order: i }));
    });
  };

  const updateStep = (idx: number, patch: Partial<StepDraft>) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const addItemToStep = (stepIdx: number, item: MenuItem & { category_name?: string }) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== stepIdx) return s;
        if (s.items.some((si) => si.menu_item_id === item.id)) return s;
        return { ...s, items: [...s.items, { menu_item_id: item.id, price_delta: 0, item_name: item.name }] };
      })
    );
  };

  const removeItemFromStep = (stepIdx: number, menuItemId: number) => {
    setSteps((prev) =>
      prev.map((s, i) =>
        i !== stepIdx ? s : { ...s, items: s.items.filter((si) => si.menu_item_id !== menuItemId) }
      )
    );
  };

  const updateStepItemDelta = (stepIdx: number, menuItemId: number, delta: number) => {
    setSteps((prev) =>
      prev.map((s, i) =>
        i !== stepIdx
          ? s
          : { ...s, items: s.items.map((si) => (si.menu_item_id === menuItemId ? { ...si, price_delta: delta } : si)) }
      )
    );
  };

  // ─── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setError('');
    if (!name.trim()) { setError(t('nameRequired')); return; }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) { setError(t('invalidPrice')); return; }

    const payload: ReturnType<typeof buildPayload> = buildPayload();
    setSaving(true);
    try {
      if (isNew) {
        const created = await createCombo(rid, payload);
        setSavedComboId(created.id);
        router.replace(`/${rid}/menu/combos/${created.id}`);
      } else {
        await updateCombo(rid, Number(comboId), payload);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const buildPayload = () => ({
    name: name.trim(),
    description: description.trim(),
    price: parseFloat(price) || 0,
    image_url: imageUrl,
    is_active: isActive,
    sort_order: 0,
    steps: steps.map((s, i): ComboStepInput => ({
      name: s.name,
      min_picks: s.min_picks,
      max_picks: s.max_picks,
      sort_order: i,
      fixed_modifier_name: s.fixed_modifier_name || undefined,
      items: s.items.map((si) => ({ menu_item_id: si.menu_item_id, price_delta: si.price_delta })),
    })),
  });

  // ─── Image upload ──────────────────────────────────────────────────────────

  const handleImageUpload = async (file: File) => {
    if (!savedComboId && isNew) {
      // Save first to get an ID, then upload
      setError('');
      const parsedPrice = parseFloat(price);
      if (!name.trim() || isNaN(parsedPrice)) {
        setError(t('saveFirstBeforeImage'));
        return;
      }
      setSaving(true);
      try {
        const created = await createCombo(rid, buildPayload());
        setSavedComboId(created.id);
        router.replace(`/${rid}/menu/combos/${created.id}`);
        setUploading(true);
        const url = await uploadComboImage(rid, created.id, file);
        setImageUrl(url);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : t('uploadFailed'));
      } finally {
        setSaving(false);
        setUploading(false);
      }
      return;
    }
    const cid = savedComboId ?? Number(comboId);
    setUploading(true);
    try {
      const url = await uploadComboImage(rid, cid, file);
      setImageUrl(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold text-fg-primary">
          {isNew ? t('createCombo') : t('editCombo')}
        </h1>
      </div>

      {error && (
        <div className="rounded-standard px-4 py-3 text-sm text-red-400 bg-red-500/10">
          {error}
        </div>
      )}

      {/* Basic info card */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-fg-secondary uppercase tracking-wider">{t('basicInfo')}</h2>

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('nameRequired')}</label>
          <input
            className="input w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('comboNamePlaceholder')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('description')}</label>
          <textarea
            className="input w-full resize-none"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('customerDescription')}
          />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-fg-secondary mb-1">{t('price')} (₪)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input w-full"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span className="text-sm text-fg-primary">{t('active')}</span>
            </label>
          </div>
        </div>

        {/* Image upload */}
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('image')}</label>
          <ImageUploadArea
            imageUrl={imageUrl}
            uploading={uploading}
            onFile={handleImageUpload}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg-secondary uppercase tracking-wider">{t('comboSteps')}</h2>
          <button onClick={addStep} className="btn-secondary flex items-center gap-2 text-sm">
            <PlusIcon className="w-4 h-4" />
            {t('addStep')}
          </button>
        </div>

        {steps.length === 0 && (
          <div className="text-center py-8 text-fg-secondary text-sm">{t('noStepsYet')}</div>
        )}

        {steps.map((step, idx) => (
          <StepCard
            key={idx}
            step={step}
            idx={idx}
            total={steps.length}
            allItems={allItems}
            onUpdate={(patch) => updateStep(idx, patch)}
            onRemove={() => removeStep(idx)}
            onMoveUp={() => moveStep(idx, -1)}
            onMoveDown={() => moveStep(idx, 1)}
            onAddItem={(item) => addItemToStep(idx, item)}
            onRemoveItem={(menuItemId) => removeItemFromStep(idx, menuItemId)}
            onUpdateDelta={(menuItemId, delta) => updateStepItemDelta(idx, menuItemId, delta)}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? t('saving') : t('saveChanges')}
        </button>
        <button onClick={() => router.push(`/${rid}/menu/combos`)} className="btn-secondary">
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}

// ─── Step Card ────────────────────────────────────────────────────────────────

function StepCard({
  step, idx, total, allItems, onUpdate, onRemove, onMoveUp, onMoveDown,
  onAddItem, onRemoveItem, onUpdateDelta,
}: {
  step: StepDraft;
  idx: number;
  total: number;
  allItems: (MenuItem & { category_name: string })[];
  onUpdate: (patch: Partial<StepDraft>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddItem: (item: MenuItem & { category_name: string }) => void;
  onRemoveItem: (menuItemId: number) => void;
  onUpdateDelta: (menuItemId: number, delta: number) => void;
}) {
  const { t } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const selectedIds = new Set(step.items.map((i) => i.menu_item_id));
  const filtered = allItems.filter(
    (item) => !selectedIds.has(item.id) && item.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="card space-y-4">
      {/* Step header */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-fg-secondary uppercase">
          {t('step')} {idx + 1}
        </span>
        <div className="flex-1" />
        <button
          onClick={onMoveUp}
          disabled={idx === 0}
          className="p-1 rounded hover:bg-[var(--surface-subtle)] disabled:opacity-30"
        >
          <ArrowUpIcon className="w-4 h-4 text-fg-secondary" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={idx === total - 1}
          className="p-1 rounded hover:bg-[var(--surface-subtle)] disabled:opacity-30"
        >
          <ArrowDownIcon className="w-4 h-4 text-fg-secondary" />
        </button>
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-red-500/10 text-red-400"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Step name */}
      <div>
        <label className="block text-xs font-medium text-fg-secondary mb-1">{t('stepName')}</label>
        <input
          className="input w-full text-sm"
          value={step.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder={t('stepNamePlaceholder')}
        />
      </div>

      {/* Min / Max picks */}
      <div className="flex gap-4">
        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">{t('minPicks')}</label>
          <input
            type="number"
            min="0"
            className="input w-24 text-sm"
            value={step.min_picks}
            onChange={(e) => onUpdate({ min_picks: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">{t('maxPicks')}</label>
          <input
            type="number"
            min="0"
            className="input w-24 text-sm"
            value={step.max_picks}
            onChange={(e) => onUpdate({ max_picks: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-fg-secondary mb-1">
            {t('fixedModifierName')} <span className="text-fg-secondary font-normal">({t('optional')})</span>
          </label>
          <input
            className="input w-full text-sm"
            value={step.fixed_modifier_name}
            onChange={(e) => onUpdate({ fixed_modifier_name: e.target.value })}
            placeholder={t('fixedModifierPlaceholder')}
          />
        </div>
      </div>

      {/* Items in step */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-fg-secondary">{t('items')}</label>
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setPickerOpen((o) => !o)}
              className="text-xs btn-secondary flex items-center gap-1 py-1"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              {t('addItem')}
            </button>
            {pickerOpen && (
              <div
                className="absolute top-full right-0 mt-1 rounded-standard py-1 w-64 z-50 shadow-lg"
                style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
              >
                <div className="px-3 py-2">
                  <input
                    autoFocus
                    className="input w-full text-xs py-1"
                    placeholder={t('search')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-fg-secondary">{t('noItemsFound')}</div>
                  ) : (
                    filtered.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => { onAddItem(item); setSearch(''); }}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)]"
                      >
                        <span className="flex-1">{item.name}</span>
                        <span className="text-fg-secondary">₪{item.price.toFixed(2)}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {step.items.length === 0 && (
          <div className="text-xs text-fg-secondary py-2">{t('noItemsInStep')}</div>
        )}

        {step.items.map((si) => (
          <div
            key={si.menu_item_id}
            className="flex items-center gap-3 py-2"
            style={{ borderBottom: '1px solid var(--divider)' }}
          >
            <span className="flex-1 text-sm text-fg-primary">{si.item_name || `#${si.menu_item_id}`}</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-fg-secondary">+₪</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input w-20 text-xs py-1"
                value={si.price_delta}
                onChange={(e) => onUpdateDelta(si.menu_item_id, parseFloat(e.target.value) || 0)}
              />
            </div>
            <button
              onClick={() => onRemoveItem(si.menu_item_id)}
              className="p-1 rounded hover:bg-red-500/10 text-red-400 flex-shrink-0"
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Image Upload Area ────────────────────────────────────────────────────────

function ImageUploadArea({
  imageUrl, uploading, onFile,
}: {
  imageUrl: string;
  uploading: boolean;
  onFile: (f: File) => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div
      className="relative rounded-standard border-2 border-dashed flex flex-col items-center justify-center p-6 cursor-pointer transition-colors hover:border-brand-500"
      style={{ borderColor: 'var(--divider)', minHeight: 120 }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      {uploading ? (
        <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
      ) : imageUrl ? (
        <img src={imageUrl} alt="" className="h-24 object-contain rounded-lg" />
      ) : (
        <>
          <PhotoIcon className="w-8 h-8 text-fg-secondary mb-2" />
          <p className="text-xs text-fg-secondary text-center">
            {t('dropImagesHere')} · <span className="text-brand-500">{t('browse')}</span>
          </p>
        </>
      )}
    </div>
  );
}
