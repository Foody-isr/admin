'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ApiError,
  FloorPlan,
  getStaffTableAssignments,
  getTableAssignmentMode,
  listFloorPlans,
  listSections,
  listStaff,
  listTables,
  RestaurantTableRef,
  StaffMember,
  StaffTableAssignment,
  TableAssignmentMode,
  TableSection,
  updateTableAssignmentMode,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { roleDisplayLabel } from '@/lib/permission-i18n';
import {
  ArrowLeftIcon,
  HandshakeIcon,
  MapPinnedIcon,
  ShieldCheckIcon,
  UsersRoundIcon,
} from 'lucide-react';
import { Button, PageHead } from '@/components/ds';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeadCell,
  DataTableHeadSpacerCell,
  DataTableRow,
} from '@/components/data-table';
import { TableAssignmentModal } from '@/components/staff/TableAssignmentModal';

export default function TableServicePage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [assignments, setAssignments] = useState<Record<number, StaffTableAssignment>>({});
  const [assignmentMode, setAssignmentMode] = useState<TableAssignmentMode>('free');
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [sections, setSections] = useState<TableSection[]>([]);
  const [tables, setTables] = useState<RestaurantTableRef[]>([]);
  const [assignmentMember, setAssignmentMember] = useState<StaffMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [modeSaving, setModeSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPageError('');

    Promise.all([
      listStaff(rid),
      getTableAssignmentMode(rid),
      listFloorPlans(rid),
      listSections(rid),
      listTables(rid),
    ])
      .then(async ([members, mode, plans, tableSections, restaurantTables]) => {
        const assignable = members.filter((member) => member.table_assignment_eligible);
        const loadedAssignments = await Promise.all(
          assignable.map(async (member) => [
            member.id,
            await getStaffTableAssignments(rid, member.id),
          ] as const),
        );
        if (!active) return;
        setStaff(members);
        setAssignmentMode(mode);
        setFloorPlans(plans);
        setSections(tableSections);
        setTables(restaurantTables);
        setAssignments(Object.fromEntries(loadedAssignments));
      })
      .catch((reason: unknown) => {
        if (active) setPageError(apiErrorMessage(reason, t('floorServiceLoadError')));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [rid, t]);

  const assignableStaff = staff.filter((member) => member.table_assignment_eligible);
  const unrestrictedStaff = staff.filter((member) => member.unrestricted_table_access);

  const handleAssignmentModeChange = async (mode: TableAssignmentMode) => {
    if (mode === assignmentMode || modeSaving) return;
    setModeSaving(true);
    setPageError('');
    setSuccessMsg('');
    try {
      const saved = await updateTableAssignmentMode(rid, mode);
      setAssignmentMode(saved);
      setSuccessMsg(t('tableAssignmentModeSaved'));
    } catch (reason: unknown) {
      setPageError(apiErrorMessage(reason, t('tableAssignmentModeSaveError')));
    } finally {
      setModeSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-[var(--s-5)]">
      <PageHead
        title={t('floorService')}
        desc={t('floorServicePageDesc')}
        actions={
          <Button variant="secondary" size="md" asChild>
            <Link href={`/${rid}/staff`}><ArrowLeftIcon />{t('staffMembers')}</Link>
          </Button>
        }
      />

      {successMsg && (
        <div className="flex items-center justify-between rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800" role="status">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="font-medium text-green-700 hover:text-green-900" aria-label={t('close')}>×</button>
        </div>
      )}

      {pageError && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {pageError}
        </div>
      )}

      <section className="overflow-hidden border border-divider bg-[var(--surface)] shadow-sm">
        <StepHeading
          number="1"
          title={t('floorServiceModeHeading')}
          description={t('tableAssignmentModeDesc')}
        />
        <TableAssignmentModeSelector
          mode={assignmentMode}
          disabled={modeSaving}
          onChange={handleAssignmentModeChange}
          t={t}
        />
      </section>

      <section className="overflow-hidden border border-divider bg-[var(--surface)] shadow-sm">
        <StepHeading
          number="2"
          title={t('floorServiceStaffHeading')}
          description={t('floorServiceStaffDesc')}
        />

        {assignmentMode === 'free' ? (
          <div className="mx-5 mb-5 border-s-4 border-brand-500 bg-[var(--surface-subtle)] px-5 py-6">
            <h3 className="font-semibold text-fg-primary">{t('floorServiceAssignmentsInactiveTitle')}</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-secondary">{t('floorServiceAssignmentsInactiveBody')}</p>
          </div>
        ) : assignableStaff.length === 0 ? (
          <div className="mx-5 mb-5 border-s-4 border-brand-500 bg-[var(--surface-subtle)] px-5 py-6">
            <h3 className="font-semibold text-fg-primary">{t('floorServiceNoEligibleTitle')}</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-secondary">{t('floorServiceNoEligibleBody')}</p>
          </div>
        ) : (
          <div className="px-5 pb-5">
            <DataTable>
              <DataTableHead>
                <DataTableHeadCell>{t('name')}</DataTableHeadCell>
                <DataTableHeadCell>{t('role')}</DataTableHeadCell>
                <DataTableHeadCell>{t('floorServiceAssignmentColumn')}</DataTableHeadCell>
                <DataTableHeadCell>{t('floorServiceCoverageColumn')}</DataTableHeadCell>
                <DataTableHeadSpacerCell />
              </DataTableHead>
              <DataTableBody>
                {assignableStaff.map((member, index) => {
                  const assignment = assignments[member.id];
                  return (
                    <DataTableRow key={member.id} index={index}>
                      <DataTableCell>
                        <div className="font-medium text-fg-primary">{member.full_name}</div>
                        <div className="mt-0.5 text-xs text-fg-muted">{member.email}</div>
                      </DataTableCell>
                      <DataTableCell>
                        <span className="badge badge-neutral">{roleDisplayLabel(t, member.role_name || member.role)}</span>
                      </DataTableCell>
                      <DataTableCell>
                        <span className={assignmentRuleCount(assignment) > 0 ? 'text-fg-primary' : 'text-fg-muted'}>
                          {assignmentSummary(assignment, t)}
                        </span>
                      </DataTableCell>
                      <DataTableCell>
                        {assignment?.effective_table_ids.length
                          ? t('floorServiceCoveredTables').replace('{count}', String(assignment.effective_table_ids.length))
                          : '—'}
                      </DataTableCell>
                      <DataTableCell align="right">
                        <Button variant="secondary" size="sm" onClick={() => setAssignmentMember(member)}>
                          <MapPinnedIcon />{t('floorServiceModifyAssignment')}
                        </Button>
                      </DataTableCell>
                    </DataTableRow>
                  );
                })}
              </DataTableBody>
            </DataTable>
          </div>
        )}
      </section>

      {unrestrictedStaff.length > 0 && (
        <div className="flex items-start gap-3 border-s-4 border-divider bg-[var(--surface-subtle)] px-5 py-4 text-sm text-fg-secondary">
          <ShieldCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-fg-muted" />
          <p>{t('floorServiceUnrestrictedNote')}</p>
        </div>
      )}

      {assignmentMember && (
        <TableAssignmentModal
          restaurantId={rid}
          member={assignmentMember}
          floorPlans={floorPlans}
          sections={sections}
          tables={tables}
          onClose={() => setAssignmentMember(null)}
          onSaved={(assignment) => {
            setAssignments((current) => ({ ...current, [assignment.user_id]: assignment }));
            setAssignmentMember(null);
            setPageError('');
            setSuccessMsg(t('tableAssignmentsSaved'));
          }}
        />
      )}
    </div>
  );
}

function StepHeading({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">{number}</span>
      <div>
        <h2 className="text-base font-semibold text-fg-primary">{title}</h2>
        <p className="mt-0.5 text-sm text-fg-secondary">{description}</p>
      </div>
    </div>
  );
}

function TableAssignmentModeSelector({
  mode,
  disabled,
  onChange,
  t,
}: {
  mode: TableAssignmentMode;
  disabled: boolean;
  onChange: (mode: TableAssignmentMode) => void;
  t: (key: string) => string;
}) {
  const options: Array<{ value: TableAssignmentMode; icon: React.ReactNode; title: string; description: string }> = [
    { value: 'free', icon: <UsersRoundIcon />, title: t('tableAssignmentModeFree'), description: t('tableAssignmentModeFreeDesc') },
    { value: 'collaborative', icon: <HandshakeIcon />, title: t('tableAssignmentModeCollaborative'), description: t('tableAssignmentModeCollaborativeDesc') },
    { value: 'strict', icon: <ShieldCheckIcon />, title: t('tableAssignmentModeStrict'), description: t('tableAssignmentModeStrictDesc') },
  ];

  return (
    <div className="grid border-t border-divider md:grid-cols-3" role="radiogroup">
      {options.map((option) => {
        const selected = option.value === mode;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`relative flex min-h-[86px] items-start gap-3 border-b border-divider px-5 py-4 text-start transition-colors last:border-b-0 disabled:cursor-wait md:border-b-0 md:border-e md:last:border-e-0 ${
              selected ? 'bg-brand-500/5' : 'hover:bg-[var(--surface-subtle)]'
            }`}
          >
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full [&_svg]:h-4 [&_svg]:w-4 ${
              selected ? 'bg-brand-500 text-white' : 'bg-[var(--surface-subtle)] text-fg-secondary'
            }`}>{option.icon}</span>
            <span>
              <span className="block text-sm font-semibold text-fg-primary">{option.title}</span>
              <span className="mt-1 block text-xs leading-5 text-fg-secondary">{option.description}</span>
            </span>
            {selected && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-brand-500" />}
          </button>
        );
      })}
    </div>
  );
}

function assignmentRuleCount(assignment?: StaffTableAssignment): number {
  if (!assignment) return 0;
  return assignment.floor_plan_ids.length + assignment.section_ids.length + assignment.table_ids.length;
}

function assignmentSummary(assignment: StaffTableAssignment | undefined, t: (key: string) => string): string {
  if (!assignment || assignmentRuleCount(assignment) === 0) return t('floorServiceNoAssignment');
  const parts = [
    assignment.floor_plan_ids.length > 0
      ? t('floorServiceRoomsCount').replace('{count}', String(assignment.floor_plan_ids.length))
      : '',
    assignment.section_ids.length > 0
      ? t('floorServiceSectionsCount').replace('{count}', String(assignment.section_ids.length))
      : '',
    assignment.table_ids.length > 0
      ? t('floorServiceTablesCount').replace('{count}', String(assignment.table_ids.length))
      : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function apiErrorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof ApiError) return reason.details || reason.message;
  return reason instanceof Error ? reason.message : fallback;
}
