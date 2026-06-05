'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getModifierSet, createModifierSet, updateModifierSet,
  deleteModifier, createModifierInSet, reorderModifierSetModifiers,
  deleteModifierSet,
  listStockItems, listPrepItems,
  getRestaurant,
  ModifierSetInput, StockItem, PrepItem, TranslationMap,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Plus, Trash2 } from 'lucide-react';
import CenteredModalShell from '@/components/common/CenteredModalShell';
import { NumberInput } from '@/components/ui/NumberInput';
import { LocaleTabs, type Locale } from '@/components/i18n/LocaleTabs';

const SUPPORTED_LOCALES: Locale[] = ['en', 'he', 'fr'];

/** Apply or clear a single locale's override on a translations map. */
function setLocaleOverride(
  prev: TranslationMap | undefined,
  field: string,
  locale: Locale,
  value: string,
): TranslationMap {
  const next: TranslationMap = { ...(prev ?? {}) };
  const fieldMap = { ...(next[field] ?? {}) };
  if (value === '') {
    delete fieldMap[locale];
  } else {
    fieldMap[locale] = value;
  }
  if (Object.keys(fieldMap).length === 0) {
    delete next[field];
  } else {
    next[field] = fieldMap;
  }
  return next;
}

interface ModifierRow {
  id?: number;
  name: string;
  kitchen_name: string;
  action: 'add' | 'remove';
  price_delta: number;
  is_active: boolean;
  is_preselected: boolean;
  hide_online: boolean;
  sort_order: number;
  // Stock consumption — when a customer picks this modifier, it consumes
  // `quantity` of the linked stock or prep item. Empty = no inventory impact.
  stock_item_id?: number | null;
  prep_item_id?: number | null;
  quantity: number;
  unit: string;
  /** Per-locale name overrides — `{ name: { he: "..." } }`. */
  translations?: TranslationMap;
  isNew?: boolean;
}

function blankRow(sortOrder: number): ModifierRow {
  return {
    name: '',
    kitchen_name: '',
    action: 'add',
    price_delta: 0,
    is_active: true,
    is_preselected: false,
    hide_online: false,
    sort_order: sortOrder,
    stock_item_id: null,
    prep_item_id: null,
    quantity: 0,
    unit: 'g',
    isNew: true,
  };
}

const ROW_GRID = '1fr 1fr 110px 70px 70px 140px 36px';

