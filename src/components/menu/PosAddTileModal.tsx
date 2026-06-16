'use client';

import * as React from 'react';
import { Layers, Search } from 'lucide-react';
import { Drawer } from '@/components/ds/Drawer';
import {
  POS_DEFAULT_COLOR,
  type PosDisplayTile,
} from '@/lib/posDisplay';
import type { Menu, MenuItem } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';

export interface PosAddTileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current container: 'menu' = top level, a number = inside that group. */
  level: 'menu' | number;
  /** Menu whose groups can be added (only relevant at the top level). */
  menu: Menu;
  /** Full item catalog, searched by name. */
  items: MenuItem[];
  /** Group ids already placed on the top grid — excluded from the group list. */
  placedGroupIds: number[];
  /** Append the built tiles to the current container. */
  onAdd: (tiles: PosDisplayTile[]) => void;
}

/** Default shape for a freshly-created tile. Position is reassigned on append. */
function baseTile(): Omit<PosDisplayTile, 'tile_type'> {
  return {
    size: 'petit',
    bg_type: 'color',
    color: POS_DEFAULT_COLOR,
    image_url: '',
    position: 0,
  };
}

/**
 * Drawer-based picker for adding tiles to a POS display layout.
 *
 * - At the top level (`level === 'menu'`): shows a "Groupes" section (menu
 *   groups not already placed) and an "Articles" search section.
 * - Inside a group (`level` is a number): only the "Articles" search, since
 *   nested groups are not supported on the POS display.
 *
 * Clicking a row builds the matching `PosDisplayTile` and calls `onAdd`, then
 * closes the drawer.
 */
export function PosAddTileModal({
  open,
  onOpenChange,
  level,
  menu,
  items,
  placedGroupIds,
  onAdd,
}: PosAddTileModalProps) {
  const [search, setSearch] = React.useState('');
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  // Reset the search field whenever the drawer opens.
  React.useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  const isMenuLevel = level === 'menu';

  const availableGroups = React.useMemo(() => {
    if (!isMenuLevel) return [];
    const placed = new Set(placedGroupIds);
    return (menu.groups ?? []).filter((g) => !placed.has(g.id));
  }, [isMenuLevel, menu.groups, placedGroupIds]);

  const filteredItems = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.name.toLowerCase().includes(q));
  }, [items, search]);

  const addGroupTile = (groupId: number) => {
    if (!canEdit) return;
    onAdd([{ ...baseTile(), tile_type: 'group', ref_group_id: groupId }]);
    onOpenChange(false);
  };

  const addItemTile = (itemId: number) => {
    if (!canEdit) return;
    onAdd([{ ...baseTile(), tile_type: 'item', ref_item_id: itemId }]);
    onOpenChange(false);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Ajouter au système de caisse"
      width={420}
    >
      <div className="space-y-[var(--s-6)]">
        {/* ── Groupes (top level only) ── */}
        {isMenuLevel && (
          <section>
            <h3 className="text-fs-sm font-semibold text-[var(--fg-muted)] mb-[var(--s-3)]">
              Groupes
            </h3>
            {availableGroups.length === 0 ? (
              <p className="text-fs-sm text-[var(--fg-subtle)]">
                Tous les groupes sont déjà placés.
              </p>
            ) : (
              <div className="space-y-[var(--s-1)]">
                {availableGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => addGroupTile(g.id)}
                    className="w-full flex items-center gap-[var(--s-3)] rounded-md px-[var(--s-3)] py-[var(--s-2)] text-start hover:bg-[var(--surface-subtle)] transition-colors"
                  >
                    {g.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={g.image_url}
                        alt=""
                        className="w-9 h-9 rounded-md object-cover shrink-0"
                      />
                    ) : (
                      <span className="grid place-items-center w-9 h-9 rounded-md bg-[var(--surface-subtle)] text-[var(--fg-subtle)] shrink-0">
                        <Layers className="w-4 h-4" />
                      </span>
                    )}
                    <span className="flex-1 min-w-0 truncate text-fs-sm font-medium text-[var(--fg)]">
                      {g.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Articles ── */}
        <section>
          <h3 className="text-fs-sm font-semibold text-[var(--fg-muted)] mb-[var(--s-3)]">
            Articles
          </h3>
          <div className="relative mb-[var(--s-3)]">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un article"
              className="w-full h-9 rounded-md border border-[var(--line)] bg-[var(--surface)] ps-9 pe-3 text-fs-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)] focus:outline-none focus:border-[var(--line-strong)]"
            />
          </div>
          {filteredItems.length === 0 ? (
            <p className="text-fs-sm text-[var(--fg-subtle)]">Aucun résultat.</p>
          ) : (
            <div className="space-y-[var(--s-1)] max-h-[50vh] overflow-auto">
              {filteredItems.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => addItemTile(it.id)}
                  className="w-full flex items-center gap-[var(--s-3)] rounded-md px-[var(--s-3)] py-[var(--s-2)] text-start hover:bg-[var(--surface-subtle)] transition-colors"
                >
                  {it.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.image_url}
                      alt=""
                      className="w-9 h-9 rounded-md object-cover shrink-0"
                    />
                  ) : (
                    <span className="w-9 h-9 rounded-md bg-[var(--surface-subtle)] shrink-0" />
                  )}
                  <span className="flex-1 min-w-0 truncate text-fs-sm font-medium text-[var(--fg)]">
                    {it.name}
                  </span>
                  {it.price != null && (
                    <span className="text-fs-sm text-[var(--fg-subtle)] shrink-0">
                      ₪{it.price.toFixed(2)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </Drawer>
  );
}
