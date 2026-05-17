'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Copy,
  Download,
  QrCode,
  Check,
  Palette,
  Printer as PrinterIcon,
  Plus,
  Pencil,
} from 'lucide-react';
import {
  listSections,
  generateTableQr,
  getQrCardConfig,
  getRestaurant,
  type TableSection,
  type RestaurantTableRef,
  type TableQrPayload,
  type QrCardConfig,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button, Drawer, PageHead } from '@/components/ds';
import { QrCard } from '@/components/qr/QrCard';
import { TableEditorModal } from '@/components/tables/TableEditorModal';

interface SelectedTable {
  table: RestaurantTableRef;
  sectionName: string;
}

type TableEditState =
  | { mode: 'create'; sectionId: number; sectionName: string; nextIndex: number }
  | { mode: 'edit'; table: RestaurantTableRef }
  | null;

export default function TableQrPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [sections, setSections] = useState<TableSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SelectedTable | null>(null);
  const [cardConfig, setCardConfig] = useState<QrCardConfig | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [restaurantLocale, setRestaurantLocale] = useState<string | undefined>(undefined);
  const [editState, setEditState] = useState<TableEditState>(null);

  const reloadSections = useCallback(() => {
    return listSections(rid).then(setSections);
  }, [rid]);

  useEffect(() => {
    Promise.all([
      listSections(rid),
      getQrCardConfig(rid),
      getRestaurant(rid).catch(() => null),
    ])
      .then(([secs, cfg, rest]) => {
        setSections(secs);
        setCardConfig(cfg);
        if (rest?.logo_url) setLogoUrl(rest.logo_url);
        if (rest?.default_locale) setRestaurantLocale(rest.default_locale);
      })
      .finally(() => setLoading(false));
  }, [rid]);

  const totalTables = sections.reduce((sum, s) => sum + (s.tables?.length ?? 0), 0);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-[var(--s-5)]">
      <PageHead
        title={t('tableQrCodes')}
        desc={t('tableQrCodesDesc')}
        actions={
          <>
            <Link href={`/${rid}/restaurant/table-qr/customize`}>
              <Button variant="secondary" size="md">
                <Palette />
                {t('customizeTemplate')}
              </Button>
            </Link>
            {totalTables > 0 && (
              <Link href={`/${rid}/restaurant/table-qr/print`} target="_blank">
                <Button variant="primary" size="md">
                  <PrinterIcon />
                  {t('printAllQrCards')}
                </Button>
              </Link>
            )}
          </>
        }
      />

      {sections.length === 0 ? (
        <div className="card flex flex-col items-center py-16 space-y-4">
          <QrCode className="w-10 h-10 text-fg-secondary" />
          <p className="text-fg-secondary text-center max-w-md">{t('noTablesYet')}</p>
          <Link href={`/${rid}/restaurant/floor-plans`}>
            <Button variant="primary" size="md">
              <Plus />
              {t('createSection')}
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-[var(--s-5)]">
          {sections.map((section) => (
            <SectionBlock
              key={section.id}
              section={section}
              onSelect={(table) => setSelected({ table, sectionName: section.name })}
              onAddTable={() =>
                setEditState({
                  mode: 'create',
                  sectionId: section.id,
                  sectionName: section.name,
                  nextIndex: (section.tables?.length ?? 0) + 1,
                })
              }
              onEditTable={(table) => setEditState({ mode: 'edit', table })}
              labels={{
                seats: t('seatsLabel'),
                inactive: t('tableInactive'),
                viewQr: t('viewQr'),
                addTable: t('addTable'),
                edit: t('edit'),
              }}
            />
          ))}
        </div>
      )}

      {selected && cardConfig && (
        <QrDrawer
          restaurantId={rid}
          table={selected.table}
          sectionName={selected.sectionName}
          cardConfig={cardConfig}
          logoUrl={logoUrl}
          restaurantLocale={restaurantLocale}
          onClose={() => setSelected(null)}
        />
      )}

      {editState && (
        <TableEditorModal
          restaurantId={rid}
          sectionId={editState.mode === 'create' ? editState.sectionId : undefined}
          sectionName={editState.mode === 'create' ? editState.sectionName : undefined}
          nextIndex={editState.mode === 'create' ? editState.nextIndex : undefined}
          table={editState.mode === 'edit' ? editState.table : undefined}
          onSaved={() => {
            setEditState(null);
            reloadSections();
          }}
          onDeleted={() => {
            setEditState(null);
            reloadSections();
          }}
          onClose={() => setEditState(null)}
        />
      )}
    </div>
  );
}

function localeBadge(lang?: string): string {
  if (lang === 'en') return 'EN';
  if (lang === 'he') return 'עב';
  if (lang === 'fr') return 'FR';
  return '';
}

