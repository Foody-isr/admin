'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  LocateFixedIcon,
  MapPinIcon,
  XIcon,
} from 'lucide-react';
import { Button, Field, Input } from '@/components/ds';
import { ApiError, geocodeAddress } from '@/lib/api';
import type { RouteStop, StopAddressInput } from '@/lib/delivery';

type Coordinates = { lat: number; lng: number };
type LookupState = 'idle' | 'checking' | 'resolved' | 'unresolved';

interface CourierAddressEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: number;
  stop: RouteStop | null;
  onSave: (input: StopAddressInput) => Promise<void>;
  t: (key: string) => string;
}

/** Mobile-first address verification sheet for the courier route. */
export function CourierAddressEditor({
  open,
  onOpenChange,
  restaurantId,
  stop,
  onSave,
  t,
}: CourierAddressEditorProps) {
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [lookupState, setLookupState] = useState<LookupState>('idle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !stop) return;
    setAddress(stop.address ?? '');
    setCity(stop.city ?? '');
    setCoordinates(stop.lat != null && stop.lng != null ? { lat: stop.lat, lng: stop.lng } : null);
    setLookupState(stop.needs_geocode ? 'idle' : 'resolved');
    setSaving(false);
    setError('');
  }, [open, stop]);

  const markChanged = () => {
    setCoordinates(null);
    setLookupState('idle');
    setError('');
  };

  const verify = async () => {
    if (!address.trim() || !city.trim()) return;
    setLookupState('checking');
    setError('');
    const result = await geocodeAddress(restaurantId, address.trim(), city.trim());
    if (result.found && result.lat != null && result.lng != null) {
      setCoordinates({ lat: result.lat, lng: result.lng });
      setLookupState('resolved');
      return;
    }
    if (result.unavailable) {
      setCoordinates(null);
      setLookupState('idle');
      setError(t('addressLookupUnavailable'));
      return;
    }
    setCoordinates(null);
    setLookupState('unresolved');
  };

  const useCurrentPosition = () => {
    setError('');
    if (!navigator.geolocation) {
      setError(t('addressCurrentPositionUnavailable'));
      return;
    }
    setLookupState('checking');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates({ lat: coords.latitude, lng: coords.longitude });
        setLookupState('resolved');
      },
      () => {
        setLookupState('idle');
        setError(t('addressCurrentPositionUnavailable'));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  const save = async () => {
    if (!stop || !address.trim() || !city.trim() || lookupState === 'unresolved') return;
    setSaving(true);
    setError('');
    try {
      await onSave({
        address: address.trim(),
        city: city.trim(),
        ...(coordinates ?? {}),
      });
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof ApiError
        ? cause.details || cause.message
        : (cause as Error)?.message || t('couldNotSave'));
    } finally {
      setSaving(false);
    }
  };

  const canSave = address.trim() !== '' && city.trim() !== '' && lookupState !== 'checking' && lookupState !== 'unresolved' && !saving;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-[1001] max-h-[calc(100dvh-var(--safe-top))] overflow-y-auto rounded-t-r-xl border border-b-0 border-[var(--line)] bg-[var(--bg)] pb-[max(var(--safe-bottom),var(--s-4))] text-[var(--fg)] shadow-3 focus:outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(500px,calc(100vw-32px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-r-xl sm:border sm:pb-0">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-50)] text-[var(--brand-600)]">
                <MapPinIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-fs-lg font-semibold">{t('correctAddress')}</Dialog.Title>
                <Dialog.Description className="mt-0.5 text-fs-sm text-[var(--fg-muted)]">
                  {t('courierAddressEditorDescription')}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button variant="ghost" size="sm" icon aria-label={t('close')} disabled={saving}>
                  <XIcon />
                </Button>
              </Dialog.Close>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <Field label={t('address')}>
              <Input
                value={address}
                onChange={(event) => { setAddress(event.target.value); markChanged(); }}
                autoComplete="street-address"
                autoFocus
              />
            </Field>
            <Field label={t('city')}>
              <Input
                value={city}
                onChange={(event) => { setCity(event.target.value); markChanged(); }}
                autoComplete="address-level2"
              />
            </Field>

            {lookupState === 'resolved' && (
              <p className="flex items-start gap-2 rounded-r-md bg-[var(--success-50)] px-3 py-2 text-fs-sm text-[var(--success-500)]">
                <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0" />
                {t('addressPositionVerified')}
              </p>
            )}
            {lookupState === 'unresolved' && (
              <p className="flex items-start gap-2 rounded-r-md bg-[var(--warning-50)] px-3 py-2 text-fs-sm text-[var(--warning-600)]">
                <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                {t('addressPositionNotFoundHelp')}
              </p>
            )}
            {error && <p role="alert" className="text-fs-sm text-[var(--danger-500)]">{error}</p>}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                variant="secondary"
                className="justify-center"
                disabled={!address.trim() || !city.trim() || lookupState === 'checking' || saving}
                onClick={() => void verify()}
              >
                <MapPinIcon />
                {lookupState === 'checking' ? t('checking') : t('verifyAddressPosition')}
              </Button>
              <Button variant="ghost" className="justify-center" disabled={lookupState === 'checking' || saving} onClick={useCurrentPosition}>
                <LocateFixedIcon />
                {t('useCurrentPositionHere')}
              </Button>
            </div>
            <p className="text-fs-xs leading-relaxed text-[var(--fg-subtle)]">
              {t('useCurrentPositionHereHint')}
            </p>
          </div>

          <div className="flex gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-5 py-4">
            <Dialog.Close asChild>
              <Button variant="ghost" className="flex-1 justify-center" disabled={saving}>{t('back')}</Button>
            </Dialog.Close>
            <Button variant="primary" className="flex-[1.5] justify-center" disabled={!canSave} onClick={() => void save()}>
              {saving ? t('saving') : t('saveAndRecalculate')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
