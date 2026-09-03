import type {
  CateringFlowConfig,
  CateringPricingCondition,
  CateringPricingRule,
} from '@/lib/api';

export type CateringOfferRateDraft = {
  id: string;
  label: string;
  weekday: string;
  startTime: string;
  endTime: string;
  minGuests: string;
  maxGuests: string;
  serviceModeId: string;
  price: string;
};

const SIMPLE_FACTORS = new Set(['weekday', 'start_time', 'guest_count', 'service_mode']);

export function normalizeCateringFlowConfig(
  raw: CateringFlowConfig | Record<string, never> | undefined,
): CateringFlowConfig {
  if (raw && Array.isArray((raw as CateringFlowConfig).steps)) {
    const flow = raw as CateringFlowConfig;
    return {
      ...flow,
      version: flow.version ?? 3,
      enabled: flow.enabled ?? true,
      steps: flow.steps ?? [],
    };
  }
  return { version: 3, enabled: false, steps: [], pricing: { rules: [] } };
}

export function isSimpleOfferPricingRule(rule: CateringPricingRule): boolean {
  return (rule.conditions ?? []).every((condition) => SIMPLE_FACTORS.has(condition.factor));
}

export function offerRateDrafts(
  flow: CateringFlowConfig,
  catalogItemId: number,
): CateringOfferRateDraft[] {
  return (flow.pricing?.rules ?? [])
    .filter((rule) => rule.catalog_item_id === catalogItemId && isSimpleOfferPricingRule(rule))
    .map((rule) => {
      const weekday = rule.conditions?.find((condition) => condition.factor === 'weekday');
      const time = rule.conditions?.find((condition) => condition.factor === 'start_time');
      const guests = rule.conditions?.find((condition) => condition.factor === 'guest_count');
      const serviceMode = rule.conditions?.find((condition) => condition.factor === 'service_mode');
      return {
        id: rule.id,
        label: rule.label,
        weekday: weekday?.value ?? '',
        startTime: time?.min_value === '00:00' ? '' : time?.min_value ?? '',
        endTime: time?.max_value === '23:59' ? '' : time?.max_value ?? '',
        minGuests: guests?.min_value === '1' ? '' : guests?.min_value ?? '',
        maxGuests: guests?.max_value === '999999' ? '' : guests?.max_value ?? '',
        serviceModeId: serviceMode?.value ?? '',
        price: String(rule.catalog_per_guest_rate),
      };
    });
}

function conditionBetween(factor: 'start_time' | 'guest_count', min: string, max: string): CateringPricingCondition | null {
  if (!min && !max) return null;
  const defaultMin = factor === 'start_time' ? '00:00' : '1';
  const defaultMax = factor === 'start_time' ? '23:59' : '999999';
  return {
    factor,
    operator: 'between',
    min_value: min || defaultMin,
    max_value: max || defaultMax,
  };
}

export function applyOfferRateDrafts(
  flow: CateringFlowConfig,
  catalogItemId: number,
  drafts: CateringOfferRateDraft[],
): CateringFlowConfig {
  const existing = flow.pricing?.rules ?? [];
  const preserved = existing.filter((rule) => (
    rule.catalog_item_id !== catalogItemId || !isSimpleOfferPricingRule(rule)
  ));
  const rules = drafts
    .filter((draft) => draft.label.trim() && Number(draft.price) >= 0 && draft.price.trim() !== '')
    .map<CateringPricingRule>((draft, index) => {
      const conditions: CateringPricingCondition[] = [];
      if (draft.serviceModeId) {
        conditions.push({ factor: 'service_mode', operator: 'equals', value: draft.serviceModeId });
      }
      if (draft.weekday) {
        conditions.push({ factor: 'weekday', operator: 'equals', value: draft.weekday });
      }
      const time = conditionBetween('start_time', draft.startTime, draft.endTime);
      if (time) conditions.push(time);
      const guests = conditionBetween('guest_count', draft.minGuests, draft.maxGuests);
      if (guests) conditions.push(guests);
      return {
        id: draft.id || `offer-${catalogItemId}-rate-${index + 1}`,
        label: draft.label.trim(),
        catalog_item_id: catalogItemId,
        conditions,
        catalog_per_guest_rate: Number(draft.price),
      };
    });
  return {
    ...flow,
    version: 3,
    pricing: { ...flow.pricing, rules: [...preserved, ...rules] },
  };
}

/** Removes obsolete group-wide fulfilment questions once modes are managed on
 * each offer. Dependent questions are removed too, avoiding dangling required
 * steps which the guest can no longer answer. */
export function removeLegacyGlobalServiceModeSteps(flow: CateringFlowConfig): CateringFlowConfig {
  const legacyIDs = new Set(flow.steps
    .filter((step) => step.kind === 'single_choice' && (step.options ?? []).some((option) => option.price_effect === 'replace_catalog_per_guest'))
    .map((step) => step.id));
  if (legacyIDs.size === 0) return flow;

  let changed = true;
  while (changed) {
    changed = false;
    for (const step of flow.steps) {
      if (!legacyIDs.has(step.id) && step.condition && legacyIDs.has(step.condition.step_id)) {
        legacyIDs.add(step.id);
        changed = true;
      }
    }
  }
  const steps = flow.steps.filter((step) => !legacyIDs.has(step.id));
  const rules = (flow.pricing?.rules ?? []).filter((rule) => !(rule.conditions ?? []).some((condition) => (
    condition.factor.startsWith('answer:') && legacyIDs.has(condition.factor.slice('answer:'.length))
  )));
  return {
    ...flow,
    enabled: steps.length > 0 ? flow.enabled : false,
    steps,
    pricing: { ...flow.pricing, rules },
  };
}
