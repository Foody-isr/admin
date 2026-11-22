'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ds';
import { ApiError, uploadMenuImage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const maxImageBytes = 5 * 1024 * 1024;

/** Lets the menu editor enter an image URL or prepare a local file for its draft. */
export function MenuImageField({ restaurantId, label, value, onChange, disabled, onPendingChange }: {
  restaurantId: number;
  label: string;
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { t } = useI18n();
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingRequest = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => {
    const pending = pendingRequest.current;
    if (pending) {
      pendingRequest.current = null;
      pending.abort();
      onPendingChange?.(false);
    }
  }, [onPendingChange]);

  async function upload(file: File | undefined) {
    if (!file || disabled || pendingRequest.current) return;
    const knownType = file.type && file.type !== 'application/octet-stream';
    if (!file.size || file.size > maxImageBytes || (knownType && !imageTypes.includes(file.type))) {
      setError(t('itemPhotosInvalid'));
      return;
    }

    const controller = new AbortController();
    pendingRequest.current = controller;
    setError('');
    setUploading(true);
    onPendingChange?.(true);
    try {
      const url = await uploadMenuImage(restaurantId, file, controller.signal);
      if (!controller.signal.aborted) onChange(url);
    } catch (failure) {
      if (!controller.signal.aborted) {
        const invalid = failure instanceof ApiError && (failure.status === 413 || failure.status === 415);
        setError(t(invalid ? 'itemPhotosInvalid' : 'uploadFailed'));
      }
    } finally {
      if (pendingRequest.current === controller) {
        pendingRequest.current = null;
        setUploading(false);
        onPendingChange?.(false);
      }
    }
  }

  return (
    <div className="space-y-2" aria-busy={uploading}>
      <label className="block space-y-1">
        <span>{label}</span>
        <input
          type="url"
          dir="ltr"
          className="input"
          placeholder="https://…/image.jpg"
          value={value}
          disabled={disabled || uploading}
          onChange={(event) => {
            setError('');
            onChange(event.target.value);
          }}
        />
      </label>
      <Button type="button" variant="secondary" disabled={disabled || uploading} onClick={() => fileInput.current?.click()}>
        <Upload aria-hidden />
        {t(uploading ? 'loading' : value ? 'changeImage' : 'groupUploadImage')}
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept={imageTypes.join(',')}
        aria-label={t('groupUploadImage')}
        hidden
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          void upload(file);
        }}
      />
      {error && <p role="alert" className="text-sm text-[var(--danger-500)]">{error}</p>}
    </div>
  );
}
