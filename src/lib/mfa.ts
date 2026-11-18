import type { User } from './api';

/** One-use primary-factor proof; keep every field in memory only. */
export interface MFAChallenge {
  mfa_required: true;
  enrollment_required: boolean;
  challenge?: string;
  expires_at?: string;
  secret?: string;
  otpauth_uri?: string;
}
export interface MFAResponse {
  token: string;
  user: User;
  recovery_codes?: string[];
  recovery_used?: boolean;
}
export type MFAReply = MFAResponse | MFAChallenge;
export type MFAPrompt = (challenge: MFAChallenge, verify: (code: string) => Promise<MFAResponse>) => Promise<MFAResponse>;

/** Reject malformed/incomplete replies before any token is persisted. */
export function isMFAChallenge(reply: MFAReply): reply is MFAChallenge {
  return 'mfa_required' in reply && reply.mfa_required === true;
}
export function requireCompleteAuth(reply: MFAReply): MFAResponse {
  if (isMFAChallenge(reply) || !reply.token || !reply.user?.id) throw new Error('Sign-in incomplete');
  return reply;
}
