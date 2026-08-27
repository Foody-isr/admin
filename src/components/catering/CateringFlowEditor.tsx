'use client';

import { useMemo, useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import {
  updateCateringServiceFlow,
  type CateringFlowConfig,
  type CateringFlowOption,
  type CateringFlowPriceEffect,
  type CateringFlowPriceMode,
  type CateringFlowStep,
  type CateringFlowStepKind,
  type CateringService,
} from '@/lib/api';

const STEP_KINDS: CateringFlowStepKind[] = ['guest_count', 'schedule', 'single_choice', 'multi_choice', 'quantity'];
const PRICE_MODES: CateringFlowPriceMode[] = ['fixed', 'per_guest', 'per_session', 'per_guest_session', 'per_unit'];

function nextId(prefix: string, used: string[]): string {
  let index = used.length + 1;
  let candidate = `${prefix}_${index}`;
  while (used.includes(candidate)) candidate = `${prefix}_${++index}`;
  return candidate;
}

function createStep(kind: CateringFlowStepKind, used: string[]): CateringFlowStep {
  const id = nextId(kind, used);
  const base = { id, kind, scope: 'booking' as const, title: '', description: '', required: true } as CateringFlowStep;
  if (kind === 'schedule') {
    return { ...base, schedule: { mode: 'custom', min_sessions: 1, max_sessions: 4, allow_same_day: true, slots: [], pricing_rules: [] } };
  }
  if (kind === 'single_choice' || kind === 'multi_choice' || kind === 'quantity') {
    return { ...base, options: [{ id: 'option_1', label: '', price: 0, price_mode: kind === 'quantity' ? 'per_unit' : 'fixed' }] };
  }
  return base;
}

function starterFlow(t: (key: string) => string): CateringFlowConfig {
  return {
    version: 2,
    enabled: true,
    catalog_pricing_per_session: false,
    steps: [
      { id: 'guests', kind: 'guest_count', scope: 'booking', title: t('catering_flow_starter_guests'), description: t('catering_flow_starter_guests_hint'), required: true },
      { id: 'schedule', kind: 'schedule', scope: 'booking', title: t('catering_flow_starter_schedule'), description: t('catering_flow_starter_schedule_hint'), required: true, schedule: { mode: 'custom', min_sessions: 1, max_sessions: 4, allow_same_day: true, slots: [], pricing_rules: [] } },
      { id: 'fulfilment', kind: 'single_choice', scope: 'session', title: t('catering_flow_starter_fulfilment'), required: true, options: [
        { id: 'delivery', label: t('catering_flow_starter_delivery'), price: 0, price_mode: 'fixed' },
        { id: 'onsite', label: t('catering_flow_starter_onsite'), price: 0, price_mode: 'fixed' },
      ] },
    ],
  };
}

function normalizedFlow(raw: CateringService['flow_config']): CateringFlowConfig {
  if (raw && 'version' in raw && (raw.version === 1 || raw.version === 2)) {
    const normalized = structuredClone(raw as CateringFlowConfig);
    return {
      ...normalized,
      version: 2,
      catalog_pricing_per_session: false,
      steps: normalized.steps.map((step) => ({ ...step, scope: step.kind === 'schedule' ? 'booking' : step.scope ?? 'booking' })),
    };
  }
  return { version: 2, enabled: false, catalog_pricing_per_session: false, steps: [] };
}

function stepValid(step: CateringFlowStep): boolean {
  if (!step.title.trim()) return false;
  if (step.kind === 'schedule') {
    const schedule = step.schedule;
    if (!schedule) return false;
    if (schedule.mode === 'single') return schedule.min_sessions === 0 && schedule.max_sessions === 1;
    if (schedule.min_sessions < 0 || schedule.max_sessions < Math.max(1, schedule.min_sessions)) return false;
    if (schedule.mode === 'predefined' && (!schedule.slots?.length || schedule.slots.some((slot) => !slot.label.trim()))) return false;
    if (schedule.pricing_rules?.some((rule) => !rule.label.trim()
      || rule.catalog_per_guest_rate < 0
      || (rule.weekday !== undefined && (rule.weekday < 0 || rule.weekday > 6))
      || Boolean(rule.start_time_from && rule.start_time_until && rule.start_time_from >= rule.start_time_until))) return false;
  }
  if (step.kind === 'single_choice' || step.kind === 'multi_choice' || step.kind === 'quantity') {
    if (!step.options?.length || step.options.some((option) => !option.label.trim())) return false;
  }
  return true;
}

function flowValid(flow: CateringFlowConfig, pricingModel: CateringService['pricing_model']): boolean {
  if (!flow.enabled) return true;
  if (flow.steps.length === 0 || new Set(flow.steps.map((step) => step.id)).size !== flow.steps.length) return false;
  if (pricingModel !== 'per_person' && flow.steps.some((step) => step.schedule?.slots?.some((slot) => slot.catalog_per_guest_rate !== undefined)
    || step.schedule?.pricing_rules?.length)) return false;
  const catalogRateSteps = flow.steps.filter((step) => step.options?.some((option) => option.price_effect === 'replace_catalog_per_guest'));
  if (catalogRateSteps.length > 1) return false;
  return flow.steps.every((step, index) => {
    if (!stepValid(step)) return false;
    if (step.kind === 'schedule' && step.scope === 'session') return false;
    if (step.options?.some((option) => option.price_effect === 'replace_catalog_per_guest'
      && (pricingModel !== 'per_person' || step.kind !== 'single_choice' || option.price_mode !== 'per_guest'))) return false;
    if (!step.condition) return true;
    const source = flow.steps.slice(0, index).find((candidate) => candidate.id === step.condition?.step_id);
    if (step.scope !== 'session' && source?.scope === 'session') return false;
    return Boolean(source?.options?.some((option) => option.id === step.condition?.option_id));
  });
}

export default function CateringFlowEditor({ restaurantId, service, canEdit, onSaved }: {
  restaurantId: number;
  service: CateringService;
  canEdit: boolean;
  onSaved: (service: CateringService) => void;
}) {
  const { t } = useI18n();
  const [flow, setFlow] = useState<CateringFlowConfig>(() => normalizedFlow(service.flow_config));
  const [newKind, setNewKind] = useState<CateringFlowStepKind>('single_choice');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const valid = useMemo(() => flowValid(flow, service.pricing_model), [flow, service.pricing_model]);

  const updateStep = (index: number, next: CateringFlowStep) => {
    setSaved(false);
    setFlow((current) => ({ ...current, steps: current.steps.map((step, i) => i === index ? next : step) }));
  };
  const moveStep = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= flow.steps.length) return;
    const steps = [...flow.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    setSaved(false);
    setFlow({ ...flow, steps });
  };
  const removeStep = (index: number) => {
    const removed = flow.steps[index];
    setSaved(false);
    setFlow({ ...flow, steps: flow.steps.filter((_, i) => i !== index).map((step) => step.condition?.step_id === removed.id ? { ...step, condition: undefined } : step) });
  };
  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const updated = await updateCateringServiceFlow(restaurantId, service.id, flow);
      onSaved(updated);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-[var(--divider)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--divider)] p-5">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">{t('catering_flow_eyebrow')}</p>
            <h2 className="mt-1 text-xl font-semibold text-fg-primary">{t('catering_flow_title')}</h2>
            <p className="mt-1 text-sm leading-6 text-fg-secondary">{t('catering_flow_hint')}</p>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-full border border-[var(--divider)] bg-[var(--surface-subtle)] px-4 py-2 text-sm font-semibold text-fg-primary">
            <input type="checkbox" checked={flow.enabled} disabled={!canEdit} onChange={(e) => { setSaved(false); setFlow({ ...flow, enabled: e.target.checked }); }} />
            {t('catering_flow_enabled')}
          </label>
        </div>

        {flow.steps.length === 0 ? (
          <div className="grid place-items-center px-5 py-14 text-center">
            <div className="max-w-md">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-500/10 text-xl text-brand-600">1→2→3</div>
              <h3 className="mt-4 font-semibold text-fg-primary">{t('catering_flow_empty_title')}</h3>
              <p className="mt-1 text-sm text-fg-secondary">{t('catering_flow_empty_hint')}</p>
              {canEdit && <Button className="mt-5" variant="primary" size="md" onClick={() => setFlow(starterFlow(t))}>{t('catering_flow_starter')}</Button>}
            </div>
          </div>
        ) : (
          <div className="space-y-4 bg-[var(--surface-subtle)] p-4 sm:p-5">
            {flow.steps.map((step, index) => (
              <StepCard
                key={step.id}
                step={step}
                index={index}
                priorSteps={flow.steps.slice(0, index)}
                canEdit={canEdit}
                pricingModel={service.pricing_model}
                onChange={(next) => updateStep(index, next)}
                onMove={(delta) => moveStep(index, delta)}
                onRemove={() => removeStep(index)}
                first={index === 0}
                last={index === flow.steps.length - 1}
              />
            ))}
          </div>
        )}

        {canEdit && flow.steps.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--divider)] p-4 sm:p-5">
            <div className="flex flex-wrap gap-2">
              <select className="input !w-auto" value={newKind} onChange={(e) => setNewKind(e.target.value as CateringFlowStepKind)}>
                {STEP_KINDS.map((kind) => <option key={kind} value={kind}>{t(`catering_flow_kind_${kind}`)}</option>)}
              </select>
              <Button variant="secondary" size="md" onClick={() => { setSaved(false); setFlow({ ...flow, steps: [...flow.steps, createStep(newKind, flow.steps.map((step) => step.id))] }); }}>
                <PlusIcon />{t('catering_flow_add_step')}
              </Button>
            </div>
            <div className="flex items-center gap-3">
              {!valid && <span className="text-sm text-red-500">{t('catering_flow_invalid')}</span>}
              {saved && <span className="text-sm text-emerald-600">{t('catering_flow_saved')}</span>}
              <Button variant="primary" size="md" disabled={saving || !valid} onClick={save}>{saving ? t('saving') : t('catering_flow_publish')}</Button>
            </div>
          </div>
        )}
      </section>

      {flow.enabled && flow.steps.length > 0 && <p className="rounded-xl border border-[var(--divider)] bg-[var(--surface)] p-4 text-sm leading-6 text-fg-secondary">{t('catering_flow_session_baskets_hint')}</p>}
    </div>
  );
}

