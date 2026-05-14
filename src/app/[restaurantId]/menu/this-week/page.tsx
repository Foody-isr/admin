'use client';

// "Cette semaine" — weekly switchboard for items in rotating categories.
//
// Toggles `is_active` on a single item; combos in category mode automatically
// follow. Categories flagged `is_weekly_rotating` show by default; "Show all"
// reveals every category for ad-hoc edits.

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import {
  getAllCategories,
  listAllItems,
  updateMenuItem,
  type MenuCategory,
  type MenuItem,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { PageHead } from '@/components/ds';

export default function ThisWeekPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!rid) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getAllCategories(rid), listAllItems(rid)])
      .then(([cats, its]) => {
        if (cancelled) return;
        setCategories(cats);
        setItems(its);
      })
      .catch((e) => !cancelled && setError(String(e instanceof Error ? e.message : e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [rid]);

  const visibleCategories = useMemo(() => {
    const filtered = showAll ? categories : categories.filter((c) => c.is_weekly_rotating);
    return filtered.slice().sort((a, b) => a.sort_order - b.sort_order);
  }, [categories, showAll]);

  const itemsByCategory = useMemo(() => {
    const m = new Map<number, MenuItem[]>();
    for (const it of items) {
      const arr = m.get(it.category_id) ?? [];
      arr.push(it);
      m.set(it.category_id, arr);
    }
    for (const arr of Array.from(m.values())) {
      arr.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    }
    return m;
  }, [items]);

  const toggleActive = async (item: MenuItem) => {
    const next = !item.is_active;
    setSavingIds((s) => {
      const n = new Set(s);
      n.add(item.id);
      return n;
    });
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, is_active: next } : it)));
    try {
      await updateMenuItem(rid, item.id, { is_active: next });
    } catch (e) {
      setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, is_active: !next } : it)));
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSavingIds((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
    }
  };

  if (loading) {
    return <div className="p-6 text-fg-secondary">{t('loading')}</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHead title={t('thisWeekTitle')} desc={t('thisWeekSubtitle')} />

      {error && (
        <div className="mb-4 p-3 rounded border border-[var(--danger-500)] text-[var(--danger-500)] text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end mb-4">
        <label className="text-sm text-fg-secondary inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          {t('thisWeekShowAll')}
        </label>
      </div>

      {visibleCategories.length === 0 ? (
        <div className="text-sm text-fg-tertiary">{t('thisWeekNoCategories')}</div>
      ) : (
        visibleCategories.map((cat) => {
          const catItems = itemsByCategory.get(cat.id) ?? [];
          const activeCount = catItems.filter((it) => it.is_active).length;
          return (
            <section key={cat.id} className="mb-8">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-lg font-semibold text-fg-secondary">{cat.name}</h2>
                <span className="text-xs text-fg-tertiary">
                  {t('thisWeekActiveCount')
                    .replace('{n}', String(activeCount))
                    .replace('{total}', String(catItems.length))}
                </span>
              </div>
              {catItems.length === 0 ? (
                <div className="text-sm text-fg-tertiary p-3 rounded border border-dashed border-[var(--divider)]">
                  {t('thisWeekCategoryEmpty')}
                </div>
              ) : (
                <ul className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                  {catItems.map((it) => (
                    <li
                      key={it.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-[var(--divider)] bg-[var(--surface)]"
                    >
                      {it.image_url ? (
                        <Image
                          src={it.image_url}
                          alt=""
                          width={48}
                          height={48}
                          className="w-12 h-12 rounded object-cover shrink-0"
                          unoptimized
                        />
                      ) : (
                        <div className="w-12 h-12 rounded bg-[var(--surface-2)] shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-fg-secondary truncate">{it.name}</div>
                        <div className="text-xs text-fg-tertiary">₪{it.price}</div>
                      </div>
                      <label className="inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={it.is_active}
                          disabled={savingIds.has(it.id)}
                          onChange={() => toggleActive(it)}
                          className="w-5 h-5"
                        />
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
