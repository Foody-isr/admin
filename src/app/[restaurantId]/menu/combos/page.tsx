'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { listCombos, deleteCombo, updateCombo, ComboMenu } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  PlusIcon,
  EllipsisHorizontalIcon,
  PhotoIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

export default function CombosPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();

  const [combos, setCombos] = useState<ComboMenu[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    return listCombos(rid).then(setCombos).finally(() => setLoading(false));
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`${t('delete')} "${name}"?`)) return;
    await deleteCombo(rid, id);
    reload();
  };

  const handleToggleActive = async (combo: ComboMenu) => {
    await updateCombo(rid, combo.id, {
      name: combo.name,
      description: combo.description,
      price: combo.price,
      image_url: combo.image_url,
      is_active: !combo.is_active,
      sort_order: combo.sort_order,
      steps: combo.steps.map((s) => ({
        name: s.name,
        min_picks: s.min_picks,
        max_picks: s.max_picks,
        sort_order: s.sort_order,
        fixed_modifier_name: s.fixed_modifier_name,
        items: s.items.map((i) => ({ menu_item_id: i.menu_item_id, price_delta: i.price_delta })),
      })),
    });
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
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div className="flex-1" />
        <button
          onClick={reload}
          className="btn-secondary flex items-center gap-2"
        >
          <ArrowPathIcon className="w-4 h-4" />
          {t('refresh')}
        </button>
        <button
          onClick={() => router.push(`/${rid}/menu/combos/new`)}
          className="btn-primary flex items-center gap-2"
        >
          <PlusIcon className="w-4 h-4" />
          {t('createCombo')}
        </button>
      </div>

      {combos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="text-4xl">🍱</div>
          <h2 className="text-lg font-semibold text-fg-primary">{t('noCombosYet')}</h2>
          <p className="text-sm text-fg-secondary max-w-sm text-center">{t('noCombosDesc')}</p>
          <button
            onClick={() => router.push(`/${rid}/menu/combos/new`)}
            className="btn-primary mt-2"
          >
            {t('createCombo')}
          </button>
        </div>
      ) : (
        <div className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left text-xs text-fg-secondary tracking-wider"
                style={{ borderBottom: '1px solid var(--divider)' }}
              >
                <th className="py-3 px-4 font-normal">{t('combo')}</th>
                <th className="py-3 px-4 font-normal">{t('steps')}</th>
                <th className="py-3 px-4 font-normal">{t('availability')}</th>
                <th className="py-3 px-4 font-normal text-right">{t('price')}</th>
                <th className="py-3 px-4 font-normal w-10" />
              </tr>
            </thead>
            <tbody>
              {combos.map((combo) => (
                <tr
                  key={combo.id}
                  className="cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
                  style={{ borderBottom: '1px solid var(--divider)' }}
                  onClick={() => router.push(`/${rid}/menu/combos/${combo.id}`)}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {combo.image_url ? (
                        <img
                          src={combo.image_url}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: 'var(--surface-subtle)' }}
                        >
                          <PhotoIcon className="w-5 h-5 text-fg-secondary" />
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-fg-primary">{combo.name}</div>
                        {combo.description && (
                          <div className="text-xs text-fg-secondary truncate max-w-xs">
                            {combo.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-fg-secondary">
                    {combo.steps.length} {t('steps')}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleActive(combo); }}
                      className={`text-sm font-medium ${combo.is_active ? 'text-status-ready' : 'text-fg-secondary'}`}
                    >
                      {combo.is_active ? t('available') : t('unavailable')}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right text-fg-primary font-medium">
                    ₪{(combo.price ?? 0).toFixed(2)}
                  </td>
                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    <ComboRowMenu
                      onEdit={() => router.push(`/${rid}/menu/combos/${combo.id}`)}
                      onDelete={() => handleDelete(combo.id, combo.name)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Row context menu ────────────────────────────────────────────────────────

function ComboRowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="p-1.5 rounded hover:bg-[var(--surface-subtle)]">
        <EllipsisHorizontalIcon className="w-5 h-5 text-fg-secondary" />
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 rounded-standard py-1 min-w-[120px] z-50 shadow-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          <button
            onClick={() => { onEdit(); setOpen(false); }}
            className="block w-full text-left px-3 py-2 text-sm text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)]"
          >
            {t('edit')}
          </button>
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            className="block w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
          >
            {t('delete')}
          </button>
        </div>
      )}
    </div>
  );
}
