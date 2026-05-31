'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  listCustomUnits, createCustomUnit, updateCustomUnit, deleteCustomUnit,
  CustomUnit, CustomUnitInput,
} from '@/lib/api';
import Modal from '@/components/Modal';
import { PlusIcon, TrashIcon, PencilIcon, RulerIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

// Units screen: manage the restaurant's library of custom measurement units
// (e.g. "piece", "slice"). The concrete size of one custom unit is set per
// stock item on the Stock screen, so this screen only owns the unit names.
export default function UnitsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [units, setUnits] = useState<CustomUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; editing?: CustomUnit }>({ open: false });

  const reload = useCallback(async () => {
    try {
      setUnits(await listCustomUnits(rid));
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">{t('units')}</h1>
          <p className="text-sm text-fg-secondary mt-1 max-w-xl">{t('unitsSubtitle')}</p>
        </div>
        <button
          onClick={() => setModal({ open: true })}
          className="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors shrink-0"
        >
          <PlusIcon className="w-4 h-4" /> {t('addUnit')}
        </button>
      </div>

      {units.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 rounded-xl border border-dashed" style={{ borderColor: 'var(--divider)' }}>
          <RulerIcon className="w-8 h-8 text-fg-tertiary mb-3" />
          <p className="text-sm font-medium text-fg-primary">{t('noCustomUnits')}</p>
          <p className="text-sm text-fg-secondary mt-1 max-w-sm">{t('noCustomUnitsHint')}</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--divider)' }}>
          {units.map((u, i) => (
            <div
              key={u.id}
              className="flex items-center justify-between px-4 py-3"
              style={i > 0 ? { borderTop: '1px solid var(--divider)' } : {}}
            >
              <div className="flex items-center gap-3 min-w-0">
                <RulerIcon className="w-4 h-4 text-fg-tertiary shrink-0" />
                <span className="text-sm font-medium text-fg-primary truncate">{u.name}</span>
                {u.abbreviation && (
                  <span className="text-xs text-fg-tertiary px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-subtle)' }}>
                    {u.abbreviation}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setModal({ open: true, editing: u })}
                  className="p-2 rounded-md text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors"
                  aria-label={t('edit')}
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm(t('deleteUnitConfirm'))) return;
                    await deleteCustomUnit(rid, u.id);
                    reload();
                  }}
                  className="p-2 rounded-md text-fg-secondary hover:text-red-600 hover:bg-red-50 transition-colors"
                  aria-label={t('delete')}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <UnitFormModal
          editing={modal.editing}
          error={error}
          onClose={() => { setModal({ open: false }); setError(null); }}
          onSave={async (input) => {
            try {
              if (modal.editing) {
                await updateCustomUnit(rid, modal.editing.id, input);
              } else {
                await createCustomUnit(rid, input);
              }
              setModal({ open: false });
              setError(null);
              reload();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
          t={t}
        />
      )}
    </div>
  );
}

function UnitFormModal({ editing, error, onClose, onSave, t }: {
  editing?: CustomUnit;
  error: string | null;
  onClose: () => void;
  onSave: (input: CustomUnitInput) => void;
  t: (k: string) => string;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [abbreviation, setAbbreviation] = useState(editing?.abbreviation ?? '');

  const canSave = name.trim().length > 0;

  return (
    <Modal title={editing ? t('editUnit') : t('addUnit')} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">{t('unitNameLabel')} *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('unitNamePlaceholder')}
            autoFocus
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">{t('unitAbbrLabel')}</label>
          <input
            value={abbreviation}
            onChange={(e) => setAbbreviation(e.target.value)}
            placeholder={t('unitAbbrPlaceholder')}
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{ background: 'var(--surface)', borderColor: 'var(--divider)', color: 'var(--text-primary)' }}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-fg-secondary hover:bg-[var(--surface-subtle)] transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            disabled={!canSave}
            onClick={() => onSave({ name: name.trim(), abbreviation: abbreviation.trim() })}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
          >
            {t('save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
