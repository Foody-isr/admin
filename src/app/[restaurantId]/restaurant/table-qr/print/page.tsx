'use client';

import { useEffect, useState } from 'react';
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
            if (tbl.active) flat.push({ table: tbl, sectionName: s.name });
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
      <div style={{ padding: 32, fontFamily: 'sans-serif' }}>{t('preparingPrint')}</div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, color: '#c33', fontFamily: 'sans-serif' }}>{error}</div>
    );
  }

  const size = TEMPLATE_SIZES[config.template];
  const layout = PRINT_LAYOUT[config.template];
  const pages: PrintableTable[][] = [];
  for (let i = 0; i < items.length; i += layout.perPage) {
    pages.push(items.slice(i, i + layout.perPage));
  }

  // Print sizes scaled to fit A4 portrait (190mm × 277mm usable after 10mm margins).
  // Aspect ratio is always preserved — only width is scaled where needed to
  // fit per-page layouts.
  const printSize = (() => {
    if (config.template === 'compact') {
      // 2 cols × 2 rows. Spec is 108×140mm but 2-up doesn't fit A4 width;
      // scale to 91mm wide → 117.7mm tall.
      const wMm = 91;
      return { wMm, hMm: (wMm * size.hMm) / size.wMm };
    }
    // Wide and tall fit at spec size.
    return { wMm: size.wMm, hMm: size.hMm };
  })();

  // Pixel width for screen rendering (the actual print uses CSS mm units).
  const screenCardWidth = config.template === 'wide' ? 600 : 360;

  return (
    <>
      <style>{`
        @page { size: A4; margin: 10mm; }
        html, body { margin: 0; padding: 0; background: #f3f3f3; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .print-toolbar { position: fixed; top: 12px; right: 12px; z-index: 10; display: flex; gap: 8px; }
        .print-toolbar button { padding: 8px 14px; border-radius: 6px; border: 1px solid #ccc; background: #fff; cursor: pointer; font-size: 13px; }
        .print-page {
          width: 210mm;
          min-height: 297mm;
          margin: 12px auto;
          padding: 10mm;
          box-sizing: border-box;
          background: #fff;
          box-shadow: 0 2px 12px rgba(0,0,0,0.08);
          display: grid;
          grid-template-columns: repeat(${layout.cols}, 1fr);
          grid-template-rows: repeat(${layout.rows}, 1fr);
          gap: 8mm;
          page-break-after: always;
          align-items: center;
          justify-items: center;
        }
        .print-page:last-child { page-break-after: auto; }
        .print-cell { display: flex; align-items: center; justify-content: center; }
        /* Force each rendered card to its real physical size on paper. */
        @media print {
          body { background: #fff; }
          .print-toolbar { display: none !important; }
          .print-page { box-shadow: none; margin: 0; }
          .qr-card {
            width: ${printSize.wMm}mm !important;
            height: ${printSize.hMm}mm !important;
            box-shadow: none !important;
            border: 1px dashed #ccc;
          }
        }
      `}</style>

      <div className="print-toolbar">
        <button onClick={() => window.print()}>{t('printQr')}</button>
        <button onClick={() => window.close()}>{t('close')}</button>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: 32 }}>{t('noTablesYet')}</div>
      ) : (
        pages.map((page, pi) => (
          <div key={pi} className="print-page">
            {page.map((it) => (
              <div key={it.table.id} className="print-cell">
                <QrCard
                  config={config}
                  url={it.url}
                  tableLabel={it.table.name}
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
