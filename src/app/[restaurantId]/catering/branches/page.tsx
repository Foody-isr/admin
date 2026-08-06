'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { PageHead, Button } from '@/components/ds';
import {
  listCateringBranches, updateCateringBranch, listCateringServices,
  type CateringBranch, type CateringService, type CateringBranchInput,
} from '@/lib/api';

export default function CateringBranchesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('catering.manage');

  const [branches, setBranches] = useState<CateringBranch[]>([]);
  const [services, setServices] = useState<CateringService[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([listCateringBranches(rid), listCateringServices(rid)]);
      setBranches(b);
      setServices(s);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  const saveBranch = async (locId: number, next: { catering_type: 'standard' | 'labo'; service_ids: number[] }) => {
    const current = branches.find((b) => b.location.id === locId);
    const body: CateringBranchInput = {
      catering_type: next.catering_type,
      latitude: current?.location.latitude ?? null,
      longitude: current?.location.longitude ?? null,
      service_ids: next.service_ids,
    };
    await updateCateringBranch(rid, locId, body);
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
    <div className="space-y-[var(--s-5)]">
      <PageHead title={t('catering_branches_title')} desc={t('catering_branches_desc')} />
      <div className="space-y-[var(--s-4)]">
        {branches.map((b) => (
          <BranchCard key={b.location.id} branch={b} services={services} canEdit={canEdit} onSave={saveBranch} />
        ))}
      </div>
    </div>
  );
}

function BranchCard({ branch, services, canEdit, onSave }: {
  branch: CateringBranch;
  services: CateringService[];
  canEdit: boolean;
  onSave: (locId: number, next: { catering_type: 'standard' | 'labo'; service_ids: number[] }) => void;
}) {
  const { t } = useI18n();
  const [type, setType] = useState<'standard' | 'labo'>(branch.location.catering_type);
  const [selected, setSelected] = useState<number[]>(branch.service_ids);

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="rounded-lg border border-[var(--line)] p-[var(--s-4)]">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-fg-primary">{branch.location.name}</h3>
        {canEdit && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onSave(branch.location.id, { catering_type: type, service_ids: selected })}
          >
            {t('catering_save')}
          </Button>
        )}
      </div>
      <div className="mt-[var(--s-3)]">
        <span className="text-sm text-fg-secondary">{t('catering_branch_type')}</span>
        <select
          className="input ms-2 w-auto"
          value={type}
          disabled={!canEdit}
          onChange={(e) => setType(e.target.value as 'standard' | 'labo')}
        >
          <option value="standard">{t('catering_type_standard')}</option>
          <option value="labo">{t('catering_type_labo')}</option>
        </select>
      </div>
      <div className="mt-[var(--s-3)]">
        <span className="text-sm text-fg-secondary">{t('catering_branch_capabilities')}</span>
        <div className="mt-[var(--s-1)] flex flex-wrap gap-[var(--s-2)]">
          {services.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-1 rounded border border-[var(--line)] px-2 py-1 text-sm text-fg-secondary"
            >
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                disabled={!canEdit}
                onChange={() => toggle(s.id)}
              />
              {s.name}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
