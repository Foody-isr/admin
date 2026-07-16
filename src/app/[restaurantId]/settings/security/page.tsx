'use client';

import { useEffect, useState } from 'react';
import { Fingerprint, Trash2, ShieldCheck } from 'lucide-react';
import {
  listPasskeys,
  registerPasskey,
  deletePasskey,
  passkeysSupported,
  clearPasskeyOnDevice,
  PasskeyCredential,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button, Field, Input, PageHead, Section } from '@/components/ds';

/**
 * Security settings — passkey (Face ID / Touch ID) management. Passkeys are
 * scoped to the signed-in user, not the restaurant, so this page never passes a
 * restaurant id; the API derives the user from the JWT. It lives under
 * /settings so it appears in the account sub-nav.
 */
export default function SecuritySettingsPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [name, setName] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      passkeysSupported().then(setSupported),
      listPasskeys().then(setPasskeys).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const handleEnroll = async () => {
    setError(null);
    setEnrolling(true);
    try {
      const cred = await registerPasskey(name.trim());
      setPasskeys((prev) => [cred, ...prev]);
      setName('');
    } catch (err: unknown) {
      const errName = (err as { name?: string })?.name;
      if (errName === 'InvalidStateError') {
        setError(t('passkeyAlreadyRegistered'));
      } else if (errName !== 'NotAllowedError' && errName !== 'AbortError') {
        // NotAllowed/Abort = user dismissed the prompt; nothing to report.
        setError(t('passkeyEnrollFailed'));
      }
    } finally {
      setEnrolling(false);
    }
  };

  const handleDelete = async (id: number) => {
    setError(null);
    setDeletingId(id);
    try {
      await deletePasskey(id);
      const next = passkeys.filter((p) => p.id !== id);
      setPasskeys(next);
      // Removing the last passkey makes the device hint stale — forget it so the
      // login screen leads with the password form again.
      if (next.length === 0) clearPasskeyOnDevice();
    } catch {
      setError(t('passkeyDeleteFailed'));
    } finally {
      setDeletingId(null);
    }
  };

  const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : '');

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-[760px]">
      <PageHead title={t('securitySettings')} desc={t('securitySettingsDesc')} />

      <Section
        title={
          <span className="inline-flex items-center gap-2">
            <Fingerprint className="w-4 h-4" />
            {t('passkeysTitle')}
          </span>
        }
        desc={t('passkeysDesc')}
      >
        {!supported ? (
          <div className="text-fs-sm text-[var(--fg-muted)] flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 mt-[2px] shrink-0" />
            {t('passkeysUnsupported')}
          </div>
        ) : (
          <div className="space-y-4">
            {passkeys.length === 0 ? (
              <p className="text-fs-sm text-[var(--fg-muted)]">{t('passkeysEmpty')}</p>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
                {passkeys.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Fingerprint className="w-5 h-5 text-[var(--brand-500)] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-fs-sm font-medium truncate">{p.name}</div>
                        <div className="text-fs-xs text-[var(--fg-muted)]">
                          {t('passkeyAddedOn')} {fmtDate(p.created_at)}
                          {p.last_used_at ? ` · ${t('passkeyLastUsed')} ${fmtDate(p.last_used_at)}` : ''}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => handleDelete(p.id)}
                      disabled={deletingId === p.id}
                      aria-label={t('delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-end gap-2">
              <Field label={t('passkeyNameLabel')} grow>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('passkeyNamePlaceholder')}
                  maxLength={40}
                />
              </Field>
              <Button onClick={handleEnroll} disabled={enrolling} variant="primary" className="gap-2">
                <Fingerprint className="w-4 h-4" />
                {enrolling ? t('passkeyEnrolling') : t('passkeyAdd')}
              </Button>
            </div>

            {error && <p className="text-fs-sm text-[var(--danger-500)]">{error}</p>}
          </div>
        )}
      </Section>
    </div>
  );
}
