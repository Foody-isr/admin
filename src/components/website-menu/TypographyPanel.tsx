'use client';

import { useEffect, useMemo } from 'react';
import { useI18n } from '@/lib/i18n';
import type { WebsiteConfig, ThemeCatalog, TypographyPairingEntry } from '@/lib/api';

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
        fontSize: kind === 'display' ? '1rem' : '0.7rem',
        lineHeight: kind === 'display' ? 1.15 : 1.4,
      }}
      className={kind === 'display' ? 'mb-0.5' : 'text-fg-secondary line-clamp-1'}
    >
      {text}
    </div>
  );
}

type Props = {
  config: WebsiteConfig;
  catalog: ThemeCatalog;
  onUpdate: (patch: Partial<WebsiteConfig>) => void;
};

export function TypographyPanel({ config, catalog, onUpdate }: Props) {
  const { t } = useI18n();

  const fontsToLoad = useMemo(() => {
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

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-fg-secondary leading-relaxed">
        {t('typographyIntro')}
      </p>

      <div className="flex flex-col gap-2">
        {catalog.typography_pairings.map((p) => {
          const selected = p.id === config.pairing_id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onUpdate({ pairing_id: p.id })}
              className={`text-start rounded-lg border p-2.5 transition-colors ${
                selected
                  ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500'
                  : 'border-[var(--divider)] hover:border-fg-tertiary'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <span className="text-xs font-semibold">{p.name}</span>
                  <p className="text-[11px] text-fg-secondary mt-0.5 line-clamp-1">{p.description}</p>
                </div>
                {selected && (
                  <span className="text-[9px] uppercase tracking-wider text-brand-500 font-semibold shrink-0">
                    {t('selectedBadge')}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--divider)]">
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-fg-tertiary mb-1">Latin</div>
                  <FontSample pairing={p.pairing} kind="display" dir="ltr" />
                  <FontSample pairing={p.pairing} kind="body" dir="ltr" />
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-fg-tertiary mb-1">עברית</div>
                  <FontSample pairing={p.pairing} kind="display" dir="rtl" />
                  <FontSample pairing={p.pairing} kind="body" dir="rtl" />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
