'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, Plus, Search, X, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { MenuCategory } from '@/lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  categories: MenuCategory[];
  /** Current category name — used for visual "selected" state. Pass empty string for none. */
  currentCategory: string;
  /** Selection mode — Figma has one drawer serving two purposes. */
  mode: 'filter' | 'bulk-assign';
  /** Fired when the user picks a category. Receives the MenuCategory (or null for "Tous"). */
  onSelect: (category: MenuCategory | null) => void;
  /** For bulk-assign mode: number of items being assigned. */
  selectionCount?: number;
  /** Optional handler for creating a new category inline. */
  onCreateCategory?: (name: string) => Promise<void> | void;
  /** Loading/processing flag for bulk operations. */
  processing?: boolean;
}

// Palette lifted from the Figma Make CategoryDrawer (App.tsx:1035-1044).
// We don't store per-category color, so we hash the name into this palette
// to give each category a consistent coloured icon across sessions.
const PALETTE: Array<{ color: string; icon: string }> = [
  { color: 'from-yellow-500 to-yellow-600', icon: '⭐' },
  { color: 'from-green-500 to-green-600', icon: '🥗' },
  { color: 'from-pink-500 to-pink-600', icon: '🍰' },
  { color: 'from-red-500 to-red-600', icon: '🍖' },
  { color: 'from-blue-500 to-blue-600', icon: '🥤' },
  { color: 'from-purple-500 to-purple-600', icon: '🍨' },
  { color: 'from-orange-500 to-orange-600', icon: '🍔' },
  { color: 'from-emerald-500 to-emerald-600', icon: '🥑' },
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function decorate(name: string): { color: string; icon: string } {
  if (!name) return { color: 'from-neutral-500 to-neutral-600', icon: '📦' };
  return PALETTE[hashName(name) % PALETTE.length];
}

export default function CategoryDrawer({
  open,
  onClose,
  categories,
  currentCategory,
  mode,
  onSelect,
  selectionCount,
  onCreateCategory,
  processing,
}: Props) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(s));
  }, [categories, search]);

  // "Tous" pseudo-entry — only in filter mode (in bulk-assign, every item must
  // get a real category_id).
  const showAll = mode === 'filter';
  const allActive = mode === 'filter' && currentCategory === '';

  if (!open) return null;

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || !onCreateCategory) return;
    setCreating(true);
    try {
      await onCreateCategory(name);
      setNewName('');
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  };

  const title = mode === 'bulk-assign' ? t('assignCategory') : t('category');
  const subtitle =
    mode === 'bulk-assign'
      ? (t('assignCategoryToSelected') || 'Assigner une catégorie')
          + (selectionCount ? ` (${selectionCount})` : '')
      : (t('selectCategory') || 'Sélectionnez une catégorie');

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Drawer — Figma App.tsx:1052 */}
      <div className="absolute right-0 top-0 bottom-0 w-96 bg-white dark:bg-[#111111] shadow-2xl flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
              {title}
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              {subtitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="size-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center transition-colors"
            aria-label={t('close') || 'Close'}
          >
            <X size={20} className="text-neutral-600 dark:text-neutral-400" />
          </button>
        </div>

        {/* Search */}
        <div className="p-6 border-b border-neutral-200 dark:border-neutral-800">
          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400"
              size={18}
            />
            <input
              type="text"
              placeholder={t('searchCategory') || 'Rechercher une catégorie...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>
        </div>

        {/* Categories list */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {showAll && (
              <CategoryRow
                name={t('all') || 'Tous'}
                icon="📦"
                color="from-neutral-500 to-neutral-600"
                count={categories.reduce(
                  (a, c) => a + (c.items?.length ?? 0),
                  0,
                )}
                active={allActive}
                onClick={() => onSelect(null)}
                disabled={processing}
              />
            )}
            {filtered.map((category) => {
              const { color, icon } = decorate(category.name);
              const count = category.items?.length ?? 0;
              const active = currentCategory === category.name;
              return (
                <CategoryRow
                  key={category.id}
                  name={category.name}
                  icon={icon}
                  color={color}
                  count={count}
                  active={active}
                  onClick={() => onSelect(category)}
                  disabled={processing}
                />
              );
            })}
            {filtered.length === 0 && !showAll && (
              <p className="text-sm text-neutral-500 text-center py-8">
                {t('noResults') || 'No results'}
              </p>
            )}
          </div>

          {/* Create new — Figma App.tsx:1110 */}
          {onCreateCategory && !showCreate && (
            <button
              onClick={() => setShowCreate(true)}
              disabled={processing}
              className="w-full mt-4 p-4 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl hover:border-orange-500 dark:hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all flex items-center justify-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-orange-600 dark:hover:text-orange-400 disabled:opacity-50"
            >
              <Plus size={20} />
              <span className="font-medium">
                {t('createCategory') || 'Créer une nouvelle catégorie'}
              </span>
            </button>
          )}
          {onCreateCategory && showCreate && (
            <div className="mt-4 p-4 border-2 border-orange-500 rounded-xl bg-orange-50 dark:bg-orange-900/20">
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('categoryName') || 'Nom de la catégorie'}
                className="w-full px-3 py-2 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') {
                    setShowCreate(false);
                    setNewName('');
                  }
                }}
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="flex-1 px-3 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all font-medium text-sm shadow-lg shadow-orange-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creating && <Loader2 size={14} className="animate-spin" />}
                  {t('create') || 'Créer'}
                </button>
                <button
                  onClick={() => {
                    setShowCreate(false);
                    setNewName('');
                  }}
                  className="px-3 py-2 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-[#1a1a1a] transition-colors font-medium text-sm text-neutral-700 dark:text-neutral-300"
                >
                  {t('cancel') || 'Annuler'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-neutral-200 dark:border-neutral-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-[#1a1a1a] transition-colors font-medium text-neutral-700 dark:text-neutral-300"
          >
            {t('cancel') || 'Annuler'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/25 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            disabled={processing}
          >
            {processing && <Loader2 size={16} className="animate-spin" />}
            {t('close') || 'Fermer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryRow({
  name,
  icon,
  color,
  count,
  active,
  onClick,
  disabled,
}: {
  name: string;
  icon: string;
  color: string;
  count: number;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all disabled:opacity-50 ${
        active
          ? 'bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-500'
          : 'bg-neutral-50 dark:bg-[#1a1a1a] border-2 border-transparent hover:border-neutral-300 dark:hover:border-neutral-700'
      }`}
    >
      <div
        className={`size-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-2xl shadow-lg`}
      >
        {icon}
      </div>
      <div className="flex-1 text-left">
        <h3 className="font-semibold text-neutral-900 dark:text-white truncate">
          {name}
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {count} article{count !== 1 ? 's' : ''}
        </p>
      </div>
      {active && <CheckCircle size={20} className="text-orange-500 shrink-0" />}
    </button>
  );
}
