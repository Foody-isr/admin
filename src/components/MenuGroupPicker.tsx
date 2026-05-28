'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchIcon, ChevronDown, X } from 'lucide-react';
import type { Menu } from '@/lib/api';

interface Props {
  menus: Menu[];
  /** Selected menu_group IDs the item belongs to. */
  selectedGroupIds: Set<number>;
  onChange: (next: Set<number>) => void;
  placeholder?: string;
  /** Shown when the restaurant has no menus at all. */
  emptyLabel?: string;
  /** Shown beside a menu that has no groups yet. */
  noGroupsHint?: string;
}

/**
 * Compact dropdown picker for the menu groups an item belongs to. The closed
 * control shows the current selection as removable chips; opening it reveals a
 * searchable, menu-grouped checkbox list. Replaces the older always-expanded
 * checkbox tree, which pushed the rest of the form far down the page.
 */
export default function MenuGroupPicker({
  menus,
  selectedGroupIds,
  onChange,
  placeholder,
  emptyLabel,
  noGroupsHint,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape so the popover behaves like a native select.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Resolve the selected ids to {id, name} for the chips on the closed control.
  const selectedChips = useMemo(() => {
    const chips: { id: number; name: string }[] = [];
    for (const m of menus) {
      for (const g of m.groups ?? []) {
        if (selectedGroupIds.has(g.id)) chips.push({ id: g.id, name: g.name });
      }
    }
    return chips;
  }, [menus, selectedGroupIds]);

  const visibleMenus = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return menus;
    const out: Menu[] = [];
    for (const m of menus) {
      const menuMatches = m.name.toLowerCase().includes(q);
      const groups = (m.groups ?? []).filter(
        (g) => menuMatches || g.name.toLowerCase().includes(q),
      );
      if (groups.length === 0 && !menuMatches) continue;
      out.push({ ...m, groups });
    }
    return out;
  }, [menus, search]);

  const toggleGroup = (groupId: number) => {
    const next = new Set(selectedGroupIds);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    onChange(next);
  };

  if (menus.length === 0) {
    return emptyLabel ? (
      <p className="text-fs-xs text-[var(--fg-subtle)] italic">{emptyLabel}</p>
    ) : null;
  }

  return (
    <div ref={rootRef} className="relative">
      {/* Closed control — selection chips + chevron. Clicking anywhere opens. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-[var(--s-2)] w-full min-h-9 px-[var(--s-3)] py-1.5 bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-md hover:border-[var(--fg-subtle)] focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring transition-colors"
      >
        <div className="flex-1 min-w-0 flex flex-wrap gap-1.5 text-start">
          {selectedChips.length === 0 ? (
            <span className="text-fs-sm text-[var(--fg-subtle)]">
              {placeholder || 'Ajouter à des cartes'}
            </span>
          ) : (
            selectedChips.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 h-6 ps-2 pe-1 rounded-r-sm bg-[var(--surface-2)] border border-[var(--line)] text-fs-xs text-[var(--fg)]"
              >
                {c.name}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Retirer ${c.name}`}
                  onClick={(e) => { e.stopPropagation(); toggleGroup(c.id); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleGroup(c.id); } }}
                  className="grid place-items-center size-4 rounded-sm text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--line)] transition-colors"
                >
                  <X className="w-3 h-3" />
                </span>
              </span>
            ))
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[var(--fg-muted)] shrink-0 transition-transform duration-fast ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Popover — search + menu-grouped checkboxes. */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-[var(--surface)] border border-[var(--line)] rounded-r-md shadow-3 overflow-hidden">
          <div className="p-[var(--s-2)] border-b border-[var(--line)]">
            <div className="relative">
              <SearchIcon className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none" />
              <input
                autoFocus
                type="text"
                placeholder={placeholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-8 ps-9 pe-3 bg-[var(--surface-2)] border border-[var(--line)] rounded-r-sm text-fs-sm text-[var(--fg)] focus:outline-none focus:border-[var(--brand-500)]"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-[var(--s-2)] space-y-[var(--s-3)]">
            {visibleMenus.map((menu) => {
              const groups = menu.groups ?? [];
              return (
                <div key={menu.id} className="space-y-0.5">
                  <div className="text-fs-xs font-semibold uppercase tracking-[.06em] text-[var(--fg-muted)] px-2 py-1">
                    {menu.name}
                  </div>
                  {groups.length === 0 ? (
                    <p className="text-fs-xs text-[var(--fg-subtle)] italic px-2">
                      {noGroupsHint ?? ''}
                    </p>
                  ) : (
                    groups.map((group) => (
                      <label
                        key={group.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-r-sm hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedGroupIds.has(group.id)}
                          onChange={() => toggleGroup(group.id)}
                          className="w-4 h-4 accent-[var(--brand-500)]"
                        />
                        <span className="text-fs-sm text-[var(--fg)]">{group.name}</span>
                      </label>
                    ))
                  )}
                </div>
              );
            })}
            {visibleMenus.length === 0 && (
              <p className="text-fs-xs text-[var(--fg-subtle)] italic px-2 py-2">—</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
