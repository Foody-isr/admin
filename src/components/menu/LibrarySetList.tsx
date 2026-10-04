'use client';

import Link from 'next/link';
import { Copy, Trash2, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, Button, EmptyState, Skeleton } from '@/components/ds';
import { useI18n } from '@/lib/i18n';

interface LibrarySetRow {
  id: number;
  name: string;
  summary: string;
  count: number;
  required?: boolean;
}

/** Reusable option/modifier library: accessible links, explicit actions and distinct load states. */
export function LibrarySetList({ rows, href, icon, title, description, emptyAction, loading, error, onRetry, busyId, onDelete, onDuplicate }: {
  rows: LibrarySetRow[];
  href: (id: number) => string;
  icon: ReactNode;
  title: string;
  description: string;
  emptyAction?: ReactNode;
  loading: boolean;
  error: string;
  onRetry: () => void;
  busyId?: number | null;
  onDelete?: (id: number, name: string) => void;
  onDuplicate?: (id: number) => void;
}) {
  const { t } = useI18n();
  return <section className="border border-[var(--line)] rounded-r-lg bg-[var(--surface)] overflow-hidden" aria-label={title} aria-busy={loading}>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[var(--danger-50)] text-[var(--danger-500)] text-sm">
      <p>{error}</p><Button variant="secondary" onClick={onRetry}>{t('retry')}</Button>
    </div>}
    {loading ? <div className="space-y-5 p-5">{[0,1,2].map(i => <div key={i} className="flex gap-4"><Skeleton className="size-10" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-2/3" /></div></div>)}</div>
      : rows.length === 0 ? !error && <EmptyState icon={icon} title={title} desc={description} action={emptyAction} className="px-5" />
      : <ul className="divide-y divide-[var(--line)]">{rows.map(row => <li key={row.id} className="flex items-center gap-2 px-3 sm:px-5 hover:bg-[var(--surface-2)] transition-colors">
        <Link href={href(row.id)} className="flex min-w-0 flex-1 items-center gap-3 py-5 rounded-r-sm group">
          <span className="hidden sm:grid size-10 shrink-0 place-items-center rounded-r-md bg-[var(--summary-bg)] text-[var(--summary-fg)] [&_svg]:size-5" aria-hidden>{icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center flex-wrap gap-2"><h2 className="font-semibold text-sm text-[var(--fg)] break-words">{row.name}</h2>{row.required && <Badge>{t('required')}</Badge>}</div>
            <p className="text-sm text-[var(--fg-muted)] mt-1 line-clamp-2">{row.summary || '—'}</p>
            <p className="text-xs text-[var(--fg-subtle)] mt-1"><bdi>{row.count}</bdi> {t('items').toLowerCase()}</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-[var(--fg-muted)] rtl:rotate-180" aria-hidden />
        </Link>
        <div className="flex shrink-0 gap-1">
          {onDuplicate && <Button variant="ghost" icon disabled={busyId === row.id} onClick={() => onDuplicate(row.id)} aria-label={`${t('duplicate')} · ${row.name}`}><Copy /></Button>}
          {onDelete && <Button variant="ghost" icon disabled={busyId === row.id} onClick={() => onDelete(row.id,row.name)} aria-label={`${t('delete')} · ${row.name}`} className="text-[var(--danger-500)] hover:bg-[var(--danger-50)]"><Trash2 /></Button>}
        </div>
      </li>)}</ul>}
  </section>;
}
