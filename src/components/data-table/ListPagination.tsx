'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Select } from '@/components/ds';
import { useI18n } from '@/lib/i18n';

interface ListPaginationProps {
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  disabled?: boolean;
}

/** Shared pagination for local and server-backed lists without implying a fake total. */
export function ListPagination({ page, totalPages, pageSize, onPageChange, onPageSizeChange, disabled }: ListPaginationProps) {
  const { t } = useI18n();
  return <nav aria-label={t('listPagination')} className="mt-6 flex flex-wrap items-center justify-between gap-4 text-fs-sm">
    {onPageSizeChange ? <label className="flex items-center gap-3"><span>{t('listPageSize')}</span>
      <Select className="w-auto min-h-11" value={pageSize} disabled={disabled} onChange={event => onPageSizeChange(Number(event.target.value))}>
        {[10,25,50,100].map(size => <option key={size} value={size}>{size}</option>)}
      </Select></label> : <span className="text-[var(--fg-muted)]">{t('listPageSize')} · {pageSize}</span>}
    <div className="flex items-center gap-3">
      <span className="tabular-nums" aria-live="polite">{t('listPagePosition').replace('{page}', String(page)).replace('{pages}', String(Math.max(1,totalPages)))}</span>
      <Button type="button" variant="secondary" icon aria-label={t('previous')} disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft className="rtl:rotate-180" /></Button>
      <Button type="button" variant="secondary" icon aria-label={t('next')} disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight className="rtl:rotate-180" /></Button>
    </div>
  </nav>;
}

/** Reset a local list to its first page when filters change and clamp after deletion. */
export function useListPagination<T>(items: T[], resetKey: string, initialSize = 25) {
  const [state, setState] = useState({ page: 1, pageSize: initialSize, resetKey });
  const totalPages = Math.max(1, Math.ceil(items.length / state.pageSize));
  const page = state.resetKey === resetKey ? Math.min(state.page, totalPages) : 1;
  const onPageChange = (value: number) => setState(current => ({ ...current, resetKey, page: Math.max(1, Math.min(value,totalPages)) }));
  const onPageSizeChange = (value: number) => setState({ resetKey, page: 1, pageSize: value });
  return { rows: items.slice((page - 1) * state.pageSize, page * state.pageSize), page, pageSize: state.pageSize, totalPages, onPageChange, onPageSizeChange };
}
