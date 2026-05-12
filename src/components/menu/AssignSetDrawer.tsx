'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Search } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Drawer } from '@/components/ds';
import { Checkbox } from '@/components/ui/checkbox';
import {
  listOptionSets,
  listModifierSets,
  attachOptionSetToItems,
  attachModifierSetToItems,
  type OptionSet,
  type ModifierSet,
  type MenuItem,
} from '@/lib/api';

export type AssignSetMode = 'options' | 'modifiers';

interface AssignSetDrawerProps {
  open: boolean;
  onClose: () => void;
  mode: AssignSetMode;
  restaurantId: number;
  /** Pass the full items in the current selection — needed for attachment counts. */
  selectedItems: MenuItem[];
  /** Called after a successful apply so the parent can reload and clear selection. */
  onApplied: () => void;
}

/** Internal row shape so the render code is mode-agnostic. */
interface SetRow {
  id: number;
  name: string;
  /** Subline metadata: e.g. "3 options" or "5 modifiers · required" */
  subline: string;
  /** Number of items in the current selection that already have this set. */
  attachedCount: number;
}

export default function AssignSetDrawer({
  open,
  onClose,
  mode,
  restaurantId,
  selectedItems,
  onApplied,
}: AssignSetDrawerProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optionSets, setOptionSets] = useState<OptionSet[]>([]);
  const [modifierSets, setModifierSets] = useState<ModifierSet[]>([]);
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [processing, setProcessing] = useState(false);

  const N = selectedItems.length;

  // Load sets when the drawer opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const loader =
      mode === 'options'
        ? listOptionSets(restaurantId)
        : listModifierSets(restaurantId);
    loader
      .then((data) => {
        if (cancelled) return;
        if (mode === 'options') setOptionSets(data as OptionSet[]);
        else setModifierSets(data as ModifierSet[]);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, restaurantId]);

  // Reset transient state on close.
  useEffect(() => {
    if (!open) {
      setSearch('');
      setChecked(new Set());
      setError(null);
    }
  }, [open]);

  // Build rows in a mode-agnostic shape with attachment counts.
  const rows = useMemo<SetRow[]>(() => {
    if (mode === 'options') {
      return optionSets.map((s) => {
        const count = selectedItems.filter((i) =>
          (i.option_sets ?? []).some((os) => os.id === s.id),
        ).length;
        const numOptions = s.options?.length ?? 0;
        return {
          id: s.id,
          name: s.name,
          subline: t('optionsCount').replace('{n}', String(numOptions)),
          attachedCount: count,
        };
      });
    }
    return modifierSets.map((s) => {
      const count = selectedItems.filter((i) =>
        (i.modifier_sets ?? []).some((ms) => ms.id === s.id),
      ).length;
      const numModifiers = s.modifiers?.length ?? 0;
      const isRequired = s.is_required && (s.min_selections ?? 0) >= 1;
      const requiredLabel = isRequired ? t('modifierRequired') : t('modifierOptional');
      return {
        id: s.id,
        name: s.name,
        subline: `${t('modifiersCount').replace('{n}', String(numModifiers))} · ${requiredLabel}`,
        attachedCount: count,
      };
    });
  }, [mode, optionSets, modifierSets, selectedItems, t]);

  // Preselect rows that are already on every selected item.
  useEffect(() => {
    if (!open) return;
    const initial = new Set<number>();
    for (const r of rows) {
      if (N > 0 && r.attachedCount === N) initial.add(r.id);
    }
    setChecked(initial);
  }, [open, rows, N]);

  // Filtered rows for search.
  const visibleRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(s));
  }, [rows, search]);

  // Diff = sets that are checked AND not already on every selected item.
  const diff = useMemo(() => {
    const out: Array<{ setId: number; idsMissing: number[] }> = [];
    for (const r of rows) {
      if (!checked.has(r.id)) continue;
      const idsMissing = selectedItems
        .filter((i) => {
          const sets = mode === 'options' ? (i.option_sets ?? []) : (i.modifier_sets ?? []);
          return !sets.some((s) => s.id === r.id);
        })
        .map((i) => i.id);
      if (idsMissing.length > 0) out.push({ setId: r.id, idsMissing });
    }
    return out;
  }, [rows, checked, selectedItems, mode]);

  const toggle = (id: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const apply = async () => {
    if (diff.length === 0 || processing) return;
    setProcessing(true);
    try {
      const results = await Promise.allSettled(
        diff.map(({ setId, idsMissing }) =>
          mode === 'options'
            ? attachOptionSetToItems(restaurantId, setId, idsMissing)
            : attachModifierSetToItems(restaurantId, setId, idsMissing),
        ),
      );
      const firstFail = results.find((r) => r.status === 'rejected') as
        | PromiseRejectedResult
        | undefined;
      if (firstFail) {
        const reason = firstFail.reason;
        alert(reason instanceof Error ? reason.message : 'Failed to assign');
        return;
      }
      onApplied();
      onClose();
    } finally {
      setProcessing(false);
    }
  };

  const title = mode === 'options' ? t('assignOptions') : t('assignModifiers');
  const subtitle =
    mode === 'options'
      ? t('assignOptionsToSelected') + ` (${N})`
      : t('assignModifiersToSelected') + ` (${N})`;
  const manageHref = `/${restaurantId}/menu/${mode === 'options' ? 'options' : 'modifier-sets'}`;
  const manageLabel = mode === 'options' ? t('manageOptions') : t('manageModifiers');
  const emptyLabel = mode === 'options' ? t('noOptionSets') : t('noModifierSets');
  const applyLabel = t('applyToNItems').replace('{N}', String(N));

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={title}
      subtitle={subtitle}
      width={520}
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <Link
            href={manageHref}
            className="text-fs-sm text-[var(--brand-500)] hover:underline"
            onClick={onClose}
          >
            {manageLabel} →
          </Link>
          <button
            type="button"
            onClick={apply}
            disabled={diff.length === 0 || processing}
            className="px-4 h-10 rounded-r-lg bg-[var(--brand-500)] text-white text-fs-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : applyLabel}
          </button>
        </div>
      }
    >
      <div className="relative mb-[var(--s-3)]">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-muted)] pointer-events-none" />
        <input
          type="text"
          placeholder={t('search') || 'Rechercher'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full ps-10 pe-3 h-10 bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-lg text-fs-sm placeholder:text-[var(--fg-subtle)] focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--fg-muted)]" />
        </div>
      ) : error ? (
        <div className="py-12 text-center text-red-500 text-fs-sm">{error}</div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-fs-sm text-[var(--fg-muted)] mb-3">{emptyLabel}</p>
          <Link
            href={manageHref}
            className="text-fs-sm text-[var(--brand-500)] hover:underline"
            onClick={onClose}
          >
            {manageLabel} →
          </Link>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="py-12 text-center text-fs-sm text-[var(--fg-muted)]">
          {t('noResults') || 'Aucun résultat'}
        </div>
      ) : (
        <ul className="flex flex-col gap-[var(--s-1)]">
          {visibleRows.map((r) => {
            const isAll = N > 0 && r.attachedCount === N;
            const isPartial = r.attachedCount > 0 && r.attachedCount < N;
            const badge = isAll
              ? t('attachedToAll')
              : isPartial
                ? t('attachedToCount')
                    .replace('{x}', String(r.attachedCount))
                    .replace('{N}', String(N))
                : '';
            return (
              <li
                key={r.id}
                className="flex items-center gap-3 px-3 py-2 rounded-r-lg hover:bg-[var(--surface-2)] cursor-pointer"
                onClick={() => toggle(r.id)}
              >
                <Checkbox
                  checked={checked.has(r.id)}
                  onCheckedChange={() => toggle(r.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-fs-sm font-medium text-[var(--fg)] truncate">{r.name}</div>
                  <div className="text-fs-xs text-[var(--fg-muted)] truncate">{r.subline}</div>
                </div>
                {badge && (
                  <span
                    className={`text-fs-xs ${isAll ? 'text-[var(--fg-muted)]' : 'text-[var(--brand-500)]'}`}
                  >
                    {badge}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}
