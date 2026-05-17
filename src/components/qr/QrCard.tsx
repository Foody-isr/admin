'use client';

import { QRCodeSVG } from 'qrcode.react';
import type { QrCardConfig, QrCardTemplate } from '@/lib/api';

export interface QrCardLabels {
  poweredBy: string;
}

interface QrCardProps {
  config: QrCardConfig;
  url: string;
  tableLabel: string;
  logoUrl?: string;
  labels: QrCardLabels;
  /** Width in pixels for screen rendering. Height follows the template's aspect ratio. */
  width?: number;
}

/**
 * Physical print sizes per template (millimeters). The card aspect ratio
 * on screen is derived from these, so the preview matches the printed
 * output exactly.
 *
 *   compact = 4.25"×5.5" (portrait, fits 4 per A4)
 *   wide    = 7"×5"     (landscape, fits 2 stacked per A4)
 *   tall    = 5"×7"     (portrait, fits 1 per A4)
 */
export const TEMPLATE_SIZES: Record<QrCardTemplate, { wMm: number; hMm: number }> = {
  compact: { wMm: 108, hMm: 140 },
  wide: { wMm: 178, hMm: 127 },
  tall: { wMm: 127, hMm: 178 },
};

/**
 * Print sheet layout: how many cards fit per A4 page for each template,
 * and the per-card flex/grid cell width.
 */
export const PRINT_LAYOUT: Record<
  QrCardTemplate,
  { perPage: number; cols: number; rows: number }
> = {
  compact: { perPage: 4, cols: 2, rows: 2 },
  wide: { perPage: 2, cols: 1, rows: 2 },
  tall: { perPage: 1, cols: 1, rows: 1 },
};

export function QrCard(props: QrCardProps) {
  const tpl = props.config.template;
  if (tpl === 'wide') return <WideCard {...props} />;
  if (tpl === 'tall') return <TallCard {...props} />;
  return <CompactCard {...props} />;
}

// ── Shared visual atoms ──────────────────────────────────────────────────────

interface AtomProps {
  config: QrCardConfig;
  logoUrl?: string;
  size: number; // font scale anchor (use card width)
}

function BrandBlock({ config, logoUrl, size }: AtomProps) {
  const showLogo = config.brand_mode === 'logo' && !!logoUrl;
  if (showLogo) {
    return (
      <img
        src={logoUrl}
        alt={config.brand_text || 'logo'}
        style={{
          maxWidth: size * 0.5,
          maxHeight: size * 0.16,
          objectFit: 'contain',
          margin: '0 auto',
          display: 'block',
        }}
      />
    );
  }
  if (!config.brand_text) return null;
  return (
    <div
      style={{
        fontSize: size * 0.04,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        opacity: 0.75,
        fontWeight: 600,
      }}
    >
      {config.brand_text}
    </div>
  );
}

function StepsList({ config, size, align = 'center' }: AtomProps & { align?: 'left' | 'center' }) {
  if (!config.step1 && !config.step2 && !config.step3) return null;
  return (
    <div
      style={{
        fontSize: size * 0.04,
        opacity: 0.8,
        lineHeight: 1.7,
        textAlign: align,
      }}
    >
      {config.step1 && <div>1. {config.step1}</div>}
      {config.step2 && <div>2. {config.step2}</div>}
      {config.step3 && <div>3. {config.step3}</div>}
    </div>
  );
}

function QrSquare({ url, size, bg = '#ffffff' }: { url: string; size: number; bg?: string }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: bg,
        borderRadius: 8,
        padding: size * 0.07,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}
    >
      <QRCodeSVG
        value={url}
        size={size - size * 0.14}
        level="H"
        marginSize={0}
        bgColor="#ffffff"
        fgColor="#0f0f0f"
      />
    </div>
  );
}

function Foot({ label, size }: { label: string; size: number }) {
  return (
    <div
      style={{
        fontSize: size * 0.032,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        opacity: 0.5,
      }}
    >
      {label}
    </div>
  );
}

function baseCardStyle(props: QrCardProps, w: number, h: number): React.CSSProperties {
  return {
    width: w,
    height: h,
    background: props.config.background_color || '#ffffff',
    color: props.config.text_color || '#1a1a1a',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    borderRadius: 14,
    boxShadow: '0 2px 14px rgba(0,0,0,0.08)',
    boxSizing: 'border-box',
    breakInside: 'avoid',
  };
}

// ── Template 1: Compact portrait (4.25 × 5.5) ────────────────────────────────

function CompactCard(props: QrCardProps) {
  const { config, url, tableLabel, logoUrl, labels, width = 260 } = props;
  const { wMm, hMm } = TEMPLATE_SIZES.compact;
  const height = (width * hMm) / wMm;
  const pad = width * 0.07;

  return (
    <div
      className="qr-card"
      style={{
        ...baseCardStyle(props, width, height),
        padding: pad,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        textAlign: 'center',
      }}
    >
      <BrandBlock config={config} logoUrl={logoUrl} size={width} />

      {config.title && (
        <div
          style={{
            fontSize: width * 0.085,
            fontWeight: 800,
            lineHeight: 1.15,
            marginTop: -pad * 0.3,
          }}
        >
          {config.title}
        </div>
      )}

      <QrSquare url={url} size={width * 0.5} />

      <div style={{ fontSize: width * 0.05, fontWeight: 600 }}>{tableLabel}</div>

      <StepsList config={config} size={width} />

      <Foot label={labels.poweredBy} size={width} />
    </div>
  );
}