function SectionBlock({
  section,
  onSelect,
  onAddTable,
  onEditTable,
  labels,
}: {
  section: TableSection;
  onSelect: (table: RestaurantTableRef) => void;
  onAddTable: () => void;
  onEditTable: (table: RestaurantTableRef) => void;
  labels: {
    seats: string;
    inactive: string;
    viewQr: string;
    addTable: string;
    edit: string;
  };
}) {
  return (
    <div className="space-y-[var(--s-3)]">
      <div className="flex items-center justify-between">
        <h3 className="text-fs-sm font-semibold text-fg-secondary uppercase tracking-wide">
          {section.name}
        </h3>
        <button
          onClick={onAddTable}
          className="text-fs-xs font-medium text-[var(--brand-500)] hover:underline flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          {labels.addTable}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-[var(--s-3)]">
        {(section.tables ?? []).map((table) => (
          <div
            key={table.id}
            className="card text-left p-[var(--s-4)] hover:border-[var(--brand-500)] hover:shadow transition-all flex flex-col gap-[var(--s-2)] relative group"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditTable(table);
              }}
              className="absolute top-2 end-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--surface-subtle)] transition-opacity"
              title={labels.edit}
            >
              <Pencil className="w-3.5 h-3.5 text-fg-secondary" />
            </button>
            <button
              onClick={() => onSelect(table)}
              className="text-left flex flex-col gap-[var(--s-2)]"
            >
              <div className="flex items-start justify-between gap-2 pe-6">
                <span className="font-semibold text-fg-primary">{table.name}</span>
                <QrCode className="w-4 h-4 text-fg-secondary shrink-0" />
              </div>
              <div className="text-fs-xs text-fg-secondary flex items-center gap-1.5">
                <span>
                  {table.seats} {labels.seats}
                </span>
                {table.language && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[10px] font-semibold uppercase tracking-wide">
                    {localeBadge(table.language)}
                  </span>
                )}
                {!table.active && <span>· {labels.inactive}</span>}
              </div>
              <span className="text-fs-xs text-[var(--brand-500)] font-medium mt-1">
                {labels.viewQr}
              </span>
            </button>
          </div>
        ))}
        {(section.tables ?? []).length === 0 && (
          <button
            onClick={onAddTable}
            className="card text-center p-[var(--s-4)] border-dashed text-fg-secondary hover:border-[var(--brand-500)] hover:text-[var(--brand-500)] transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="text-fs-sm">{labels.addTable}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function QrDrawer({
  restaurantId,
  table,
  sectionName,
  cardConfig,
  logoUrl,
  restaurantLocale,
  onClose,
}: {
  restaurantId: number;
  table: RestaurantTableRef;
  sectionName: string;
  cardConfig: QrCardConfig;
  logoUrl?: string;
  restaurantLocale?: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [payload, setPayload] = useState<TableQrPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const cardWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setPayload(null);
    setError(null);
    generateTableQr(restaurantId, table.code)
      .then((p) => {
        if (!cancelled) setPayload(p);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, table.code]);

  const handleCopy = useCallback(async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = payload.url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [payload]);

  const handleDownload = useCallback(() => {
    const svg = cardWrapRef.current?.querySelector('.qr-card svg');
    if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `table-${table.code}-qr.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [table.code]);

  const tableLabel = sectionName ? `${sectionName} · ${table.name}` : table.name;

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`${t('qrFor')} ${table.name}`}
      subtitle={sectionName}
      width={520}
    >
      <div className="flex flex-col items-center gap-[var(--s-5)]">
        {!payload && !error && (
          <div className="py-16">
            <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
          </div>
        )}

        {error && (
          <div className="card w-full text-center text-fs-sm text-red-500 py-8 px-4">
            {error}
          </div>
        )}

        {payload && (
          <>
            <div ref={cardWrapRef}>
              <QrCard
                config={cardConfig}
                url={payload.url}
                tableLabel={tableLabel}
                logoUrl={logoUrl}
                locale={(table.language as 'en' | 'he' | 'fr' | '' | undefined) || ''}
                restaurantDefaultLocale={restaurantLocale}
                labels={{ poweredBy: t('poweredByFoody') }}
                width={300}
              />
            </div>

            <div className="w-full">
              <label className="text-fs-xs text-fg-secondary block mb-1">URL</label>
              <div className="card p-[var(--s-3)] text-fs-xs break-all font-mono text-fg-secondary">
                {payload.url}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--s-2)] w-full">
              <Button variant="secondary" size="md" onClick={handleCopy}>
                {copied ? <Check /> : <Copy />}
                {copied ? t('linkCopied') : t('copyLink')}
              </Button>
              <Button variant="secondary" size="md" onClick={handleDownload}>
                <Download />
                {t('downloadSvg')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
