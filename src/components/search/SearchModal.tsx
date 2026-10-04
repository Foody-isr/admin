'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';
import { useI18n } from '@/lib/i18n';
import { useParams, useRouter } from 'next/navigation';
import {
  SearchIcon,
  XIcon,
  UtensilsCrossedIcon,
  ReceiptIcon,
  UserIcon,
  PackageIcon,
} from 'lucide-react';
import { useGlobalSearch } from '@/lib/use-global-search';
import { useSearchShortcut } from '@/lib/search-shortcut';
import { SearchResult, SearchGroupType } from '@/lib/api';

interface FlatRow {
  groupIndex: number;
  itemIndex: number;
  result: SearchResult;
}

function FallbackIcon({ type }: { type: SearchGroupType }) {
  const Icon = {
    item: UtensilsCrossedIcon,
    order: ReceiptIcon,
    customer: UserIcon,
    stock: PackageIcon,
  }[type];
  return <Icon className="w-4 h-4 text-[var(--fg-subtle)]" />;
}

function ResultThumbnail({ src, type }: { src?: string; type: SearchGroupType }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <FallbackIcon type={type} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
    />
  );
}

function highlight(title: string, q: string): React.ReactNode {
  if (!q) return title;
  const lowerTitle = title.toLowerCase();
  const idx = lowerTitle.indexOf(q.toLowerCase());
  if (idx === -1) return title;
  return (
    <>
      {title.slice(0, idx)}
      <span className="bg-[var(--brand-500)]/30 text-[var(--fg)] rounded-sm">
        {title.slice(idx, idx + q.length)}
      </span>
      {title.slice(idx + q.length)}
    </>
  );
}

