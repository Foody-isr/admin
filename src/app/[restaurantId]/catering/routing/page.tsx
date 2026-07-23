'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PencilIcon, TrashIcon, PlusIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell,
  DataTableBody, DataTableRow, DataTableCell,
} from '@/components/data-table';
import { PageHead, Button, Badge } from '@/components/ds';
import Modal from '@/components/Modal';
import {
  listCateringRoutingRules, createCateringRoutingRule, updateCateringRoutingRule, deleteCateringRoutingRule,
  listCateringServices, listCateringBranches,
  type CateringRoutingRule, type CateringService, type CateringBranch,
} from '@/lib/api';

export default function CateringRoutingPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('catering.manage');

  const [rules, setRules] = useState<CateringRoutingRule[]>([]);
  const [services, setServices] = useState<CateringService[]>([]);
  const [branches, setBranches] = useState<CateringBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ open: boolean; editing?: CateringRoutingRule }>({ open: false });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [ruleList, serviceList, branchList] = await Promise.all([
        listCateringRoutingRules(rid),
        listCateringServices(rid),
        listCateringBranches(rid),
      ]);
      setRules(ruleList);
      setServices(serviceList);
      setBranches(branchList);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  const serviceName = (id: number) => services.find((s) => s.id === id)?.name ?? id;
  const branchName = (id: number) => branches.find((b) => b.location.id === id)?.location.name ?? id;

  const handleDelete = async (rule: CateringRoutingRule) => {
    if (!confirm(t('catering_routing_delete_confirm'))) return;
    await deleteCateringRoutingRule(rid, rule.id);
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
      <PageHead
        title={t('catering_routing_title')}
        desc={t('catering_routing_desc')}
        actions={
          canEdit ? (
            <Button variant="primary" size="md" onClick={() => setEditModal({ open: true })}>
              <PlusIcon />
              {t('catering_routing_new')}
            </Button>
          ) : undefined
        }
      />

      {rules.length === 0 ? (
        <p className="text-fg-secondary mt-6">{t('catering_routing_empty')}</p>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>{t('catering_routing_name')}</DataTableHeadCell>
            <DataTableHeadCell>{t('catering_routing_service')}</DataTableHeadCell>
            <DataTableHeadCell>{t('catering_routing_branch')}</DataTableHeadCell>
            <DataTableHeadCell>{t('catering_routing_cities')}</DataTableHeadCell>
            <DataTableHeadCell align="right">{t('catering_routing_priority')}</DataTableHeadCell>
            <DataTableHeadCell align="right">{t('catering_routing_fallback')}</DataTableHeadCell>
            <DataTableHeadCell align="right">{t('catering_routing_active')}</DataTableHeadCell>
            <DataTableHeadSpacerCell />
          </DataTableHead>
          <DataTableBody>
            {rules.map((rule, index) => (
              <DataTableRow key={rule.id} index={index}>
                <DataTableCell mobilePrimary className="font-medium text-fg-primary">
                  {rule.name}
                </DataTableCell>
                <DataTableCell mobileLabel={t('catering_routing_service')} className="text-fg-secondary">
                  {serviceName(rule.service_id)}
                </DataTableCell>
                <DataTableCell mobileLabel={t('catering_routing_branch')} className="text-fg-secondary">
                  {branchName(rule.target_location_id)}
                </DataTableCell>
                <DataTableCell mobileLabel={t('catering_routing_cities')} className="text-fg-secondary">
                  {(rule.cities ?? []).join(', ')}
                </DataTableCell>
                <DataTableCell align="right" mobileLabel={t('catering_routing_priority')}>
                  {rule.priority}
                </DataTableCell>
                <DataTableCell align="right" mobileLabel={t('catering_routing_fallback')}>
                  {rule.is_fallback && <Badge tone="neutral">{t('catering_routing_fallback')}</Badge>}
                </DataTableCell>
                <DataTableCell align="right" mobileLabel={t('catering_routing_active')}>
                  {rule.is_active ? '✓' : '—'}
                </DataTableCell>
                <DataTableCell>
                  {canEdit && (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        aria-label={t('catering_routing_edit')}
                        onClick={() => setEditModal({ open: true, editing: rule })}
                        className="p-1.5 rounded hover:bg-[var(--surface-subtle)] text-fg-secondary hover:text-fg-primary"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        aria-label={t('catering_routing_delete_confirm')}
                        onClick={() => handleDelete(rule)}
                        className="p-1.5 rounded hover:bg-red-500/10 text-fg-secondary hover:text-red-500"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      {editModal.open && (
        <RoutingRuleEditModal
          restaurantId={rid}
          editing={editModal.editing}
          services={services}
          branches={branches}
          onClose={() => setEditModal({ open: false })}
          onSaved={() => { setEditModal({ open: false }); reload(); }}
        />
      )}
    </div>
  );
}

function RoutingRuleEditModal({ restaurantId, editing, services, branches, onClose, onSaved }: {
  restaurantId: number;
  editing?: CateringRoutingRule;
  services: CateringService[];
  branches: CateringBranch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [serviceId, setServiceId] = useState<number>(editing?.service_id ?? services[0]?.id ?? 0);
  const [name, setName] = useState(editing?.name ?? '');
  const [citiesText, setCitiesText] = useState((editing?.cities ?? []).join(', '));
  const [targetLocationId, setTargetLocationId] = useState<number>(editing?.target_location_id ?? branches[0]?.location.id ?? 0);
  const [priority, setPriority] = useState<number>(editing?.priority ?? 0);
  const [isFallback, setIsFallback] = useState(editing?.is_fallback ?? false);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !serviceId || !targetLocationId) return;
    setSaving(true);
    try {
      const cities = citiesText.split(',').map((c) => c.trim()).filter(Boolean);
      const body = {
        service_id: serviceId,
        name: name.trim(),
        cities,
        target_location_id: targetLocationId,
        priority,
        is_fallback: isFallback,
        is_active: isActive,
      };
      if (editing) {
        await updateCateringRoutingRule(restaurantId, editing.id, body);
      } else {
        await createCateringRoutingRule(restaurantId, body);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? t('catering_routing_edit') : t('catering_routing_new')} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('catering_routing_name')}</label>
          <input
            autoFocus
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('catering_routing_service')}</label>
          <select
            className="input"
            value={serviceId}
            onChange={(e) => setServiceId(Number(e.target.value))}
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('catering_routing_branch')}</label>
          <select
            className="input"
            value={targetLocationId}
            onChange={(e) => setTargetLocationId(Number(e.target.value))}
          >
            {branches.map((b) => (
              <option key={b.location.id} value={b.location.id}>{b.location.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('catering_routing_cities')}</label>
          <input
            className="input"
            value={citiesText}
            onChange={(e) => setCitiesText(e.target.value)}
            placeholder={t('catering_routing_cities_help')}
          />
          <p className="text-fs-xs text-fg-secondary mt-1">{t('catering_routing_cities_help')}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('catering_routing_priority')}</label>
          <input
            type="number"
            className="input"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          />
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isFallback} onChange={(e) => setIsFallback(e.target.checked)} />
          <span className="text-sm text-fg-secondary">{t('catering_routing_fallback')}</span>
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span className="text-sm text-fg-secondary">{t('catering_routing_active')}</span>
        </label>

        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>{t('catering_cancel')}</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !name.trim() || !serviceId || !targetLocationId}>
            {t('catering_save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
