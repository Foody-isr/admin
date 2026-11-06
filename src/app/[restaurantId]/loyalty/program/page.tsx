import LoyaltyProgramWorkspace, { LoyaltyProgramUnavailable } from '@/components/loyalty/LoyaltyProgramWorkspace';
import { loyaltyProgramEnabled } from '@/lib/loyalty-program';

/** Independent opt-in leaves default navigation and API traffic unchanged. */
export default function LoyaltyProgramPage() {
  return loyaltyProgramEnabled ? <LoyaltyProgramWorkspace /> : <LoyaltyProgramUnavailable />;
}
