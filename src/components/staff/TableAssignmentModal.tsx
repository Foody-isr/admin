'use client';

import { useEffect, useMemo, useState } from 'react';
import { Grid3X3Icon, Layers3Icon, MapPinnedIcon } from 'lucide-react';

import Modal from '@/components/Modal';
import { Button } from '@/components/ds';
import {
  FloorPlan,
  getStaffTableAssignments,
  RestaurantTableRef,
  StaffMember,
  StaffTableAssignment,
  TableSection,
  updateStaffTableAssignments,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface TableAssignmentModalProps {
  restaurantId: number;
  member: StaffMember;
  floorPlans: FloorPlan[];
  sections: TableSection[];
  tables: RestaurantTableRef[];
  onClose: () => void;
  onSaved: (assignment: StaffTableAssignment) => void;
}

export function TableAssignmentModal({
  restaurantId,
  member,
  floorPlans,
  sections,
  tables,
  onClose,
  onSaved,
}: TableAssignmentModalProps) {
  const { t } = useI18n();
  const [tableIds, setTableIds] = useState<Set<number>>(new Set());
  const [sectionIds, setSectionIds] = useState<Set<number>>(new Set());
  const [floorPlanIds, setFloorPlanIds] = useState<Set<number>>(new Set());
  const [effectiveCount, setEffectiveCount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getStaffTableAssignments(restaurantId, member.id)
      .then((assignment) => {
        if (!active) return;
        setTableIds(new Set(assignment.table_ids));
        setSectionIds(new Set(assignment.section_ids));
        setFloorPlanIds(new Set(assignment.floor_plan_ids));
        setEffectiveCount(assignment.effective_table_ids.length);
        setDirty(false);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : t('tableAssignmentsLoadError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [member.id, restaurantId, t]);

  const sectionNames = useMemo(
    () => new Map(sections.map((section) => [section.id, section.name])),
    [sections],
  );

  const selectedRuleCount = tableIds.size + sectionIds.size + floorPlanIds.size;

  const toggle = (
    current: Set<number>,
    setCurrent: React.Dispatch<React.SetStateAction<Set<number>>>,
    id: number,
  ) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCurrent(next);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const assignment = await updateStaffTableAssignments(restaurantId, member.id, {
        table_ids: Array.from(tableIds),
        section_ids: Array.from(sectionIds),
        floor_plan_ids: Array.from(floorPlanIds),
      });
      setEffectiveCount(assignment.effective_table_ids.length);
      onSaved(assignment);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : t('tableAssignmentsSaveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('tableAssignmentsTitle').replace('{name}', member.full_name)}
      subtitle={t('tableAssignmentsSubtitle')}
      icon={<MapPinnedIcon />}
      size="3xl"
      onClose={onClose}
      bodyClassName="space-y-5"
      footer={
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-fg-secondary">
            {selectedRuleCount === 0
              ? t('tableAssignmentsNoneSelected')
              : t('tableAssignmentsRuleCount').replace('{count}', String(selectedRuleCount))}
            {!dirty && effectiveCount > 0 && ` · ${t('tableAssignmentsEffectiveCount').replace('{count}', String(effectiveCount))}`}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
            <Button variant="primary" disabled={loading || saving} onClick={save}>
              {saving ? t('saving') : t('saveChanges')}
            </Button>
          </div>
        </div>
      }
    >
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1fr_1.25fr]">
          <AssignmentGroup
            icon={<MapPinnedIcon />}
            title={t('tableAssignmentsRooms')}
            description={t('tableAssignmentsRoomsDesc')}
            empty={t('tableAssignmentsNoRooms')}
            items={floorPlans.map((plan) => ({ id: plan.id, label: plan.name }))}
            selected={floorPlanIds}
            onToggle={(id) => toggle(floorPlanIds, setFloorPlanIds, id)}
          />
          <AssignmentGroup
            icon={<Layers3Icon />}
            title={t('tableAssignmentsSections')}
            description={t('tableAssignmentsSectionsDesc')}
            empty={t('tableAssignmentsNoSections')}
            items={sections.map((section) => ({
              id: section.id,
              label: section.name,
              meta: t('tableAssignmentsTableCount').replace('{count}', String(section.tables?.length ?? 0)),
            }))}
            selected={sectionIds}
            onToggle={(id) => toggle(sectionIds, setSectionIds, id)}
          />
          <AssignmentGroup
            icon={<Grid3X3Icon />}
            title={t('tableAssignmentsSpecificTables')}
            description={t('tableAssignmentsSpecificTablesDesc')}
            empty={t('tableAssignmentsNoTables')}
            items={tables.map((table) => ({
              id: table.id,
              label: table.name,
              meta: table.section_id ? sectionNames.get(table.section_id) : t('tableAssignmentsNoSection'),
            }))}
            selected={tableIds}
            onToggle={(id) => toggle(tableIds, setTableIds, id)}
          />
        </div>
      )}
    </Modal>
  );
}

function AssignmentGroup({
  icon,
  title,
  description,
  empty,
  items,
  selected,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  empty: string;
  items: Array<{ id: number; label: string; meta?: string }>;
  selected: Set<number>;
  onToggle: (id: number) => void;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="mt-0.5 text-brand-600 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        <div>
          <h4 className="text-sm font-semibold text-fg-primary">{title}</h4>
          <p className="mt-0.5 text-xs leading-5 text-fg-secondary">{description}</p>
        </div>
      </div>
      <div className="max-h-[340px] space-y-1 overflow-y-auto border-y border-divider py-2">
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-fg-muted">{empty}</p>
        ) : items.map((item) => (
          <label
            key={item.id}
            className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors ${
              selected.has(item.id) ? 'bg-brand-500/10' : 'hover:bg-[var(--surface-subtle)]'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              onChange={() => onToggle(item.id)}
              className="h-4 w-4 rounded border-divider text-brand-600 focus:ring-brand-500"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg-primary">{item.label}</span>
              {item.meta && <span className="block truncate text-xs text-fg-muted">{item.meta}</span>}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