function StepCard({ step, index, priorSteps, canEdit, pricingModel, onChange, onMove, onRemove, first, last }: {
  step: CateringFlowStep;
  index: number;
  priorSteps: CateringFlowStep[];
  canEdit: boolean;
  pricingModel: CateringService['pricing_model'];
  onChange: (step: CateringFlowStep) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  first: boolean;
  last: boolean;
}) {
  const { t } = useI18n();
  const conditionalSources = priorSteps.filter((candidate) => candidate.options?.length);
  const selectedSource = conditionalSources.find((candidate) => candidate.id === step.condition?.step_id);
  return (
    <article className={`rounded-xl border bg-[var(--surface)] ${stepValid(step) ? 'border-[var(--divider)]' : 'border-red-400'}`}>
      <div className="flex items-center gap-3 border-b border-[var(--divider)] px-4 py-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">{index + 1}</span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-fg-primary">{step.title || t('catering_flow_untitled')}</p><p className="text-xs text-fg-tertiary">{t(`catering_flow_kind_${step.kind}`)}</p></div>
        {canEdit && <div className="flex items-center"><button className="rounded p-1.5 text-fg-secondary hover:bg-[var(--surface-subtle)] disabled:opacity-25" disabled={first} onClick={() => onMove(-1)}><ArrowUpIcon className="h-4 w-4" /></button><button className="rounded p-1.5 text-fg-secondary hover:bg-[var(--surface-subtle)] disabled:opacity-25" disabled={last} onClick={() => onMove(1)}><ArrowDownIcon className="h-4 w-4" /></button><button className="rounded p-1.5 text-fg-secondary hover:bg-red-500/10 hover:text-red-500" onClick={onRemove}><Trash2Icon className="h-4 w-4" /></button></div>}
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <Field label={t('catering_flow_question')}><input className="input" value={step.title} disabled={!canEdit} onChange={(e) => onChange({ ...step, title: e.target.value })} /></Field>
        <Field label={t('catering_flow_help')}><input className="input" value={step.description ?? ''} disabled={!canEdit} onChange={(e) => onChange({ ...step, description: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm text-fg-primary"><input type="checkbox" checked={step.required} disabled={!canEdit} onChange={(e) => onChange({ ...step, required: e.target.checked })} />{t('catering_flow_required')}</label>
        <Field label={t('catering_flow_scope')}>
          <select className="input" disabled={!canEdit || step.kind === 'schedule'} value={step.kind === 'schedule' ? 'booking' : step.scope ?? 'booking'} onChange={(e) => onChange({ ...step, scope: e.target.value as 'booking' | 'session' })}>
            <option value="booking">{t('catering_flow_scope_booking')}</option>
            <option value="session">{t('catering_flow_scope_session')}</option>
          </select>
          <p className="mt-1 text-xs text-fg-tertiary">{t(step.scope === 'session' ? 'catering_flow_scope_session_hint' : 'catering_flow_scope_booking_hint')}</p>
        </Field>
        <Field label={t('catering_flow_condition')}>
          <select className="input" disabled={!canEdit || conditionalSources.length === 0} value={step.condition ? `${step.condition.step_id}:${step.condition.option_id}` : ''} onChange={(e) => { const [stepId, optionId] = e.target.value.split(':'); onChange({ ...step, condition: stepId ? { step_id: stepId, option_id: optionId, operator: 'equals' } : undefined }); }}>
            <option value="">{t('catering_flow_always')}</option>
            {conditionalSources.flatMap((source) => (source.options ?? []).map((option) => <option key={`${source.id}:${option.id}`} value={`${source.id}:${option.id}`}>{source.title || source.id} → {option.label || option.id}</option>))}
          </select>
          {step.condition && !selectedSource && <p className="mt-1 text-xs text-red-500">{t('catering_flow_condition_broken')}</p>}
        </Field>
      </div>
      {step.kind === 'schedule' && step.schedule && <ScheduleEditor step={step} canEdit={canEdit} pricingModel={pricingModel} onChange={onChange} />}
      {(step.kind === 'single_choice' || step.kind === 'multi_choice' || step.kind === 'quantity') && <OptionsEditor step={step} canEdit={canEdit} allowCatalogRate={pricingModel === 'per_person' && step.kind === 'single_choice'} onChange={onChange} />}
    </article>
  );
}

function ScheduleEditor({ step, canEdit, pricingModel, onChange }: { step: CateringFlowStep; canEdit: boolean; pricingModel: CateringService['pricing_model']; onChange: (step: CateringFlowStep) => void }) {
  const { t } = useI18n();
  const schedule = step.schedule!;
  const update = (next: typeof schedule) => onChange({ ...step, schedule: next });
  return <div className="space-y-4 border-t border-[var(--divider)] bg-[var(--surface-subtle)] p-4">
    <div className={`grid gap-3 ${schedule.mode === 'single' ? '' : 'sm:grid-cols-3'}`}>
      <Field label={t('catering_flow_schedule_mode')}><select className="input" disabled={!canEdit} value={schedule.mode} onChange={(e) => {
        const mode = e.target.value as 'single' | 'custom' | 'predefined';
        update(mode === 'single'
          ? { ...schedule, mode, min_sessions: 0, max_sessions: 1, allow_same_day: false, slots: [], pricing_rules: [] }
          : { ...schedule, mode, min_sessions: Math.max(1, schedule.min_sessions), max_sessions: Math.max(1, schedule.max_sessions) });
      }}><option value="single">{t('catering_flow_schedule_single')}</option><option value="custom">{t('catering_flow_schedule_custom')}</option><option value="predefined">{t('catering_flow_schedule_predefined')}</option></select></Field>
      {schedule.mode !== 'single' && <Field label={t('catering_flow_min_sessions')}><input className="input" type="number" min={0} max={31} disabled={!canEdit} value={schedule.min_sessions} onChange={(e) => update({ ...schedule, min_sessions: Number(e.target.value) })} /></Field>}
      {schedule.mode !== 'single' && <Field label={t('catering_flow_max_sessions')}><input className="input" type="number" min={1} max={31} disabled={!canEdit} value={schedule.max_sessions} onChange={(e) => update({ ...schedule, max_sessions: Number(e.target.value) })} /></Field>}
    </div>
    {schedule.mode === 'single'
      ? <p className="rounded-lg border border-[var(--divider)] bg-[var(--surface)] px-3 py-2 text-sm text-fg-secondary">{t('catering_flow_schedule_single_hint')}</p>
      : <label className="flex items-center gap-2 text-sm text-fg-primary"><input type="checkbox" checked={schedule.allow_same_day} disabled={!canEdit} onChange={(e) => update({ ...schedule, allow_same_day: e.target.checked })} />{t('catering_flow_same_day')}</label>}
    {schedule.mode === 'predefined' && <div className="space-y-2">
      {(schedule.slots ?? []).map((slot, index) => <div key={slot.id} className="grid gap-2 rounded-lg border border-[var(--divider)] bg-[var(--surface)] p-3 sm:grid-cols-[1fr_100px_110px_110px_150px_auto]">
        <input className="input" placeholder={t('catering_flow_slot_label')} disabled={!canEdit} value={slot.label} onChange={(e) => update({ ...schedule, slots: schedule.slots!.map((item, i) => i === index ? { ...item, label: e.target.value } : item) })} />
        <input className="input" aria-label={t('catering_flow_day_offset')} type="number" min={0} max={365} disabled={!canEdit} value={slot.day_offset} onChange={(e) => update({ ...schedule, slots: schedule.slots!.map((item, i) => i === index ? { ...item, day_offset: Number(e.target.value) } : item) })} />
        <input className="input" aria-label={t('catering_flow_start')} type="time" disabled={!canEdit} value={slot.start_time ?? ''} onChange={(e) => update({ ...schedule, slots: schedule.slots!.map((item, i) => i === index ? { ...item, start_time: e.target.value } : item) })} />
        <input className="input" aria-label={t('catering_flow_end')} type="time" disabled={!canEdit} value={slot.end_time ?? ''} onChange={(e) => update({ ...schedule, slots: schedule.slots!.map((item, i) => i === index ? { ...item, end_time: e.target.value } : item) })} />
        <input className="input" aria-label={t('catering_flow_slot_guest_rate')} type="number" min={0} step="0.01" disabled={!canEdit || pricingModel !== 'per_person'} placeholder={t('catering_flow_slot_guest_rate')} value={slot.catalog_per_guest_rate ?? ''} onChange={(e) => update({ ...schedule, slots: schedule.slots!.map((item, i) => i === index ? { ...item, catalog_per_guest_rate: e.target.value === '' ? undefined : Number(e.target.value) } : item) })} />
        {canEdit && <button className="rounded p-2 text-fg-secondary hover:bg-red-500/10 hover:text-red-500" onClick={() => update({ ...schedule, slots: schedule.slots!.filter((_, i) => i !== index) })}><Trash2Icon className="h-4 w-4" /></button>}
      </div>)}
      {canEdit && <Button variant="secondary" size="sm" onClick={() => { const slots = schedule.slots ?? []; update({ ...schedule, slots: [...slots, { id: nextId('session', slots.map((slot) => slot.id)), label: '', day_offset: slots.length, start_time: '', end_time: '' }] }); }}><PlusIcon />{t('catering_flow_add_slot')}</Button>}
      <p className="text-xs text-fg-tertiary">{t('catering_flow_day_offset_hint')}</p>
      {pricingModel === 'per_person' && <p className="text-xs text-fg-tertiary">{t('catering_flow_slot_guest_rate_hint')}</p>}
    </div>}
    {schedule.mode !== 'single' && pricingModel === 'per_person' && <div className="space-y-3 rounded-xl border border-[var(--divider)] bg-[var(--surface)] p-4">
      <div>
        <h4 className="text-sm font-semibold text-fg-primary">{t('catering_flow_pricing_rules')}</h4>
        <p className="mt-1 text-xs text-fg-tertiary">{t('catering_flow_pricing_rules_hint')}</p>
      </div>
      {(schedule.pricing_rules ?? []).map((rule, index) => <div key={rule.id} className="grid gap-2 rounded-lg bg-[var(--surface-subtle)] p-3 sm:grid-cols-[1.2fr_130px_110px_110px_140px_auto]">
        <input className="input" placeholder={t('catering_flow_pricing_rule_label')} disabled={!canEdit} value={rule.label} onChange={(e) => update({ ...schedule, pricing_rules: schedule.pricing_rules!.map((item, i) => i === index ? { ...item, label: e.target.value } : item) })} />
        <select className="input" aria-label={t('catering_flow_pricing_rule_weekday')} disabled={!canEdit} value={rule.weekday ?? ''} onChange={(e) => update({ ...schedule, pricing_rules: schedule.pricing_rules!.map((item, i) => i === index ? { ...item, weekday: e.target.value === '' ? undefined : Number(e.target.value) } : item) })}>
          <option value="">{t('catering_flow_pricing_rule_any_day')}</option>
          {['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((day, dayIndex) => <option key={day} value={dayIndex}>{t(`catering_flow_weekday_${day}`)}</option>)}
        </select>
        <input className="input" aria-label={t('catering_flow_pricing_rule_from')} type="time" disabled={!canEdit} value={rule.start_time_from ?? ''} onChange={(e) => update({ ...schedule, pricing_rules: schedule.pricing_rules!.map((item, i) => i === index ? { ...item, start_time_from: e.target.value } : item) })} />
        <input className="input" aria-label={t('catering_flow_pricing_rule_until')} type="time" disabled={!canEdit} value={rule.start_time_until ?? ''} onChange={(e) => update({ ...schedule, pricing_rules: schedule.pricing_rules!.map((item, i) => i === index ? { ...item, start_time_until: e.target.value } : item) })} />
        <input className="input" aria-label={t('catering_flow_slot_guest_rate')} type="number" min={0} step="0.01" disabled={!canEdit} placeholder={t('catering_flow_slot_guest_rate')} value={rule.catalog_per_guest_rate} onChange={(e) => update({ ...schedule, pricing_rules: schedule.pricing_rules!.map((item, i) => i === index ? { ...item, catalog_per_guest_rate: Number(e.target.value) } : item) })} />
        {canEdit && <div className="flex items-center">
          <button className="rounded p-2 text-fg-secondary hover:bg-[var(--surface)] disabled:opacity-30" aria-label={t('catering_move_up')} disabled={index === 0} onClick={() => { const rules = [...schedule.pricing_rules!]; [rules[index - 1], rules[index]] = [rules[index], rules[index - 1]]; update({ ...schedule, pricing_rules: rules }); }}><ArrowUpIcon className="h-4 w-4" /></button>
          <button className="rounded p-2 text-fg-secondary hover:bg-[var(--surface)] disabled:opacity-30" aria-label={t('catering_move_down')} disabled={index === schedule.pricing_rules!.length - 1} onClick={() => { const rules = [...schedule.pricing_rules!]; [rules[index], rules[index + 1]] = [rules[index + 1], rules[index]]; update({ ...schedule, pricing_rules: rules }); }}><ArrowDownIcon className="h-4 w-4" /></button>
          <button className="rounded p-2 text-fg-secondary hover:bg-red-500/10 hover:text-red-500" aria-label={t('delete')} onClick={() => update({ ...schedule, pricing_rules: schedule.pricing_rules!.filter((_, i) => i !== index) })}><Trash2Icon className="h-4 w-4" /></button>
        </div>}
      </div>)}
      {canEdit && <Button variant="secondary" size="sm" onClick={() => { const rules = schedule.pricing_rules ?? []; update({ ...schedule, pricing_rules: [...rules, { id: nextId('rate', rules.map((rule) => rule.id)), label: '', catalog_per_guest_rate: 0 }] }); }}><PlusIcon />{t('catering_flow_pricing_rule_add')}</Button>}
    </div>}
  </div>;
}

function OptionsEditor({ step, canEdit, allowCatalogRate, onChange }: { step: CateringFlowStep; canEdit: boolean; allowCatalogRate: boolean; onChange: (step: CateringFlowStep) => void }) {
  const { t } = useI18n();
  const options = step.options ?? [];
  const updateOption = (index: number, patch: Partial<CateringFlowOption>) => onChange({ ...step, options: options.map((option, i) => i === index ? { ...option, ...patch } : option) });
  return <div className="space-y-2 border-t border-[var(--divider)] bg-[var(--surface-subtle)] p-4">
    {options.map((option, index) => {
      const effect = option.price_effect ?? 'add';
      return <div key={option.id} className="space-y-3 rounded-lg border border-[var(--divider)] bg-[var(--surface)] p-3">
        <div className="grid gap-2 sm:grid-cols-[1.2fr_1.6fr_auto]">
          <Field label={t('catering_flow_option')}><input className="input" placeholder={t('catering_flow_option')} disabled={!canEdit} value={option.label} onChange={(e) => updateOption(index, { label: e.target.value })} /></Field>
          <Field label={t('catering_flow_option_help')}><input className="input" placeholder={t('catering_flow_option_help')} disabled={!canEdit} value={option.description ?? ''} onChange={(e) => updateOption(index, { description: e.target.value })} /></Field>
          {canEdit && <button className="self-end rounded p-3 text-fg-secondary hover:bg-red-500/10 hover:text-red-500" aria-label={t('delete')} onClick={() => onChange({ ...step, options: options.filter((_, i) => i !== index) })}><Trash2Icon className="h-4 w-4" /></button>}
        </div>
        <div className="grid gap-2 rounded-lg bg-[var(--surface-subtle)] p-3 sm:grid-cols-3">
          <Field label={t('catering_flow_price_effect')}><select className="input" disabled={!canEdit} value={effect} onChange={(e) => {
            const priceEffect = e.target.value as CateringFlowPriceEffect;
            updateOption(index, { price_effect: priceEffect, ...(priceEffect === 'replace_catalog_per_guest' ? { price_mode: 'per_guest' as const } : {}) });
          }}><option value="add">{t('catering_flow_price_effect_add')}</option><option value="replace_catalog_per_guest" disabled={!allowCatalogRate}>{t('catering_flow_price_effect_catalog_rate')}</option></select></Field>
          {effect === 'replace_catalog_per_guest'
            ? <Field label={t('catering_flow_price_mode')}><div className="input flex items-center text-sm text-fg-secondary">{t('catering_flow_price_per_guest')}</div></Field>
            : <Field label={t('catering_flow_price_mode')}><select className="input" disabled={!canEdit} value={option.price_mode ?? (step.kind === 'quantity' ? 'per_unit' : 'fixed')} onChange={(e) => updateOption(index, { price_mode: e.target.value as CateringFlowPriceMode })}>{PRICE_MODES.map((mode) => <option key={mode} value={mode}>{t(`catering_flow_price_${mode}`)}</option>)}</select></Field>}
        </div>
      </div>;
    })}
    {canEdit && <Button variant="secondary" size="sm" onClick={() => onChange({ ...step, options: [...options, { id: nextId('option', options.map((option) => option.id)), label: '', price: 0, price_mode: step.kind === 'quantity' ? 'per_unit' : 'fixed' }] })}><PlusIcon />{t('catering_flow_add_option')}</Button>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold text-fg-secondary">{label}</span>{children}</label>;
}
