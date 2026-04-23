'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getRestaurant, updateRestaurant, type Restaurant } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button, Field, Input, PageHead, Section, Textarea } from '@/components/ds';

export default function BrandingSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    logo_url: '',
  });

  useEffect(() => {
    getRestaurant(rid)
      .then((r) => {
        setRestaurant(r);
        setForm({
          name: r.name ?? '',
          description: r.description ?? '',
          logo_url: (r as Restaurant & { logo_url?: string }).logo_url ?? '',
        });
      })
      .finally(() => setLoading(false));
  }, [rid]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRestaurant(rid, { ...form });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
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

  const initial = (form.name?.trim().charAt(0) || 'F').toUpperCase();

  return (
    <div className="max-w-3xl space-y-[var(--s-5)]">
      <PageHead
        title={t('branding') || 'Image de marque'}
        desc={
          t('brandingDesc') ||
          "Comment votre restaurant apparaît sur le site, les tickets et les notifications."
        }
      />

      <Section title={t('logo') || 'Logo'} desc={t('logoDesc') || 'Carré, 512×512 px minimum, fond transparent recommandé.'}>
        <div className="flex items-center gap-[var(--s-4)]">
          <div
            className="w-20 h-20 rounded-r-lg grid place-items-center text-white font-bold text-fs-2xl shadow-2"
            style={{ background: 'linear-gradient(135deg, var(--brand-400), var(--brand-600))' }}
          >
            {form.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.logo_url}
                alt={form.name}
                className="w-full h-full object-cover rounded-r-lg"
              />
            ) : (
              initial
            )}
          </div>
          <Field label={t('logoUrl') || 'URL du logo'} hint={t('logoUrlHint') || 'Téléversement direct à venir.'}>
            <Input
              value={form.logo_url}
              onChange={(e) => setForm((p) => ({ ...p, logo_url: e.target.value }))}
              placeholder="https://…"
            />
          </Field>
        </div>
      </Section>

      <Section
        title={t('publicIdentity') || 'Identité publique'}
        desc={t('publicIdentityDesc') || "Affichée sur le site de commande, les reçus et les notifications."}
      >
        <div className="flex flex-col gap-[var(--s-4)]">
          <Field label={t('name') || 'Nom'}>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </Field>
          <Field
            label={t('tagline') || 'Description courte'}
            hint={t('taglineHint') || 'Une phrase qui décrit votre restaurant.'}
          >
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder={t('taglinePlaceholder') || 'Cuisine méditerranéenne au coeur de Tel Aviv'}
            />
          </Field>
        </div>
      </Section>

      <div className="flex items-center gap-[var(--s-3)]">
        <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('saveChanges')}
        </Button>
        {saved && (
          <span className="text-fs-sm text-[var(--success-500)] font-medium">
            {t('saved')}
          </span>
        )}
      </div>
    </div>
  );
}
