import type { CateringBalanceHold } from './api';

const states = ['none', 'creating', 'pending', 'authorized', 'authorization_unknown', 'expired', 'failed', 'declined', 'capture_processing', 'capture_unknown', 'capture_completed', 'capture_declined', 'release_processing', 'release_unknown', 'released'] as const;

/** Unknown gateway states fail closed, never implying payment or authorization. */
export function cateringBalanceStatusKey(status: string): string {
  return `catering_balance_status_${states.find(state => state === status) ?? 'authorization_unknown'}`;
}

/** Mutating actions are available only on a confirmed, positive balance hold. */
export function cateringBalanceActions(view: CateringBalanceHold): { create: boolean; settle: boolean } {
  return {
    create: view.enabled && view.status === 'none' && view.can_create && view.balance_due > 0,
    settle: view.enabled && view.status === 'authorized' && view.held_amount > 0 && view.held_amount === view.balance_due && view.captured === 0,
  };
}
