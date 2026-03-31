'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  listMenus, getRestaurant, deleteCategory, deleteMenu, deleteMenuItem,
  Menu, MenuCategory, MenuItem, Restaurant,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  ArrowLeftIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  EllipsisHorizontalIcon,
  PlusIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';

type TFn = (k: string) => string;

function channelsMeta(m: Menu, t: TFn): string {
  const parts = [m.pos_enabled && t('posSystem'), m.web_enabled && 'Web'].filter(Boolean) as string[];
  if (parts.length === 0) return t('noChannels');
  if (parts.length === 1) return parts[0];
  return `${parts[0]}+ ${parts.length - 1} ${t('andNMore').replace('{n}', String(parts.length - 1)).replace(/^\+ \d+ /, '')}`;
}

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

  const reload = useCallback(() => {
    setLoading(true);
    listMenus(rid).then((menus) => {
      const found = menus.find((m) => m.id === mid);
      setMenu(found ?? null);
      // Groups start collapsed by default
    }).finally(() => setLoading(false));
  }, [rid, mid]);

  useEffect(() => { reload(); getRestaurant(rid).then(setRestaurant).catch(() => null); }, [reload, rid]);

  const handleDeleteGroup = async (cat: MenuCategory) => {
    if (!confirm(`${t('delete')} "${cat.name}"?`)) return;
    await deleteCategory(rid, cat.id);
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
      <div className="text-center py-16 text-fg-secondary">
        Menu not found.
        <button onClick={() => router.back()} className="ml-2 underline">{t('back')}</button>
      </div>
    );
  }

  const categories = menu.categories ?? [];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/${rid}/menu/menus`)} className="p-2 rounded-full border border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors">
            <ArrowLeftIcon className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-fg-primary">{menu.name}</h1>
              <div className="relative">
                <button
                  onClick={() => setHeaderDropdownOpen(!headerDropdownOpen)}
                  className="p-1 rounded-full border border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors"
                >
                  <EllipsisHorizontalIcon className="w-5 h-5 text-fg-primary" />
                </button>
                {headerDropdownOpen && (
                  <div className="absolute left-0 top-10 z-30 w-72 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
                    <button
                      onClick={() => { setHeaderDropdownOpen(false); router.push(`/${rid}/menu/menus/${mid}/edit`); }}
                      className="w-full text-left px-4 py-3 hover:bg-[var(--surface-subtle)] transition-colors"
                    >
                      <p className="text-sm font-medium text-fg-primary">{t('editMenuOption')}</p>
                      <p className="text-xs text-fg-tertiary mt-0.5">{t('editMenuOptionDesc')}</p>
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
            <div className="flex items-center gap-0 mt-0.5 text-xs text-fg-tertiary">
              {restaurant?.name && (
                <>
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
                    {restaurant.name}
                  </span>
                  <span className="mx-2">|</span>
                </>
              )}
              <span className="flex items-center gap-1">
                <Squares2X2Icon className="w-3.5 h-3.5 shrink-0" />
                {channelsMeta(menu, t)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button className="btn-secondary text-sm px-4 py-2 rounded-full flex items-center gap-1.5" onClick={() => alert(t('comingSoon'))}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" /></svg>
            {t('editPosLayout')}
          </button>
          {/* Ajouter dropdown */}
          <div className="relative">
            <button
              onClick={() => setAddDropdownOpen(!addDropdownOpen)}
              className="btn-primary text-sm px-4 py-2 rounded-full flex items-center gap-1"
            >
              {t('add')} <ChevronDownIcon className="w-3 h-3" />
            </button>
            {addDropdownOpen && (
              <div className="absolute right-0 top-10 z-30 w-56 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
                <button
                  onClick={() => { setAddDropdownOpen(false); router.push(`/${rid}/menu/items/new?category=${categories[0]?.id ?? ''}&menuId=${mid}`); }}
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

      {/* ── Groupes de cartes ── */}
      {categories.length === 0 && (
        <div className="text-center py-12 text-sm text-fg-secondary">
          {t('noGroupsYet')}
        </div>
      )}

      {categories.map((cat) => {
        const items = cat.items ?? [];
        const isExpanded = expanded.has(cat.id);
        return (
          <div key={cat.id} className="rounded-xl border border-[var(--divider)] bg-[var(--surface)] overflow-hidden">
            {/* Group header */}
            <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors" onClick={() => toggleExpand(cat.id)}>
              {isExpanded ? <ChevronUpIcon className="w-4 h-4 text-fg-tertiary shrink-0" /> : <ChevronDownIcon className="w-4 h-4 text-fg-tertiary shrink-0" />}
              <span className="font-bold text-sm text-fg-primary">{cat.name}</span>
              <span className="text-xs text-fg-tertiary">{t('nArticles').replace('{n}', String(items.length))}</span>
              <div className="flex-1" />
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setGroupDropdown(groupDropdown === cat.id ? null : cat.id); }}
                  className="p-1 rounded hover:bg-[var(--surface-subtle)] text-fg-tertiary"
                >
                  <EllipsisHorizontalIcon className="w-5 h-5" />
                </button>
                {groupDropdown === cat.id && (
                  <div className="absolute right-0 top-8 z-30 w-44 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
                    <button
                      onClick={(e) => { e.stopPropagation(); setGroupDropdown(null); router.push(`/${rid}/menu/menus/${mid}/group/${cat.id}`); }}
                      className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-[var(--surface-subtle)] transition-colors"
                    >
                      {t('edit')}
                    </button>
                    <div className="border-t border-[var(--divider)]" />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteGroup(cat); }}
                      className="w-full text-left px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      {t('delete')}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Articles table */}
            {isExpanded && (
              <div className="border-t border-[var(--divider)]">
                {items.length > 0 && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-fg-secondary border-b border-[var(--divider)]">
                        <th className="py-2 px-4 font-normal w-8"><input type="checkbox" className="rounded" disabled /></th>
                        <th className="py-2 px-4 font-normal">{t('name')}</th>
                        <th className="py-2 px-4 font-normal">{t('pointOfSale')}</th>
                        <th className="py-2 px-4 font-normal">{t('salesChannels')}</th>
                        <th className="py-2 px-4 font-normal">{t('modifiers')}</th>
                        <th className="py-2 px-4 font-normal text-right">{t('price')}</th>
                        <th className="py-2 px-4 font-normal w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <ArticleRow key={item.id} item={item} restaurantName={restaurant?.name} menu={menu} t={t} rid={rid} onDelete={reload} />
                      ))}
                    </tbody>
                  </table>
                )}
                {/* Add article row */}
                <button
                  onClick={() => router.push(`/${rid}/menu/items/new?category=${cat.id}`)}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-fg-tertiary hover:text-fg-primary hover:bg-[var(--surface-subtle)] w-full transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  {t('addArticle')}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Add group button ── */}
      <button
        onClick={() => router.push(`/${rid}/menu/menus/${mid}/group/new`)}
        className="flex items-center gap-3 w-full px-5 py-4 rounded-xl border border-[var(--divider)] bg-[var(--surface)] hover:bg-[var(--surface-subtle)] transition-colors text-sm font-bold text-fg-primary"
      >
        <PlusIcon className="w-5 h-5" />
        {t('addGroup')}
      </button>

    </div>
  );
}

// ─── Article row ──────────────────────────────────────────────────────────────

function ArticleRow({ item, restaurantName, menu, t, rid, onDelete }: {
  item: MenuItem;
  restaurantName?: string;
  menu: Menu;
  t: TFn;
  rid: number;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const modifierNames = (item.modifier_sets ?? []).map((ms) => ms.name).join(', ') || '—';
  const channelTags: string[] = [];
  if (menu.pos_enabled) channelTags.push(t('posSystem'));
  if (menu.web_enabled) channelTags.push('Web');

  const handleDelete = async () => {
    setDropdownOpen(false);
    if (!confirm(`${t('delete')} "${item.name}"?`)) return;
    await deleteMenuItem(rid, item.id);
    onDelete();
  };

  return (
    <tr className="border-b border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer" onClick={() => router.push(`/${rid}/menu/items/${item.id}`)}>
      <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="rounded" /></td>
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-2">
          {item.image_url ? (
            <img src={item.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 0 0 1.5-1.5V5.25a1.5 1.5 0 0 0-1.5-1.5H3.75a1.5 1.5 0 0 0-1.5 1.5v14.25a1.5 1.5 0 0 0 1.5 1.5Z" /></svg>
            </div>
          )}
          <span className="text-fg-primary font-medium">{item.name}</span>
        </div>
      </td>
      <td className="py-2.5 px-4">
        {restaurantName && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-fg-secondary">{restaurantName}</span>
        )}
      </td>
      <td className="py-2.5 px-4">
        <div className="flex gap-1 flex-wrap">
          {channelTags.map((tag) => (
            <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-fg-secondary">{tag}</span>
          ))}
        </div>
      </td>
      <td className="py-2.5 px-4 text-fg-secondary text-xs">{modifierNames}</td>
      <td className="py-2.5 px-4 text-right text-fg-primary font-medium">
        {item.price?.toFixed(2)} ₪
      </td>
      <td className="py-2.5 px-4 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setDropdownOpen(!dropdownOpen)} className="p-1 rounded hover:bg-[var(--surface-subtle)]">
          <EllipsisHorizontalIcon className="w-4 h-4 text-fg-tertiary" />
        </button>
        {dropdownOpen && (
          <div className="absolute right-4 top-8 z-30 w-40 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
            <button
              onClick={() => { setDropdownOpen(false); router.push(`/${rid}/menu/items/${item.id}`); }}
              className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-[var(--surface-subtle)] transition-colors"
            >
              {t('editItem')}
            </button>
            <div className="border-t border-[var(--divider)]" />
            <button
              onClick={handleDelete}
              className="w-full text-left px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
            >
              {t('delete')}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