export default function SearchModal() {
  const { t } = useI18n();
  const focus = useDialogReturnFocus();
  const resultsId = useId();
  const { isOpen, closeSearch } = useSearchShortcut();
  const params = useParams();
  const restaurantId = Number(params.restaurantId);
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useGlobalSearch(restaurantId, query);

  // Reset query + focus when opening.
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  // Flatten groups -> rows for keyboard navigation.
  const flatRows: FlatRow[] = useMemo(() => {
    const out: FlatRow[] = [];
    data?.groups.forEach((g, gi) => {
      g.items.forEach((r, ri) => out.push({ groupIndex: gi, itemIndex: ri, result: r }));
    });
    return out;
  }, [data]);

  // Clamp activeIndex when results change.
  useEffect(() => {
    if (activeIndex >= flatRows.length) setActiveIndex(0);
  }, [flatRows.length, activeIndex]);

  // Skeleton only after 150ms of pending state (avoids flash on fast responses).
  const [showSkeleton, setShowSkeleton] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setShowSkeleton(false);
      return;
    }
    const t = setTimeout(() => setShowSkeleton(true), 150);
    return () => clearTimeout(t);
  }, [isLoading]);

  useEffect(() => {
    document.getElementById(`${resultsId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, resultsId]);

  if (!isOpen) return null;

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (flatRows.length ? (i + 1) % flatRows.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (flatRows.length ? (i - 1 + flatRows.length) % flatRows.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = flatRows[activeIndex];
      if (row) {
        router.push(row.result.url);
        closeSearch();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
    }
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={open => { if (!open) closeSearch(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-[var(--overlay)]" />
        <Dialog.Content {...focus} aria-describedby={undefined}
          onOpenAutoFocus={event => { focus.onOpenAutoFocus(event); event.preventDefault(); inputRef.current?.focus(); }}
          className="fixed inset-0 sm:inset-auto sm:top-20 sm:left-1/2 sm:-translate-x-1/2 z-[100] w-full sm:w-[540px] sm:max-w-[calc(100vw-32px)] sm:rounded-r-lg bg-[var(--surface)] border border-[var(--line)] shadow-3 overflow-hidden h-dvh pt-safe-t pb-safe-b sm:h-auto sm:max-h-[70dvh] sm:pt-0 sm:pb-0 flex flex-col">
        <Dialog.Title className="sr-only">{t('globalSearch')}</Dialog.Title>
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-[var(--line)]">
          <SearchIcon className="w-4 h-4 text-[var(--fg-subtle)] shrink-0" />
          <input
            ref={inputRef}
            data-search-modal-input="true"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t('globalSearchPlaceholder')}
            aria-label={t('globalSearch')}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={Boolean(data?.groups.length)}
            aria-controls={resultsId}
            aria-activedescendant={flatRows[activeIndex] ? `${resultsId}-${activeIndex}` : undefined}
            className="min-w-0 flex-1 bg-transparent border-none outline-none text-fs-md text-[var(--fg)] placeholder:text-[var(--fg-subtle)]"
            type="text"
            autoComplete="off"
          />
          <button
            onClick={closeSearch}
            className="text-[var(--fg-subtle)] hover:text-[var(--fg)] size-10 shrink-0 grid place-items-center"
            aria-label={t('close')}
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Results region */}
        <div ref={listRef} id={resultsId} role="listbox" aria-label={t('globalSearchResults')} className="flex-1 overflow-y-auto">
          {error && <p role="alert" className="p-5 text-sm text-[var(--danger-500)]">{t('globalSearchError')}</p>}
          {query.trim().length < 2 && (
            <div className="px-5 py-10 text-center text-fs-sm text-[var(--fg-muted)]">
              {t('globalSearchMinimum')}
            </div>
          )}
          {query.trim().length >= 2 && data && data.groups.length === 0 && !isLoading && (
            <div className="px-5 py-10 text-center text-fs-sm text-[var(--fg-muted)]">
              {t('globalSearchEmpty').replace('{query}',query)}
            </div>
          )}
          {showSkeleton && (!data || data.groups.length === 0) && (
            <div className="px-5 py-4 space-y-2">
              <div className="h-10 rounded-md bg-[var(--surface-2)] animate-pulse" />
              <div className="h-10 rounded-md bg-[var(--surface-2)] animate-pulse" />
            </div>
          )}
          {data?.groups.map((g, gi) => (
            <div key={g.type}>
              <div className="px-5 pt-3 pb-1 text-xs font-semibold text-[var(--fg-subtle)] flex items-center justify-between">
                <span>{t(g.type === 'item' ? 'items' : g.type === 'order' ? 'orders' : g.type === 'customer' ? 'customers' : 'stock')} · {g.items.length}</span>
              </div>
              {g.items.map((r, ri) => {
                const flatIdx = flatRows.findIndex((f) => f.groupIndex === gi && f.itemIndex === ri);
                const isActive = flatIdx === activeIndex;
                return (
                  <button
                    key={r.id}
                    id={`${resultsId}-${flatIdx}`} role="option" aria-selected={isActive} tabIndex={-1}
                    onMouseEnter={() => setActiveIndex(flatIdx)}
                    onClick={() => { router.push(r.url); closeSearch(); }}
                    className={`w-full text-start flex items-center gap-3 px-5 py-2 ${
                      isActive ? 'bg-[var(--brand-soft)]' : ''
                    }`}
                  >
                    <div className="w-8 h-8 shrink-0 rounded-md bg-[var(--surface-2)] border border-[var(--line)] overflow-hidden flex items-center justify-center">
                      <ResultThumbnail src={r.image} type={g.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-fs-sm text-[var(--fg)] truncate">{highlight(r.title, query.trim())}</div>
                      <div className="text-fs-xs text-[var(--fg-muted)] truncate">{r.subtitle}</div>
                    </div>
                    {isActive && <div className="text-fs-xs text-[var(--fg-muted)] hidden sm:block">↵</div>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="hidden sm:flex items-center gap-4 px-5 py-2.5 border-t border-[var(--line)] text-fs-xs text-[var(--fg-muted)]">
          <span className="flex items-center gap-1.5">
            <kbd className="font-mono text-xs bg-[var(--surface-2)] border border-[var(--line)] rounded px-1.5 py-0.5">↑</kbd>
            <kbd className="font-mono text-xs bg-[var(--surface-2)] border border-[var(--line)] rounded px-1.5 py-0.5">↓</kbd>
            {t('globalSearchNavigate')}
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="font-mono text-xs bg-[var(--surface-2)] border border-[var(--line)] rounded px-1.5 py-0.5">↵</kbd>
            {t('open')}
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="font-mono text-xs bg-[var(--surface-2)] border border-[var(--line)] rounded px-1.5 py-0.5">esc</kbd>
            {t('close')}
          </span>
        </div>
      </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
