'use client';

import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ds';
import { useI18n } from '@/lib/i18n';

interface ListToolbarProps {
  search: { value: string; onChange: (value: string) => void; label: string; disabled?: boolean };
  filters?: ReactNode;
  actions?: ReactNode;
  primaryAction?: ReactNode;
}

/** One shared rail for search, quick filters, an actions menu and creation. */
export function ListToolbar({ search, filters, actions, primaryAction }: ListToolbarProps) {
  const { t } = useI18n();
  return <section data-list-toolbar aria-label={t('listTools')} className="list-toolbar">
    <div className="list-toolbar-row">
      <div className="list-search">
        <Search aria-hidden className="pointer-events-none absolute start-5 top-1/2 size-5 -translate-y-1/2 text-[var(--fg)]" />
        <Input type="search" dir="auto" className="list-search-input" aria-label={search.label}
          placeholder={search.label} value={search.value} disabled={search.disabled} onChange={event => search.onChange(event.target.value)} />
      </div>
      {filters && <div className="list-filters">{filters}</div>}
      {(actions || primaryAction) && <div className="list-commands"><div className="list-actions">{actions}</div>{primaryAction}</div>}
    </div>
  </section>;
}
