'use client';

import { useId, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { compositionPresets, type Composition } from '@/lib/wallet-composition';

type Template = Composition['template'] | 'classic';
const templateKeys = { classic: 'walletArtClassic', table: 'walletArtTable', cafe: 'walletArtCafe' } as const;

/** Choose a starting layout, then edit its individual layers from the private draft. */
export function WalletCompositionEditor({
  value,
  onTemplate,
  onChange,
}: {
  value: Composition | null;
  onTemplate: (template: Template) => void;
  onChange: (value: Composition) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  function patch<K extends keyof Composition>(k: K, v: Composition[K]) {
    if (value) onChange({ ...value, [k]: v });
  }
  type Numeric = { [K in keyof Composition]: Composition[K] extends number ? K : never }[keyof Composition];
  function slider(k: Numeric, label: string, min: number, max: number, unit: string) {
    return (
      <label className="grid gap-1 text-sm" htmlFor={id + k}>
        <span className="flex justify-between gap-2">
          {t(label)}
          <output className="tabular-nums text-[var(--fg-muted)]">
            {value![k]}
            {unit}
          </output>
        </span>
        <input
          id={id + k}
          aria-label={t(label)}
          type="range"
          className="w-full accent-current"
          min={min}
          max={max}
          value={value![k]}
          onChange={(e) => patch(k, Number(e.target.value))}
        />
      </label>
    );
  }
  function select<K extends 'pattern' | 'font' | 'balance' | 'reward'>(
    k: K,
    label: string,
    options: Record<string, string>,
  ) {
    return (
      <label className="grid gap-1 text-sm">
        {t(label)}
        <select
          aria-label={t(label)}
          className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] p-2"
          value={value![k]}
          onChange={(e) => patch(k, e.target.value as Composition[K])}
        >
          {Object.entries(options).map(([key, name]) => (
            <option key={key} value={key}>
              {t(name)}
            </option>
          ))}
        </select>
      </label>
    );
  }
  function toggle(k: 'trim_logo' | 'trim_photo' | 'photo_front', text: string) {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value![k]} onChange={(e) => patch(k, e.target.checked)} />
        {t(text)}
      </label>
    );
  }
  function color(k: 'accent' | 'detail' | 'footer' | 'title_color', label: string) {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          aria-label={t(label)}
          type="color"
          value={value![k]}
          onChange={(e) => patch(k, e.target.value.toUpperCase())}
        />
        <span>
          {t(label)}
          <small dir="ltr" className="block text-[var(--fg-muted)]">
            {value![k]}
          </small>
        </span>
      </label>
    );
  }
  function section(label: string, body: ReactNode) {
    return (
      <details className="border-t border-[var(--line)] py-2">
        <summary className="cursor-pointer py-1 text-sm font-semibold">{t(label)}</summary>
        <div className="grid gap-3 px-1 py-3 sm:grid-cols-2">{body}</div>
      </details>
    );
  }
  return (
    <div className="space-y-3" data-wallet-composer>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t('walletArtModel')}</legend>
        <div className="grid grid-cols-3 gap-2">
          {(['classic', 'table', 'cafe'] as const).map((k) => {
            const selected = (value?.template ?? 'classic') === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  if (!selected) onTemplate(k);
                }}
                className="min-w-0 overflow-hidden rounded-lg border border-[var(--line)] text-start focus-visible:outline-2 aria-pressed:ring-2 aria-pressed:ring-[var(--fg)]"
              >
                <span
                  aria-hidden="true"
                  className="relative block h-10 overflow-hidden"
                  style={{
                    background: k === 'classic' ? 'var(--surface-subtle)' : compositionPresets[k].background,
                  }}
                >
                  {k === 'table' && (
                    <span
                      className="absolute -inset-x-2 top-4 h-5 rotate-3"
                      style={{
                        backgroundColor: '#FBF1DB',
                        backgroundImage:
                          'repeating-linear-gradient(0deg,transparent 0 4px,#C275545c 4px 8px),repeating-linear-gradient(90deg,transparent 0 4px,#C275545c 4px 8px)',
                      }}
                    />
                  )}
                  {k === 'cafe' && (
                    <>
                      <span className="absolute -right-2 -top-6 h-16 w-16 rounded-full border-4 border-[#ef83a2]" />
                      <span className="absolute -bottom-5 -right-4 h-10 w-[120%] -rotate-6 rounded-[50%] border-t-4 border-[#fff1d9] bg-[#4f210f]" />
                    </>
                  )}
                  {k === 'classic' && <span className="absolute inset-x-0 bottom-2 h-2 bg-[var(--line)]" />}
                </span>
                <span className="block px-2 py-2 text-xs font-medium">{t(templateKeys[k])}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      {value && (
        <>
          {section(
            'walletArtTitle',
            <>
              <label className="grid gap-1 text-sm sm:col-span-2">
                {t('walletArtTitleText')}
                <textarea
                  dir="auto"
                  rows={2}
                  maxLength={80}
                  value={value.title}
                  className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-2"
                  onChange={(e) => patch('title', e.target.value.split('\n').slice(0, 2).join('\n'))}
                />
              </label>
              {select('font', 'walletArtFont', {
                serif: 'walletArtSerif',
                rounded: 'walletArtRounded',
                sans: 'walletArtSans',
              })}
              {color('title_color', 'walletArtTitleInk')}
              {slider('title_size', 'walletArtSize', 16, 96, ' px')}
              {slider('title_angle', 'walletArtAngle', -45, 45, '°')}
              {slider('title_x', 'walletArtX', 0, 95, '%')}
              {slider('title_y', 'walletArtY', 0, 75, '%')}
            </>,
          )}
          {section(
            'walletArtDecor',
            <>
              {select('pattern', 'walletArtPattern', {
                gingham: 'walletArtGingham',
                waves: 'walletArtWaves',
                none: 'walletArtPlain',
              })}
              {color('footer', 'walletArtFooter')}
              {color('accent', 'walletArtAccent')}
              {color('detail', 'walletArtDetail')}
              {slider('seam', 'walletArtSeam', 35, 80, '%')}
              {value.pattern !== 'none' && (
                <>
                  {slider('pattern_size', 'walletArtSize', 6, 40, ' px')}
                  {slider('pattern_opacity', 'walletArtOpacity', 0, 100, '%')}
                  {slider('pattern_angle', 'walletArtAngle', -25, 25, '°')}
                </>
              )}
            </>,
          )}
          {section(
            'walletArtPhoto',
            <>
              {slider('photo_x', 'walletArtX', -50, 100, '%')}
              {slider('photo_y', 'walletArtY', -30, 80, '%')}
              {slider('photo_width', 'walletArtWidth', 10, 160, '%')}
              {slider('photo_height', 'walletArtHeight', 5, 100, '%')}
              {slider('warmth', 'walletArtWarmth', 0, 100, '%')}
              {slider('shade', 'walletArtShade', 0, 100, '%')}
              {toggle('trim_photo', 'walletArtTrim')}
              {toggle('photo_front', 'walletArtFront')}
            </>,
          )}
          {section(
            'walletArtFields',
            <>
              {select('balance', 'walletArtBalance', {
                count: 'walletArtCount',
                fraction: 'walletArtFraction',
              })}
              {select('reward', 'walletArtReward', {
                remaining: 'walletArtRemaining',
                benefit: 'walletArtBenefit',
              })}
              {slider('logo_scale', 'walletArtLogoSize', 40, 100, '%')}
              {toggle('trim_logo', 'walletArtLogoTrim')}
            </>,
          )}
        </>
      )}
    </div>
  );
}
