'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  const { isOpen, closeSearch } = useSearchShortcut();
  const params = useParams();
  const restaurantId = Number(params.restaurantId);
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useGlobalSearch(restaurantId, query);

  // Reset query + focus when opening.
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
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
    <div
      className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-sm flex items-start justify-center sm:pt-20"
      onClick={closeSearch}
    >
      <div
        className="w-full sm:w-[540px] sm:max-w-[calc(100vw-32px)] sm:rounded-xl bg-[var(--surface)] border border-[var(--line-strong)] shadow-2xl overflow-hidden h-screen sm:h-auto sm:max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-[var(--line)]">
          <SearchIcon className="w-4 h-4 text-[var(--fg-subtle)] shrink-0" />
          <input
            ref={inputRef}
            data-search-modal-input="true"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Tapez pour rechercher articles, commandes, clients, stock…"
            className="flex-1 bg-transparent border-none outline-none text-fs-md text-[var(--fg)] placeholder:text-[var(--fg-subtle)]"
            type="text"
            autoComplete="off"
          />
          <button
            onClick={closeSearch}
            className="text-[var(--fg-subtle)] hover:text-[var(--fg)] p-1"
            aria-label="Fermer"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Results region */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {query.trim().length < 2 && (
            <div className="px-5 py-10 text-center text-fs-sm text-[var(--fg-muted)]">
              Tapez au moins 2 caractères pour rechercher.
            </div>
          )}
          {query.trim().length >= 2 && data && data.groups.length === 0 && !isLoading && (
            <div className="px-5 py-10 text-center text-fs-sm text-[var(--fg-muted)]">
              Aucun résultat pour « {query} »
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
              <div className="px-5 pt-3 pb-1 text-[10px] font-semibold tracking-wider uppercase text-[var(--fg-subtle)] flex items-center justify-between">
                <span>{g.label} · {g.items.length}</span>
              </div>
              {g.items.map((r, ri) => {
                const flatIdx = flatRows.findIndex((f) => f.groupIndex === gi && f.itemIndex === ri);
                const isActive = flatIdx === activeIndex;
                return (
                  <button
                    key={r.id}
                    onMouseEnter={() => setActiveIndex(flatIdx)}
                    onClick={() => { router.push(r.url); closeSearch(); }}
                    className={`w-full text-left flex items-center gap-3 px-5 py-2 ${
                      isActive ? 'bg-[var(--brand-500)]/12' : ''
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
            <kbd className="font-mono text-[11px] bg-[var(--surface-2)] border border-[var(--line)] rounded px-1.5 py-0.5">↑</kbd>
            <kbd className="font-mono text-[11px] bg-[var(--surface-2)] border border-[var(--line)] rounded px-1.5 py-0.5">↓</kbd>
            naviguer
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="font-mono text-[11px] bg-[var(--surface-2)] border border-[var(--line)] rounded px-1.5 py-0.5">↵</kbd>
            ouvrir
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="font-mono text-[11px] bg-[var(--surface-2)] border border-[var(--line)] rounded px-1.5 py-0.5">esc</kbd>
            fermer
          </span>
        </div>
      </div>
    </div>
  );
}
