'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PlusIcon, PencilIcon, TrashIcon, SparklesIcon, StarIcon } from 'lucide-react';
import {
  listMenuImagePrompts,
  createMenuImagePrompt,
  updateMenuImagePrompt,
  deleteMenuImagePrompt,
  MenuImagePrompt,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import Modal from '@/components/Modal';
import { Button, PageHead } from '@/components/ds';
import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  DataTableHeadSpacerCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table';

export default function MenuImagePromptsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  const [prompts, setPrompts] = useState<MenuImagePrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ open: boolean; editing?: MenuImagePrompt }>({
    open: false,
  });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setPrompts(await listMenuImagePrompts(rid));
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleDelete = async (p: MenuImagePrompt) => {
    if (!confirm(`${t('delete') || 'Delete'} "${p.name}"?`)) return;
    await deleteMenuImagePrompt(rid, p.id);
    reload();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-[var(--s-5)]">
      <PageHead
        title="AI image prompts"
        desc={`${prompts.length} template${prompts.length === 1 ? '' : 's'} · used when generating images for menu items`}
        actions={
          canEdit ? (
            <Button variant="primary" size="md" onClick={() => setEditModal({ open: true })}>
              <PlusIcon />
              New template
            </Button>
          ) : undefined
        }
      />

      {prompts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <SparklesIcon className="w-10 h-10 text-[var(--fg-muted)]" strokeWidth={1.5} />
          <h2 className="text-lg font-semibold text-fg-primary">No templates yet</h2>
          <p className="text-sm text-fg-secondary max-w-md text-center">
            Save reusable prompts so you can apply the same style to multiple items.
            Use <code className="text-xs px-1 py-0.5 rounded bg-[var(--surface-2)]">{'{{item_name}}'}</code>,{' '}
            <code className="text-xs px-1 py-0.5 rounded bg-[var(--surface-2)]">{'{{item_description}}'}</code>, or{' '}
            <code className="text-xs px-1 py-0.5 rounded bg-[var(--surface-2)]">{'{{category}}'}</code> as placeholders.
          </p>
          {canEdit && (
            <Button variant="primary" size="md" onClick={() => setEditModal({ open: true })}>
              <PlusIcon />
              Create first template
            </Button>
          )}
        </div>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>Name</DataTableHeadCell>
            <DataTableHeadCell>Prompt</DataTableHeadCell>
            <DataTableHeadSpacerCell />
          </DataTableHead>
          <DataTableBody>
            {prompts.map((p, index) => (
              <DataTableRow key={p.id} index={index}>
                <DataTableCell mobilePrimary className="font-medium text-fg-primary">
                  <div className="flex items-center gap-2">
                    {p.is_default && (
                      <StarIcon className="w-3.5 h-3.5 text-[var(--brand-500)] fill-[var(--brand-500)] shrink-0" />
                    )}
                    <span>{p.name}</span>
                  </div>
                </DataTableCell>
                <DataTableCell className="text-fg-secondary text-fs-xs">
                  <div className="line-clamp-2 max-w-2xl">{p.prompt}</div>
                </DataTableCell>
                <DataTableCell>
                  {canEdit && (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditModal({ open: true, editing: p })}
                        className="p-1.5 rounded hover:bg-[var(--surface-subtle)] text-fg-secondary hover:text-fg-primary"
                        aria-label="Edit"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="p-1.5 rounded hover:bg-red-500/10 text-fg-secondary hover:text-red-500"
                        aria-label="Delete"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      {editModal.open && (
        <PromptEditModal
          restaurantId={rid}
          editing={editModal.editing}
          onClose={() => setEditModal({ open: false })}
          onSaved={() => {
            setEditModal({ open: false });
            reload();
          }}
        />
      )}
    </div>
  );
}

function PromptEditModal({
  restaurantId,
  editing,
  onClose,
  onSaved,
}: {
  restaurantId: number;
  editing?: MenuImagePrompt;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [prompt, setPrompt] = useState(editing?.prompt ?? '');
  const [isDefault, setIsDefault] = useState(editing?.is_default ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim() || !prompt.trim()) {
      setError('Name and prompt are both required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updateMenuImagePrompt(restaurantId, editing.id, {
          name,
          prompt,
          is_default: isDefault,
        });
      } else {
        await createMenuImagePrompt(restaurantId, { name, prompt, is_default: isDefault });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? 'Edit template' : 'New template'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">Name</label>
          <input
            autoFocus
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Studio top-down"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">Prompt</label>
          <textarea
            className="input min-h-[140px]"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              'Professional studio food photograph of {{item_name}}, top-down 30-degree angle, soft natural light, neutral background.'
            }
          />
          <p className="mt-1 text-xs text-fg-tertiary">
            Variables:{' '}
            <code className="text-xs px-1 py-0.5 rounded bg-[var(--surface-2)]">{'{{item_name}}'}</code>,{' '}
            <code className="text-xs px-1 py-0.5 rounded bg-[var(--surface-2)]">{'{{item_description}}'}</code>,{' '}
            <code className="text-xs px-1 py-0.5 rounded bg-[var(--surface-2)]">{'{{category}}'}</code>
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          <span>Use as default template</span>
          <span className="text-xs text-fg-tertiary">
            (auto-selected when the generator opens)
          </span>
        </label>

        {error && (
          <div className="rounded-md border border-[var(--danger-500)] bg-[color-mix(in_oklab,var(--danger-500)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger-500)]">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
