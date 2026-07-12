'use client';

import { useMemo, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, SearchIcon } from 'lucide-react';
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableBody, DataTableRow, DataTableCell,
} from '@/components/data-table/DataTable';
import { TranslationReviewEntry } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  LOCALE_LABELS, SUPPORTED_LOCALES, SECTION_ORDER, SECTION_LABEL_KEY,
  sectionFor, usageTotal,
} from './sections';

interface Props {
  entries: TranslationReviewEntry[];
  onEdit: (text: string, locale: string, value: string) => void;
  /**
   * Single-source mode (language settings): the restaurant's one source locale;
   * that column is hidden and the other two are shown as editable translations.
   */
  sourceLocale?: string;
  /**
   * Per-section source mode (language-aware import): each section declares which
   * language its original text is in. Enables a source dropdown per section
   * header; the remaining two locales are the editable translation columns.
   */
  sectionSources?: Record<string, string>;
  onSectionSourceChange?: (section: string, locale: string) => void;
}

/**
 * Editable review table for machine translations. One row per unique source
 * text (identical texts are pre-deduped by the caller/API); editing a row
 * applies everywhere that text is used, which the usage badge makes visible.
 */
export default function TranslationReviewTable({
  entries, onEdit, sourceLocale, sectionSources, onSectionSourceChange,
}: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const perSection = !!sectionSources;

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? entries.filter(
          (e) =>
            e.text.toLowerCase().includes(q) ||
            Object.values(e.translations).some((v) => v.toLowerCase().includes(q)),
        )
      : entries;
    const by: Record<string, TranslationReviewEntry[]> = {};
    for (const e of filtered) {
      const s = sectionFor(e.usage);
      (by[s] ||= []).push(e);
    }
    return SECTION_ORDER.filter((s) => by[s]?.length).map((s) => ({ key: s, rows: by[s] }));
  }, [entries, query]);

  if (entries.length === 0) {
    return <p className="text-sm text-fg-secondary">{t('trReviewEmpty')}</p>;
  }

  const sourceFor = (sectionKey: string) =>
    perSection ? (sectionSources![sectionKey] ?? 'en') : (sourceLocale ?? 'en');

  return (
    <div className="space-y-4">
      <div className="relative">
        <SearchIcon className="w-4 h-4 absolute top-1/2 -translate-y-1/2 ltr:left-3 rtl:right-3 text-fg-secondary" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('trReviewSearch')}
          className="w-full ltr:pl-9 rtl:pr-9 px-3 py-2 rounded-standard bg-[var(--surface-subtle)] border border-[var(--divider)] text-sm text-fg-primary placeholder:text-fg-secondary focus:outline-none focus:border-brand-500"
        />
      </div>

      {sections.map(({ key, rows }) => {
        const isCollapsed = collapsed[key] ?? false;
        const secSource = sourceFor(key);
        const targetLocales = SUPPORTED_LOCALES.filter((l) => l !== secSource);
        return (
          <div key={key}>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [key]: !isCollapsed }))}
                className="flex items-center gap-1.5 text-sm font-bold text-fg-primary"
              >
                {isCollapsed ? (
                  <ChevronRightIcon className="w-4 h-4 rtl:rotate-180" />
                ) : (
                  <ChevronDownIcon className="w-4 h-4" />
                )}
                {t(SECTION_LABEL_KEY[key])}
                <span className="text-xs font-normal text-fg-secondary">({rows.length})</span>
              </button>

              {perSection && (
                <label className="flex items-center gap-1.5 text-xs text-fg-secondary">
                  {t('importSectionSourceLabel')}
                  <select
                    value={secSource}
                    onChange={(e) => onSectionSourceChange?.(key, e.target.value)}
                    className="px-2 py-1 rounded-standard bg-[var(--surface-subtle)] border border-[var(--divider)] text-xs text-fg-primary focus:outline-none focus:border-brand-500"
                  >
                    {SUPPORTED_LOCALES.map((loc) => (
                      <option key={loc} value={loc}>{LOCALE_LABELS[loc]}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {!isCollapsed && (
              <DataTable responsive={false}>
                <DataTableHead>
                  <DataTableHeadCell>
                    {LOCALE_LABELS[secSource] ?? secSource}
                  </DataTableHeadCell>
                  {targetLocales.map((loc) => (
                    <DataTableHeadCell key={loc}>{LOCALE_LABELS[loc] ?? loc}</DataTableHeadCell>
                  ))}
                </DataTableHead>
                <DataTableBody>
                  {rows.map((row, i) => {
                    const total = usageTotal(row.usage);
                    return (
                      <DataTableRow key={row.text} index={i}>
                        <DataTableCell className="align-top">
                          <div
                            className="text-sm text-fg-primary"
                            dir={secSource === 'he' ? 'rtl' : 'ltr'}
                          >
                            {row.text}
                          </div>
                          {total > 1 && (
                            <span className="inline-block mt-1 text-xs text-fg-secondary px-1.5 py-0.5 rounded bg-[var(--surface-subtle)]">
                              {t('trReviewUsedIn').replace('{count}', String(total))}
                            </span>
                          )}
                        </DataTableCell>
                        {targetLocales.map((loc) => (
                          <DataTableCell key={loc} className="align-top">
                            <input
                              type="text"
                              dir={loc === 'he' ? 'rtl' : 'ltr'}
                              value={row.translations[loc] ?? ''}
                              onChange={(e) => onEdit(row.text, loc, e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-standard bg-[var(--surface-subtle)] border border-[var(--divider)] text-sm text-fg-primary focus:outline-none focus:border-brand-500"
                            />
                          </DataTableCell>
                        ))}
                      </DataTableRow>
                    );
                  })}
                </DataTableBody>
              </DataTable>
            )}
          </div>
        );
      })}
    </div>
  );
}