// ── Template 2: Wide landscape (7 × 5) ───────────────────────────────────────

function WideCard(props: QrCardProps) {
  const { config, url, tableLabel, logoUrl, labels, width = 420 } = props;
  const { wMm, hMm } = TEMPLATE_SIZES.wide;
  const height = (width * hMm) / wMm;
  const pad = width * 0.05;

  return (
    <div
      className="qr-card"
      style={{
        ...baseCardStyle(props, width, height),
        padding: pad,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <BrandBlock config={config} logoUrl={logoUrl} size={width * 0.6} />

      {config.title && (
        <div
          style={{
            fontSize: width * 0.06,
            fontWeight: 800,
            lineHeight: 1.15,
            marginTop: pad * 0.3,
          }}
        >
          {config.title}
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1.4fr',
          gap: pad,
          width: '100%',
          alignItems: 'center',
          marginTop: pad * 0.4,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: pad * 0.4 }}>
          <QrSquare url={url} size={width * 0.28} />
          <div style={{ fontSize: width * 0.034, fontWeight: 600 }}>{tableLabel}</div>
        </div>
        <div style={{ textAlign: 'left' }}>
          {config.subtitle && (
            <div style={{ fontSize: width * 0.032, opacity: 0.8, marginBottom: pad * 0.3 }}>
              {config.subtitle}
            </div>
          )}
          <StepsList config={config} size={width * 0.85} align="left" />
        </div>
      </div>

      <Foot label={labels.poweredBy} size={width * 0.7} />
    </div>
  );
}

// ── Template 3: Tall portrait with hero panel (5 × 7) ────────────────────────

function TallCard(props: QrCardProps) {
  const { config, url, tableLabel, logoUrl, labels, width = 260 } = props;
  const { wMm, hMm } = TEMPLATE_SIZES.tall;
  const height = (width * hMm) / wMm;
  const pad = width * 0.06;

  // Tint the hero panel slightly darker than the bg.
  const panelBg = tintPanel(config.background_color || '#ffffff', config.text_color || '#1a1a1a');

  return (
    <div
      className="qr-card"
      style={{
        ...baseCardStyle(props, width, height),
        padding: pad,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div style={{ width: '100%', textAlign: 'center', paddingTop: pad * 0.2 }}>
        <BrandBlock config={config} logoUrl={logoUrl} size={width} />
      </div>

      <div
        style={{
          flex: 1,
          width: '100%',
          background: panelBg,
          borderRadius: 12,
          padding: pad * 0.9,
          marginTop: pad * 0.6,
          marginBottom: pad * 0.4,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {config.title && (
          <div style={{ fontSize: width * 0.085, fontWeight: 800, lineHeight: 1.15 }}>
            {config.title}
          </div>
        )}

        <div
          style={{
            width: '40%',
            height: 2,
            background: 'currentColor',
            opacity: 0.3,
            marginTop: pad * 0.5,
            marginBottom: pad * 0.5,
          }}
        />

        <div style={{ display: 'flex', gap: pad * 0.5, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, fontSize: width * 0.04, opacity: 0.85, lineHeight: 1.6 }}>
            {config.step1 && <div>{config.step1}</div>}
            {config.step2 && <div>{config.step2}</div>}
            {config.step3 && <div>{config.step3}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <QrSquare url={url} size={width * 0.3} />
            <div style={{ fontSize: width * 0.032 }}>{tableLabel}</div>
          </div>
        </div>
      </div>

      {config.subtitle && (
        <div
          style={{
            fontSize: width * 0.04,
            textAlign: 'center',
            opacity: 0.8,
            padding: `0 ${pad}px`,
            marginBottom: pad * 0.4,
          }}
        >
          {config.subtitle}
        </div>
      )}

      <Foot label={labels.poweredBy} size={width} />
    </div>
  );
}

/**
 * Returns the panel tint for Template 3: ~6% blend of the text color over the
 * background, so dark text on light bg makes a soft gray panel, and light
 * text on dark bg makes a slightly lighter panel.
 */
function tintPanel(bg: string, fg: string): string {
  const mix = (a: string, b: string, t: number) => {
    const ah = a.replace('#', '');
    const bh = b.replace('#', '');
    if (ah.length < 6 || bh.length < 6) return a;
    const r = Math.round(parseInt(ah.slice(0, 2), 16) * (1 - t) + parseInt(bh.slice(0, 2), 16) * t);
    const g = Math.round(parseInt(ah.slice(2, 4), 16) * (1 - t) + parseInt(bh.slice(2, 4), 16) * t);
    const b2 = Math.round(parseInt(ah.slice(4, 6), 16) * (1 - t) + parseInt(bh.slice(4, 6), 16) * t);
    return `rgb(${r}, ${g}, ${b2})`;
  };
  return mix(bg, fg, 0.07);
}

/** Computes the WCAG contrast ratio between two CSS hex colors. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string): number => {
    const h = hex.replace('#', '');
    if (h.length !== 6 && h.length !== 8) return 1;
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const toLin = (c: number) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  };
  const la = lum(hexA);
  const lb = lum(hexB);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
