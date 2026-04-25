'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Edit, Save } from 'lucide-react';
import { getRestaurant, updateRestaurant, type Restaurant } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button, Field, Input, PageHead, Section, Select } from '@/components/ds';

interface BrandingForm {
  name: string;
  description: string;
  short_tagline: string;
  logo_url: string;
}

const DEFAULT_COLORS = [
  { key: 'primary', label: 'Primaire', value: '#F97316' },
  { key: 'accent', label: 'Accent', value: '#FB923C' },
  { key: 'background', label: 'Fond', value: '#0A0A0B' },
  { key: 'text', label: 'Texte', value: '#EDEDEF' },
] as const;

export default function BrandingSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<BrandingForm>({
    name: '',
    description: '',
    short_tagline: '',
    logo_url: '',
  });

  const [colors, setColors] = useState<Record<string, string>>(
    Object.fromEntries(DEFAULT_COLORS.map((c) => [c.key, c.value])),
  );
  const [headingFont, setHeadingFont] = useState('Instrument Serif');
  const [bodyFont, setBodyFont] = useState('Geist');

  useEffect(() => {
    getRestaurant(rid)
      .then((r) => {
        setRestaurant(r);
        setForm({
          name: r.name ?? '',
          description: r.description ?? '',
          short_tagline: '',
          logo_url: (r as Restaurant & { logo_url?: string }).logo_url ?? '',
        });
      })
      .finally(() => setLoading(false));
  }, [rid]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRestaurant(rid, {
        name: form.name,
        description: form.description,
        logo_url: form.logo_url,
      });
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
    <div className="max-w-[880px]">
      <PageHead
        title={t('branding') || 'Image de marque'}
        desc={t('brandingDesc') || 'Logo, couleurs, et apparence de vos supports clients.'}
        actions={
          <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
            <Save />
            {saving ? t('saving') : t('saveChanges')}
          </Button>
        }
      />
      {saved && (
        <div className="text-fs-sm text-[var(--success-500)] font-medium mb-[var(--s-4)]">
          {t('saved')}
        </div>
      )}

      <Section title={t('logoAndIdentity') || 'Logo et identité'}>
        <div
          className="grid gap-[var(--s-5)]"
          style={{ gridTemplateColumns: '200px 1fr' }}
        >
          <div
            className="aspect-square rounded-r-lg grid place-items-center text-white font-bold overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, var(--brand-400), var(--brand-600))',
              fontSize: 72,
              letterSpacing: '-0.04em',
              fontFamily: 'var(--font-serif)',
            }}
          >
            {form.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.logo_url}
                alt={form.name}
                className="w-full h-full object-cover"
              />
            ) : (
              initial
            )}
          </div>
          <div className="flex flex-col gap-[var(--s-3)]">
            <div className="flex items-center gap-[var(--s-2)]">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const url = window.prompt(t('logoUrlPrompt') || 'URL du logo:', form.logo_url);
                  if (url !== null) setForm((p) => ({ ...p, logo_url: url }));
                }}
              >
                <Edit />
                {t('changeLogo') || 'Changer le logo'}
              </Button>
              {form.logo_url && (
                <button
                  type="button"
                  className="text-fs-sm text-[var(--fg-muted)] hover:text-[var(--fg)] px-[var(--s-2)]"
                  onClick={() => setForm((p) => ({ ...p, logo_url: '' }))}
                >
                  {t('remove') || 'Supprimer'}
                </button>
              )}
            </div>
            <Field
              label={t('tagline') || 'Slogan'}
              hint={t('taglineHintBranding') || "Affiché sur la page d'accueil de votre menu en ligne."}
            >
              <Input
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </Field>
            <Field
              label={t('shortTagline') || 'Slogan court'}
              hint={t('shortTaglineHint') || 'Pour les reçus (40 car. max).'}
            >
              <Input
                maxLength={40}
                value={form.short_tagline}
                onChange={(e) => setForm((p) => ({ ...p, short_tagline: e.target.value }))}
                placeholder="Cuisine maison · depuis 2019"
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section
        title={t('colors') || 'Couleurs'}
        desc={t('colorsDesc') || 'Appliquées à votre menu en ligne et aux emails clients.'}
      >
        <div className="flex flex-wrap gap-[var(--s-3)]">
          {DEFAULT_COLORS.map((c) => (
            <label
              key={c.key}
              className="flex items-center gap-[var(--s-3)] p-[var(--s-3)] bg-[var(--surface)] border border-[var(--line)] rounded-r-md cursor-pointer"
              style={{ flex: '1 1 200px' }}
            >
              <span
                className="w-11 h-11 rounded-r-sm border border-[var(--line)] shrink-0 relative overflow-hidden"
                style={{ background: colors[c.key] ?? c.value }}
              >
                <input
                  type="color"
                  value={colors[c.key] ?? c.value}
                  onChange={(e) =>
                    setColors((p) => ({ ...p, [c.key]: e.target.value }))
                  }
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
                  {t(c.key + 'Color') || c.label}
                </span>
                <span className="block font-mono text-fs-sm text-[var(--fg)]">
                  {(colors[c.key] ?? c.value).toUpperCase()}
                </span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <Section title={t('typography') || 'Typographie'}>
        <div className="flex gap-[var(--s-4)] flex-wrap">
          <Field grow label={t('headingFont') || 'Police titres'}>
            <Select
              value={headingFont}
              onChange={(e) => setHeadingFont(e.target.value)}
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              <option>Instrument Serif</option>
              <option>Geist</option>
              <option>Playfair Display</option>
            </Select>
          </Field>
          <Field grow label={t('bodyFont') || 'Police corps'}>
            <Select value={bodyFont} onChange={(e) => setBodyFont(e.target.value)}>
              <option>Geist</option>
              <option>Inter</option>
              <option>System UI</option>
            </Select>
          </Field>
        </div>
        <div
          className="mt-[var(--s-4)] p-[var(--s-5)] bg-[var(--surface)] border border-[var(--line)] rounded-r-md"
        >
          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 40,
              letterSpacing: '-0.02em',
              marginBottom: 8,
              color: 'var(--fg)',
            }}
          >
            {t('stylePreview') || 'Aperçu du style'}
          </div>
          <div className="text-fs-sm text-[var(--fg-subtle)] leading-[1.6]">
            {t('stylePreviewBody') ||
              'Voici à quoi ressembleront vos titres et votre texte sur votre menu en ligne et vos emails clients.'}
          </div>
        </div>
      </Section>
    </div>
  );
}
