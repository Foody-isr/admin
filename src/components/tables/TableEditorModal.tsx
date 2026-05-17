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
import { Button, Input, Field } from '@/components/ds';

interface TableEditorModalProps {
  restaurantId: number;
  /** Pre-fill section when creating a new table. Ignored when editing. */
  sectionId?: number | null;
  /** If provided, the modal edits this table. Otherwise it creates a new one. */
  table?: RestaurantTableRef;
  onSaved: (table: RestaurantTableRef) => void;
  onDeleted?: (tableCode: string) => void;
  onClose: () => void;
}

export function TableEditorModal({
  restaurantId,
  sectionId,
  table,
  onSaved,
  onDeleted,
  onClose,
}: TableEditorModalProps) {
  const { t } = useI18n();
  const isEdit = !!table;

  const [code, setCode] = useState(table?.code ?? '');
  const [name, setName] = useState(table?.name ?? '');
  const [seats, setSeats] = useState<number>(table?.seats ?? 4);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError(t('tableCodeRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && table) {
        const input: Omit<TableInput, 'code'> = {
          name: name.trim() || undefined,
          seats: seats > 0 ? seats : undefined,
        };
        const updated = await updateTable(restaurantId, table.code, input);
        onSaved(updated);
      } else {
        const input: TableInput = {
          code: trimmedCode,
          name: name.trim() || undefined,
          seats: seats > 0 ? seats : 4,
          is_open: true,
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
        <Field label={t('tableCode')} hint={isEdit ? t('tableCodeImmutable') : t('tableCodeHint')}>
          <Input
            value={code}
            disabled={isEdit}
            onChange={(e) => setCode(e.target.value)}
            placeholder="A1"
            autoFocus={!isEdit}
          />
        </Field>

        <Field label={t('tableName')} hint={t('tableNameHint')}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={code.trim() ? `Table ${code.trim()}` : 'Table A1'}
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
