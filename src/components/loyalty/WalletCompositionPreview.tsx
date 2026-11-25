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
import type { WalletStampStyle, WalletStudioState } from '@/lib/api';
import { WalletStampGrid } from './WalletVisitStamps';

function Artwork({
  design,
  format,
  background,
  banner,
  layout,
  withStamps,
}: {
  design: Composition;
  format: Format;
  background: string;
  banner: string | null;
  layout: WalletBannerLayout;
  withStamps: boolean;
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
    paintComposition(temp, format, design, background, source.image, layout, withStamps)
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
  }, [source, format, design, background, layout, banner, withStamps]);
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

function PosterLogo({ src, design, primary = false }: { src: string; design: Composition; primary?: boolean }) {
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
    <div className={primary ? 'flex h-[8.4cqw] w-[35.2cqw] items-center' : 'flex h-[14cqw] w-[38cqw] items-center'}>
      <Image
        unoptimized
        src={image || src}
        alt={t('walletStudioLogo')}
        width={160}
        height={50}
        style={{
          maxHeight: design.logo_scale + '%',
          maxWidth: design.logo_scale + '%',
          width: primary ? design.logo_scale + '%' : 'auto',
          height: primary ? design.logo_scale + '%' : 'auto',
          objectFit: 'contain',
          objectPosition: 'left center',
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
  stamps,
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
  stamps: WalletStampStyle | null;
}) {
  const { t, locale } = useI18n();
  const program = state.program;
  const points = program?.mode === 'points',
    threshold = program?.threshold ?? 2,
    amount = Math.max(0, Math.min(sample, stamps ? threshold : threshold - 1)),
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
  const googleInk =
    colorContrast(background, '#FFFFFF') > colorContrast(background, '#202124') ? '#FFFFFF' : '#202124';
  const art = (
    <div className="relative">
      <Artwork design={design} format={format} background={background} banner={banner} layout={layout} withStamps={!!stamps} />
      {stamps && <WalletStampGrid style={stamps} progress={amount} threshold={threshold} platform={format} overPhoto={false} composed />}
    </div>
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
  const poster = format === 'poster';
  const qr = (
    <div className={poster ? 'flex w-full overflow-hidden rounded-[1.7cqw] bg-white' : 'inline-flex rounded-lg bg-white p-1'}>
      <QRCodeSVG
        aria-label={t('walletStudioTestCard')}
        value="FOODY-WALLET-STUDIO-TEST"
        size={104}
        minVersion={poster ? 2 : 1}
        marginSize={poster ? 2 : 4}
        className="h-auto w-full"
      />
    </div>
  );
  const title = program?.names[locale] || state.restaurant_name;
  if (poster) {
    // Apple applies one ink to the header and footer. Match the surface in the signed pass.
    const footer = [design.footer, background, '#FFFFFF'].find(color => colorContrast(foreground, color) >= 4.5) ?? '#000000';
    return (
      <article
        data-wallet-preview="apple"
        data-wallet-poster
        className="relative mx-auto aspect-[358/503] max-w-[23rem] overflow-hidden rounded-[3.3%] shadow-2 [container-type:inline-size]"
        style={{ backgroundColor: footer, color: foreground }}
      >
        {/* The signed artwork has side bleed. Wallet's center crop restores this design width. */}
        <div className="absolute inset-x-0 top-0">{art}</div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[34%] bg-gradient-to-b from-black/30 to-transparent" />
        <div aria-hidden="true" data-wallet-footer-surface className="absolute inset-x-0 bottom-0 top-[76.14%]" style={{ backgroundColor: footer }} />
        <div className="absolute inset-x-[3.9%] top-[2.4%] flex items-start justify-between gap-2">
          <div>
            {logo && <PosterLogo src={logo} design={design} primary />}
            {!hideName && <span className="block text-[3cqw] font-semibold">{state.restaurant_name}</span>}
          </div>
          <div className="text-end">
            <div className="text-[3.9cqw] font-bold uppercase leading-tight">{unit}</div>
            <span dir="ltr" className="block font-mono text-[4.4cqw] leading-tight tabular-nums">{balance}</span>
          </div>
        </div>
        <div data-wallet-poster-qr className="absolute left-1/2 top-[47.1%] w-[43.6%] -translate-x-1/2">
          {qr}
        </div>
        <div className="absolute inset-x-[3.9%] top-[81%] font-mono leading-tight">
          <div className="text-[3.1cqw]">{rewardLabel}</div>
          <span className="line-clamp-2 text-[4.4cqw]">{rewardValue}</span>
        </div>
        <div className="absolute inset-x-[3.9%] bottom-[3%] font-mono text-[2.9cqw]">
          {t('walletStudioAttribution')}
        </div>
      </article>
    );
  }
  const google = format === 'google';
  const stampedStrip = !google && !!stamps;
  const leadingField = stampedStrip
    ? { label: t('loyaltyProgramReward'), value: program?.reward_labels?.[locale] || title }
    : { label: unit, value: google ? balance : amount };
  const stripDetail = stamps
    ? { label: t('stampRemaining'), value: left }
    : { label: t('walletStudioThreshold'), value: threshold };
  const trailingField = google ? { label: rewardLabel, value: rewardValue } : stripDetail;
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
        {!google && <span className="text-xs">{stamps ? <>{unit} <b dir="ltr">{balance}</b></> : t('walletStudioTestCard')}</span>}
      </div>
      {!google && art}
      <div className="flex justify-between gap-4 px-4 py-2 text-sm">
        <div>
          {leadingField.label}
          <strong className="block">{leadingField.value}</strong>
        </div>
        <div>
          {trailingField.label}
          <strong className="block">{trailingField.value}</strong>
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
