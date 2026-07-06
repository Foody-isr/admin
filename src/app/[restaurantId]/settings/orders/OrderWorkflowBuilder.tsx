'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Info, Plus, Trash2 } from 'lucide-react';
import {
  getOrderWorkflows,
  updateOrderWorkflow,
  type WorkflowStage,
  type WorkflowStageKind,
  type WorkflowOrderType,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, Input, Select } from '@/components/ds';
import { Switch } from './_components';

const ORDER_TYPES: WorkflowOrderType[] = ['pickup', 'dine_in', 'delivery'];
const ALL_KINDS: WorkflowStageKind[] = ['received', 'in_progress', 'ready', 'out_for_delivery', 'completed'];

function blankStage(): WorkflowStage {
  return {
    name: '',
    kind: 'received',
    trigger_payment_confirmed: false,
    trigger_production_done: false,
    trigger_courier_assigned: false,
    trigger_courier_delivered: false,
    notify_customer: false,
    customer_message: '',
  };
}

/**
 * OrderWorkflowBuilder lets a restaurant shape its order pipeline per service
 * type: free-form step names in any number/order, a semantic Type per step (so
 * the engine keeps stock/stats/delivery working), automation triggers, and a
 * per-step customer notification. Saves one order type at a time.
 */
export function OrderWorkflowBuilder({ rid, canEdit }: { rid: number; canEdit: boolean }) {
  const { t } = useI18n();
  const [byType, setByType] = useState<Record<string, WorkflowStage[]>>({});
  const [templateSource, setTemplateSource] = useState<Record<string, string>>({});
  const [activeType, setActiveType] = useState<WorkflowOrderType>('pickup');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOrderWorkflows(rid)
      .then((wfs) => {
        const stages: Record<string, WorkflowStage[]> = {};
        const tmpl: Record<string, string> = {};
        for (const wf of wfs) {
          stages[wf.order_type] = wf.stages;
          tmpl[wf.order_type] = wf.template_source;
        }
        setByType(stages);
        setTemplateSource(tmpl);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [rid]);

  const stages = byType[activeType] ?? [];
  const setStages = (next: WorkflowStage[]) => {
    setByType((w) => ({ ...w, [activeType]: next }));
    setSaved(false);
  };
  const patchStage = (i: number, patch: Partial<WorkflowStage>) =>
    setStages(stages.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const removeStage = (i: number) => setStages(stages.filter((_, idx) => idx !== i));
  const moveStage = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stages.length) return;
    const next = [...stages];
    [next[i], next[j]] = [next[j], next[i]];
    setStages(next);
  };
  const addStage = () => setStages([...stages, blankStage()]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const wf = await updateOrderWorkflow(rid, activeType, stages);
      setByType((w) => ({ ...w, [activeType]: wf.stages }));
      setTemplateSource((s) => ({ ...s, [activeType]: wf.template_source }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const kinds = activeType === 'delivery' ? ALL_KINDS : ALL_KINDS.filter((k) => k !== 'out_for_delivery');
  const kindLabel = (k: WorkflowStageKind): string =>
    ({
      received: t('wfKindReceived') || 'Reçue',
      in_progress: t('wfKindInProgress') || 'En préparation',
      ready: t('wfKindReady') || 'Prête',
      out_for_delivery: t('wfKindOutForDelivery') || 'En livraison',
      completed: t('wfKindCompleted') || 'Terminée',
    })[k];
  const typeLabel = (ot: WorkflowOrderType): string =>
    ot === 'pickup'
      ? t('pickup') || 'À emporter'
      : ot === 'dine_in'
        ? t('dineIn') || 'Sur place'
        : t('delivery') || 'Livraison';

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin w-6 h-6 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--s-4)]">
      <div
        className="flex items-start gap-2 px-[var(--s-3)] py-[var(--s-2)] rounded-r-md text-fs-xs"
        style={{ background: 'color-mix(in oklab, var(--info-500) 10%, transparent)', color: 'var(--fg-muted)' }}
      >
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--info-500)' }} />
        <span>
          {t('workflowBuilderDesc') ||
            'Construisez le parcours de vos commandes, étape par étape. Le « Type » de chaque étape indique au système ce qu’elle signifie (préparation, prête, livraison…) pour garder le stock, les statistiques et la livraison corrects.'}
        </span>
      </div>

      {/* Order-type tabs */}
      <div className="flex gap-1 flex-wrap">
        {ORDER_TYPES.map((ot) => {
          const active = ot === activeType;
          return (
            <button
              key={ot}
              type="button"
              onClick={() => {
                setActiveType(ot);
                setError(null);
                setSaved(false);
              }}
              className="px-[var(--s-3)] py-[var(--s-2)] rounded-r-md text-fs-sm font-medium border transition-colors"
              style={{
                borderColor: active ? 'var(--brand-500)' : 'var(--line)',
                background: active ? 'color-mix(in oklab, var(--brand-500) 10%, transparent)' : 'transparent',
                color: active ? 'var(--brand-600)' : 'var(--fg-muted)',
              }}
            >
              {typeLabel(ot)}
            </button>
          );
        })}
        {templateSource[activeType] === 'custom' && (
          <span className="ml-auto self-center">
            <Badge>{t('wfCustomized') || 'Personnalisé'}</Badge>
          </span>
        )}
      </div>

      {/* Stage list */}
      <div className="flex flex-col gap-[var(--s-3)]">
        {stages.length === 0 && (
          <div className="text-fs-sm text-[var(--fg-subtle)] py-[var(--s-3)]">
            {t('wfEmpty') || 'Aucune étape. Ajoutez-en une pour commencer.'}
          </div>
        )}
        {stages.map((stage, i) => (
          <div
            key={i}
            className="rounded-r-md border border-[var(--line)] p-[var(--s-4)] flex flex-col gap-[var(--s-3)]"
          >
            <div className="flex items-center gap-[var(--s-2)]">
              <span className="text-fs-xs font-mono text-[var(--fg-subtle)] w-5 shrink-0">{i + 1}</span>
              <Input
                value={stage.name}
                onChange={(e) => patchStage(i, { name: e.target.value })}
                placeholder={t('wfStageNamePlaceholder') || 'Nom de l’étape (ex. Au four)'}
                disabled={!canEdit}
                className="flex-1"
              />
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => moveStage(i, -1)}
                  disabled={!canEdit || i === 0}
                  aria-label={t('wfMoveUp') || 'Monter'}
                  className="p-1.5 rounded-r-md text-[var(--fg-muted)] hover:bg-[var(--surface-2)] disabled:opacity-30"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveStage(i, 1)}
                  disabled={!canEdit || i === stages.length - 1}
                  aria-label={t('wfMoveDown') || 'Descendre'}
                  className="p-1.5 rounded-r-md text-[var(--fg-muted)] hover:bg-[var(--surface-2)] disabled:opacity-30"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeStage(i)}
                  disabled={!canEdit}
                  aria-label={t('wfRemoveStage') || 'Supprimer l’étape'}
                  className="p-1.5 rounded-r-md text-[var(--danger-500)] hover:bg-[var(--surface-2)] disabled:opacity-30"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-[var(--s-3)] pl-7">
              <label className="flex items-center gap-1.5 text-fs-xs text-[var(--fg-muted)]">
                {t('wfType') || 'Type'}
                <Select
                  value={stage.kind}
                  onChange={(e) => patchStage(i, { kind: e.target.value as WorkflowStageKind })}
                  disabled={!canEdit}
                >
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {kindLabel(k)}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            {/* Automations */}
            <div className="flex flex-col gap-1.5 pl-7">
              <div className="text-fs-xs font-medium text-[var(--fg-subtle)] uppercase tracking-wide">
                {t('wfAutomations') || 'Automatisations'}
              </div>
              <StageSwitch
                checked={stage.trigger_production_done}
                onChange={(v) => patchStage(i, { trigger_production_done: v })}
                label={t('wfTrigProduction') || 'Coché dans le plan de production'}
                disabled={!canEdit}
              />
              <StageSwitch
                checked={stage.trigger_payment_confirmed}
                onChange={(v) => patchStage(i, { trigger_payment_confirmed: v })}
                label={t('wfTrigPayment') || 'Paiement confirmé'}
                disabled={!canEdit}
              />
              {activeType === 'delivery' && (
                <>
                  <StageSwitch
                    checked={stage.trigger_courier_assigned}
                    onChange={(v) => patchStage(i, { trigger_courier_assigned: v })}
                    label={t('wfTrigCourierAssigned') || 'Livreur assigné'}
                    disabled={!canEdit}
                  />
                  <StageSwitch
                    checked={stage.trigger_courier_delivered}
                    onChange={(v) => patchStage(i, { trigger_courier_delivered: v })}
                    label={t('wfTrigCourierDelivered') || 'Livré / récupéré'}
                    disabled={!canEdit}
                  />
                </>
              )}
            </div>

            {/* Customer notification */}
            <div className="flex flex-col gap-1.5 pl-7">
              <StageSwitch
                checked={stage.notify_customer}
                onChange={(v) => patchStage(i, { notify_customer: v })}
                label={t('wfNotify') || 'Prévenir le client'}
                disabled={!canEdit}
              />
              {stage.notify_customer && (
                <Input
                  value={stage.customer_message ?? ''}
                  onChange={(e) => patchStage(i, { customer_message: e.target.value })}
                  placeholder={t('wfNotifyMsgPlaceholder') || 'Message (optionnel, sinon message par défaut)'}
                  disabled={!canEdit}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="flex items-center gap-[var(--s-3)] flex-wrap">
          <Button variant="secondary" size="sm" onClick={addStage}>
            <Plus className="w-4 h-4" />
            {t('wfAddStage') || 'Ajouter une étape'}
          </Button>
          <Button variant="primary" size="sm" onClick={save} disabled={saving}>
            {saving ? t('saving') : t('saveChanges')}
          </Button>
          {saved && <span className="text-fs-sm text-[var(--success-500)] font-medium">{t('saved')}</span>}
          {error && <span className="text-fs-sm text-[var(--danger-500)] font-medium">{error}</span>}
        </div>
      )}
    </div>
  );
}

function StageSwitch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label
      className="flex items-center justify-between gap-[var(--s-3)] max-w-[420px]"
      style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
    >
      <span className="text-fs-sm text-[var(--fg)]">{label}</span>
      <Switch checked={checked} onChange={disabled ? () => {} : onChange} label={label} />
    </label>
  );
}
