'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  listFloorPlans, deleteFloorPlan, reorderFloorPlans,
  FloorPlan,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { PlusIcon, MenuIcon, TrashIcon } from 'lucide-react';
import { Button, PageHead } from '@/components/ds';

export default function FloorPlansListPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();

  const [plans, setPlans] = useState<FloorPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      setPlans(await listFloorPlans(rid));
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  const handleDelete = async (plan: FloorPlan) => {
    if (!confirm(t('confirmDeleteFloorPlan'))) return;
    await deleteFloorPlan(rid, plan.id);
    reload();
  };

  // Simple drag-to-reorder
  const handleDragStart = (id: number) => setDragging(id);
  const handleDragOver = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (dragging === null || dragging === targetId) return;
    const from = plans.findIndex((p) => p.id === dragging);
    const to = plans.findIndex((p) => p.id === targetId);
    if (from === -1 || to === -1) return;
    const next = [...plans];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setPlans(next);
  };
  const handleDragEnd = async () => {
    setDragging(null);
    await reorderFloorPlans(rid, plans.map((p) => p.id));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-[var(--s-5)]">
      <PageHead
        title={t('floorPlans')}
        desc={t('noFloorPlansDesc')}
        actions={
          <Button
            variant="primary"
            size="md"
            onClick={() => router.push(`/${rid}/restaurant/floor-plans/new`)}
          >
            <PlusIcon />
            {t('createFloorPlan')}
          </Button>
        }
      />

      {/* Plans list */}
      {plans.length === 0 ? (
        <div className="card flex flex-col items-center py-16 space-y-4">
          <p className="text-fg-secondary">{t('noFloorPlans')}</p>
          <button
            onClick={() => router.push(`/${rid}/restaurant/floor-plans/new`)}
            className="btn-primary"
          >
            {t('createFloorPlan')}
          </button>
        </div>
      ) : (
        <div className="card p-0 divide-y" style={{ borderColor: 'var(--divider)' }}>
          {plans.map((plan) => (
            <div
              key={plan.id}
              draggable
              onDragStart={() => handleDragStart(plan.id)}
              onDragOver={(e) => handleDragOver(e, plan.id)}
              onDragEnd={handleDragEnd}
              className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer"
              onClick={() => router.push(`/${rid}/restaurant/floor-plans/${plan.id}`)}
            >
              <MenuIcon className="w-5 h-5 text-fg-secondary cursor-grab flex-shrink-0" />
              <span className="flex-1 font-medium text-fg-primary">{plan.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(plan); }}
                className="p-1.5 rounded-md hover:bg-red-500/10 text-fg-secondary hover:text-red-400 transition-colors"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
