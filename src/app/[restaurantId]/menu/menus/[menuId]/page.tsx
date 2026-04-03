'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  listMenus, getRestaurant, deleteGroup, deleteMenu,
  listAllItems, addItemsToGroup, removeItemFromGroup,
  Menu, MenuGroup, MenuItem, Restaurant,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  ArrowLeftIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  EllipsisHorizontalIcon,
  PlusIcon,
  Squares2X2Icon,
  XMarkIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

type TFn = (k: string) => string;

// Grid column template shared by header, item rows, and add-item row
const GRID_COLS = 'grid-cols-[40px_1.5fr_1fr_1fr_1fr_80px_40px] min-w-[700px]';

function channelsMeta(m: Menu, t: TFn): string {
  const parts = [m.pos_enabled && t('posSystem'), m.web_enabled && 'Web'].filter(Boolean) as string[];
  if (parts.length === 0) return t('noChannels');
  if (parts.length === 1) return parts[0];
  return `${parts[0]}+ ${parts.length - 1} ${t('andNMore').replace('{n}', String(parts.length - 1)).replace(/^\+ \d+ /, '')}`;
}

// ─── Tag / Pill ──────────────────────────────────────────────────────────────

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--surface-subtle)] text-[var(--text-secondary)]">
      {children}
    </span>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function MenuDetailPage() {
  const { restaurantId, menuId } = useParams();
  const rid = Number(restaurantId);
  const mid = Number(menuId);
  const router = useRouter();
  const { t } = useI18n();

  const [menu, setMenu] = useState<Menu | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const [headerDropdownOpen, setHeaderDropdownOpen] = useState(false);
  const [groupDropdown, setGroupDropdown] = useState<number | null>(null);
  const [itemPickerGroupId, setItemPickerGroupId] = useState<number | null>(null);
  const [allItems, setAllItems] = useState<MenuItem[]>([]);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([listMenus(rid), listAllItems(rid)]).then(([menus, items]) => {
      const found = menus.find((m) => m.id === mid);
      setMenu(found ?? null);
      setAllItems(items);
      if (found?.groups) {
        setExpanded(new Set(found.groups.map((g) => g.id)));
      }
    }).finally(() => setLoading(false));
  }, [rid, mid]);

  useEffect(() => { reload(); getRestaurant(rid).then(setRestaurant).catch(() => null); }, [reload, rid]);

  const handleDeleteGroup = async (group: MenuGroup) => {
    if (!confirm(`${t('delete')} "${group.name}"?`)) return;
    await deleteGroup(rid, group.id);
    setGroupDropdown(null);
    reload();
  };

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="text-center py-16 text-[var(--text-secondary)]">
        Menu not found.
        <button onClick={() => router.back()} className="ml-2 underline">{t('back')}</button>
      </div>
    );
  }

  const groups = menu.groups ?? [];

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* ── Page Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/${rid}/menu/menus`)}
            className="w-10 h-10 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-[var(--text-primary)]">{menu.name}</h1>
              <div className="relative">
                <button
                  onClick={() => setHeaderDropdownOpen(!headerDropdownOpen)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-2xl leading-none px-1"
                >
                  ···
                </button>
                {headerDropdownOpen && (
                  <div className="absolute left-0 top-10 z-30 w-72 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
                    <button
                      onClick={() => { setHeaderDropdownOpen(false); router.push(`/${rid}/menu/menus/${mid}/edit`); }}
                      className="w-full text-left px-4 py-3 hover:bg-[var(--surface-subtle)] transition-colors"
                    >
                      <p className="text-sm font-medium text-[var(--text-primary)]">{t('editMenuOption')}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{t('editMenuOptionDesc')}</p>
                    </button>
                    <div className="border-t border-[var(--divider)]" />
                    <button
                      onClick={() => { setHeaderDropdownOpen(false); alert(t('comingSoon')); }}
                      className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-[var(--surface-subtle)] transition-colors"
                    >
                      {t('duplicateMenu')}
                    </button>
                    <div className="border-t border-[var(--divider)]" />
                    <button
                      onClick={async () => {
                        setHeaderDropdownOpen(false);
                        if (!confirm(`${t('deleteMenuOption')} "${menu.name}"?`)) return;
                        await deleteMenu(rid, mid);
                        router.push(`/${rid}/menu/menus`);
                      }}
                      className="w-full text-left px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      {t('deleteMenuOption')}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => router.push(`/${rid}/menu/menus/${mid}/edit`)}
              className="flex items-center gap-0 mt-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline transition-colors cursor-pointer"
            >
              {restaurant?.name && (
                <>
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
                    {restaurant.name}
                  </span>
                  <span className="mx-2 text-[var(--text-muted)]">|</span>
                </>
              )}
              <span className="flex items-center gap-1.5">
                <Squares2X2Icon className="w-4 h-4 shrink-0" />
                {channelsMeta(menu, t)}
              </span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button className="btn-secondary rounded-full flex items-center gap-2" onClick={() => alert(t('comingSoon'))}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" /></svg>
            {t('editPosLayout')}
          </button>
          <div className="relative">
            <button
              onClick={() => setAddDropdownOpen(!addDropdownOpen)}
              className="btn-primary rounded-full flex items-center gap-1.5"
            >
              {t('add')} <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
            {addDropdownOpen && (
              <div className="absolute right-0 top-12 z-30 w-56 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
                <button
                  onClick={() => { setAddDropdownOpen(false); router.push(`/${rid}/menu/items/new?menuId=${mid}`); }}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-[var(--surface-subtle)] transition-colors"
                >
                  {t('addArticle')}
                </button>
                <div className="border-t border-[var(--divider)]" />
                <button
                  onClick={() => { setAddDropdownOpen(false); router.push(`/${rid}/menu/menus/${mid}/group/new`); }}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-[var(--surface-subtle)] transition-colors"
                >
                  {t('addGroup')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Accordion Groups ── */}
      <div className="space-y-3">
        {groups.length === 0 && (
          <div className="rounded-xl border border-[var(--divider)] bg-[var(--surface)] text-center py-16 text-sm text-[var(--text-muted)]">
            {t('noGroupsYet')}
          </div>
        )}

        {groups.map((group) => {
          const items = group.items ?? [];
          const isExpanded = expanded.has(group.id);
          return (
            <div key={group.id} className="rounded-xl border border-[var(--divider)] bg-[var(--surface)] overflow-hidden">
              {/* ── Group Header ── */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
                onClick={() => toggleExpand(group.id)}
              >
                {isExpanded
                  ? <ChevronUpIcon className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
                  : <ChevronDownIcon className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
                }
                <span className="font-bold text-base text-[var(--text-primary)]">{group.name}</span>
                <span className="text-sm text-[var(--text-secondary)]">{t('nArticles').replace('{n}', String(items.length))}</span>
                <div className="flex-1" />
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setGroupDropdown(groupDropdown === group.id ? null : group.id); }}
                    className="p-1.5 rounded-lg hover:bg-[var(--surface-subtle)] text-[var(--text-muted)] transition-colors"
                  >
                    <EllipsisHorizontalIcon className="w-5 h-5" />
                  </button>
                  {groupDropdown === group.id && (
                    <div className="absolute right-0 top-9 z-30 w-48 bg-[var(--surface-elevated,var(--surface))] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
                      <button
                        onClick={(e) => { e.stopPropagation(); setGroupDropdown(null); router.push(`/${rid}/menu/menus/${mid}/group/${group.id}`); }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--surface-subtle)] transition-colors"
                      >
                        {t('edit')}
                      </button>
                      <div className="border-t border-[var(--divider)]" />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        {t('delete')}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Group Content (expanded) ── */}
              {isExpanded && (
                <div className="border-t border-[var(--divider)] overflow-x-auto">
                  {/* Table Header Row */}
                  {items.length > 0 && (
                    <div className={`grid ${GRID_COLS} items-center px-4 py-2.5 border-b-2 border-[var(--text-primary)]`}>
                      <div><input type="checkbox" className="rounded border-[var(--divider)]" disabled /></div>
                      <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">{t('article')}</div>
                      <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">{t('pointOfSale')}</div>
                      <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">{t('salesChannels')}</div>
                      <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">{t('modifiers')}</div>
                      <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide text-right">{t('price')}</div>
                      <div />
                    </div>
                  )}

                  {/* Item Rows */}
                  {items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      restaurantName={restaurant?.name}
                      menu={menu}
                      t={t}
                      rid={rid}
                      groupId={group.id}
                      onUpdate={reload}
                    />
                  ))}

                  {/* Add Item Row */}
                  <button
                    onClick={() => setItemPickerGroupId(group.id)}
                    className={`grid ${GRID_COLS} items-center w-full px-4 py-3 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors border-t border-[var(--divider)]`}
                  >
                    <div />
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <PlusIcon className="w-4 h-4" />
                      {t('addArticle')}
                    </div>
                    <div /><div /><div /><div /><div />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* ── Add Group Card ── */}
        <div className="rounded-xl border border-[var(--divider)] bg-[var(--surface)] overflow-hidden">
          <button
            onClick={() => router.push(`/${rid}/menu/menus/${mid}/group/new`)}
            className="flex items-center gap-3 w-full px-4 py-4 hover:bg-[var(--surface-subtle)] transition-colors text-base font-bold text-[var(--text-primary)]"
          >
            <PlusIcon className="w-5 h-5" />
            {t('addGroup')}
          </button>
        </div>
      </div>

      {/* ── Add/Remove Items Modal ── */}
      {itemPickerGroupId !== null && (
        <AddRemoveItemsModal
          t={t}
          rid={rid}
          groupId={itemPickerGroupId}
          allItems={allItems}
          groupItems={groups.find((g) => g.id === itemPickerGroupId)?.items ?? []}
          onClose={() => setItemPickerGroupId(null)}
          onDone={() => { setItemPickerGroupId(null); reload(); }}
          onCreateNew={() => { setItemPickerGroupId(null); router.push(`/${rid}/menu/items/new`); }}
        />
      )}
    </div>
  );
}

// ─── Add/Remove Items Modal ──────────────────────────────────────────────────

function AddRemoveItemsModal({ t, rid, groupId, allItems, groupItems, onClose, onDone, onCreateNew }: {
  t: TFn;
  rid: number;
  groupId: number;
  allItems: MenuItem[];
  groupItems: MenuItem[];
  onClose: () => void;
  onDone: () => void;
  onCreateNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Track which items are checked — initialize with items already in the group
  const originalIds = useMemo(() => new Set(groupItems.map((i) => i.id)), [groupItems]);
  const [checked, setChecked] = useState<Set<number>>(() => new Set(groupItems.map((i) => i.id)));

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allItems.filter((item) => !q || item.name.toLowerCase().includes(q));
  }, [allItems, search]);

  const selectedCount = checked.size;

  const toggle = (id: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDone = async () => {
    setSaving(true);
    try {
      // Items to add (checked now but weren't before)
      const toAdd = Array.from(checked).filter((id) => !originalIds.has(id));
      // Items to remove (were checked before but aren't now)
      const toRemove = Array.from(originalIds).filter((id) => !checked.has(id));

      if (toAdd.length > 0) {
        await addItemsToGroup(rid, groupId, toAdd);
      }
      for (const id of toRemove) {
        await removeItemFromGroup(rid, groupId, id);
      }
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[5vh] bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col border border-[var(--divider)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
            <button
              onClick={handleDone}
              disabled={saving}
              className="btn-secondary rounded-full disabled:opacity-40"
            >
              {saving ? '...' : t('done')}
            </button>
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">{t('addOrRemoveItems')}</h2>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              className="input w-full pl-12 rounded-full"
              placeholder={t('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Subheader */}
        <div className="flex items-center justify-between px-6 pb-2">
          <span className="text-sm font-medium text-[var(--text-secondary)]">{t('articlesGroup')}</span>
          <span className="text-sm text-[var(--text-secondary)]">{selectedCount} {t('selected')}</span>
        </div>
        <div className="mx-6 border-t-2 border-[var(--text-primary)]" />

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* Create new */}
          <button
            onClick={onCreateNew}
            className="w-full flex items-center gap-3 py-4 border-b border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
              <PlusIcon className="w-5 h-5 text-[var(--text-primary)]" />
            </div>
            <span className="text-base font-medium text-[var(--text-primary)]">{t('createNewItems')}</span>
          </button>

          {/* Items list */}
          {filtered.map((item) => (
            <label
              key={item.id}
              className="w-full flex items-center gap-3 py-4 border-b border-[var(--divider)] cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
            >
              {item.image_url ? (
                <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 0 0 1.5-1.5V5.25a1.5 1.5 0 0 0-1.5-1.5H3.75a1.5 1.5 0 0 0-1.5 1.5v14.25a1.5 1.5 0 0 0 1.5 1.5Z" /></svg>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-base font-medium text-[var(--text-primary)] truncate">{item.name}</p>
                {(item.variant_groups?.length ?? 0) > 0 && (
                  <p className="text-sm text-[var(--text-secondary)]">{item.variant_groups!.length} {t('variants')}</p>
                )}
              </div>
              <input
                type="checkbox"
                checked={checked.has(item.id)}
                onChange={() => toggle(item.id)}
                className="w-5 h-5 rounded border-2 border-[var(--divider)] text-brand-500 shrink-0"
              />
            </label>
          ))}

          {filtered.length === 0 && (
            <p className="text-sm text-[var(--text-muted)] text-center py-8">{t('noResults')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Item Row (CSS Grid) ─────────────────────────────────────────────────────

function ItemRow({ item, restaurantName, menu, t, rid, groupId, onUpdate }: {
  item: MenuItem;
  restaurantName?: string;
  menu: Menu;
  t: TFn;
  rid: number;
  groupId: number;
  onUpdate: () => void;
}) {
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const modifierNames = (item.modifier_sets ?? []).map((ms) => ms.name).join(', ') || '—';
  const channelTags: string[] = [];
  if (menu.pos_enabled) channelTags.push(t('posSystem'));
  if (menu.web_enabled) channelTags.push('Web');

  const handleRemoveFromGroup = async () => {
    setDropdownOpen(false);
    if (!confirm(`${t('removeFromGroupConfirm')} "${item.name}"?`)) return;
    await removeItemFromGroup(rid, groupId, item.id);
    onUpdate();
  };

  return (
    <div
      className={`grid ${GRID_COLS} items-center px-4 py-3 border-b border-[var(--divider)] last:border-b-0 hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer`}
      onClick={() => router.push(`/${rid}/menu/items/${item.id}`)}
    >
      {/* Checkbox */}
      <div onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" className="rounded border-[var(--divider)]" />
      </div>

      {/* Article name + image */}
      <div className="flex items-center gap-3 min-w-0">
        {item.image_url ? (
          <img src={item.image_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 0 0 1.5-1.5V5.25a1.5 1.5 0 0 0-1.5-1.5H3.75a1.5 1.5 0 0 0-1.5 1.5v14.25a1.5 1.5 0 0 0 1.5 1.5Z" /></svg>
          </div>
        )}
        <span className="text-sm font-medium text-[var(--text-primary)] truncate">{item.name}</span>
      </div>

      {/* Point of sale */}
      <div>
        {restaurantName && <Tag>{restaurantName}</Tag>}
      </div>

      {/* Sales channels */}
      <div className="flex gap-1.5 flex-wrap">
        {channelTags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
      </div>

      {/* Modifiers */}
      <div className="text-sm text-[var(--text-secondary)] truncate">{modifierNames}</div>

      {/* Price */}
      <div className="text-sm font-semibold text-[var(--text-primary)] text-right">
        {item.price?.toFixed(2)} ₪
      </div>

      {/* Actions */}
      <div className="relative flex justify-center" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="p-1 rounded-lg hover:bg-[var(--surface-subtle)] text-[var(--text-muted)] transition-colors"
        >
          <EllipsisHorizontalIcon className="w-4 h-4" />
        </button>
        {dropdownOpen && (
          <div className="absolute right-0 top-8 z-30 w-64 bg-[var(--surface-elevated,var(--surface))] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
            <button
              onClick={() => { setDropdownOpen(false); router.push(`/${rid}/menu/items/${item.id}`); }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-[var(--surface-subtle)] transition-colors"
            >
              {t('editItemDetails')}
            </button>
            <div className="border-t border-[var(--divider)]" />
            <button
              onClick={() => { setDropdownOpen(false); alert(t('comingSoon')); }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-[var(--surface-subtle)] transition-colors"
            >
              {t('duplicateItem')}
            </button>
            <div className="border-t border-[var(--divider)]" />
            <button
              onClick={() => { setDropdownOpen(false); alert(t('comingSoon')); }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-[var(--surface-subtle)] transition-colors"
            >
              {t('changeModifiers')}
            </button>
            <div className="border-t border-[var(--divider)]" />
            <button
              onClick={() => { setDropdownOpen(false); alert(t('comingSoon')); }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-[var(--surface-subtle)] transition-colors"
            >
              {t('archiveItem')}
            </button>
            <div className="border-t border-[var(--divider)]" />
            <button
              onClick={handleRemoveFromGroup}
              className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
            >
              {t('removeFromGroup')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
