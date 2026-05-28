'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Eye, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { PosTile } from '@/components/menu/PosTile';
import { PosTileCanvas } from '@/components/menu/PosTileCanvas';
import { PosAddTileModal } from '@/components/menu/PosAddTileModal';
import {
  PosTileInspector,
  type PosSortKey,
} from '@/components/menu/PosTileInspector';
import {
  POS_GRID_COLUMNS,
  POS_PALETTE,
  POS_TILE_SPANS,
  type PosBgType,
  type PosDisplayTile,
  type PosTileSize,
} from '@/lib/posDisplay';
import {
  getPosDisplay,
  listAllItems,
  listMenus,
  savePosDisplay,
  updateGroup,
  type Menu,
  type MenuGroup,
  type MenuItem,
} from '@/lib/api';
import type { PosTileRef } from '@/components/menu/PosTile';

/** Move an item within an array, returning a new array. */
function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Reassign `position` to match array index. */
function withPositions(tiles: PosDisplayTile[]): PosDisplayTile[] {
  return tiles.map((t, i) => ({ ...t, position: i }));
}

export default function PosDisplayEditorPage() {
  const { restaurantId, menuId } = useParams();
  const rid = Number(restaurantId);
  const mid = Number(menuId);
  const router = useRouter();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [menu, setMenu] = React.useState<Menu | null>(null);
  const [groupMap, setGroupMap] = React.useState<Map<number, MenuGroup>>(new Map());
  const [itemMap, setItemMap] = React.useState<Map<number, MenuItem>>(new Map());

  // Top-level tiles + per-group tile layouts.
  const [tiles, setTiles] = React.useState<PosDisplayTile[]>([]);
  const [groupTiles, setGroupTiles] = React.useState<Record<string, PosDisplayTile[]>>({});

  // Editor UI state.
  const [level, setLevel] = React.useState<number | 'menu'>('menu');
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [preview, setPreview] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);

  const closeBack = () => router.push(`/${rid}/menu/menus/${mid}`);

  // ── Load ──
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listMenus(rid), listAllItems(rid), getPosDisplay(rid, mid)])
      .then(([menus, items, layout]) => {
        if (cancelled) return;
        const found = menus.find((m) => m.id === mid) ?? null;
        setMenu(found);
        setGroupMap(new Map((found?.groups ?? []).map((g) => [g.id, g])));
        setItemMap(new Map(items.map((it) => [it.id, it])));
        setTiles(layout.tiles ?? []);
        setGroupTiles(layout.group_tiles ?? {});
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur de chargement');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rid, mid]);

  // ── Current container ──
  const currentTiles = level === 'menu' ? tiles : (groupTiles[String(level)] ?? []);

  const setCurrentTiles = React.useCallback(
    (next: PosDisplayTile[]) => {
      const positioned = withPositions(next);
      if (level === 'menu') {
        setTiles(positioned);
      } else {
        setGroupTiles((prev) => ({ ...prev, [String(level)]: positioned }));
      }
    },
    [level],
  );

  // ── Resolve display data for a tile ──
  const resolve = React.useCallback(
    (tile: PosDisplayTile): PosTileRef => {
      if (tile.tile_type === 'group') {
        const g = tile.ref_group_id != null ? groupMap.get(tile.ref_group_id) : undefined;
        return { name: g?.name ?? 'Groupe', imageUrl: g?.image_url };
      }
      const it = tile.ref_item_id != null ? itemMap.get(tile.ref_item_id) : undefined;
      return { name: it?.name ?? 'Article', price: it?.price, imageUrl: it?.image_url };
    },
    [groupMap, itemMap],
  );

  const selectedTile =
    selectedIndex != null ? currentTiles[selectedIndex] ?? null : null;

  // ── Handlers ──
  const onSelect = (i: number) => setSelectedIndex(i);

  const onDrill = (i: number) => {
    const tile = currentTiles[i];
    if (tile?.tile_type !== 'group' || tile.ref_group_id == null) return;
    const gid = tile.ref_group_id;
    setGroupTiles((prev) =>
      prev[String(gid)] ? prev : { ...prev, [String(gid)]: [] },
    );
    setLevel(gid);
    setSelectedIndex(null);
  };

  const goToMenuLevel = () => {
    setLevel('menu');
    setSelectedIndex(null);
  };

  const onReorder = (from: number, to: number) => {
    setCurrentTiles(arrayMove(currentTiles, from, to));
    // Clear selection after reorder to avoid stale-index mismatches when a
    // bystander tile is dragged past the currently selected one.
    setSelectedIndex(null);
  };

  const updateSelectedTile = (patch: Partial<PosDisplayTile>) => {
    if (selectedIndex == null) return;
    const next = currentTiles.map((t, i) =>
      i === selectedIndex ? { ...t, ...patch } : t,
    );
    setCurrentTiles(next);
  };

  const removeSelectedTile = () => {
    if (selectedIndex == null) return;
    const removed = currentTiles[selectedIndex] ?? null;
    setCurrentTiles(currentTiles.filter((_, i) => i !== selectedIndex));
    setSelectedIndex(null);
    // Drop the inner-tile bucket so orphaned group tiles don't accumulate in
    // the saved payload.
    if (removed?.tile_type === 'group' && removed.ref_group_id != null) {
      setGroupTiles((prev) => {
        const next = { ...prev };
        delete next[String(removed.ref_group_id)];
        return next;
      });
    }
  };

  const onAddTiles = (newTiles: PosDisplayTile[]) => {
    setCurrentTiles([...currentTiles, ...newTiles]);
    setAddOpen(false);
  };

  // ── Sorting ──
  const applySort = (key: PosSortKey) => {
    const groupOrder = new Map<number, number>();
    (menu?.groups ?? []).forEach((g, idx) => groupOrder.set(g.id, idx));
    const colorIndex = (c: string) => {
      const i = POS_PALETTE.indexOf(c);
      return i === -1 ? POS_PALETTE.length : i;
    };
    const typeRank = (t: PosDisplayTile) => (t.tile_type === 'group' ? 0 : 1);
    const tagged = currentTiles.map((t, i) => ({ t, i })); // for stable sort

    const cmp = (a: PosDisplayTile, b: PosDisplayTile): number => {
      switch (key) {
        case 'menu': {
          const ra = typeRank(a);
          const rb = typeRank(b);
          if (ra !== rb) return ra - rb; // groups before items
          if (a.tile_type === 'group' && b.tile_type === 'group') {
            const oa = groupOrder.get(a.ref_group_id ?? -1) ?? Number.MAX_SAFE_INTEGER;
            const ob = groupOrder.get(b.ref_group_id ?? -1) ?? Number.MAX_SAFE_INTEGER;
            return oa - ob;
          }
          return 0;
        }
        case 'az':
          return resolve(a).name.localeCompare(resolve(b).name);
        case 'color':
          return colorIndex(a.color) - colorIndex(b.color);
        case 'type':
          return typeRank(a) - typeRank(b);
        case 'color_type': {
          const ta = typeRank(a);
          const tb = typeRank(b);
          if (ta !== tb) return ta - tb;
          return colorIndex(a.color) - colorIndex(b.color);
        }
        default:
          return 0;
      }
    };

    tagged.sort((x, y) => {
      const r = cmp(x.t, y.t);
      return r !== 0 ? r : x.i - y.i; // stable
    });
    setCurrentTiles(tagged.map((x) => x.t));
    setSelectedIndex(null);
  };

  // ── Rename group (group tiles only) ──
  const renameSelectedGroup = async () => {
    if (!selectedTile || selectedTile.tile_type !== 'group' || selectedTile.ref_group_id == null) {
      return;
    }
    const gid = selectedTile.ref_group_id;
    const current = groupMap.get(gid);
    const name = window.prompt('Nom du groupe de menus', current?.name ?? '');
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === current?.name) return;
    try {
      const updated = await updateGroup(rid, gid, { name: trimmed });
      setGroupMap((prev) => {
        const m = new Map(prev);
        const existing = m.get(gid);
        m.set(gid, existing ? { ...existing, ...updated } : updated);
        return m;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec du renommage');
    }
  };

  // ── Save ──
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const layout = await savePosDisplay(rid, mid, { tiles, group_tiles: groupTiles });
      setTiles(layout.tiles ?? []);
      setGroupTiles(layout.group_tiles ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  // ── Derived: placed top-level group ids (to exclude in picker) ──
  const placedGroupIds = React.useMemo(
    () =>
      tiles
        .filter((t) => t.tile_type === 'group' && t.ref_group_id != null)
        .map((t) => t.ref_group_id as number),
    [tiles],
  );

  const menuName = menu?.name ?? '';
  const currentGroupName =
    level !== 'menu' ? groupMap.get(level)?.name ?? 'Groupe' : '';

  if (loading) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-[var(--bg)]">
        <div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-[var(--bg)] text-[var(--fg-muted)]">
        <div className="text-center space-y-[var(--s-3)]">
          <p>Menu introuvable.</p>
          <Button variant="secondary" size="sm" onClick={closeBack}>
            Retour
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[var(--bg)] text-[var(--fg)]">
      {/* ── Top bar ── */}
      <header className="h-[60px] shrink-0 flex items-center gap-[var(--s-4)] px-[var(--s-5)] border-b border-[var(--line)] bg-[var(--surface)]">
        <Button variant="ghost" size="md" icon aria-label="Fermer" onClick={closeBack}>
          <X />
        </Button>
        <h1 className="flex-1 text-center text-fs-md font-semibold truncate">
          {`Présentation du menu ${menuName} sur le système de caisse`}
        </h1>
        <Button
          variant={preview ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => {
            setPreview((p) => !p);
            setSelectedIndex(null);
          }}
        >
          {preview ? <Pencil className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {preview ? 'Modifier' : 'Aperçu'}
        </Button>
        <Button variant="primary" size="sm" onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </header>

      {error && (
        <div className="shrink-0 px-[var(--s-5)] py-[var(--s-2)] text-fs-sm text-[var(--danger-500)] bg-[color-mix(in_oklab,var(--danger-500)_8%,transparent)] border-b border-[var(--line)]">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        {/* ── Canvas ── */}
        <main className="flex-1 min-w-0 overflow-auto p-[var(--s-6)]">
          {/* Breadcrumb when drilled into a group */}
          {level !== 'menu' && (
            <div className="flex items-center gap-[var(--s-2)] mb-[var(--s-4)]">
              <Button
                variant="ghost"
                size="sm"
                icon
                aria-label="Retour au menu"
                onClick={goToMenuLevel}
              >
                <ChevronLeft />
              </Button>
              <nav className="text-fs-sm text-[var(--fg-muted)]">
                <button
                  type="button"
                  onClick={goToMenuLevel}
                  className="hover:text-[var(--fg)] transition-colors"
                >
                  {menuName}
                </button>
                <span className="mx-[var(--s-2)] text-[var(--fg-subtle)]">›</span>
                <span className="text-[var(--fg)] font-medium">{currentGroupName}</span>
              </nav>
            </div>
          )}

          {preview ? (
            <PreviewGrid tiles={currentTiles} resolve={resolve} onDrill={onDrill} />
          ) : (
            <PosTileCanvas
              tiles={currentTiles}
              resolve={resolve}
              selectedIndex={selectedIndex}
              onSelect={onSelect}
              onDrill={onDrill}
              onAdd={() => setAddOpen(true)}
              onReorder={onReorder}
            />
          )}
        </main>

        {/* ── Context panel (hidden in preview) ── */}
        {!preview && (
          <aside className="w-[360px] shrink-0 overflow-auto border-s border-[var(--line)] bg-[var(--surface)] p-[var(--s-5)]">
            <PosTileInspector
              tile={selectedTile}
              onSort={applySort}
              onSizeChange={(size: PosTileSize) => updateSelectedTile({ size })}
              onBgTypeChange={(bg: PosBgType) => updateSelectedTile({ bg_type: bg })}
              onColorPick={(color) => updateSelectedTile({ color })}
              onImageUrlChange={(url) => updateSelectedTile({ image_url: url })}
              onRenameGroup={renameSelectedGroup}
              onDrill={() => {
                if (selectedIndex != null) onDrill(selectedIndex);
              }}
              onRemove={removeSelectedTile}
            />
          </aside>
        )}
      </div>

      {/* ── Add-tile picker ── */}
      <PosAddTileModal
        open={addOpen}
        onOpenChange={setAddOpen}
        level={level}
        menu={menu}
        items={Array.from(itemMap.values())}
        placedGroupIds={placedGroupIds}
        onAdd={onAddTiles}
      />
    </div>
  );
}

/** Read-only grid for Aperçu mode — same spans, no selection or add cell. */
function PreviewGrid({
  tiles,
  resolve,
  onDrill,
}: {
  tiles: PosDisplayTile[];
  resolve: (t: PosDisplayTile) => PosTileRef;
  onDrill: (i: number) => void;
}) {
  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: `repeat(${POS_GRID_COLUMNS}, 1fr)`,
        gridAutoRows: '110px',
        gridAutoFlow: 'dense',
      }}
    >
      {tiles.map((t, i) => {
        const span = POS_TILE_SPANS[t.size];
        return (
          <div
            key={t.id ?? `idx-${i}`}
            style={{
              gridColumn: `span ${span.col}`,
              gridRow: `span ${span.row}`,
            }}
          >
            <PosTile
              tile={t}
              refData={resolve(t)}
              onDrill={t.tile_type === 'group' ? () => onDrill(i) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
