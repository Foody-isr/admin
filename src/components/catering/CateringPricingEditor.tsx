'use client';

import { useMemo, useState, useEffect } from 'react';
import { CalculatorIcon, ChevronDownIcon, EyeIcon, PlusIcon, ShieldCheckIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import {
  listCateringItems,
  updateCateringServiceFlow,
  type CateringCatalogItem,
  type CateringFlowConfig,
  type CateringFlowStep,
  type CateringPricingCondition,
  type CateringPricingRule,
  type CateringService,
} from '@/lib/api';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function normalizeFlow(raw: CateringService['flow_config']): CateringFlowConfig {
  if (raw && 'version' in raw) {
    return { ...(structuredClone(raw) as CateringFlowConfig), version: 3, steps: (raw as CateringFlowConfig).steps ?? [], pricing: (raw as CateringFlowConfig).pricing ?? { rules: [] } };
  }
  return { version: 3, enabled: false, steps: [], pricing: { rules: [] } };
}

function condition(rule: CateringPricingRule, factor: string): CateringPricingCondition | undefined {
  return rule.conditions?.find((candidate) => candidate.factor === factor);
}

function ruleMatches(rule: CateringPricingRule, context: Record<string, string>): boolean {
  return (rule.conditions ?? []).every((candidate) => {
    const value = context[candidate.factor] ?? '';
    if (candidate.operator === 'equals') return value === candidate.value;
    if (candidate.operator === 'one_of') return candidate.values?.includes(value) ?? false;
    if (candidate.factor === 'guest_count') {
      const numeric = Number(value);
      return numeric >= Number(candidate.min_value) && numeric <= Number(candidate.max_value);
    }
    return value !== '' && value >= (candidate.min_value ?? '') && value <= (candidate.max_value ?? '');
  });
}

export function resolveCateringPricingPreview(
  rules: CateringPricingRule[],
  item: CateringCatalogItem | undefined,
  context: Record<string, string>,
): { matchingSpecific: CateringPricingRule[]; matched?: CateringPricingRule; rate?: number } {
  const itemRules = rules.filter((rule) => rule.catalog_item_id === item?.id);
  const matchingSpecific = itemRules.filter((rule) => (rule.conditions?.length ?? 0) > 0 && ruleMatches(rule, context));
  const fallback = itemRules.find((rule) => !rule.conditions?.length);
  const matched = matchingSpecific.length === 1 ? matchingSpecific[0] : matchingSpecific.length === 0 ? fallback : undefined;
  return { matchingSpecific, matched, rate: matched?.catalog_per_guest_rate ?? item?.base_price };
}

function nextRuleId(rules: CateringPricingRule[]): string {
  let index = rules.length + 1;
  while (rules.some((rule) => rule.id === `price_${index}`)) index += 1;
  return `price_${index}`;
}

export function CateringPricingSimulator({ restaurantId, service, flow, compact = false, refreshKey = 0 }: {
  restaurantId: number;
  service: CateringService;
  flow?: CateringFlowConfig;
  compact?: boolean;
  refreshKey?: number;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<CateringCatalogItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState(0);
  const [guests, setGuests] = useState(30);
  const [weekday, setWeekday] = useState('5');
  const [slotId, setSlotId] = useState('');
  const [startTime, setStartTime] = useState('19:00');
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    listCateringItems(restaurantId, service.id).then((next) => {
      setItems(next);
      setSelectedItemId((current) => next.some((item) => item.id === current) ? current : next[0]?.id ?? 0);
    });
  }, [refreshKey, restaurantId, service.id]);

  const resolvedFlow = flow ?? normalizeFlow(service.flow_config);
  const rules = resolvedFlow.pricing?.rules ?? [];
  const choiceSteps = resolvedFlow.steps.filter((step) => step.kind === 'single_choice' && step.options?.length);
  const schedule = resolvedFlow.steps.find((step) => step.kind === 'schedule')?.schedule;
  const simulatorContext = {
    guest_count: String(guests),
    weekday,
    session_id: slotId,
    start_time: startTime,
    ...Object.fromEntries(Object.entries(answers).map(([key, value]) => [`answer:${key}`, value])),
  };
  const selectedItem = items.find((item) => item.id === selectedItemId);
  const { matchingSpecific, matched, rate: simulatedRate } = resolveCateringPricingPreview(rules, selectedItem, simulatorContext);

  return (
    <section aria-label={t('catering_pricing_simulator')} className="overflow-hidden rounded-2xl border border-[var(--divider)] bg-[var(--surface)] shadow-sm">
      <header className="flex items-start gap-3 border-b border-[var(--divider)] p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-700"><EyeIcon className="h-5 w-5" /></span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">{t('catering_workspace_preview_eyebrow')}</p>
          <h2 className="mt-0.5 font-semibold text-fg-primary">{t('catering_workspace_preview_title')}</h2>
          <p className="mt-1 text-xs leading-5 text-fg-tertiary">{t('catering_workspace_preview_hint')}</p>
        </div>
      </header>

      <div className="space-y-3 p-4">
        <Field label={t('catering_pricing_formula')}>
          <select className="input" value={selectedItemId} onChange={(event) => setSelectedItemId(Number(event.target.value))}>
            {items.length === 0 && <option value={0}>{t('catering_empty_items')}</option>}
            {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label={t('catering_pricing_guests')}>
          <input className="input" type="number" min={1} value={guests} onChange={(event) => setGuests(Math.max(1, Number(event.target.value)))} />
        </Field>
        {choiceSteps.map((step) => (
          <Field key={step.id} label={step.title}>
            <select className="input" value={answers[step.id] ?? ''} onChange={(event) => setAnswers({ ...answers, [step.id]: event.target.value })}>
              <option value="">{t('catering_pricing_any')}</option>
              {step.options?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </Field>
        ))}

        <details className="group rounded-xl border border-[var(--divider)] bg-[var(--surface-subtle)]" {...(!compact ? { open: true } : {})}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-fg-secondary">
            {t('catering_workspace_preview_context')}
            <ChevronDownIcon className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 border-t border-[var(--divider)] p-3">
            <Field label={t('catering_pricing_day')}>
              <select className="input" value={weekday} onChange={(event) => setWeekday(event.target.value)}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{t(`catering_flow_weekday_${day}`)}</option>)}</select>
            </Field>
            {(schedule?.slots?.length ?? 0) > 0 && <Field label={t('catering_pricing_session')}>
              <select className="input" value={slotId} onChange={(event) => setSlotId(event.target.value)}><option value="">{t('catering_pricing_any')}</option>{schedule?.slots?.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}</select>
            </Field>}
            <Field label={t('catering_pricing_time')}>
              <input className="input" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </Field>
          </div>
        </details>
      </div>

      <div className={`relative overflow-hidden p-5 text-white ${matchingSpecific.length > 1 ? 'bg-red-600' : 'bg-neutral-950'}`}>
        <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-brand-500/25" />
        <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">{t('catering_pricing_result')}</p>
        <div className="relative mt-3 flex items-end justify-between gap-3">
          <div><strong className="text-3xl">{simulatedRate === undefined ? '—' : `₪${simulatedRate.toLocaleString()}`}</strong><p className="text-xs text-white/55">{t('catering_pricing_per_guest')}</p></div>
          <div className="text-end"><p className="text-xs text-white/55">{t('catering_pricing_total')}</p><strong className="text-lg">{simulatedRate === undefined ? '—' : `₪${(simulatedRate * guests).toLocaleString()}`}</strong></div>
        </div>
        <p className="relative mt-4 flex items-start gap-2 border-t border-white/15 pt-3 text-xs leading-5 text-white/70">
          <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
          {matchingSpecific.length > 1 ? t('catering_pricing_conflict') : matched ? `${t('catering_pricing_rule_applied')} ${matched.label}` : t('catering_pricing_legacy_fallback')}
        </p>
      </div>
    </section>
  );
}

