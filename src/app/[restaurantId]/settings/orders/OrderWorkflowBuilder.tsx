'use client';

import { useEffect, useState } from 'react';
import {
  Bell,
  Bike,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  Info,
  PackageCheck,
  Plus,
  Trash2,
} from 'lucide-react';
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
 * OrderWorkflowBuilder shows a restaurant's order pipeline per service type as a
 * vertical timeline: each step collapses to a compact row (name, role, and
 * status badges) and expands inline to edit its role, its triggers ("what moves
 * an order here"), and its customer notification. Saves one order type at a time.
 */
export function OrderWorkflowBuilder({ rid, canEdit }: { rid: number; canEdit: boolean }) {
  const { t } = useI18n();
  const [byType, setByType] = useState<Record<string, WorkflowStage[]>>({});
  const [templateSource, setTemplateSource] = useState<Record<string, string>>({});
  const [activeType, setActiveType] = useState<WorkflowOrderType>('pickup');
  const [openIndex, setOpenIndex] = useState<number | null>(0);
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
  const removeStage = (i: number) => {
    setStages(stages.filter((_, idx) => idx !== i));
    setOpenIndex(null);
  };
  const moveStage = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stages.length) return;
    const next = [...stages];
    [next[i], next[j]] = [next[j], next[i]];
    setStages(next);
    setOpenIndex(j);
  };
  const addStage = () => {
    setStages([...stages, blankStage()]);
    setOpenIndex(stages.length);
  };

  const switchType = (ot: WorkflowOrderType) => {
    setActiveType(ot);
    setOpenIndex(0);
    setError(null);
    setSaved(false);
  };

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
            'Construisez le parcours de vos commandes, étape par étape. Le « Type » de chaque étape indique au système ce qu’elle signifie (en préparation, prête, en livraison…) pour garder le stock, les statistiques et la livraison corrects.'}
        </span>
      </div>

      {/* Order-type tabs */}
      <div className="flex gap-1 flex-wrap items-center">
        {ORDER_TYPES.map((ot) => {
          const active = ot === activeType;
          return (
            <button
              key={ot}
              type="button"
              onClick={() => switchType(ot)}
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
          <span className="ms-auto self-center">
            <Badge>{t('wfCustomized') || 'Personnalisé'}</Badge>
          </span>
        )}
      </div>

      {/* Vertical pipeline */}
      {stages.length === 0 ? (
        <div className="text-fs-sm text-[var(--fg-subtle)] py-[var(--s-3)]">
          {t('wfEmpty') || 'Aucune étape. Ajoutez-en une pour commencer.'}
        </div>
      ) : (
        <div className="flex flex-col">
          {stages.map((stage, i) => {
            const open = openIndex === i;
            const isLast = i === stages.length - 1;
            const isFirst = i === 0;
            const hasTrigger =
              stage.trigger_production_done ||
              stage.trigger_payment_confirmed ||
              stage.trigger_courier_assigned ||
              stage.trigger_courier_delivered;
            return (
              <div key={i} className="flex gap-[var(--s-3)] items-stretch">
                {/* Rail: dot + connector line */}
                <div className="flex flex-col items-center w-4 shrink-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full mt-[14px] transition-colors"
                    style={{ background: open ? 'var(--brand-500)' : 'var(--line-strong)' }}
                  />
                  {!isLast && <div className="w-px flex-1 my-1" style={{ background: 'var(--line)' }} />}
                </div>

                {/* Step card */}
                <div className={`flex-1 min-w-0 ${isLast ? '' : 'mb-[var(--s-3)]'}`}>
                  <div
                    className="rounded-r-md border transition-colors"
                    style={{ borderColor: open ? 'var(--brand-500)' : 'var(--line)' }}
                  >
                    {/* Header (collapsed summary, click to expand) */}
                    <button
                      type="button"
                      onClick={() => setOpenIndex(open ? null : i)}
                      className="w-full flex items-center gap-[var(--s-2)] px-[var(--s-3)] py-[var(--s-3)] text-start"
                    >
                      <span className="text-fs-xs font-mono text-[var(--fg-subtle)] w-4 shrink-0">{i + 1}</span>
                      <span
                        className={`text-fs-sm font-medium truncate ${stage.name.trim() ? 'text-[var(--fg)]' : 'text-[var(--fg-subtle)] italic'}`}
                      >
                        {stage.name.trim() || (t('wfUnnamed') || 'Étape sans nom')}
                      </span>
                      <span
                        className="ms-2 shrink-0 inline-flex items-center h-[18px] px-[6px] rounded-r-full text-fs-micro font-medium"
                        style={{
                          background: 'color-mix(in oklab, var(--brand-500) 10%, transparent)',
                          color: 'var(--brand-600)',
                        }}
                      >
                        {kindLabel(stage.kind)}
                      </span>
                      <span className="ms-auto flex items-center gap-1.5 shrink-0 text-[var(--fg-subtle)]">
                        <StageBadges stage={stage} t={t} />
                        <ChevronDown
                          className="w-4 h-4 transition-transform"
                          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
                        />
                      </span>
                    </button>

                    {/* Editor (expanded) */}
                    {open && (
                      <div className="px-[var(--s-3)] pb-[var(--s-4)] pt-[var(--s-1)] flex flex-col gap-[var(--s-4)] border-t border-[var(--line)]">
                        <div className="flex flex-wrap gap-[var(--s-3)] pt-[var(--s-3)]">
                          <label className="flex-1 min-w-[200px] flex flex-col gap-1">
                            <span className="text-fs-xs text-[var(--fg-muted)]">
                              {t('wfStageName') || 'Nom de l’étape'}
                            </span>
                            <Input
                              value={stage.name}
                              onChange={(e) => patchStage(i, { name: e.target.value })}
                              placeholder={t('wfStageNamePlaceholder') || 'Nom de l’étape (ex. Au four)'}
                              disabled={!canEdit}
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-fs-xs text-[var(--fg-muted)]">{t('wfType') || 'Type'}</span>
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
                        <p className="text-fs-xs text-[var(--fg-subtle)] -mt-2">
                          {t('wfTypeHint') ||
                            'Le type indique au système ce que représente l’étape (préparation, prête, livraison…).'}
                        </p>

                        {/* Triggers */}
                        <div className="flex flex-col gap-1.5">
                          <div className="text-fs-xs font-medium text-[var(--fg-subtle)] uppercase tracking-wide">
                            {t('wfTriggersTitle') || 'Se déclenche quand'}
                          </div>
                          <p className="text-fs-xs text-[var(--fg-subtle)] -mt-0.5 mb-0.5">
                            {hasTrigger ? (
                              <>
                                {t('wfAutomationsHint') ||
                                  'Quand l’un de ces événements se produit, la commande passe automatiquement à'}{' '}
                                «&nbsp;{stage.name.trim() || (t('wfThisStep') || 'cette étape')}&nbsp;».
                              </>
                            ) : isFirst ? (
                              t('wfTriggerStartHint') ||
                              'Point de départ : les commandes démarrent ici. Ajouter une automatisation est optionnel.'
                            ) : (
                              t('wfTriggerManualHint') ||
                              'Avancement manuel : le staff fait passer la commande à cette étape. Ajoutez une automatisation pour le faire à sa place.'
                            )}
                          </p>
                          <ToggleRow
                            checked={stage.trigger_production_done}
                            onChange={(v) => patchStage(i, { trigger_production_done: v })}
                            label={t('wfTrigProduction') || 'Coché dans le plan de production'}
                            disabled={!canEdit}
                          />
                          <ToggleRow
                            checked={stage.trigger_payment_confirmed}
                            onChange={(v) => patchStage(i, { trigger_payment_confirmed: v })}
                            label={t('wfTrigPayment') || 'Paiement confirmé'}
                            disabled={!canEdit}
                          />
                          {activeType === 'delivery' && (
                            <>
                              <ToggleRow
                                checked={stage.trigger_courier_assigned}
                                onChange={(v) => patchStage(i, { trigger_courier_assigned: v })}
                                label={t('wfTrigCourierAssigned') || 'Livreur assigné'}
                                disabled={!canEdit}
                              />
                              <ToggleRow
                                checked={stage.trigger_courier_delivered}
                                onChange={(v) => patchStage(i, { trigger_courier_delivered: v })}
                                label={t('wfTrigCourierDelivered') || 'Livré / récupéré'}
                                disabled={!canEdit}
                              />
                            </>
                          )}
                        </div>

                        {/* Customer notification */}
                        <div className="flex flex-col gap-1.5">
                          <div className="text-fs-xs font-medium text-[var(--fg-subtle)] uppercase tracking-wide">
                            {t('wfNotificationTitle') || 'Notification client'}
                          </div>
                          <ToggleRow
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

                        {/* Row actions */}
                        {canEdit && (
                          <div className="flex items-center gap-1 pt-1 border-t border-[var(--line)]">
                            <IconButton
                              onClick={() => moveStage(i, -1)}
                              disabled={i === 0}
                              label={t('wfMoveUp') || 'Monter'}
                              icon={<ChevronDown className="w-4 h-4 rotate-180" />}
                            />
                            <IconButton
                              onClick={() => moveStage(i, 1)}
                              disabled={i === stages.length - 1}
                              label={t('wfMoveDown') || 'Descendre'}
                              icon={<ChevronDown className="w-4 h-4" />}
                            />
                            <button
                              type="button"
                              onClick={() => removeStage(i)}
                              className="ms-auto inline-flex items-center gap-1 px-[var(--s-2)] py-1 rounded-r-md text-fs-xs text-[var(--danger-500)] hover:bg-[var(--surface-2)]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              {t('wfRemoveStage') || 'Supprimer l’étape'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add step (as a final rail node) */}
          {canEdit && (
            <div className="flex gap-[var(--s-3)] items-center">
              <div className="flex flex-col items-center w-4 shrink-0">
                <Plus className="w-3.5 h-3.5" style={{ color: 'var(--fg-subtle)' }} />
              </div>
              <button
                type="button"
                onClick={addStage}
                className="flex-1 text-start text-fs-sm text-[var(--brand-600)] hover:underline py-[var(--s-1)]"
              >
                {t('wfAddStage') || 'Ajouter une étape'}
              </button>
            </div>
          )}
        </div>
      )}

      {canEdit && (
        <div className="flex items-center gap-[var(--s-3)] flex-wrap">
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

function StageBadges({ stage, t }: { stage: WorkflowStage; t: (k: string) => string }) {
  const badges: { on: boolean; icon: React.ReactNode; label: string }[] = [
    { on: stage.trigger_production_done, icon: <ClipboardCheck className="w-3.5 h-3.5" />, label: t('wfTrigProduction') || 'Coché dans le plan de production' },
    { on: stage.trigger_payment_confirmed, icon: <CreditCard className="w-3.5 h-3.5" />, label: t('wfTrigPayment') || 'Paiement confirmé' },
    { on: stage.trigger_courier_assigned, icon: <Bike className="w-3.5 h-3.5" />, label: t('wfTrigCourierAssigned') || 'Livreur assigné' },
    { on: stage.trigger_courier_delivered, icon: <PackageCheck className="w-3.5 h-3.5" />, label: t('wfTrigCourierDelivered') || 'Livré / récupéré' },
    { on: stage.notify_customer, icon: <Bell className="w-3.5 h-3.5" />, label: t('wfNotify') || 'Prévenir le client' },
  ];
  return (
    <>
      {badges
        .filter((b) => b.on)
        .map((b, idx) => (
          <span key={idx} title={b.label} className="inline-flex">
            {b.icon}
          </span>
        ))}
    </>
  );
}

function ToggleRow({
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
      className="flex items-center justify-between gap-[var(--s-3)] max-w-[440px]"
      style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
    >
      <span className="text-fs-sm text-[var(--fg)]">{label}</span>
      <Switch checked={checked} onChange={disabled ? () => {} : onChange} label={label} />
    </label>
  );
}

function IconButton({
  onClick,
  disabled,
  label,
  icon,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="p-1.5 rounded-r-md text-[var(--fg-muted)] hover:bg-[var(--surface-2)] disabled:opacity-30"
    >
      {icon}
    </button>
  );
}
