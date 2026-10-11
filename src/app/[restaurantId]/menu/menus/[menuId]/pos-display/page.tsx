'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Eye, Pencil, ArrowUp, ArrowDown, SlidersHorizontal, Plus } from 'lucide-react';
import { Button, FullScreenEditor, ConfirmDialog } from '@/components/ds';
import Modal from '@/components/Modal';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
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

/** Build the default item tiles for a group, mirroring the POS fallback. */
function seedGroupTiles(items: MenuItem[]): PosDisplayTile[] {
  return items.map((item, idx) => ({
    tile_type: 'item',
    ref_item_id: item.id,
    size: 'petit',
    bg_type: 'color',
    color: POS_PALETTE[idx % POS_PALETTE.length],
    image_url: '',
    position: idx,
  }));
}
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

/** Isolates layout drafts when navigating between restaurant menus. */
export default function PosDisplayEditorPage() {
  const { restaurantId, menuId } = useParams();
  return <PosDisplayEditor key={`${restaurantId}.${menuId}`} />;
}

function PosDisplayEditor() {
  const { restaurantId, menuId } = useParams();
  const rid = Number(restaurantId);
  const mid = Number(menuId);
  const router = useRouter();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

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
  const [discard, setDiscard] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [rename, setRename] = React.useState<{ id: number; name: string } | null>(null);
  const [renameError, setRenameError] = React.useState('');
  const [renaming, setRenaming] = React.useState(false);
  const busyRef = React.useRef(false);
  const baseline = React.useRef('');
  const inspector = React.useRef<HTMLElement>(null);
  const renameInput = React.useRef<HTMLInputElement>(null);
  const dirty = !!baseline.current && baseline.current !== JSON.stringify({ tiles, group_tiles: groupTiles });
  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const closeBack = () => { if (busyRef.current) return; if (dirty) setDiscard(true); else router.push(`/${rid}/menu/menus/${mid}`); };

  // ── Load ──
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setLoadFailed(false);
    Promise.all([listMenus(rid), listAllItems(rid), getPosDisplay(rid, mid)])
      .then(([menus, items, layout]) => {
        if (cancelled) return;
        const found = menus.find((m) => m.id === mid) ?? null;
        setMenu(found);
        setGroupMap(new Map((found?.groups ?? []).map((g) => [g.id, g])));
        setItemMap(new Map(items.map((it) => [it.id, it])));
        setTiles(layout.tiles ?? []);
        setGroupTiles(layout.group_tiles ?? {});
        baseline.current = JSON.stringify({ tiles: layout.tiles ?? [], group_tiles: layout.group_tiles ?? {} });
      })
      .catch((e) => {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'libraryOperationFailed'); setLoadFailed(true); }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rid, mid, retry]);

  // ── Current container ──
  // Inside a group, fall back to synthesized item tiles when no layout is
  // saved (or it was saved empty). Mirrors the Flutter POS fallback so the
  // editor never opens onto a blank group when items exist.
  const currentTiles = React.useMemo<PosDisplayTile[]>(() => {
    if (level === 'menu') return tiles;
    const saved = groupTiles[String(level)];
    if (saved && saved.length > 0) return saved;
    const items = groupMap.get(level)?.items ?? [];
    return seedGroupTiles(items);
  }, [level, tiles, groupTiles, groupMap]);

  const setCurrentTiles = React.useCallback(
    (next: PosDisplayTile[]) => {
      if (!canEdit || busyRef.current) return;
      setSaved(false);
      const positioned = withPositions(next);
      if (level === 'menu') {
        setTiles(positioned);
      } else {
        setGroupTiles((prev) => ({ ...prev, [String(level)]: positioned }));
      }
    },
    [level, canEdit],
  );

  // ── Resolve display data for a tile ──
  const resolve = React.useCallback(
    (tile: PosDisplayTile): PosTileRef => {
      if (tile.tile_type === 'group') {
        const g = tile.ref_group_id != null ? groupMap.get(tile.ref_group_id) : undefined;
        return {
          name: g?.name ?? t('groupName'),
          imageUrl: g?.image_url,
          itemCount: g?.items?.length,
        };
      }
      const it = tile.ref_item_id != null ? itemMap.get(tile.ref_item_id) : undefined;
      return { name: it?.name ?? t('article'), price: it?.price, imageUrl: it?.image_url };
    },
    [groupMap, itemMap, t],
  );

  const selectedTile =
    selectedIndex != null ? currentTiles[selectedIndex] ?? null : null;

  // Image URL already attached to the linked group/item, offered as a one-click
  // pick in the inspector so users don't need to paste a URL by hand.
  const selectedLinkedImageUrl = React.useMemo<string | undefined>(() => {
    if (!selectedTile) return undefined;
    if (selectedTile.tile_type === 'group' && selectedTile.ref_group_id != null) {
      return groupMap.get(selectedTile.ref_group_id)?.image_url || undefined;
    }
    if (selectedTile.tile_type === 'item' && selectedTile.ref_item_id != null) {
      return itemMap.get(selectedTile.ref_item_id)?.image_url || undefined;
    }
    return undefined;
  }, [selectedTile, groupMap, itemMap]);

  // ── Handlers ──
  const onSelect = (i: number) => setSelectedIndex(i);

  const onDrill = (i: number) => {
    const tile = currentTiles[i];
    if (tile?.tile_type !== 'group' || tile.ref_group_id == null) return;
    const gid = tile.ref_group_id;
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

  // A group rename is persisted immediately, separately from the layout draft.
  const renameSelectedGroup = () => {
    if (!canEdit || selectedTile?.tile_type !== 'group' || selectedTile.ref_group_id == null) return;
    const group = groupMap.get(selectedTile.ref_group_id);
    setRenameError(''); setRename({ id: selectedTile.ref_group_id, name: group?.name ?? '' });
  };
  const saveGroupName = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rename || !rename.name.trim() || !canEdit || busyRef.current) return;
    busyRef.current = true; setRenaming(true); setRenameError('');
    try {
      const updated = await updateGroup(rid, rename.id, { name: rename.name.trim() });
      setGroupMap(previous => { const next = new Map(previous); const existing = next.get(rename.id); next.set(rename.id, existing ? { ...existing, ...updated } : updated); return next; });
      setRename(null);
    } catch (cause) { setRenameError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { busyRef.current = false; setRenaming(false); }
  };

  // ── Save ──
  const save = async () => {
    if (!canEdit || busyRef.current || loading || loadFailed) return;
    busyRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const layout = await savePosDisplay(rid, mid, { tiles, group_tiles: groupTiles });
      setTiles(layout.tiles ?? []);
      setGroupTiles(layout.group_tiles ?? {});
      baseline.current = JSON.stringify({ tiles: layout.tiles ?? [], group_tiles: layout.group_tiles ?? {} });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('libraryOperationFailed'));
    } finally {
      busyRef.current = false;
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
    level !== 'menu' ? groupMap.get(level)?.name ?? t('groupName') : '';

  const moveSelected = (delta: number) => {
    if (selectedIndex === null || !canEdit || busyRef.current) return;
    const target = selectedIndex + delta;
    if (target < 0 || target >= currentTiles.length) return;
    setCurrentTiles(arrayMove(currentTiles, selectedIndex, target)); setSelectedIndex(target);
  };

  return <><FullScreenEditor open onOpenChange={open => { if (!open) closeBack(); }} title={t('posLayoutTitle')} subtitle={menuName || undefined} showCancel={false}
    onSave={canEdit && !loading && !loadFailed && menu ? save : undefined} saveLabel={t(saving ? 'saving' : 'save')} saveDisabled={saving || !dirty}>
    {loading ? <p role="status" className="py-16 text-center text-fg-secondary">{t('loading')}</p>
    : loadFailed ? <div role="alert" className="space-y-4 rounded-r-lg border border-[var(--line)] p-5"><p className="text-[var(--danger-500)]">{t(error || 'libraryOperationFailed')}</p><Button variant="secondary" onClick={() => setRetry(value => value + 1)}>{t('retry')}</Button></div>
    : !menu ? <p role="status" className="py-12 text-center text-fg-secondary">{t('menuNotFound')}</p>
    : <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-r-lg bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)]">
        <p className="min-w-0 flex-[1_1_300px]">{t('posLayoutDescription')}</p>
        {canEdit && <Button variant="secondary" disabled={saving} aria-pressed={preview} onClick={() => { setPreview(value => !value); setSelectedIndex(null); }}>{preview ? <Pencil /> : <Eye />}{t(preview ? 'edit' : 'preview')}</Button>}
        <span role="status">{dirty ? t('settingsUnsaved') : saved ? t('posLayoutSaved') : ''}</span>
      </div>
      {error && <p role="alert" className="rounded-r-md bg-[var(--danger-50)] p-3 text-sm text-[var(--danger-500)]">{t(error)}</p>}
      {level !== 'menu' && <nav aria-label={t('menus')} className="flex flex-wrap items-center gap-2 text-sm"><Button variant="secondary" onClick={goToMenuLevel}><ChevronLeft className="rtl:rotate-180" />{menuName}</Button><span className="break-words font-semibold" dir="auto">{currentGroupName}</span></nav>}
      <div className={`grid min-w-0 gap-5 ${!preview && canEdit ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
        <section className="min-w-0 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4" aria-label={t('posLayoutTitle')}>
          {!preview && canEdit && <div className="mb-4 flex flex-wrap items-center gap-2"><Button variant="primary" disabled={saving} onClick={() => setAddOpen(true)}><Plus />{t('posAddTile')}</Button><Button variant="secondary" className="lg:hidden" onClick={() => inspector.current?.scrollIntoView({ block: 'start' })}><SlidersHorizontal />{t('posTileSettings')}</Button></div>}
          <div className="overflow-x-auto p-1" tabIndex={0} role="region" aria-label={t('posLayoutTitle')}><fieldset disabled={saving} className="min-w-0">
            {preview || !canEdit ? <PreviewGrid tiles={currentTiles} resolve={resolve} onDrill={onDrill} /> : <PosTileCanvas tiles={currentTiles} resolve={resolve} selectedIndex={selectedIndex} onSelect={onSelect} onDrill={onDrill} onAdd={() => setAddOpen(true)} onReorder={onReorder} />}
          </fieldset></div>
          {!currentTiles.length && <p className="py-5 text-center text-sm text-fg-secondary">{t('posNoTiles')}</p>}
        </section>
        {!preview && canEdit && <aside ref={inspector} aria-label={t('posTileSettings')} className="min-w-0 scroll-mt-4 self-start rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
          <h2 className="rounded-t-r-lg bg-[var(--summary-bg)] p-4 font-semibold text-[var(--summary-fg)]">{t('posTileSettings')}</h2>
          <fieldset disabled={saving} className="min-w-0 space-y-5 p-4">
            {selectedTile && <div className="space-y-3 border-b border-[var(--line)] pb-4"><p className="break-words font-semibold" dir="auto">{resolve(selectedTile).name}</p><div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" disabled={selectedIndex === 0} onClick={() => moveSelected(-1)}><ArrowUp />{t('moveUp')}</Button><Button variant="secondary" size="sm" disabled={selectedIndex === currentTiles.length - 1} onClick={() => moveSelected(1)}><ArrowDown />{t('moveDown')}</Button></div></div>}
            <PosTileInspector tile={selectedTile} linkedImageUrl={selectedLinkedImageUrl} onSort={applySort} onSizeChange={(size: PosTileSize) => updateSelectedTile({ size })} onBgTypeChange={(bg_type: PosBgType) => updateSelectedTile({ bg_type })} onColorPick={color => updateSelectedTile({ color })} onImageUrlChange={image_url => updateSelectedTile({ image_url })} onRenameGroup={renameSelectedGroup} onDrill={() => { if (selectedIndex !== null) onDrill(selectedIndex); }} onRemove={removeSelectedTile} />
          </fieldset>
        </aside>}
      </div>
      <PosAddTileModal open={addOpen} onOpenChange={setAddOpen} level={level} menu={menu} items={Array.from(itemMap.values())} placedGroupIds={placedGroupIds} onAdd={onAddTiles} />
    </div>}
  </FullScreenEditor>
  <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardChanges')} description={t('libraryDiscardDescription')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => router.push(`/${rid}/menu/menus/${mid}`)} />
  {rename && <Modal initialFocusRef={renameInput} title={t('posRenameGroup')} subtitle={t('posRenameImmediate')} onClose={() => { if (!renaming) setRename(null); }} footer={<div className="flex justify-end gap-2"><Button variant="secondary" disabled={renaming} onClick={() => setRename(null)}>{t('cancel')}</Button><Button variant="primary" type="submit" form="pos-rename" disabled={renaming || !rename.name.trim()}>{t(renaming ? 'saving' : 'save')}</Button></div>}>
    <form id="pos-rename" onSubmit={saveGroupName} className="space-y-4"><label className="block space-y-2 text-sm"><span>{t('groupName')}</span><input ref={renameInput} required disabled={renaming} className="input" value={rename.name} onChange={event => setRename({ ...rename, name: event.target.value })} /></label>{renameError && <p role="alert" className="text-sm text-[var(--danger-500)]">{renameError}</p>}</form>
  </Modal>}
  </>;
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
      className="grid gap-2 mx-auto w-fit"
      style={{
        gridTemplateColumns: `repeat(${POS_GRID_COLUMNS}, 151px)`,
        gridAutoRows: '64px',
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
              onClick={t.tile_type === 'group' ? () => onDrill(i) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
