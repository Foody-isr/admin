'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Clock3Icon, FlagIcon, MapPinIcon, PencilIcon, SaveIcon, XIcon } from 'lucide-react';
import { Button, Input } from '@/components/ds';
import { CustomerWindowField, parseCustomerWindowMinutes } from '@/components/delivery/CustomerWindowField';
import { RouteAddressField } from '@/components/delivery/RouteAddressField';
import { StopServiceField, validStopServiceMinutes } from '@/components/delivery/StopServiceField';
import { deliveryRoutingError } from '@/lib/delivery-planning';
import type { DeliveryRoute, RouteSettingsInput } from '@/lib/delivery';

type Translator = (key: string) => string;

interface RouteSettingsEditorProps {
  route: DeliveryRoute;
  locale: string;
  disabled?: boolean;
  onSave: (input: RouteSettingsInput) => Promise<void>;
  t: Translator;
}

function localDateTimeValue(value: string | null | undefined, routeDate: string): string {
  if (!value) return `${routeDate.slice(0, 10)}T09:00`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function RouteSettingsEditor({ route, locale, disabled = false, onSave, t }: RouteSettingsEditorProps) {
  const [editing, setEditing] = useState(false);
  const [resolvingStart, setResolvingStart] = useState(false);
  const [resolvingEnd, setResolvingEnd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [departure, setDeparture] = useState(() => localDateTimeValue(route.planned_departure_at, route.date));
  const [startAddress, setStartAddress] = useState(route.start_address ?? '');
  const [endAddress, setEndAddress] = useState(route.end_address ?? '');
  const [customerWindow, setCustomerWindow] = useState(String(route.customer_window_minutes ?? 90));
  const [serviceMinutes, setServiceMinutes] = useState(String(route.stop_service_minutes ?? 3));

  useEffect(() => {
    if (editing) return;
    setDeparture(localDateTimeValue(route.planned_departure_at, route.date));
    setStartAddress(route.start_address ?? '');
    setEndAddress(route.end_address ?? '');
    setServiceMinutes(String(route.stop_service_minutes ?? 3));
    setCustomerWindow(String(route.customer_window_minutes ?? 90));
  }, [editing, route.date, route.end_address, route.planned_departure_at, route.start_address, route.stop_service_minutes, route.customer_window_minutes]);

  const departureDate = departure ? new Date(departure) : null;
  const departureValid = departureDate != null && !Number.isNaN(departureDate.getTime());
  const departureLabel = route.planned_departure_at
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(route.planned_departure_at))
    : t('routeSettingsNotSet');

  const reset = () => {
    setDeparture(localDateTimeValue(route.planned_departure_at, route.date));
    setStartAddress(route.start_address ?? '');
    setEndAddress(route.end_address ?? '');
    setServiceMinutes(String(route.stop_service_minutes ?? 3));
    setCustomerWindow(String(route.customer_window_minutes ?? 90));
    setEditing(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (resolvingStart || resolvingEnd || !departureValid || !validStopServiceMinutes(serviceMinutes) || parseCustomerWindowMinutes(customerWindow) == null) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({
        planned_departure_at: departureDate.toISOString(),
        start_address: startAddress.trim(),
        end_address: endAddress.trim(),
        stop_service_minutes: Number(serviceMinutes),
        customer_window_minutes: parseCustomerWindowMinutes(customerWindow)!,
      });
      setEditing(false);
    } catch (cause) {
      setSaveError(deliveryRoutingError(cause, t) ?? t('routeSettingsSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1 text-fs-xs text-[var(--fg-muted)]">
            <p className="flex items-center gap-2">
              <Clock3Icon className="h-3.5 w-3.5 shrink-0 text-[var(--brand-500)]" />
              <span className="font-medium text-[var(--fg)]">{departureLabel}</span>
            </p>
            <p className="flex items-center gap-2"><Clock3Icon className="h-3.5 w-3.5 shrink-0" /><span>{t('stopServiceMinutesSummary').replace('{minutes}', String(route.stop_service_minutes ?? 3))}</span></p>
            <p className="flex items-center gap-2">
              <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{route.start_address || t('routeSettingsOptionalStart')}</span>
            </p>
            <p className="flex items-center gap-2">
              <FlagIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{route.end_address || t('routeSettingsOptionalEnd')}</span>
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setEditing(true)}>
            <PencilIcon />
            {t('edit')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="min-w-0 rounded-r-lg border border-[var(--line-strong)] bg-[var(--surface-2)] p-3 sm:p-4">
      <div className="mb-3">
        <p className="text-fs-sm font-semibold text-[var(--fg)]">{t('routeSettingsTitle')}</p>
        <p className="mt-1 max-w-[60ch] text-fs-xs leading-relaxed text-[var(--fg-subtle)]">{t('routeSettingsHint')}</p>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
          <span className="text-fs-xs font-medium text-[var(--fg-muted)]">{t('deliveryPlanDeparture')}</span>
          <Input
            type="datetime-local"
            value={departure}
            onChange={(event) => setDeparture(event.target.value)}
            className="min-w-0 max-w-full text-[16px] sm:text-fs-sm"
            dir="ltr"
            required
            disabled={disabled || saving}
          />
        </label>
        <RouteAddressField restaurantId={route.restaurant_id} locale={locale} label={t('routeSettingsStartAddress')} placeholder={t('routeSettingsStartPlaceholder')} value={startAddress} onChange={setStartAddress} onResolvingChange={setResolvingStart} disabled={disabled || saving} t={t} />
        <RouteAddressField restaurantId={route.restaurant_id} locale={locale} label={t('routeSettingsEndAddress')} placeholder={t('routeSettingsEndPlaceholder')} value={endAddress} onChange={setEndAddress} onResolvingChange={setResolvingEnd} disabled={disabled || saving} t={t} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><StopServiceField value={serviceMinutes} onChange={setServiceMinutes} disabled={disabled || saving} t={t} /><CustomerWindowField value={customerWindow} onChange={setCustomerWindow} disabled={disabled || saving} t={t} /></div>
      <p className="mt-3 text-fs-xs leading-relaxed text-[var(--fg-subtle)]">{t('routeSettingsGeocodeHint')}</p>
      {saveError && <p role="alert" className="mt-3 text-fs-xs text-[var(--danger-500)]">{saveError}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <Button type="button" variant="ghost" size="md" className="w-full sm:w-auto" disabled={saving} onClick={reset}>
          <XIcon />
          {t('cancel')}
        </Button>
        <Button type="submit" variant="primary" size="md" className="w-full sm:w-auto" disabled={disabled || saving || resolvingStart || resolvingEnd || !departureValid || !validStopServiceMinutes(serviceMinutes) || parseCustomerWindowMinutes(customerWindow) == null}>
          <SaveIcon />
          {t(saving ? 'saving' : 'save')}
        </Button>
      </div>
    </form>
  );
}
