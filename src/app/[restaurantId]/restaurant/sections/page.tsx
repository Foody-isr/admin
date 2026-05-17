'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Pencil, Trash2, Plus, Boxes } from 'lucide-react';
import {
  listSections,
  createSection,
  updateSection,
  deleteSection,
  type TableSection,
  type SectionInput,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button, Input, PageHead, Field } from '@/components/ds';
import Modal from '@/components/Modal';
import { NumberInput } from '@/components/ui/NumberInput';

export default function SectionsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [sections, setSections] = useState<TableSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const reload = useCallback(() => {
    return listSections(rid).then(setSections);
  }, [rid]);

  useEffect(() => {
    listSections(rid)
      .then(setSections)
      .finally(() => setLoading(false));
  }, [rid]);

  const handleRename = async (section: TableSection) => {
    const next = prompt(t('renameSectionPrompt'), section.name);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === section.name) return;
    try {
      await updateSection(rid, section.id, trimmed);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (section: TableSection) => {
    const count = section.tables?.length ?? 0;
    const msg =
      count > 0
        ? t('deleteSectionConfirmCascade').replace('{count}', String(count))
        : t('deleteSectionConfirm');
    if (!confirm(msg)) return;
    try {
      await deleteSection(rid, section.id);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
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
        title={t('sections')}
        desc={t('sectionsDesc')}
        actions={
          <Button variant="primary" size="md" onClick={() => setShowCreate(true)}>
            <Plus />
            {t('newSection')}
          </Button>
        }
      />

      {sections.length === 0 ? (
        <div className="card flex flex-col items-center py-16 space-y-4">
          <Boxes className="w-10 h-10 text-fg-secondary" />
          <p className="text-fg-secondary text-center max-w-md">{t('noSectionsYet')}</p>
          <Button variant="primary" size="md" onClick={() => setShowCreate(true)}>
            <Plus />
            {t('newSection')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--s-3)]">
          {sections.map((section) => {
            const count = section.tables?.length ?? 0;
            return (
              <div
                key={section.id}
                className="card p-[var(--s-4)] flex flex-col gap-[var(--s-2)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-fg-primary truncate">
                    {section.name}
                  </h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleRename(section)}
                      title={t('renameSection')}
                      className="p-1.5 rounded text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(section)}
                      title={t('deleteSection')}
                      className="p-1.5 rounded text-fg-secondary hover:text-red-500 hover:bg-[var(--surface-subtle)] transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="text-fs-xs text-fg-secondary">
                  {count} {t('tablesCount')}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateSectionModal
          restaurantId={rid}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

function CreateSectionModal({
  restaurantId,
  onCreated,
  onClose,
}: {
  restaurantId: number;
  onCreated: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [tableCount, setTableCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('sectionNameRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input: SectionInput = { name: trimmed, label: trimmed };
      if (tableCount > 0) input.table_count = tableCount;
      await createSection(restaurantId, input);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t('newSection')} onClose={onClose}>
      <div className="space-y-4">
        <Field label={t('sectionName')}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('sectionNamePlaceholder')}
            autoFocus
          />
        </Field>

        <Field label={t('initialTableCount')} hint={t('initialTableCountHint')}>
          <NumberInput
            min={0}
            max={50}
            value={tableCount}
            onChange={(v) => setTableCount(Math.max(0, Math.floor(v ?? 0)))}
          />
        </Field>

        {error && (
          <div className="text-fs-xs text-red-500 bg-red-50 px-3 py-2 rounded">{error}</div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="md" onClick={onClose} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button variant="primary" size="md" onClick={handleCreate} disabled={saving}>
            {saving ? t('saving') : t('create')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
