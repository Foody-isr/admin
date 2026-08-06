'use client';

/**
 * Cibus (Pluxee) — settings sub-page.
 * The restaurant enters its own Cibus terminal identity (restaurantID / posID /
 * companyCode). Cibus must first be enabled as the payment provider by a Foody
 * superadmin in the back office; until then the form is locked.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CreditCard } from 'lucide-react';
import { getCibusCreds, updateCibusCreds, CibusCreds } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, Field, Input, PageHead, Section } from '@/components/ds';

export default function CibusSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');

  const [creds, setCreds] = useState<CibusCreds | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [restaurantIdField, setRestaurantIdField] = useState('');
  const [posId, setPosId] = useState('');
  const [companyCode, setCompanyCode] = useState('');

  useEffect(() => {
    getCibusCreds(rid)
      .then((c) => setCreds(c))
      .finally(() => setLoading(false));
  }, [rid]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateCibusCreds(rid, {
        cibus_restaurant_id: restaurantIdField || undefined,
        cibus_pos_id: posId || undefined,
        cibus_company_code: companyCode || undefined,
      });
      setSaved(true);
      setRestaurantIdField('');
      setPosId('');
      setCompanyCode('');
      setCreds(await getCibusCreds(rid));
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
      <PageHead title={t('cibusSettings')} desc={t('cibusSettingsDesc')} />

      {!creds?.enabled ? (
        <Section title={t('cibusSettings')} desc={t('cibusNotEnabledDesc')}>
          <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
            <CreditCard className="w-5 h-5" />
            <span>{t('cibusNotEnabled')}</span>
          </div>
        </Section>
      ) : (
        <Section title={t('cibusCredentialsTitle')} desc={t('cibusCredentialsHint')}>
          <div className="space-y-4 max-w-md">
            <Field label={t('cibusRestaurantId')} grow>
              <Input
                inputMode="numeric"
                value={restaurantIdField}
                onChange={(e) => setRestaurantIdField(e.target.value)}
                placeholder={creds?.masked_restaurant_id || 'e.g. 1001'}
                disabled={!canEdit}
              />
            </Field>
            <Field label={t('cibusPosId')} grow>
              <Input
                inputMode="numeric"
                value={posId}
                onChange={(e) => setPosId(e.target.value)}
                placeholder={creds?.masked_pos_id || 'e.g. 7'}
                disabled={!canEdit}
              />
            </Field>
            <Field label={t('cibusCompanyCode')} grow>
              <Input
                inputMode="numeric"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value)}
                placeholder={creds?.masked_company_code || 'e.g. 42'}
                disabled={!canEdit}
              />
            </Field>

            {canEdit && (
              <div className="flex items-center gap-3 pt-2">
                <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
                  {saving ? t('saving') : t('saveChanges')}
                </Button>
                {saved && <span className="text-sm text-green-600">{t('saved')}</span>}
                {error && <span className="text-sm text-red-600">{error}</span>}
              </div>
            )}
          </div>
        </Section>
      )}
    </>
  );
}
