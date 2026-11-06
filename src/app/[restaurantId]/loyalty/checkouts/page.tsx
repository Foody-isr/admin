import { loyaltyCheckoutEnabled } from '@/lib/loyalty-checkout';
import LoyaltyCheckoutWorkspace, { LoyaltyCheckoutUnavailable } from '@/components/loyalty/LoyaltyCheckoutWorkspace';

/** This controlled workspace stays absent until the Admin build explicitly opts in. */
export default function LoyaltyCheckoutPage() {
  if (!loyaltyCheckoutEnabled) return <LoyaltyCheckoutUnavailable />;
  return <LoyaltyCheckoutWorkspace />;
}
