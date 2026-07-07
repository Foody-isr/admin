'use client';

import React, { useEffect, useState } from 'react';
import { Bell, ChevronDown, Info, Plus, Trash2 } from 'lucide-react';
import {
  getOrderWorkflows,
  updateOrderWorkflow,
  resetOrderWorkflow,
  type WorkflowStage,
  type WorkflowStageKind,
  type WorkflowOrderType,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, Input, Select } from '@/components/ds';
import { Switch } from './_components';

type TriggerChoice = 'manual' | 'payment' | 'production' | 'courier_assigned' | 'courier_delivered';

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

// A stage advances via a single trigger in the builder; map it to/from the four
// booleans the API carries.
function currentTrigger(s: WorkflowStage): TriggerChoice {
  if (s.trigger_production_done) return 'production';
  if (s.trigger_payment_confirmed) return 'payment';
  if (s.trigger_courier_assigned) return 'courier_assigned';
  if (s.trigger_courier_delivered) return 'courier_delivered';
  return 'manual';
}
function triggerPatch(choice: TriggerChoice): Partial<WorkflowStage> {
  return {
    trigger_production_done: choice === 'production',
    trigger_payment_confirmed: choice === 'payment',
    trigger_courier_assigned: choice === 'courier_assigned',
    trigger_courier_delivered: choice === 'courier_delivered',
  };
}

/**
 * OrderWorkflowBuilder shows a restaurant's order pipeline per service type as a
 * living flow: steps are simple nodes on a vertical line, and the connector
 * between two steps carries HOW the order advances (its trigger) — because a
 * trigger describes the transition, not the step. A step's own editor only holds
 * its name, role, and customer notification. Saves one order type at a time.
 */
