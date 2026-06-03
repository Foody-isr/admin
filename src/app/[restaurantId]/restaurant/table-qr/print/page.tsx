'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  listSections,
  generateTableQr,
  getQrCardConfig,
  getRestaurant,
  type QrCardConfig,
  type RestaurantTableRef,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { QrCard, TEMPLATE_SIZES, PRINT_LAYOUT } from '@/components/qr/QrCard';

interface PrintableTable {
  table: RestaurantTableRef;
  sectionName: string;
  url: string;
}

export default function PrintQrCardsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [config, setConfig] = useState<QrCardConfig | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [restaurantLocale, setRestaurantLocale] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<PrintableTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [sections, cfg, rest] = await Promise.all([
          listSections(rid),
          getQrCardConfig(rid),
          getRestaurant(rid).catch(() => null),
        ]);
        if (cancelled) return;
        setConfig(cfg);
        if (rest?.logo_url) setLogoUrl(rest.logo_url);
        if (rest?.default_locale) setRestaurantLocale(rest.default_locale);

        const flat: { table: RestaurantTableRef; sectionName: string }[] = [];
        for (const s of sections) {
          for (const tbl of s.tables ?? []) {
            flat.push({ table: tbl, sectionName: s.name });
          }
        }

        const results = await Promise.all(
          flat.map(async ({ table, sectionName }) => {
            const payload = await generateTableQr(rid, table.code);
            return { table, sectionName, url: payload.url };
          }),
        );
        if (!cancelled) setItems(results);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rid]);

  useEffect(() => {
    if (!loading && !error && items.length > 0) {
      const id = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(id);
    }
  }, [loading, error, items.length]);

  if (loading || !config) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          background: '#fff',
          color: '#111',
          fontFamily: 'sans-serif',
        }}
      >
        {t('preparingPrint')}
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          background: '#fff',
          color: '#c33',
          fontFamily: 'sans-serif',
        }}
      >
        {error}
      </div>
    );
  }

  const size = TEMPLATE_SIZES[config.template];
  const layout = PRINT_LAYOUT[config.template];
  const pages: PrintableTable[][] = [];
  for (let i = 0; i < items.length; i += layout.perPage) {
    pages.push(items.slice(i, i + layout.perPage));
  }

  // Card dimensions in mm. Compact is scaled to 92mm so two cards plus a 6mm
  // gutter still leave ~10mm of breathing room on the A4 page after a 10mm
  // internal padding (210 - 20 - 6 - 92*2 = 0mm — tight, but cleanly fits).
  const printSize = (() => {
    if (config.template === 'compact') {
      const wMm = 92;
      return { wMm, hMm: (wMm * size.hMm) / size.wMm };
    }
    return { wMm: size.wMm, hMm: size.hMm };
  })();

  // Render the card at its physical print size in pixels (1mm ≈ 3.7795px at
  // 96dpi) so the layout we see on screen matches what gets printed. Avoids
  // having to override sizes again via `!important` inside `@media print`.
  const screenCardWidth = Math.round(printSize.wMm * 3.7795);

  return (
    <>
      <style>{`
        /* margin:0 means .print-page IS the printable area, no surprise overflow. */
        @page { size: A4; margin: 0; }
        html, body { margin: 0; padding: 0; background: #f3f3f3; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .print-toolbar { position: fixed; top: 12px; right: 12px; z-index: 10; display: flex; gap: 8px; }
        .print-toolbar button { padding: 8px 14px; border-radius: 6px; border: 1px solid #ccc; background: #fff; cursor: pointer; font-size: 13px; }
        .print-page {
          width: 210mm;
          height: 297mm;
          margin: 12px auto;
          padding: 10mm;
          box-sizing: border-box;
          background: #fff;
          box-shadow: 0 2px 12px rgba(0,0,0,0.08);
          display: grid;
          grid-template-columns: repeat(${layout.cols}, 1fr);
          grid-template-rows: repeat(${layout.rows}, 1fr);
          gap: 6mm;
          page-break-after: always;
          align-items: center;
          justify-items: center;
          overflow: hidden;
        }
        .print-page:last-child { page-break-after: auto; }
        .print-cell { display: flex; align-items: center; justify-content: center; }
        .qr-card { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        @media print {
          body { background: #fff; }
          .print-toolbar { display: none !important; }
          .print-page { box-shadow: none; margin: 0; }
          .qr-card { box-shadow: none !important; }
        }
      `}</style>

      <div className="print-toolbar">
        <button onClick={() => window.print()}>{t('printQr')}</button>
        <button onClick={() => window.close()}>{t('close')}</button>
      </div>

      {items.length === 0 ? (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 32,
            color: '#111',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, maxWidth: 420 }}>{t('noTablesYet')}</p>
          <Link
            href={`/${rid}/restaurant/table-qr`}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid #ccc',
              background: '#fff',
              color: '#111',
              textDecoration: 'none',
              fontSize: 13,
            }}
          >
            {t('close')}
          </Link>
        </div>
      ) : (
        pages.map((page, pi) => (
          <div key={pi} className="print-page">
            {page.map((it) => (
              <div key={it.table.id} className="print-cell">
                <QrCard
                  config={config}
                  url={it.url}
                  tableLabel={
                    it.sectionName ? `${it.sectionName} · ${it.table.name}` : it.table.name
                  }
                  logoUrl={logoUrl}
                  locale={(it.table.language as 'en' | 'he' | 'fr' | '' | undefined) || ''}
                  restaurantDefaultLocale={restaurantLocale}
                  labels={{ poweredBy: t('poweredByFoody') }}
                  width={screenCardWidth}
                />
              </div>
            ))}
            {page.length < layout.perPage &&
              Array.from({ length: layout.perPage - page.length }).map((_, i) => (
                <div key={`empty-${i}`} className="print-cell" />
              ))}
          </div>
        ))
      )}
    </>
  );
}
