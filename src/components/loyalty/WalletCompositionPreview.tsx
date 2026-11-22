'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { useI18n } from '@/lib/i18n';
import { colorContrast } from '@/lib/website-v3/site-colors';
import {
  compositionImage,
  formats,
  paintComposition,
  type Composition,
  type Format,
} from '@/lib/wallet-composition';
import type { WalletBannerLayout } from '@/lib/wallet-banner';
import type { WalletStudioState } from '@/lib/api';

function Artwork({
  design,
  format,
  background,
  banner,
  layout,
}: {
  design: Composition;
  format: Format;
  background: string;
  banner: string | null;
  layout: WalletBannerLayout;
}) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [source, setSource] = useState<{
    url: string | null;
    trim: boolean;
    image: HTMLCanvasElement | null;
  }>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let current = true;
    setError(false);
    compositionImage(banner, design.trim_photo)
      .then((image) => {
        if (current) setSource({ url: banner, trim: design.trim_photo, image });
      })
      .catch(() => {
        if (current) setError(true);
      });
    return () => {
      current = false;
    };
  }, [banner, design.trim_photo]);
  useEffect(() => {
    if (!source || source.url !== banner || source.trim !== design.trim_photo) return;
    let current = true;
    const temp = document.createElement('canvas');
    temp.width = Math.min(720, formats[format].width);
    temp.height = Math.round((temp.width * formats[format].height) / formats[format].width);
    paintComposition(temp, format, design, background, source.image, layout)
      .then(() => {
        if (!current || !canvas.current) return;
        canvas.current.width = temp.width;
        canvas.current.height = temp.height;
        canvas.current.getContext('2d')?.drawImage(temp, 0, 0);
        setError(false);
      })
      .catch(() => {
        if (current) setError(true);
      });
    return () => {
      current = false;
    };
  }, [source, format, design, background, layout, banner]);
  return (
    <>
      {error && (
        <p role="alert" className="bg-white p-2 text-sm text-black">
          {t('walletArtRenderError')}
        </p>
      )}
      <canvas
        ref={canvas}
        data-wallet-art={format}
        aria-label={design.title || t('walletArtDecor')}
        className="block w-full"
        style={{ aspectRatio: formats[format].width + '/' + formats[format].height }}
      />
    </>
  );
}

