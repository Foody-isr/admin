// Combo validation. Returns a list of human-readable error messages keyed
// by step.key so the caller can surface them inline. The save button is
// disabled when this returns a non-empty list.

import type { MenuItem } from '@/lib/api';
import type { ComboStepDraft } from './types';
import { buildOptions } from './types';

export interface ComboValidationError {
  /** Empty when the error is global (e.g. "no steps"). */
  stepKey?: string;
  message: string;
}

interface I18nFns {
  noSteps: string;
  stepNoOptions: (stepName: string) => string;
  stepRange: (stepName: string) => string;
  stepNoVariants: (stepName: string, itemName: string) => string;
}

export function validateCombo(
  steps: ComboStepDraft[],
  itemsById: Map<number, MenuItem>,
  i18n: I18nFns,
): ComboValidationError[] {
  const errors: ComboValidationError[] = [];

  if (steps.length === 0) {
    errors.push({ message: i18n.noSteps });
    return errors;
  }

  for (const step of steps) {
    const stepName = step.name || '?';

    if (step.items.length === 0) {
      errors.push({ stepKey: step.key, message: i18n.stepNoOptions(stepName) });
      continue;
    }

    if (step.max_picks > 0 && step.max_picks < step.min_picks) {
      errors.push({ stepKey: step.key, message: i18n.stepRange(stepName) });
    }

    // Per-option variant inclusion: every option that has variants on the
    // source item must include at least one variant, otherwise the customer
    // can't pick anything.
    const opts = buildOptions(step.items, itemsById);
    for (const opt of opts) {
      if (!opt.hasVariants) continue;
      const anyIncluded = opt.variants.some((v) => v.included);
      if (!anyIncluded) {
        errors.push({
          stepKey: step.key,
          message: i18n.stepNoVariants(stepName, opt.itemName),
        });
      }
    }
  }

  return errors;
}
