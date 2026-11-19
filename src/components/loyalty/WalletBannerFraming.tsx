'use client';

import { useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { BooleanInput, Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { defaultBannerLayout, walletBannerSize, walletFrame, type WalletBannerLayout, type WalletPlatform } from '@/lib/wallet-banner';
import { imageFrameRect, type ImageFrame } from '@/lib/website-v3/image-framing';

type ControlsProps = {
  layout: WalletBannerLayout; platform: WalletPlatform; onPlatform: (p: WalletPlatform) => void;
  onChange: (layout: WalletBannerLayout) => void; onFrame: (f: ImageFrame) => void;
};

/** Accessible framing controls work with the selected live Wallet preview. */
export function WalletBannerControls({ layout, platform, onPlatform, onChange, onFrame }: ControlsProps) {
  const { t } = useI18n();
  const frame = walletFrame(layout, platform);
  const selectClass = 'h-10 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 text-sm';
  const sliders = [
    { key: 'zoom', label: 'walletFrameZoom', min: 0.5, max: 3, step: 0.05 },
    { key: 'x', label: 'walletFrameX', min: 0, max: 100, step: 1 },
    { key: 'y', label: 'walletFrameY', min: 0, max: 100, step: 1 },
  ] as const;
  return <div id="wallet-frame-controls" className="space-y-4 rounded-lg border border-[var(--line)] p-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium">{t('walletFrameDevice')}
        <select className={selectClass} value={platform} onChange={e => onPlatform(e.target.value as WalletPlatform)}>
          <option value="apple">Apple Wallet</option><option value="google">Google Wallet</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">{t('walletFrameMode')}
        <select className={selectClass} value={frame.fit} onChange={e => onFrame({ ...defaultBannerLayout().shared, fit: e.target.value as ImageFrame['fit'] })}>
          <option value="contain">{t('walletFrameContain')}</option><option value="cover">{t('walletFrameCover')}</option>
        </select>
      </label>
    </div>
    {platform === 'google' && <div className="flex items-center justify-between gap-2">
      <label htmlFor="wallet-frame-google" className="text-sm font-medium">{t('walletFrameSeparate')}</label>
      <BooleanInput id="wallet-frame-google" checked={!!layout.google} onChange={e => onChange({ ...layout, google: e.target.checked ? { ...layout.shared } : undefined })} />
    </div>}
    {sliders.map(({ key, label, ...range }) => <div key={key}>
      <div className="flex justify-between text-sm">
        <label htmlFor={'wallet-frame-' + key}>{t(label)}</label>
        <span dir="ltr" className="tabular-nums">{Math.round(frame[key] * (key === 'zoom' ? 100 : 1))}%</span>
      </div>
      <input {...range} id={'wallet-frame-' + key} type="range" dir="ltr" className="w-full accent-current" value={frame[key]}
        onChange={e => onFrame({ ...frame, [key]: Number(e.target.value) })} />
    </div>)}
    {platform === 'apple' && <label className="grid gap-1 text-sm font-medium">{t('walletFrameCounter')}
      <select className={selectClass} value={layout.apple_counter} onChange={e => onChange({ ...layout, apple_counter: e.target.value as WalletBannerLayout['apple_counter'] })}>
        <option value="below">{t('walletFrameBelow')}</option><option value="overlay">{t('walletFrameOverlay')}</option>
      </select>
    </label>}
    <p className="text-xs text-[var(--fg-muted)]">{t('walletFrameHint')}</p>
    <Button type="button" variant="secondary" onClick={() => onFrame(defaultBannerLayout().shared)}>{t('walletFrameReset')}</Button>
  </div>;
}

/** Preview and drag the full source using the same rectangle as the exported PNG. */
export function FramedWalletBanner({ source, frame, platform, onFrame, children }: {
  source: string; frame: ImageFrame; platform: WalletPlatform; onFrame?: (f: ImageFrame) => void; children?: ReactNode;
}) {
  const { t } = useI18n();
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const drag = useRef<{ id: number; left: number; top: number; dx: number; dy: number; frame: ImageFrame } | null>(null);
  const { width, height } = walletBannerSize[platform];
  const rect = imageFrameRect(width, height, natural.width, natural.height, frame);
  const pan = (start: number, delta: number, free: number) =>
    Math.abs(free) < 0.5 ? start : Math.round(Math.max(0, Math.min(100, start + 100 * delta / free)));
  return <div data-wallet-banner={platform} className={'relative overflow-hidden ' + (onFrame ? 'touch-none cursor-grab active:cursor-grabbing' : '')}
    style={{ aspectRatio: width + ' / ' + height }}
    onPointerDown={e => {
      if (!onFrame || !natural.width || !e.isPrimary || e.button !== 0) return;
      const bounds = e.currentTarget.getBoundingClientRect();
      drag.current = { id: e.pointerId, left: e.clientX, top: e.clientY, dx: bounds.width * (1 - rect.width / width),
        dy: bounds.height * (1 - rect.height / height), frame };
      e.currentTarget.setPointerCapture(e.pointerId);
    }}
    onPointerMove={e => {
      const d = drag.current;
      if (onFrame && d?.id === e.pointerId) onFrame({ ...d.frame, x: pan(d.frame.x, e.clientX - d.left, d.dx), y: pan(d.frame.y, e.clientY - d.top, d.dy) });
    }}
    onLostPointerCapture={() => { drag.current = null; }}>
    <Image unoptimized loading="eager" width={width} height={height} src={source} alt={t('walletStudioBanner')}
      draggable={false} className="pointer-events-none absolute max-w-none select-none"
      onLoad={e => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
      style={{ left: rect.left / width * 100 + '%', top: rect.top / height * 100 + '%', width: rect.width / width * 100 + '%', height: rect.height / height * 100 + '%' }} />
    {children}
  </div>;
}
