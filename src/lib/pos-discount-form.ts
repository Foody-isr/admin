import type { POSDiscountDefinition } from './api';

/** Validates a manual staff reduction without repurposing coupon eligibility rules. */
export function validPOSDiscount(value: POSDiscountDefinition): boolean {
  return !!value.name.trim() && Array.from(value.name.trim()).length <= 80 && !/[\0\r\n]/.test(value.name)
    && (value.type === 'fixed' || value.type === 'percent') && Number.isSafeInteger(value.version) && value.version >= 0
    && Number.isFinite(value.value) && (value.variable ? value.value === 0
      : value.value > 0 && value.value <= 1_000_000 && (value.type !== 'percent' || value.value <= 100)
        && Math.abs(value.value * 100 - Math.round(value.value * 100)) < 0.000001);
}
