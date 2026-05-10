'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, Loader2, Pencil, Plus, Search, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

/** Minimal shape the drawer needs. Callers can project their own domain
 *  objects (MenuCategory, FilterCategory, etc.) into this shape. */
export interface CategoryDrawerEntry {
  name: string;
  /** Item count shown next to the name. Omit or pass 0 to hide. */
  count?: number;
}

/** Input passed to `onCreateCategory`. */
export interface CreateCategoryInput {
  name: string;
}

/** Input passed to `onEditCategory`. */
export interface EditCategoryPatch {
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  categories: CategoryDrawerEntry[];
  /** Current category name — used for visual "selected" state. Pass empty string for none. */
  currentCategory: string;
  /** Selection mode — one drawer serving two purposes. */
  mode: 'filter' | 'bulk-assign';
  /** Fired when the user picks a category. Receives the name (or null for "Tous"). */
  onSelect: (name: string | null) => void;
  /** For bulk-assign mode: number of items being assigned. */
  selectionCount?: number;
  /** Optional handler for creating a new category inline. */
  onCreateCategory?: (input: CreateCategoryInput) => Promise<void> | void;
  /** Optional handler for renaming an existing category.
   *  When provided, each row shows an inline Edit affordance. */
  onEditCategory?: (oldName: string, patch: EditCategoryPatch) => Promise<void> | void;
  /** Loading/processing flag for bulk operations. */
  processing?: boolean;
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
  onEditCategory,
  processing,
}: Props) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(s));
  }, [categories, search]);

  const showAll = mode === 'filter';
  const allActive = mode === 'filter' && currentCategory === '';

  if (!open) return null;

  const title = mode === 'bulk-assign' ? t('assignCategory') : t('category');
  const subtitle =
    mode === 'bulk-assign'
      ? (t('assignCategoryToSelected') || 'Assigner une catégorie')
          + (selectionCount ? ` (${selectionCount})` : '')
      : (t('selectCategory') || 'Sélectionnez une catégorie');

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="absolute right-0 top-0 bottom-0 w-96 bg-white dark:bg-[#111111] shadow-2xl flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white">{title}</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{subtitle}</p>
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
                count={categories.reduce((a, c) => a + (c.count ?? 0), 0)}
                active={allActive}
                onClick={() => onSelect(null)}
                disabled={processing}
              />
            )}
            {filtered.map((category) => {
              const count = category.count ?? 0;
              const active = currentCategory === category.name;
              const isEditing = editingName === category.name;
              if (isEditing && onEditCategory) {
                return (
                  <CategoryEditPanel
                    key={category.name}
                    entry={category}
                    onSave={async (patch) => {
                      await onEditCategory(category.name, patch);
                      setEditingName(null);
                    }}
                    onCancel={() => setEditingName(null)}
                  />
                );
              }
              return (
                <CategoryRow
                  key={category.name}
                  name={category.name}
                  count={count}
                  active={active}
                  onClick={() => onSelect(category.name)}
                  onEdit={onEditCategory ? () => setEditingName(category.name) : undefined}
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

          {/* Create new */}
          {onCreateCategory && !showCreate && (
            <button
              onClick={() => setShowCreate(true)}
              disabled={processing}
              className="w-full mt-4 p-4 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl hover:border-orange-500 dark:hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all flex items-center justify-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-orange-600 dark:hover:text-orange-400 disabled:opacity-50"
            >
              <Plus size={20} />
              <span className="font-medium">
                {t('createCategory') || 'Créer une catégorie'}
              </span>
            </button>
          )}
          {onCreateCategory && showCreate && (
            <CategoryCreatePanel
              onSubmit={async (input) => {
                await onCreateCategory(input);
                setShowCreate(false);
              }}
              onCancel={() => setShowCreate(false)}
            />
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

// ─── Row ───────────────────────────────────────────────────────

function CategoryRow({
  name,
  count,
  active,
  onClick,
  onEdit,
  disabled,
}: {
  name: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onEdit?: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`group relative w-full flex items-center gap-4 p-4 rounded-xl transition-all ${
        active
          ? 'bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-500'
          : 'bg-neutral-50 dark:bg-[#1a1a1a] border-2 border-transparent hover:border-neutral-300 dark:hover:border-neutral-700'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex-1 min-w-0 flex items-center text-left disabled:cursor-not-allowed"
      >
        <div className="flex-1 text-left min-w-0">
          <h3 className="font-semibold text-neutral-900 dark:text-white truncate">{name}</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {count} article{count !== 1 ? 's' : ''}
          </p>
        </div>
      </button>
      {active && <CheckCircle size={20} className="text-orange-500 shrink-0" />}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="shrink-0 w-8 h-8 rounded-lg bg-white dark:bg-[#222222] border border-neutral-200 dark:border-neutral-700 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center text-neutral-500 hover:text-orange-500 disabled:cursor-not-allowed"
          aria-label="Edit"
          title="Edit"
        >
          <Pencil size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Create panel ──────────────────────────────────────────────

function CategoryCreatePanel({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: CreateCategoryInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit({ name: name.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 p-4 border-2 border-orange-500 rounded-xl bg-orange-50 dark:bg-orange-900/20 space-y-3">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('categoryName') || 'Nom de la catégorie'}
        className="w-full px-3 py-2 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={saving || !name.trim()}
          className="flex-1 px-3 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all font-medium text-sm shadow-lg shadow-orange-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {t('create') || 'Créer'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-[#1a1a1a] transition-colors font-medium text-sm text-neutral-700 dark:text-neutral-300"
        >
          {t('cancel') || 'Annuler'}
        </button>
      </div>
    </div>
  );
}

// ─── Edit panel (inline, replaces the row) ─────────────────────

function CategoryEditPanel({
  entry,
  onSave,
  onCancel,
}: {
  entry: CategoryDrawerEntry;
  onSave: (patch: EditCategoryPatch) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(entry.name);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 border-2 border-orange-500 rounded-xl bg-orange-50 dark:bg-orange-900/20 space-y-3">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('categoryName') || 'Nom de la catégorie'}
        className="w-full px-3 py-2 bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={saving || !name.trim()}
          className="flex-1 px-3 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all font-medium text-sm shadow-lg shadow-orange-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {t('save') || 'Enregistrer'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-[#1a1a1a] transition-colors font-medium text-sm text-neutral-700 dark:text-neutral-300"
        >
          {t('cancel') || 'Annuler'}
        </button>
      </div>
    </div>
  );
}
