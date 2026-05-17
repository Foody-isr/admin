'use client';

import { QRCodeSVG } from 'qrcode.react';
import type { QrCardConfig } from '@/lib/api';

export interface QrCardLabels {
  poweredBy: string;
}

interface QrCardProps {
  config: QrCardConfig;
  url: string;
  tableLabel: string;
  logoUrl?: string;
  labels: QrCardLabels;
  /** Card width in pixels (height follows 3:4 aspect ratio). */
  width?: number;
}

/**
 * Renders one printable QR card using the restaurant's chosen template,
 * colors, and text. The component is purely presentational — feed it a
 * pre-fetched signed URL and it draws the SVG.
 */
export function QrCard({
  config,
  url,
  tableLabel,
  logoUrl,
  labels,
  width = 260,
}: QrCardProps) {
  const height = (width / 3) * 4;
  const isBold = config.template === 'bold';
  const isElegant = config.template === 'elegant';

  const bg = config.background_color || '#fafaf7';
  const fg = config.text_color || '#2a2a2a';

  const fontFamily = isElegant
    ? "Georgia, 'Times New Roman', serif"
    : "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  // For "bold" and "elegant", text floats on the colored background and
  // should use the configured text color directly. The inner QR square
  // stays white so the code remains scannable.
  const onBgColor = fg;

  const cardStyle: React.CSSProperties = {
    width,
    height,
    background: bg,
    color: onBgColor,
    fontFamily,
    borderRadius: 12,
    padding: width * 0.08,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    textAlign: 'center',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    border: isElegant ? `2px solid ${fg}` : undefined,
    boxSizing: 'border-box',
    breakInside: 'avoid',
  };

  const brandStyle: React.CSSProperties = {
    fontSize: width * 0.045,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    opacity: 0.75,
    fontWeight: 600,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: width * 0.075,
    fontWeight: 700,
    marginTop: 6,
    lineHeight: 1.2,
    letterSpacing: isElegant ? '0.04em' : undefined,
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: width * 0.045,
    opacity: 0.7,
    marginTop: 2,
  };

  const qrSize = width * 0.5;
  const qrBoxStyle: React.CSSProperties = {
    width: qrSize,
    height: qrSize,
    background: '#ffffff',
    borderRadius: 8,
    padding: qrSize * 0.07,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const tableLabelStyle: React.CSSProperties = {
    fontSize: width * 0.055,
    fontWeight: 600,
    marginTop: 8,
  };

  const stepStyle: React.CSSProperties = {
    fontSize: width * 0.04,
    opacity: 0.75,
    lineHeight: 1.7,
  };

  const footStyle: React.CSSProperties = {
    fontSize: width * 0.035,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    opacity: 0.55,
  };

  const showLogo = config.brand_mode === 'logo' && !!logoUrl;
  const brandText = config.brand_text || '';

  return (
    <div style={cardStyle} className="qr-card">
      <div style={{ width: '100%' }}>
        {showLogo ? (
          <img
            src={logoUrl}
            alt={brandText || 'logo'}
            style={{
              maxWidth: width * 0.55,
              maxHeight: width * 0.18,
              objectFit: 'contain',
              margin: '0 auto',
              display: 'block',
            }}
          />
        ) : (
          brandText && <div style={brandStyle}>{brandText}</div>
        )}
        {config.title && <div style={titleStyle}>{config.title}</div>}
        {config.subtitle && <div style={subtitleStyle}>{config.subtitle}</div>}
      </div>

      <div style={qrBoxStyle}>
        <QRCodeSVG
          value={url}
          size={qrSize - qrSize * 0.14}
          level="H"
          marginSize={0}
          bgColor="#ffffff"
          fgColor={isBold ? '#000000' : '#111111'}
        />
      </div>

      <div style={{ width: '100%' }}>
        <div style={tableLabelStyle}>{tableLabel}</div>
        {(config.step1 || config.step2 || config.step3) && (
          <div style={stepStyle}>
            {config.step1 && <div>1. {config.step1}</div>}
            {config.step2 && <div>2. {config.step2}</div>}
            {config.step3 && <div>3. {config.step3}</div>}
          </div>
        )}
      </div>

      <div style={footStyle}>{labels.poweredBy}</div>
    </div>
  );
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