export default function ModifierSetEditorPage() {
  const { restaurantId, setId } = useParams();
  const rid = Number(restaurantId);
  const isNew = setId === 'new';
  const router = useRouter();
  const { t } = useI18n();

  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [setTranslations, setSetTranslations] = useState<TranslationMap>({});
  const [isRequired, setIsRequired] = useState(false);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [minSelections, setMinSelections] = useState(1);
  const [maxSelections, setMaxSelections] = useState(0);
  const [allowQuantities, setAllowQuantities] = useState(false);
  const [hideOnReceipt, setHideOnReceipt] = useState(false);
  const [useConversational, setUseConversational] = useState(false);
  const [rows, setRows] = useState<ModifierRow[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [sourceLocale, setSourceLocale] = useState<Locale>('en');
  const [activeLocale, setActiveLocale] = useState<Locale>('en');
  const isSourceTab = activeLocale === sourceLocale;
  // Inventory sources for the per-row stock picker.
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [prepItems, setPrepItems] = useState<PrepItem[]>([]);
  // Which row has its stock-consumption subrow expanded.
  const [expandedStockIdx, setExpandedStockIdx] = useState<number | null>(null);
  // Buffer for the inline add-row at the bottom.
  const [newRow, setNewRow] = useState<ModifierRow>(blankRow(0));

  const loadSet = useCallback(async () => {
    if (isNew) return;
    const set = await getModifierSet(rid, Number(setId));
    setName(set.name);
    setDisplayName(set.display_name);
    setSetTranslations(set.translations ?? {});
    setIsRequired(set.is_required);
    setAllowMultiple(set.allow_multiple);
    const hasCustomQuantities = set.min_selections > 1 || set.max_selections > 0;
    setAllowQuantities(hasCustomQuantities);
    setMinSelections(set.min_selections || 1);
    setMaxSelections(set.max_selections);
    setHideOnReceipt(set.hide_on_receipt);
    setUseConversational(set.use_conversational);
    setRows(set.modifiers.map((m) => ({
      id: m.id,
      name: m.name,
      kitchen_name: m.kitchen_name,
      action: m.action,
      price_delta: m.price_delta,
      is_active: m.is_active,
      is_preselected: m.is_preselected,
      hide_online: m.hide_online,
      sort_order: m.sort_order,
      stock_item_id: m.stock_item_id ?? null,
      prep_item_id: m.prep_item_id ?? null,
      quantity: m.quantity ?? 0,
      unit: m.unit || 'g',
      translations: m.translations ?? {},
    })));
    setLoading(false);
  }, [rid, setId, isNew]);

  useEffect(() => { loadSet(); }, [loadSet]);
  // Source locale comes from the restaurant — same pattern as the item editor.
  useEffect(() => {
    getRestaurant(rid)
      .then((r) => {
        const loc = r.default_locale;
        if (loc === 'en' || loc === 'he' || loc === 'fr') {
          setSourceLocale(loc);
          setActiveLocale(loc);
        }
      })
      .catch(() => {});
  }, [rid]);
  useEffect(() => {
    Promise.all([listStockItems(rid), listPrepItems(rid)])
      .then(([s, p]) => { setStockItems(s); setPrepItems(p); })
      .catch(() => {});
  }, [rid]);

  const updateRow = (index: number, patch: Partial<ModifierRow>) => {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, ...patch } : r));
  };

  const commitNewRow = () => {
    if (!newRow.name.trim()) return;
    setRows((prev) => [...prev, { ...newRow, sort_order: prev.length }]);
    setNewRow(blankRow(rows.length + 1));
  };

  const removeRow = async (index: number) => {
    const row = rows[index];
    if (row.id && !isNew) {
      if (!confirm(t('deleteThisModifier') || 'Delete this modifier?')) return;
      await deleteModifier(rid, row.id);
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
    if (expandedStockIdx === index) setExpandedStockIdx(null);
  };

  const goBack = () => router.push(`/${restaurantId}/menu/modifier-sets`);

  const handleSave = async () => {
    if (!name.trim()) { alert(t('nameRequired') || 'Name is required'); return; }
    setSaving(true);
    try {
      // Auto-commit any pending inline row before save.
      const finalRows = newRow.name.trim()
        ? [...rows, { ...newRow, sort_order: rows.length }]
        : rows;

      const input: ModifierSetInput = {
        name,
        display_name: displayName,
        is_required: isRequired,
        allow_multiple: allowMultiple,
        min_selections: (allowMultiple && allowQuantities) ? minSelections : 0,
        max_selections: (allowMultiple && allowQuantities) ? maxSelections : 0,
        hide_on_receipt: hideOnReceipt,
        use_conversational: useConversational,
        translations: setTranslations,
      };

      if (isNew) {
        const newRows = finalRows.filter((r) => r.name.trim());
        input.modifiers = newRows.map((r, i) => ({
          ...r,
          sort_order: i,
          translations: r.translations ?? {},
        }));
        await createModifierSet(rid, input);
      } else {
        const setID = Number(setId);
        await updateModifierSet(rid, setID, input);
        const newRows = finalRows.filter((r) => r.isNew && r.name.trim());
        for (const row of newRows) {
          await createModifierInSet(rid, setID, {
            ...row,
            translations: row.translations ?? {},
          });
        }
        const existingIds = finalRows.filter((r) => r.id).map((r) => r.id as number);
        if (existingIds.length > 0) {
          await reorderModifierSetModifiers(rid, setID, existingIds);
        }
      }

      router.push(`/${restaurantId}/menu/modifier-sets`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSet = async () => {
    if (isNew) return;
    if (!confirm(`${t('delete')} "${name}"?`)) return;
    await deleteModifierSet(rid, Number(setId));
    router.push(`/${restaurantId}/menu/modifier-sets`);
  };

  if (loading) {
    return (
      <CenteredModalShell title="" onClose={goBack}>
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
        </div>
      </CenteredModalShell>
    );
  }

  const namedRowCount = Math.max(rows.filter((r) => r.name.trim()).length, 5);
  const selectionOptions = Array.from({ length: namedRowCount }, (_, i) => i + 1);
  const title = isNew
    ? (t('createModifierSet') || 'Create modifier set')
    : (name || (t('editModifierSet') || 'Edit modifier set'));

  return (
    <CenteredModalShell
      title={title}
      onClose={goBack}
      onSave={handleSave}
      saving={saving}
      saveDisabled={!name.trim()}
      maxWidth="max-w-5xl"
    >
      <div className="px-6 py-8 space-y-8">
        {/* Details */}
        <Section title={t('details') || 'Details'}>
          <div className="bg-white dark:bg-[#111111] rounded-xl border border-neutral-200 dark:border-neutral-700 p-5 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <LocaleTabs
                locales={SUPPORTED_LOCALES}
                source={sourceLocale}
                active={activeLocale}
                onChange={setActiveLocale}
                missing={Object.fromEntries(
                  SUPPORTED_LOCALES.filter((l) => l !== sourceLocale).map((l) => [
                    l,
                    !setTranslations?.display_name?.[l] && !!displayName.trim(),
                  ]),
                )}
              />
              {!isSourceTab && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t('languageEditingTranslation') ||
                    'Editing translation. Leave blank to use the auto-translation; what you type here overrides it.'}
                </span>
              )}
            </div>
            {isSourceTab && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
                  {(t('internalName') || 'Internal name') + ' *'}
                </label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Toppings"
                  className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
                {t('displayName') || 'Display name'}
              </label>
              {isSourceTab ? (
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('displayNamePlaceholder') || 'Shown to customers (leave blank to use internal name)'}
                  className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
                />
              ) : (
                <>
                  <input
                    value={setTranslations?.display_name?.[activeLocale] ?? ''}
                    onChange={(e) =>
                      setSetTranslations((prev) =>
                        setLocaleOverride(prev, 'display_name', activeLocale, e.target.value),
                      )
                    }
                    placeholder={displayName || (t('displayNamePlaceholder') || 'Shown to customers')}
                    className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
                  />
                  <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                    {(t('languageSourceLabel') || 'Source') + ': '}
                    <span className="text-neutral-500 dark:text-neutral-400">{displayName || '—'}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </Section>

        {/* Modifiers list */}
        <Section title={t('modifierList') || 'Modifier list'}>
          <div className="bg-white dark:bg-[#111111] rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            {/* Header */}
            <div
              className="grid text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider px-4 py-3 bg-neutral-50 dark:bg-[#0a0a0a] border-b border-neutral-200 dark:border-neutral-700 gap-2"
              style={{ gridTemplateColumns: ROW_GRID }}
            >
              <span>{t('name') || 'Name'}</span>
              <span>{t('kitchenName') || 'Kitchen name'}</span>
              <span className="text-right">{t('price') || 'Price'}</span>
              <span className="text-center">{t('hideOnline') || 'Hide online'}</span>
              <span className="text-center">{t('preselect') || 'Preselect'}</span>
              <span>{t('available') || 'Availability'}</span>
              <span />
            </div>

            {rows.map((row, i) => (
              <div
                key={row.id ?? `new-${i}`}
                className="border-b border-neutral-200 dark:border-neutral-700 last:border-b-0"
              >
                <div
                  className="grid items-center gap-2 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-[#1a1a1a] transition-colors"
                  style={{ gridTemplateColumns: ROW_GRID }}
                >
                  {isSourceTab ? (
                    <input
                      value={row.name}
                      onChange={(e) => updateRow(i, { name: e.target.value })}
                      placeholder={t('modifierName') || 'New modifier'}
                      className="text-sm bg-transparent border-0 outline-none text-neutral-900 dark:text-white pr-2"
                    />
                  ) : (
                    <input
                      value={row.translations?.name?.[activeLocale] ?? ''}
                      onChange={(e) =>
                        updateRow(i, {
                          translations: setLocaleOverride(
                            row.translations,
                            'name',
                            activeLocale,
                            e.target.value,
                          ),
                        })
                      }
                      placeholder={row.name || (t('modifierName') || 'New modifier')}
                      className="text-sm bg-transparent border-0 outline-none text-neutral-900 dark:text-white pr-2 italic"
                    />
                  )}
                  <input
                    value={row.kitchen_name}
                    onChange={(e) => updateRow(i, { kitchen_name: e.target.value })}
                    placeholder={t('kitchenNamePlaceholder') || 'Abbrev.'}
                    className="text-sm bg-transparent border-0 outline-none text-neutral-700 dark:text-neutral-300"
                  />
                  <div className="flex items-center justify-end gap-1">
                    <NumberInput
                      min={-1000000}
                      value={row.price_delta}
                      onChange={(n) => updateRow(i, { price_delta: n })}
                      className="w-full text-sm bg-transparent border-0 outline-none text-neutral-900 dark:text-white text-right pr-1"
                    />
                    <span className="text-neutral-400 text-xs shrink-0">₪</span>
                  </div>
                  <div className="flex justify-center">
                    <input
                      type="checkbox"
                      checked={row.hide_online}
                      onChange={(e) => updateRow(i, { hide_online: e.target.checked })}
                      className="size-4 rounded accent-orange-500"
                    />
                  </div>
                  <div className="flex justify-center">
                    <input
                      type="checkbox"
                      checked={row.is_preselected}
                      onChange={(e) => updateRow(i, { is_preselected: e.target.checked })}
                      className="size-4 rounded accent-orange-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <PillToggle
                      checked={row.is_active}
                      onChange={(v) => updateRow(i, { is_active: v })}
                      size="sm"
                    />
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      {row.is_active ? (t('inStock') || 'In stock') : (t('outOfStock') || 'Out of stock')}
                    </span>
                  </div>
                  <button
                    onClick={() => removeRow(i)}
                    className="size-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors justify-self-end"
                    title={t('delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Stock-consumption subrow — opt-in per modifier */}
                <StockConsumptionRow
                  row={row}
                  index={i}
                  expanded={expandedStockIdx === i || !!(row.stock_item_id || row.prep_item_id)}
                  onExpand={() => setExpandedStockIdx(i)}
                  onCollapse={() => setExpandedStockIdx(null)}
                  onChange={(patch) => updateRow(i, patch)}
                  stockItems={stockItems}
                  prepItems={prepItems}
                  t={t}
                />
              </div>
            ))}

            {/* Inline add row */}
            <div
              className="grid items-center gap-2 px-4 py-3 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-[#0a0a0a]"
              style={{ gridTemplateColumns: ROW_GRID }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Plus size={14} className="text-orange-500 shrink-0" />
                <input
                  value={newRow.name}
                  onChange={(e) => setNewRow((r) => ({ ...r, name: e.target.value }))}
                  placeholder={t('addModifier') || 'Add modifier'}
                  className="flex-1 text-sm bg-transparent border-0 outline-none text-neutral-900 dark:text-white min-w-0"
                  onKeyDown={(e) => { if (e.key === 'Enter') commitNewRow(); }}
                />
              </div>
              <input
                value={newRow.kitchen_name}
                onChange={(e) => setNewRow((r) => ({ ...r, kitchen_name: e.target.value }))}
                placeholder={t('kitchenNamePlaceholder') || 'Abbrev.'}
                className="text-sm bg-transparent border-0 outline-none text-neutral-700 dark:text-neutral-300"
                onKeyDown={(e) => { if (e.key === 'Enter') commitNewRow(); }}
              />
              <div className="flex items-center justify-end gap-1">
                <NumberInput
                  min={-1000000}
                  value={newRow.price_delta}
                  onChange={(n) => setNewRow((r) => ({ ...r, price_delta: n }))}
                  placeholder="0.00"
                  className="w-full text-sm bg-transparent border-0 outline-none text-neutral-900 dark:text-white text-right pr-1"
                  onKeyDown={(e) => { if (e.key === 'Enter') commitNewRow(); }}
                />
                <span className="text-neutral-400 text-xs shrink-0">₪</span>
              </div>
              <span />
              <span />
              <span />
              {newRow.name.trim() ? (
                <button
                  onClick={commitNewRow}
                  className="text-sm font-medium text-orange-500 hover:underline justify-self-end"
                >
                  {t('add') || 'Add'}
                </button>
              ) : (
                <span />
              )}
            </div>
          </div>
        </Section>

        {/* Selection rules */}
        <Section title={t('selectionRules') || 'Selection rules'}>
          <div className="bg-white dark:bg-[#111111] rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            <p className="px-5 pt-5 pb-2 text-sm text-neutral-600 dark:text-neutral-400">
              {t('selectionRulesDesc') || 'These are the default settings for customization. You can override them per item.'}
            </p>
            <ToggleRow
              checked={isRequired}
              onChange={setIsRequired}
              label={t('requireSelection') || 'Require selection'}
            />
            <ToggleRow
              checked={allowMultiple}
              onChange={setAllowMultiple}
              label={t('allowMultiple') || 'Allow selection of more than one modifier'}
            />
          </div>
        </Section>

        {/* Quantity rules — only when Allow multiple is on */}
        {allowMultiple && (
          <Section title={t('quantityRules') || 'Quantity rules'}>
            <div className="bg-white dark:bg-[#111111] rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
              <ToggleRow
                checked={allowQuantities}
                onChange={setAllowQuantities}
                label={t('allowQuantities') || 'Allow multiple quantities per modifier'}
                noBorder
              />
              <div className="px-5 py-4 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between gap-4">
                <p className="text-sm font-medium text-neutral-900 dark:text-white">{t('minSelectionsLabel') || 'Minimum selections'}</p>
                <select
                  value={minSelections}
                  onChange={(e) => setMinSelections(Number(e.target.value))}
                  disabled={!allowQuantities}
                  className="w-48 px-3 py-2 text-sm rounded-lg outline-none transition-opacity text-neutral-900 dark:text-white bg-neutral-50 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 disabled:opacity-50"
                >
                  {selectionOptions.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div className="px-5 py-4 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between gap-4">
                <p className="text-sm font-medium text-neutral-900 dark:text-white">{t('maxSelectionsLabel') || 'Maximum selections'}</p>
                <select
                  value={maxSelections}
                  onChange={(e) => setMaxSelections(Number(e.target.value))}
                  disabled={!allowQuantities}
                  className="w-48 px-3 py-2 text-sm rounded-lg outline-none transition-opacity text-neutral-900 dark:text-white bg-neutral-50 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 disabled:opacity-50"
                >
                  <option value={0}>{t('noMaximum') || 'No maximum'}</option>
                  {selectionOptions.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          </Section>
        )}

        {/* Settings */}
        <Section title={t('settings') || 'Settings'}>
          <div className="bg-white dark:bg-[#111111] rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            <ToggleRow
              checked={hideOnReceipt}
              onChange={setHideOnReceipt}
              label={t('hideOnReceipt') || 'Hide modifiers on customer receipts'}
              description={t('hideOnReceiptDesc') || 'Modifiers in this set will not appear on customer-facing receipts'}
              noBorder
            />
            <ToggleRow
              checked={useConversational}
              onChange={setUseConversational}
              label={t('useConversational') || 'Use conversational modifiers in POS'}
              description={t('useConversationalDesc') || 'Show "Add", "Extra", "Remove" operators when displaying this group in the POS'}
            />
          </div>
        </Section>

        {/* Destructive */}
        {!isNew && (
          <button
            onClick={handleDeleteSet}
            className="text-sm font-medium text-red-500 hover:text-red-600 hover:underline"
          >
            {t('delete')} {(t('modifierSets') || 'modifier set').toLowerCase()}
          </button>
        )}
      </div>
    </CenteredModalShell>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-1 h-6 bg-orange-500 rounded-full" />
        <h3 className="text-lg font-bold text-neutral-900 dark:text-white">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function PillToggle({ checked, onChange, size = 'md' }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  size?: 'sm' | 'md';
}) {
  const dims = size === 'sm'
    ? { track: 'h-5 w-9', knob: 'h-4 w-4', shift: 'translate-x-4' }
    : { track: 'h-6 w-11', knob: 'h-5 w-5', shift: 'translate-x-5' };
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${dims.track} ${checked ? 'bg-orange-500' : 'bg-neutral-300 dark:bg-neutral-700'}`}
    >
      <span className={`pointer-events-none inline-block rounded-full bg-white shadow transform transition-transform ${dims.knob} ${checked ? dims.shift : 'translate-x-0'}`} />
    </button>
  );
}

function ToggleRow({ checked, onChange, label, description, noBorder }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  noBorder?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 px-5 py-4 ${noBorder ? '' : 'border-t border-neutral-200 dark:border-neutral-700'}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-900 dark:text-white">{label}</p>
        {description && (
          <p className="text-xs mt-0.5 text-neutral-500 dark:text-neutral-400">{description}</p>
        )}
      </div>
      <PillToggle checked={checked} onChange={onChange} />
    </div>
  );
}

function StockConsumptionRow({
  row, index, expanded, onExpand, onCollapse, onChange, stockItems, prepItems, t,
}: {
  row: ModifierRow;
  index: number;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onChange: (patch: Partial<ModifierRow>) => void;
  stockItems: StockItem[];
  prepItems: PrepItem[];
  t: (key: string) => string;
}) {
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onExpand}
        className="block w-full text-left px-4 pb-3 text-xs text-neutral-400 hover:text-orange-500 transition-colors"
      >
        + {t('linkStockConsumption') || 'Link stock consumption'}
      </button>
    );
  }
  const pickerValue = row.stock_item_id
    ? `s:${row.stock_item_id}`
    : row.prep_item_id ? `p:${row.prep_item_id}` : '';
  return (
    <div className="flex items-center gap-2 flex-wrap px-4 pb-3 text-xs text-neutral-500 dark:text-neutral-400" key={`stock-${index}`}>
      <span className="text-neutral-400">{t('consumesFromStock') || 'Consumes'}:</span>
      <select
        value={pickerValue}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) {
            onChange({ stock_item_id: null, prep_item_id: null });
            onCollapse();
          } else if (v.startsWith('s:')) {
            onChange({ stock_item_id: Number(v.slice(2)), prep_item_id: null });
          } else {
            onChange({ prep_item_id: Number(v.slice(2)), stock_item_id: null });
          }
        }}
        className="px-2 py-1 rounded text-xs bg-neutral-50 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white"
      >
        <option value="">— {t('none') || 'None'} —</option>
        <optgroup label={t('stockItems') || 'Stock items'}>
          {stockItems.map((s) => (
            <option key={`s-${s.id}`} value={`s:${s.id}`}>{s.name}</option>
          ))}
        </optgroup>
        <optgroup label={t('prepItems') || 'Prep items'}>
          {prepItems.map((p) => (
            <option key={`p-${p.id}`} value={`p:${p.id}`}>{p.name}</option>
          ))}
        </optgroup>
      </select>
      <NumberInput
        min={0}
        value={row.quantity}
        onChange={(n) => onChange({ quantity: n })}
        placeholder={t('qty') || 'Qty'}
        className="w-20 px-2 py-1 rounded text-xs bg-neutral-50 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white text-right"
      />
      <select
        value={row.unit || 'g'}
        onChange={(e) => onChange({ unit: e.target.value })}
        className="px-2 py-1 rounded text-xs bg-neutral-50 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white"
      >
        <option value="g">g</option>
        <option value="kg">kg</option>
        <option value="ml">ml</option>
        <option value="l">l</option>
        <option value="unit">unit</option>
      </select>
      <span className="text-neutral-400">{t('perSelection') || 'per selection'}</span>
    </div>
  );
}
