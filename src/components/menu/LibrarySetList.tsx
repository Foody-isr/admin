'use client';

import Link from 'next/link';
import { Copy, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { DataTable, DataTableHead, DataTableHeadCell, DataTableBody, DataTableRow, DataTableCell, SortableHeadCell, ListToolbar, ListPagination, useListPagination, type SortDir } from '@/components/data-table';
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
export function LibrarySetList({ rows, href, icon, title, description, emptyAction, loading, error, onRetry, busyId, onDelete, onDuplicate, actions, primaryAction }: {
  actions?: ReactNode;
  primaryAction?: ReactNode;
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
  const { t, locale } = useI18n();
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const filtered = rows.filter(row => `${row.name} ${row.summary}`.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)))
    .sort((a,b) => a.name.localeCompare(b.name,locale) * (sortDir === 'asc' ? 1 : -1));
  const pagination = useListPagination(filtered, `${search}:${sortDir}`);
  return <section aria-label={title} aria-busy={loading}>
    <ListToolbar search={{ value: search, onChange: setSearch, label: t('search') }} actions={actions} primaryAction={primaryAction} />
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[var(--danger-50)] text-[var(--danger-500)] text-sm">
      <p>{error}</p><Button variant="secondary" onClick={onRetry}>{t('retry')}</Button>
    </div>}
    {loading ? <div className="space-y-5 p-5">{[0,1,2].map(i => <div key={i} className="flex gap-4"><Skeleton className="size-10" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-2/3" /></div></div>)}</div>
      : rows.length === 0 ? !error && <EmptyState icon={icon} title={title} desc={description} action={emptyAction} className="px-5" />
      : !filtered.length ? <EmptyState title={t('listNoMatches')} action={<Button variant="secondary" onClick={() => setSearch('')}>{t('reset')}</Button>} />
      : <><DataTable className="list-table"><DataTableHead>
        <SortableHeadCell sortKey="name" currentSortKey="name" sortDir={sortDir} onSort={() => setSortDir(current => current === 'asc' ? 'desc' : 'asc')}>{t('name')}</SortableHeadCell>
        <DataTableHeadCell>{t('options')}</DataTableHeadCell><DataTableHeadCell align="right">{t('items')}</DataTableHeadCell>
        <DataTableHeadCell><span className="sr-only">{t('actions')}</span></DataTableHeadCell>
      </DataTableHead><DataTableBody>{pagination.rows.map(row => <DataTableRow key={row.id}>
        <DataTableCell mobilePrimary><Link href={href(row.id)} className="inline-flex min-h-11 items-center gap-2 text-start text-sm text-[var(--fg)] hover:underline"><span>{row.name}</span>{row.required && <Badge>{t('required')}</Badge>}</Link></DataTableCell>
        <DataTableCell mobileLabel={t('options')}><span className="text-[var(--fg-muted)]">{row.summary || '—'}</span></DataTableCell>
        <DataTableCell align="right" mobileLabel={t('items')}><bdi>{row.count}</bdi></DataTableCell>
        <DataTableCell><div className="flex justify-end gap-1">
          {onDuplicate && <Button variant="ghost" icon disabled={busyId === row.id} onClick={() => onDuplicate(row.id)} aria-label={`${t('duplicate')} · ${row.name}`}><Copy /></Button>}
          {onDelete && <Button variant="ghost" icon disabled={busyId === row.id} onClick={() => onDelete(row.id,row.name)} aria-label={`${t('delete')} · ${row.name}`} className="text-[var(--danger-500)] hover:bg-[var(--danger-50)]"><Trash2 /></Button>}
        </div></DataTableCell>
      </DataTableRow>)}</DataTableBody></DataTable><ListPagination {...pagination} /></>}

  </section>;
}
