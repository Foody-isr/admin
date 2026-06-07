import { MenuGroupMembership } from '@/lib/api';

/**
 * True when the membership window covers `day` (both bounds inclusive,
 * null/undefined = open-ended).
 *
 * `day` is an ISO date string "YYYY-MM-DD". String comparison works because
 * ISO dates are lexicographically ordered.
 */
export function isMembershipActiveOn(m: MenuGroupMembership, day: string): boolean {
  if (m.effective_from && m.effective_from > day) return false;
  if (m.effective_until && m.effective_until < day) return false;
  return true;
}
