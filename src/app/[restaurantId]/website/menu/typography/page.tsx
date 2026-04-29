'use client';

import { useEffect, useMemo } from 'react';
import { useI18n } from '@/lib/i18n';
import { useWebsiteMenu } from '@/lib/website-menu-context';
import type { TypographyPairingEntry } from '@/lib/api';

function loadGoogleFont(family: string, weights: number[]) {
  if (typeof document === 'undefined') return;
  const id = `gf-${family.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  const familyParam = family.replace(/\s+/g, '+');
  const weightParam = weights.length > 0 ? `:wght@${[...weights].sort((a, b) => a - b).join(';')}` : '';
  link.href = `https://fonts.googleapis.com/css2?family=${familyParam}${weightParam}&display=swap`;
  document.head.appendChild(link);
}

function FontSample({
  pairing, kind, dir,
}: {
  pairing: TypographyPairingEntry['pairing'];
  kind: 'display' | 'body';
  dir: 'ltr' | 'rtl';
}) {
  const def =
    dir === 'rtl'
      ? kind === 'display' ? pairing.displayHebrew : pairing.bodyHebrew
      : kind === 'display' ? pairing.displayLatin : pairing.bodyLatin;

  const text =
    dir === 'rtl'
      ? kind === 'display' ? 'תפריט הערב' : 'מנה צמחונית עם ירקות עונתיים, רוטב טחינה'
      : kind === 'display' ? 'Tonight’s Menu' : 'Seasonal greens, tahini, slow-roasted pepper.';

  return (
    <div
      dir={dir}
      style={{
        fontFamily: `"${def.family}", system-ui, sans-serif`,
        fontWeight: kind === 'display' ? Math.max(...def.weights) : Math.min(...def.weights),
        fontSize: kind === 'display' ? '1.4rem' : '0.85rem',
        lineHeight: kind === 'display' ? 1.15 : 1.4,
      }}
      className={kind === 'display' ? 'mb-1' : 'text-fg-secondary'}
    >
      {text}
    </div>
  );
}

export default function TypographyPage() {
  const { t } = useI18n();
  const { config, catalog, update } = useWebsiteMenu();

  const fontsToLoad = useMemo(() => {
    if (!catalog) return [];
    const set = new Map<string, number[]>();
    for (const p of catalog.typography_pairings) {
      for (const def of [p.pairing.displayLatin, p.pairing.bodyLatin, p.pairing.displayHebrew, p.pairing.bodyHebrew]) {
        const existing = set.get(def.family) ?? [];
        set.set(def.family, Array.from(new Set([...existing, ...def.weights])));
      }
    }
    return Array.from(set.entries());
  }, [catalog]);

  useEffect(() => {
    fontsToLoad.forEach(([family, weights]) => loadGoogleFont(family, weights));
  }, [fontsToLoad]);

  if (!config || !catalog) return null;

  const selectedPairingId = config.pairing_id;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-8">
      <header>
        <h1 className="text-xl font-semibold mb-1">{t('typography') || 'Typography'}</h1>
        <p className="text-sm text-fg-secondary">
          {t('typographyIntro') ||
            'Each pairing combines a display face and a body face, with matching Hebrew fonts for RTL menus.'}
        </p>
      </header>

      <section className="flex flex-col gap-3">
        {catalog.typography_pairings.map((p) => {
          const selected = p.id === selectedPairingId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => update({ pairing_id: p.id })}
              className={`text-start rounded-xl border p-4 transition-colors ${
                selected
                  ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500'
                  : 'border-[var(--divider)] hover:border-fg-tertiary'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <span className="text-sm font-semibold">{p.name}</span>
                  <p className="text-xs text-fg-secondary mt-0.5">{p.description}</p>
                </div>
                {selected && (
                  <span className="text-[10px] uppercase tracking-wider text-brand-500 font-semibold">
                    {t('selected') || 'Selected'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[var(--divider)]">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-fg-tertiary mb-2">Latin</div>
                  <FontSample pairing={p.pairing} kind="display" dir="ltr" />
                  <FontSample pairing={p.pairing} kind="body" dir="ltr" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-fg-tertiary mb-2">עברית</div>
                  <FontSample pairing={p.pairing} kind="display" dir="rtl" />
                  <FontSample pairing={p.pairing} kind="body" dir="rtl" />
                </div>
              </div>
            </button>
          );
        })}
      </section>
    </div>
  );
}