export default function CateringPricingEditor({ restaurantId, service, canEdit, onSaved, onDraftChange, showSimulator = true, refreshKey = 0 }: {
  restaurantId: number;
  service: CateringService;
  canEdit: boolean;
  onSaved: (service: CateringService) => void;
  onDraftChange?: (flow: CateringFlowConfig) => void;
  showSimulator?: boolean;
  refreshKey?: number;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<CateringCatalogItem[]>([]);
  const [flow, setFlow] = useState<CateringFlowConfig>(() => normalizeFlow(service.flow_config));
  const [selectedItemId, setSelectedItemId] = useState(0);
  const [guests, setGuests] = useState(30);
  const [weekday, setWeekday] = useState('5');
  const [slotId, setSlotId] = useState('');
  const [startTime, setStartTime] = useState('19:00');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listCateringItems(restaurantId, service.id).then((next) => {
      setItems(next);
      setSelectedItemId((current) => current || next[0]?.id || 0);
    });
  }, [refreshKey, restaurantId, service.id]);

  useEffect(() => {
    setFlow(normalizeFlow(service.flow_config));
  }, [service.flow_config]);

  useEffect(() => {
    onDraftChange?.(flow);
  }, [flow, onDraftChange]);

  const rules = flow.pricing?.rules ?? [];
  const choiceSteps = useMemo(() => flow.steps.filter((step) => step.kind === 'single_choice' && step.options?.length), [flow.steps]);
  const schedule = flow.steps.find((step) => step.kind === 'schedule')?.schedule;
  const selectedRules = rules.filter((rule) => rule.catalog_item_id === selectedItemId);
  const simulatorContext = useMemo(() => ({
    guest_count: String(guests),
    weekday,
    session_id: slotId,
    start_time: startTime,
    ...Object.fromEntries(Object.entries(answers).map(([key, value]) => [`answer:${key}`, value])),
  }), [answers, guests, slotId, startTime, weekday]);
  const selectedItem = items.find((item) => item.id === selectedItemId);
  const { matchingSpecific, matched, rate: simulatedRate } = resolveCateringPricingPreview(rules, selectedItem, simulatorContext);

  const updateRule = (id: string, patch: Partial<CateringPricingRule>) => {
    setSaved(false);
    setError('');
    setFlow((current) => ({ ...current, version: 3, pricing: { rules: (current.pricing?.rules ?? []).map((rule) => rule.id === id ? { ...rule, ...patch } : rule) } }));
  };
  const setRuleCondition = (rule: CateringPricingRule, factor: CateringPricingCondition['factor'], next?: CateringPricingCondition) => {
    const conditions = (rule.conditions ?? []).filter((candidate) => candidate.factor !== factor);
    updateRule(rule.id, { conditions: next ? [...conditions, next] : conditions });
  };
  const addRule = () => {
    if (!selectedItemId) return;
    const hasFallback = selectedRules.some((rule) => !rule.conditions?.length);
    const next: CateringPricingRule = {
      id: nextRuleId(rules),
      label: hasFallback ? t('catering_pricing_new_rule') : t('catering_pricing_fallback'),
      catalog_item_id: selectedItemId,
      catalog_per_guest_rate: selectedItem?.base_price ?? 0,
      conditions: hasFallback ? [{ factor: 'guest_count', operator: 'between', min_value: '1', max_value: '30' }] : [],
    };
    setFlow({ ...flow, version: 3, pricing: { rules: [...rules, next] } });
    setSaved(false);
  };
  const removeRule = (id: string) => {
    setFlow({ ...flow, pricing: { rules: rules.filter((rule) => rule.id !== id) } });
    setSaved(false);
  };
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await updateCateringServiceFlow(restaurantId, service.id, { ...flow, version: 3 });
      onSaved(updated);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('catering_pricing_save_error'));
    } finally {
      setSaving(false);
    }
  };

  if (service.pricing_model !== 'per_person') {
    return <div className="rounded-2xl border border-[var(--divider)] bg-[var(--surface)] p-8 text-center text-fg-secondary">{t('catering_pricing_per_person_only')}</div>;
  }

  return <div className="space-y-5">
    {showSimulator && <section className="overflow-hidden rounded-2xl border border-[var(--divider)] bg-[var(--surface)]">
      <div className="border-b border-[var(--divider)] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">{t('catering_pricing_eyebrow')}</p>
        <h2 className="mt-1 text-xl font-semibold text-fg-primary">{t('catering_pricing_title')}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-secondary">{t('catering_pricing_hint')}</p>
      </div>

      <div className="grid gap-5 bg-[var(--surface-subtle)] p-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,.75fr)] sm:p-5">
        <div className="rounded-xl border border-[var(--divider)] bg-[var(--surface)] p-4">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/10 text-brand-600"><CalculatorIcon className="h-5 w-5" /></span>
            <div><h3 className="font-semibold text-fg-primary">{t('catering_pricing_simulator')}</h3><p className="text-xs text-fg-tertiary">{t('catering_pricing_simulator_hint')}</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label={t('catering_pricing_formula')}><select className="input" value={selectedItemId} onChange={(event) => setSelectedItemId(Number(event.target.value))}>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label={t('catering_pricing_guests')}><input className="input" type="number" min={1} value={guests} onChange={(event) => setGuests(Math.max(1, Number(event.target.value)))} /></Field>
            <Field label={t('catering_pricing_day')}><select className="input" value={weekday} onChange={(event) => setWeekday(event.target.value)}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{t(`catering_flow_weekday_${day}`)}</option>)}</select></Field>
            {(schedule?.slots?.length ?? 0) > 0 && <Field label={t('catering_pricing_session')}><select className="input" value={slotId} onChange={(event) => setSlotId(event.target.value)}><option value="">{t('catering_pricing_any')}</option>{schedule?.slots?.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}</select></Field>}
            <Field label={t('catering_pricing_time')}><input className="input" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></Field>
            {choiceSteps.map((step) => <Field key={step.id} label={step.title}><select className="input" value={answers[step.id] ?? ''} onChange={(event) => setAnswers({ ...answers, [step.id]: event.target.value })}><option value="">{t('catering_pricing_any')}</option>{step.options?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Field>)}
          </div>
        </div>

        <div className={`relative overflow-hidden rounded-xl p-5 text-white ${matchingSpecific.length > 1 ? 'bg-red-600' : 'bg-neutral-900'}`}>
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand-500/25" />
          <p className="relative text-xs font-bold uppercase tracking-[0.14em] text-white/60">{t('catering_pricing_result')}</p>
          <p className="relative mt-4 text-4xl font-bold">{simulatedRate === undefined ? '—' : `₪${simulatedRate.toLocaleString()}`}</p>
          <p className="relative text-sm text-white/60">{t('catering_pricing_per_guest')}</p>
          <div className="relative mt-5 border-t border-white/15 pt-4">
            <div className="flex items-center justify-between gap-3"><span className="text-sm text-white/60">{t('catering_pricing_total')}</span><strong className="text-xl">{simulatedRate === undefined ? '—' : `₪${(simulatedRate * guests).toLocaleString()}`}</strong></div>
            <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-white/70"><ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />{matchingSpecific.length > 1 ? t('catering_pricing_conflict') : matched ? `${t('catering_pricing_rule_applied')} ${matched.label}` : t('catering_pricing_legacy_fallback')}</p>
          </div>
        </div>
      </div>
    </section>}

    <section className="rounded-2xl border border-[var(--divider)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h3 className="text-lg font-semibold text-fg-primary">{t('catering_pricing_rules')}</h3><p className="mt-1 text-sm text-fg-secondary">{t('catering_pricing_rules_hint')}</p></div>
        {canEdit && <Button variant="primary" size="md" onClick={addRule}><PlusIcon />{t('catering_pricing_add_rule')}</Button>}
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => <button key={item.id} type="button" onClick={() => setSelectedItemId(item.id)} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition ${selectedItemId === item.id ? 'border-brand-500 bg-brand-500 text-white' : 'border-[var(--divider)] bg-[var(--surface-subtle)] text-fg-secondary hover:text-fg-primary'}`}>{item.name}</button>)}
      </div>
      {selectedRules.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-[var(--divider)] p-8 text-center text-sm text-fg-secondary">{t('catering_pricing_empty')}</div> : <div className="mt-4 space-y-3">{selectedRules.map((rule) => <RuleCard key={rule.id} rule={rule} choiceSteps={choiceSteps} slots={schedule?.slots ?? []} canEdit={canEdit} onChange={updateRule} onCondition={setRuleCondition} onRemove={() => removeRule(rule.id)} />)}</div>}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--divider)] pt-4">
        {error && <span className="me-auto text-sm text-red-500">{error}</span>}
        {saved && <span className="text-sm text-emerald-600">{t('catering_flow_saved')}</span>}
        {canEdit && <Button variant="primary" size="md" disabled={saving || matchingSpecific.length > 1} onClick={save}>{saving ? t('saving') : t('catering_pricing_publish')}</Button>}
      </div>
    </section>
  </div>;
}

function RuleCard({ rule, choiceSteps, slots, canEdit, onChange, onCondition, onRemove }: {
  rule: CateringPricingRule;
  choiceSteps: CateringFlowStep[];
  slots: NonNullable<CateringFlowStep['schedule']>['slots'];
  canEdit: boolean;
  onChange: (id: string, patch: Partial<CateringPricingRule>) => void;
  onCondition: (rule: CateringPricingRule, factor: CateringPricingCondition['factor'], condition?: CateringPricingCondition) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const guestRange = condition(rule, 'guest_count');
  const day = condition(rule, 'weekday');
  const session = condition(rule, 'session_id');
  const time = condition(rule, 'start_time');
  const isFallback = !rule.conditions?.length;
  return <article className="rounded-xl border border-[var(--divider)] bg-[var(--surface-subtle)] p-4">
    <div className="grid gap-3 lg:grid-cols-[1.2fr_180px_auto]">
      <Field label={t('catering_pricing_rule_name')}><input className="input" disabled={!canEdit} value={rule.label} onChange={(event) => onChange(rule.id, { label: event.target.value })} /></Field>
      <Field label={t('catering_pricing_rate')}><div className="relative"><span className="pointer-events-none absolute inset-y-0 start-3 flex items-center font-semibold text-fg-tertiary">₪</span><input className="input !ps-8" type="number" min={0} step="0.01" disabled={!canEdit} value={rule.catalog_per_guest_rate} onChange={(event) => onChange(rule.id, { catalog_per_guest_rate: Number(event.target.value) })} /></div></Field>
      {canEdit && <button type="button" aria-label={t('delete')} onClick={onRemove} className="self-end rounded-lg p-3 text-fg-secondary hover:bg-red-500/10 hover:text-red-500"><Trash2Icon className="h-4 w-4" /></button>}
    </div>
    <label className="mt-3 flex items-center gap-2 text-sm font-medium text-fg-primary"><input type="checkbox" checked={isFallback} disabled={!canEdit} onChange={(event) => onChange(rule.id, { conditions: event.target.checked ? [] : [{ factor: 'guest_count', operator: 'between', min_value: '1', max_value: '30' }] })} />{t('catering_pricing_use_fallback')}</label>
    {!isFallback && <div className="mt-4 grid gap-3 border-t border-[var(--divider)] pt-4 sm:grid-cols-2 xl:grid-cols-4">
      <Field label={t('catering_pricing_guest_range')}><div className="grid grid-cols-2 gap-2"><input className="input" type="number" min={1} placeholder={t('catering_pricing_min')} disabled={!canEdit} value={guestRange?.min_value ?? ''} onChange={(event) => onCondition(rule, 'guest_count', event.target.value ? { factor: 'guest_count', operator: 'between', min_value: event.target.value, max_value: guestRange?.max_value ?? '999' } : undefined)} /><input className="input" type="number" min={1} placeholder={t('catering_pricing_max')} disabled={!canEdit} value={guestRange?.max_value ?? ''} onChange={(event) => onCondition(rule, 'guest_count', event.target.value ? { factor: 'guest_count', operator: 'between', min_value: guestRange?.min_value ?? '1', max_value: event.target.value } : undefined)} /></div></Field>
      <Field label={t('catering_pricing_day')}><select className="input" disabled={!canEdit} value={day?.value ?? ''} onChange={(event) => onCondition(rule, 'weekday', event.target.value === '' ? undefined : { factor: 'weekday', operator: 'equals', value: event.target.value })}><option value="">{t('catering_pricing_any')}</option>{WEEKDAYS.map((weekday, index) => <option key={weekday} value={index}>{t(`catering_flow_weekday_${weekday}`)}</option>)}</select></Field>
      {(slots?.length ?? 0) > 0 && <Field label={t('catering_pricing_session')}><select className="input" disabled={!canEdit} value={session?.value ?? ''} onChange={(event) => onCondition(rule, 'session_id', event.target.value === '' ? undefined : { factor: 'session_id', operator: 'equals', value: event.target.value })}><option value="">{t('catering_pricing_any')}</option>{slots?.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}</select></Field>}
      <Field label={t('catering_pricing_time_range')}><div className="grid grid-cols-2 gap-2"><input className="input" type="time" disabled={!canEdit} value={time?.min_value ?? ''} onChange={(event) => onCondition(rule, 'start_time', event.target.value ? { factor: 'start_time', operator: 'between', min_value: event.target.value, max_value: time?.max_value ?? '23:59' } : undefined)} /><input className="input" type="time" disabled={!canEdit} value={time?.max_value ?? ''} onChange={(event) => onCondition(rule, 'start_time', event.target.value ? { factor: 'start_time', operator: 'between', min_value: time?.min_value ?? '00:00', max_value: event.target.value } : undefined)} /></div></Field>
      {choiceSteps.map((step) => { const selected = condition(rule, `answer:${step.id}`); return <Field key={step.id} label={step.title}><select className="input" disabled={!canEdit} value={selected?.value ?? ''} onChange={(event) => onCondition(rule, `answer:${step.id}`, event.target.value === '' ? undefined : { factor: `answer:${step.id}`, operator: 'equals', value: event.target.value })}><option value="">{t('catering_pricing_any')}</option>{step.options?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Field>; })}
    </div>}
  </article>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold text-fg-secondary">{label}</span>{children}</label>;
}
