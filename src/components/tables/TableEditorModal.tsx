'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  createTable,
  updateTable,
  deleteTable,
  type RestaurantTableRef,
  type TableInput,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import Modal from '@/components/Modal';
import { Button, Input, Field, Select } from '@/components/ds';

interface TableEditorModalProps {
  restaurantId: number;
  /** Pre-fill section when creating a new table. Ignored when editing. */
  sectionId?: number | null;
  /**
   * Section name + next-index, used to suggest a friendly default name like
   * "Interieur 6" when creating. Optional — falls back to "Table N".
   */
  sectionName?: string;
  nextIndex?: number;
  /** If provided, the modal edits this table. Otherwise it creates a new one. */
  table?: RestaurantTableRef;
  onSaved: (table: RestaurantTableRef) => void;
  onDeleted?: (tableCode: string) => void;
  onClose: () => void;
}

export function TableEditorModal({
  restaurantId,
  sectionId,
  sectionName,
  nextIndex,
  table,
  onSaved,
  onDeleted,
  onClose,
}: TableEditorModalProps) {
  const { t } = useI18n();
  const isEdit = !!table;

  const suggestedName = (() => {
    if (table?.name) return table.name;
    const base = sectionName?.trim() || 'Table';
    return nextIndex != null ? `${base} ${nextIndex}` : '';
  })();

  const [name, setName] = useState(suggestedName);
  const [seats, setSeats] = useState<number>(table?.seats ?? 4);
  const [language, setLanguage] = useState<string>(table?.language ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('tableNameRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && table) {
        const input: Omit<TableInput, 'code'> = {
          name: trimmed,
          seats: seats > 0 ? seats : undefined,
          language,
        };
        const updated = await updateTable(restaurantId, table.code, input);
        onSaved(updated);
      } else {
        // Code is auto-generated server-side; omit from payload.
        const input: TableInput = {
          code: '',
          name: trimmed,
          seats: seats > 0 ? seats : 4,
          is_open: true,
          language,
        };
        if (sectionId != null) input.section_id = sectionId;
        const created = await createTable(restaurantId, input);
        onSaved(created);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!table) return;
    if (!confirm(t('tableDeleteConfirm'))) return;
    setSaving(true);
    setError(null);
    try {
      await deleteTable(restaurantId, table.code);
      onDeleted?.(table.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <Modal title={isEdit ? t('editTable') : t('addTable')} onClose={onClose}>
      <div className="space-y-4">
        <Field label={t('tableName')} hint={t('tableNameHint')}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={suggestedName || 'Table 1'}
            autoFocus
          />
        </Field>

        <Field label={t('seatsLabel')}>
          <Input
            type="number"
            min={1}
            max={50}
            value={seats}
            onChange={(e) => setSeats(parseInt(e.target.value, 10) || 0)}
          />
        </Field>

        <Field label={t('language')} hint={t('tableLanguageHint')}>
          <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">{t('useRestaurantDefault')}</option>
            <option value="en">English</option>
            <option value="he">עברית</option>
            <option value="fr">Français</option>
          </Select>
        </Field>

        {isEdit && table && (
          <div className="text-fs-xs text-fg-secondary font-mono">
            {t('internalIdentifier')}: <span className="select-all">{table.code}</span>
          </div>
        )}

        {error && (
          <div className="text-fs-xs text-red-500 bg-red-50 px-3 py-2 rounded">{error}</div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          <div>
            {isEdit && (
              <Button variant="danger" size="md" onClick={handleDelete} disabled={saving}>
                <Trash2 />
                {t('delete')}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="md" onClick={onClose} disabled={saving}>
              {t('cancel')}
            </Button>
            <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
              {saving ? t('saving') : t('save')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
