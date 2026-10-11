'use client';

import { useRef } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useI18n } from '@/lib/i18n';
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';
import { Button } from '@/components/ds';

/** Offers saving or discarding without closing the editor on a failed save. */
export default function ItemUnsavedDialog({
  open,
  onCancel,
  onDiscard,
  onSave,
  saving,
  saveDisabled,
  error,
  hint,
}: {
  open: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
  saving: boolean;
  saveDisabled?: boolean;
  error?: string;
  hint?: string;
}) {
  const { t } = useI18n();
  const focus = useDialogReturnFocus();
  const save = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value && !saving) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="item-photo-dialog-overlay" />
        <AlertDialog.Content
          {...focus}
          className="item-editor item-unsaved-dialog"
          onOpenAutoFocus={(event) => {
            focus.onOpenAutoFocus(event);
            event.preventDefault();
            save.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
            else onCancel();
          }}
        >
          <AlertDialog.Title>{t('itemUnsavedTitle')}</AlertDialog.Title>
          <AlertDialog.Description>
            {t('itemUnsavedDescription')}
          </AlertDialog.Description>
          {hint && <p className="item-unsaved-hint">{hint}</p>}
          {error && (
            <p role="alert" className="item-unsaved-error">
              {error}
            </p>
          )}
          <div className="item-unsaved-actions">
            <Button variant="secondary" disabled={saving} onClick={onDiscard}>
              {t('itemDiscard')}
            </Button>
            <Button
              ref={save}
              disabled={saving || saveDisabled}
              onClick={onSave}
            >
              {saving ? t('saving') : t('save')}
            </Button>
          </div>
          <AlertDialog.Cancel asChild>
            <button
              type="button"
              className="item-unsaved-resume"
              disabled={saving}
            >
              {t('itemContinueEditing')}
            </button>
          </AlertDialog.Cancel>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
