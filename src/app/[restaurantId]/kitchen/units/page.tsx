'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  listCustomUnits, createCustomUnit, updateCustomUnit, deleteCustomUnit,
  listStockItems,
  CustomUnit, CustomUnitInput, StockItem,
} from '@/lib/api';
import Modal from '@/components/Modal';
import { PlusIcon, TrashIcon, PencilIcon, RulerIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

// Units screen: manage the restaurant's library of custom measurement units
// (e.g. "piece", "slice"). The concrete size of one custom unit is set per
// stock item on the Stock screen, so this screen only owns the unit names.
export default function UnitsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [units, setUnits] = useState<CustomUnit[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; editing?: CustomUnit }>({ open: false });

  const reload = useCallback(async () => {
    try {
      const [us, is] = await Promise.all([listCustomUnits(rid), listStockItems(rid).catch(() => [])]);
      setUnits(us);
      setItems(is);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  // Map each library unit id -> the stock items that have a positive
  // per-item conversion configured. Drives the "Used on N items" chip and
  // the per-unit usage popover.
  const usageByUnitId = new Map<number, StockItem[]>();
  for (const item of items) {
    for (const conv of item.unit_conversions ?? []) {
      if (conv.base_quantity > 0) {
        const list = usageByUnitId.get(conv.custom_unit_id) ?? [];
        list.push(item);
        usageByUnitId.set(conv.custom_unit_id, list);
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">{t('units')}</h1>
          <p className="text-sm text-fg-secondary mt-1 max-w-xl">
            {t('unitsLibrarySubtitle')}{' '}
            <Link href={`/${rid}/kitchen/stock`} className="text-brand-500 hover:underline">
              {t('unitsGoToStock')}
            </Link>
          </p>
        </div>
        <button
          onClick={() => setModal({ open: true })}
          className="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors shrink-0"
        >
          <PlusIcon className="w-4 h-4" /> {t('addUnit')}
        </button>
      </div>

      {units.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 rounded-xl border border-dashed" style={{ borderColor: 'var(--divider)' }}>
          <RulerIcon className="w-8 h-8 text-fg-tertiary mb-3" />
          <p className="text-sm font-medium text-fg-primary">{t('noCustomUnits')}</p>
          <p className="text-sm text-fg-secondary mt-1 max-w-sm">{t('noCustomUnitsHint')}</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--divider)' }}>
          {units.map((u, i) => {
            const usingItems = usageByUnitId.get(u.id) ?? [];
            return (
              <div
                key={u.id}
                className="flex items-center justify-between px-4 py-3"
                style={i > 0 ? { borderTop: '1px solid var(--divider)' } : {}}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <RulerIcon className="w-4 h-4 text-fg-tertiary shrink-0" />
                  <span className="text-sm font-medium text-fg-primary truncate">{u.name}</span>
                  {u.abbreviation && (
                    <span className="text-xs text-fg-tertiary px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-subtle)' }}>
                      {u.abbreviation}
                    </span>
                  )}
                </div>
                <UnitUsageChip rid={rid} unit={u} items={usingItems} t={t} />
                <div className="flex items-center gap-1 shrink-0 ms-2">
                  <button
                    onClick={() => setModal({ open: true, editing: u })}
                    className="p-2 rounded-md text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors"
                    aria-label={t('edit')}
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={async () => {
                      const inUseCount = usingItems.length;
                      const confirmMsg = inUseCount > 0
                        ? `${t('deleteUnitConfirm')}\n\n${t('unitsUsageCount').replace('{count}', String(inUseCount))}.`
                        : t('deleteUnitConfirm');
                      if (!window.confirm(confirmMsg)) return;
                      await deleteCustomUnit(rid, u.id);
                      reload();
                    }}
                    className="p-2 rounded-md text-fg-secondary hover:text-red-600 hover:bg-red-50 transition-colors"
                    aria-label={t('delete')}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal.open && (
        <UnitFormModal
          editing={modal.editing}
          error={error}
          onClose={() => { setModal({ open: false }); setError(null); }}
          onSave={async (input) => {
            try {
              if (modal.editing) {
                await updateCustomUnit(rid, modal.editing.id, input);
              } else {
                await createCustomUnit(rid, input);
              }
              setModal({ open: false });
              setError(null);
              reload();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
          t={t}
        />
      )}
    </div>
  );
}

// Renders the "Used on N items" affordance for a library unit. Empty state
// is muted text; populated state expands into a list of links straight to
// each stock item's editor (via the existing `?edit=<id>` deep-link).
function UnitUsageChip({ rid, unit, items, t }: {
  rid: number;
  unit: CustomUnit;
  items: StockItem[];
  t: (k: string) => string;
}) {
  if (items.length === 0) {
    return <span className="text-xs text-fg-tertiary italic shrink-0">{t('unitsUsageNone')}</span>;
  }
  const label = items.length === 1
    ? t('unitsUsageOne')
    : t('unitsUsageCount').replace('{count}', String(items.length));
  return (
    <details className="relative shrink-0">
      <summary
        className="cursor-pointer text-xs text-fg-secondary px-2 py-1 rounded hover:bg-[var(--surface-subtle)] list-none select-none"
        aria-label={`${unit.name}: ${label}`}
      >
        {label}
      </summary>
      <div
        className="absolute end-0 top-full mt-1 z-10 rounded-md border shadow-lg min-w-[220px] py-1"
        style={{ borderColor: 'var(--divider)', background: 'var(--surface)' }}
      >
        {items.map((item) => {
          const conv = item.unit_conversions?.find((c) => c.custom_unit_id === unit.id);
          return (
            <Link
              key={item.id}
              href={`/${rid}/kitchen/stock?edit=${item.id}`}
              className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm hover:bg-[var(--surface-subtle)]"
            >
              <span className="truncate">{item.name}</span>
              {conv && (
                <span className="text-xs text-fg-tertiary font-mono tabular-nums shrink-0">
                  {conv.base_quantity} {item.unit}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </details>
  );
}

function UnitFormModal({ editing, error, onClose, onSave, t }: {
  editing?: CustomUnit;
  error: string | null;
  onClose: () => void;
  onSave: (input: CustomUnitInput) => void;
  t: (k: string) => string;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [abbreviation, setAbbreviation] = useState(editing?.abbreviation ?? '');

  const canSave = name.trim().length > 0;

  return (
    <Modal title={editing ? t('editUnit') : t('addUnit')} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">{t('unitNameLabel')} *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('unitNamePlaceholder')}
            autoFocus
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">{t('unitAbbrLabel')}</label>
          <input
            value={abbreviation}
            onChange={(e) => setAbbreviation(e.target.value)}
            placeholder={t('unitAbbrPlaceholder')}
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-fg-secondary hover:bg-[var(--surface-subtle)] transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            disabled={!canSave}
            onClick={() => onSave({ name: name.trim(), abbreviation: abbreviation.trim() })}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
          >
            {t('save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
