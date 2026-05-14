'use client';

import { useMemo, useState } from 'react';
import { SearchIcon } from 'lucide-react';
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
 * Lets the user pick the exact menu groups an item belongs to. Replaces the
 * older menu-only picker, which silently dropped items into a menu's first
 * group on save — landing them in whichever group happened to be at
 * sort_order=0 (often a combo container).
 */
export default function MenuGroupPicker({
  menus,
  selectedGroupIds,
  onChange,
  placeholder,
  emptyLabel,
  noGroupsHint,
}: Props) {
  const [search, setSearch] = useState('');

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

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none" />
        <input
          type="text"
          placeholder={placeholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input text-sm w-full pl-9"
        />
      </div>
      {menus.length === 0 ? (
        emptyLabel ? <p className="text-xs text-fg-tertiary italic">{emptyLabel}</p> : null
      ) : (
        <div className="space-y-3 max-h-72 overflow-y-auto">
          {visibleMenus.map((menu) => {
            const groups = menu.groups ?? [];
            return (
              <div key={menu.id} className="space-y-1">
                <div className="text-fs-xs font-semibold uppercase tracking-[.06em] text-[var(--fg-muted)] px-2">
                  {menu.name}
                </div>
                {groups.length === 0 ? (
                  <p className="text-xs text-fg-tertiary italic px-2">
                    {noGroupsHint ?? 'No groups yet'}
                  </p>
                ) : (
                  groups.map((group) => (
                    <label
                      key={group.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--surface-subtle)] cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.has(group.id)}
                        onChange={() => toggleGroup(group.id)}
                        className="rounded border-[var(--divider)]"
                      />
                      <span className="text-sm text-fg-primary">{group.name}</span>
                    </label>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