export function OrderWorkflowBuilder({ rid, canEdit }: { rid: number; canEdit: boolean }) {
  const { t } = useI18n();
  const [byType, setByType] = useState<Record<string, WorkflowStage[]>>({});
  const [templateSource, setTemplateSource] = useState<Record<string, string>>({});
  const [activeType, setActiveType] = useState<WorkflowOrderType>('pickup');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);
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
    setOpenIndex(null);
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

  const reset = async () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(t('wfResetConfirm') || 'Réinitialiser ce parcours au modèle par défaut ? Vos modifications seront perdues.')
    ) {
      return;
    }
    setResetting(true);
    setError(null);
    try {
      const wf = await resetOrderWorkflow(rid, activeType);
      setByType((w) => ({ ...w, [activeType]: wf.stages }));
      setTemplateSource((s) => ({ ...s, [activeType]: wf.template_source }));
      setOpenIndex(null);
      setSaved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  };

  const kinds = activeType === 'delivery' ? ALL_KINDS : ALL_KINDS.filter((k) => k !== 'out_for_delivery');
  const triggerOptions: TriggerChoice[] =
    activeType === 'delivery'
      ? ['manual', 'payment', 'production', 'courier_assigned', 'courier_delivered']
      : ['manual', 'payment', 'production'];

  const kindLabel = (k: WorkflowStageKind): string =>
    ({
      received: t('wfKindReceived') || 'Reçue',
      in_progress: t('wfKindInProgress') || 'En préparation',
      ready: t('wfKindReady') || 'Prête',
      out_for_delivery: t('wfKindOutForDelivery') || 'En livraison',
      completed: t('wfKindCompleted') || 'Terminée',
    })[k];
  const triggerLabel = (c: TriggerChoice): string =>
    ({
      manual: t('wfTrigManual') || 'Avancement manuel',
      payment: t('wfTrigPayment') || 'Paiement confirmé',
      production: t('wfTrigProduction') || 'Coché dans le plan de production',
      courier_assigned: t('wfTrigCourierAssigned') || 'Livreur assigné',
      courier_delivered: t('wfTrigCourierDelivered') || 'Livré / récupéré',
    })[c];
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
          {t('workflowBuilderFlowDesc') ||
            'Le parcours d’une commande. Chaque étape est un jalon ; entre deux étapes, choisissez ce qui fait avancer la commande (paiement, plan de production, livreur… ou manuellement).'}
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

      {/* Flow */}
      {stages.length === 0 ? (
        <div className="text-fs-sm text-[var(--fg-subtle)] py-[var(--s-3)]">
          {t('wfEmpty') || 'Aucune étape. Ajoutez-en une pour commencer.'}
        </div>
      ) : (
        <div className="flex flex-col">
          {stages.map((stage, i) => {
            const open = openIndex === i;
            const isFirst = i === 0;
            return (
              <React.Fragment key={i}>
                {/* Connector INTO this step: how the order advances here */}
                {!isFirst && (
                  <div className="flex gap-[var(--s-3)] items-stretch">
                    <Rail marker="arrow" topLine bottomLine />
                    <div className="flex-1 min-w-0 flex flex-col gap-1 py-[var(--s-2)]">
                      <span className="text-fs-xs text-[var(--fg-subtle)]">
                        {t('wfTriggeredBy') || 'Se déclenche par'}
                      </span>
                      <Select
                        value={currentTrigger(stage)}
                        onChange={(e) => patchStage(i, triggerPatch(e.target.value as TriggerChoice))}
                        disabled={!canEdit}
                      >
                        {triggerOptions.map((o) => (
                          <option key={o} value={o}>
                            {triggerLabel(o)}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                )}

                {/* Step node */}
                <div className="flex gap-[var(--s-3)] items-stretch">
                  <Rail marker="dot" active={open} topLine={!isFirst} bottomLine />
                  <div className="flex-1 min-w-0 py-[var(--s-2)]">
                    <div
                      className="rounded-r-md border transition-colors"
                      style={{ borderColor: open ? 'var(--brand-500)' : 'var(--line)' }}
                    >
                      {/* Collapsed header */}
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
                        {isFirst && (
                          <span className="shrink-0 text-fs-micro text-[var(--fg-subtle)] uppercase tracking-wide">
                            {t('wfStart') || 'Départ'}
                          </span>
                        )}
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
                          {stage.notify_customer && (
                            <Bell className="w-3.5 h-3.5" style={{ color: 'var(--brand-500)' }} />
                          )}
                          <ChevronDown
                            className="w-4 h-4 transition-transform"
                            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
                          />
                        </span>
                      </button>

                      {/* Expanded editor — name, role, notification (NO triggers) */}
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
              </React.Fragment>
            );
          })}

          {/* Add step */}
          {canEdit && (
            <div className="flex gap-[var(--s-3)] items-center">
              <Rail marker="plus" topLine />
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
            {saving ? t('saving') : t('wfSaveFlow') || 'Enregistrer ce parcours'}
          </Button>
          {templateSource[activeType] === 'custom' && (
            <Button variant="ghost" size="sm" onClick={reset} disabled={resetting}>
              {resetting ? t('saving') : t('wfReset') || 'Réinitialiser au parcours par défaut'}
            </Button>
          )}
          {saved && <span className="text-fs-sm text-[var(--success-500)] font-medium">{t('saved')}</span>}
          {error && <span className="text-fs-sm text-[var(--danger-500)] font-medium">{error}</span>}
        </div>
      )}
    </div>
  );
}

// Rail draws the continuous flow line with a marker (a node dot, a transition
// arrow, or the add "+"). Line segments are flex so they stretch to the row.
function Rail({
  marker,
  active,
  topLine,
  bottomLine,
}: {
  marker: 'dot' | 'arrow' | 'plus';
  active?: boolean;
  topLine?: boolean;
  bottomLine?: boolean;
}) {
  const isDot = marker === 'dot';
  return (
    <div className="w-4 shrink-0 flex flex-col items-center self-stretch">
      {/* Dots anchor to the collapsed header height so they stay aligned when a
          step expands; arrows/plus center in their (short) rows. */}
      <div
        className={isDot ? 'w-px' : 'w-px flex-1'}
        style={{
          background: topLine ? 'var(--line)' : 'transparent',
          height: isDot ? 26 : undefined,
          minHeight: isDot ? undefined : 8,
        }}
      />
      {marker === 'dot' ? (
        <div
          className="w-2.5 h-2.5 rounded-full my-0.5"
          style={{ background: active ? 'var(--brand-500)' : 'var(--line-strong)' }}
        />
      ) : marker === 'plus' ? (
        <Plus className="w-3.5 h-3.5 my-0.5" style={{ color: 'var(--fg-subtle)' }} />
      ) : (
        <ChevronDown className="w-3.5 h-3.5 my-0.5" style={{ color: 'var(--fg-subtle)' }} />
      )}
      <div className="w-px flex-1" style={{ background: bottomLine ? 'var(--line)' : 'transparent', minHeight: 8 }} />
    </div>
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
