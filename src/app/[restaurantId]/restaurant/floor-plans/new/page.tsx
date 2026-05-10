'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createFloorPlan } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { XIcon } from 'lucide-react';

export default function NewFloorPlanPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const plan = await createFloorPlan(rid, name.trim());
      router.replace(`/${rid}/restaurant/floor-plans/${plan.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create');
      setSaving(false);
    }
  };

  const handleCancel = () => router.push(`/${rid}/restaurant/floor-plans`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="card w-full max-w-md p-6 space-y-5" style={{ background: 'var(--bg)' }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-fg-primary">{t('floorPlanDetails')}</h2>
          <button onClick={handleCancel} className="p-1 rounded-md hover:bg-[var(--surface-subtle)]">
            <XIcon className="w-5 h-5 text-fg-secondary" />
          </button>
        </div>

        {/* Name input */}
        <div className="card p-0">
          <label className="block text-xs font-medium text-fg-secondary px-4 pt-3">{t('floorPlanName')}</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            className="w-full px-4 pb-3 pt-1 text-base bg-transparent border-0 outline-none text-fg-primary"
            placeholder={t('floorPlanName')}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button onClick={handleCancel} className="btn-secondary px-4">
            {t('cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className="btn-primary px-6 disabled:opacity-50"
          >
            {saving ? t('saving') : t('done')}
          </button>
        </div>
      </div>
    </div>
  );
}