function PosterLogo({ src, design }: { src: string; design: Composition }) {
  const [image, setImage] = useState('');
  const { t } = useI18n();
  useEffect(() => {
    let current = true;
    compositionImage(src, design.trim_logo)
      .then((result) => {
        if (current) setImage(result?.toDataURL() ?? src);
      })
      .catch(() => {
        if (current) setImage(src);
      });
    return () => {
      current = false;
    };
  }, [src, design.trim_logo]);
  return (
    <div className="flex h-[14cqw] w-[38cqw] items-center">
      <Image
        unoptimized
        src={image || src}
        alt={t('walletStudioLogo')}
        width={160}
        height={50}
        style={{
          maxHeight: design.logo_scale + '%',
          maxWidth: design.logo_scale + '%',
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}

/** Preview native member information separately from the exported decoration, at each Wallet's aspect ratio. */
export function WalletCompositionPreview({
  design,
  format,
  banner,
  logo,
  layout,
  background,
  foreground,
  hideName,
  state,
  sample,
}: {
  design: Composition;
  format: Format;
  banner: string | null;
  logo: string | null;
  layout: WalletBannerLayout;
  background: string;
  foreground: string;
  hideName: boolean;
  state: WalletStudioState;
  sample: number;
}) {
  const { t, locale } = useI18n();
  const program = state.program;
  const points = program?.mode === 'points',
    threshold = program?.threshold ?? 2,
    amount = Math.max(0, Math.min(sample, threshold - 1)),
    left = threshold - amount;
  const unit = t(points ? 'loyaltyProgramPoints' : 'loyaltyProgramVisits');
  const balance = design.balance === 'fraction' ? amount + ' / ' + threshold : String(amount);
  const remaining = t(
    points
      ? left === 1
        ? 'walletArtOnePoint'
        : 'walletArtMorePoints'
      : left === 1
        ? 'walletArtOneVisit'
        : 'walletArtMoreVisits',
  ).replace('{n}', String(left));
  const benefit = design.reward === 'benefit' && program?.reward_labels?.[locale];
  const rewardLabel = benefit ? remaining : t('walletArtNext');
  const rewardValue = benefit || remaining;
  const paperInk =
    colorContrast(design.footer, '#FFFFFF') > colorContrast(design.footer, foreground)
      ? '#FFFFFF'
      : foreground;
  const googleInk =
    colorContrast(background, '#FFFFFF') > colorContrast(background, '#202124') ? '#FFFFFF' : '#202124';
  const art = (
    <Artwork design={design} format={format} background={background} banner={banner} layout={layout} />
  );
  const attribution = (
    <a
      href="https://foody-pos.co.il/?utm_source=wallet&utm_medium=powered_by"
      target="_blank"
      rel="noopener noreferrer"
      className="hover:underline focus-visible:underline"
    >
      {t('walletStudioAttribution')}
    </a>
  );
  const qr = (
    <div className="inline-flex rounded-lg bg-white p-1">
      <QRCodeSVG
        aria-label={t('walletStudioTestCard')}
        value="FOODY-WALLET-STUDIO-TEST"
        size={104}
        marginSize={4}
        className="h-auto w-full"
      />
    </div>
  );
  const title = program?.names[locale] || state.restaurant_name;
  if (format === 'poster')
    return (
      <article
        data-wallet-preview="apple"
        data-wallet-poster
        className="relative mx-auto aspect-[420/568] max-w-[23rem] overflow-hidden rounded-2xl border border-black/10 shadow-2 [container-type:inline-size]"
        style={{ backgroundColor: design.footer, color: foreground }}
      >
        <div className="absolute inset-x-0 top-0">{art}</div>
        <div className="absolute inset-x-[5%] top-[3%] flex items-start justify-between gap-2">
          <div>
            {logo && <PosterLogo src={logo} design={design} />}
            {!hideName && <span className="block text-[3cqw] font-semibold">{state.restaurant_name}</span>}
          </div>
          <div className="text-end">
            <div className="text-[3cqw]">{unit}</div>
            <strong className="block text-[7cqw] leading-none tabular-nums">{balance}</strong>
          </div>
        </div>
        <div className="absolute start-1/2 top-[53.4%] w-[33%] -translate-x-1/2 rtl:translate-x-1/2">
          {qr}
        </div>
        <div className="absolute inset-x-[5.5%] top-[81%] leading-tight" style={{ color: paperInk }}>
          <div className="text-[3.1cqw]">{rewardLabel}</div>
          <strong className="line-clamp-2 text-[5.5cqw]">{rewardValue}</strong>
        </div>
        <div className="absolute inset-x-[5.5%] bottom-[3%] text-[2.7cqw]" style={{ color: paperInk }}>
          {attribution}
        </div>
      </article>
    );
  const google = format === 'google';
  return (
    <article
      data-wallet-preview={google ? 'google' : 'apple'}
      className="mx-auto max-w-[23rem] overflow-hidden rounded-2xl border border-black/10 shadow-2 [container-type:inline-size]"
      style={{ backgroundColor: background, color: google ? googleInk : foreground }}
    >
      <div className="flex items-start justify-between gap-2 p-4">
        <div className="flex items-center gap-2">
          {logo &&
            (google ? (
              <Image
                unoptimized
                alt={t('walletStudioLogo')}
                src={logo}
                width={32}
                height={32}
                className="h-8 w-8 rounded-full bg-white object-contain"
              />
            ) : (
              <PosterLogo src={logo} design={design} />
            ))}
          {(google || !hideName) && <b className="text-sm">{google ? title : state.restaurant_name}</b>}
        </div>
        {!google && <span className="text-xs">{t('walletStudioTestCard')}</span>}
      </div>
      {!google && art}
      <div className="flex justify-between gap-4 px-4 py-2 text-sm">
        <div>
          {unit}
          <strong className="block">{google ? balance : amount}</strong>
        </div>
        <div>
          {google ? rewardLabel : t('walletStudioThreshold')}
          <strong className="block">{google ? rewardValue : threshold}</strong>
        </div>
      </div>
      {google && art}
      <div className="grid justify-items-center gap-1 p-4 text-xs">
        {qr}
        {attribution}
      </div>
    </article>
  );
}
