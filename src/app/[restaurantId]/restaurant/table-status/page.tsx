'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Info } from 'lucide-react';
import { getRestaurantSettings, updateRestaurantSettings, type RestaurantSettings } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, ConfirmDialog, Field, NumberField, PageHead, Section, Input } from '@/components/ds';

type Draft = { floor_plan_color_indicators: boolean; table_in_service_color: string; table_yellow_after_minutes: number; table_red_after_minutes: number };
// Current POS TableStatusStyle palette; the service colour remains restaurant-owned.
const SWATCH = { free: '#89909E', warn: '#F4A62A', late: '#EF6A67', toSettle: '#FF934F' };
function draftFrom(settings: RestaurantSettings): Draft {
  if (typeof settings.floor_plan_color_indicators !== 'boolean' || typeof settings.table_in_service_color !== 'string' || !Number.isFinite(settings.table_yellow_after_minutes) || !Number.isFinite(settings.table_red_after_minutes)) throw new Error('Incomplete table settings');
  return { floor_plan_color_indicators: settings.floor_plan_color_indicators, table_in_service_color: settings.table_in_service_color, table_yellow_after_minutes: settings.table_yellow_after_minutes!, table_red_after_minutes: settings.table_red_after_minutes! };
}
const equal = (first: unknown, second: unknown) => JSON.stringify(first) === JSON.stringify(second);

/** Configure the existing POS table indicators with a labelled, live preview. */
export default function TableStatusPage() {
  const { restaurantId } = useParams();
  return <TableStatusWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}
function TableStatusWorkspace({ rid }: { rid: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<Draft | null>(null);
  const [invalidColor, setInvalidColor] = useState(false);
  const colorInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const lifetime = useRef({ generation: 0, sequence: 0 });
  const lock = useRef(false);
  const dirty = !!draft && !equal(draft, baseline);
  const load = useCallback(async () => {
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    setLoading(true); setLoadError(false);
    try {
      const settings = await getRestaurantSettings(rid), next = draftFrom(settings);
      if (current()) { setDraft(next); setBaseline(next); }
    } catch { if (current()) setLoadError(true); }
    finally { if (current()) setLoading(false); }
  }, [rid]);
  useEffect(() => { const current = lifetime.current; void load(); return () => { current.generation += 1; }; }, [load]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty || lock.current) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: MouseEvent) => {
      if ((!dirty && !lock.current) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download') || link.origin !== location.origin || link.href === location.href) return;
      event.preventDefault(); event.stopPropagation(); if (!lock.current) setLeaving(link.pathname + link.search + link.hash);
    };
    window.addEventListener('beforeunload', guard); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', guard); document.removeEventListener('click', navigate, true); };
  }, [dirty]);
  const patch = (value: Partial<Draft>) => { if (!canEdit || lock.current) return; setDraft(current => current ? { ...current, ...value } : null); setSaved(false); setSaveError(false); setInvalidColor(false); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!canEdit || !draft || !baseline || !dirty || lock.current || loading || loadError) return;
    if (draft.table_in_service_color !== baseline.table_in_service_color && !/^#[0-9a-f]{6}$/i.test(draft.table_in_service_color)) { setInvalidColor(true); colorInput.current?.focus(); return; }
    lock.current = true; setSaving(true); setSaveError(false); setSaved(false);
    const generation = lifetime.current.generation, current = () => generation === lifetime.current.generation;
    const input: Partial<RestaurantSettings> = {};
    if (draft.floor_plan_color_indicators !== baseline.floor_plan_color_indicators) input.floor_plan_color_indicators = draft.floor_plan_color_indicators;
    if (draft.table_in_service_color !== baseline.table_in_service_color) input.table_in_service_color = draft.table_in_service_color;
    if (draft.table_yellow_after_minutes !== baseline.table_yellow_after_minutes) input.table_yellow_after_minutes = draft.table_yellow_after_minutes;
    if (draft.table_red_after_minutes !== baseline.table_red_after_minutes) input.table_red_after_minutes = draft.table_red_after_minutes;
    try {
      const response = await updateRestaurantSettings(rid, input);
      const next = draftFrom({ ...draft, ...response });
      if (current()) { setDraft(next); setBaseline(next); setSaved(true); }
    } catch { if (current()) setSaveError(true); }
    finally { if (current()) { lock.current = false; setSaving(false); } }
  };
  const on = draft?.floor_plan_color_indicators;
  const color = draft && /^#[0-9a-f]{6}$/i.test(draft.table_in_service_color) ? draft.table_in_service_color : undefined;
  return <div className="max-w-4xl space-y-6">
    <PageHead title={t('tableStatus')} desc={t('tableStatusDesc')} actions={canEdit && <Button type="submit" form="table-status-settings" disabled={loading || loadError || !dirty || saving}>{t(saving ? 'saving' : 'saveChanges')}</Button>} />
    {loading ? <p role="status" className="py-10 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : loadError ? <div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{t('tableSettingsLoadFailed')}</p><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div> : draft && <form id="table-status-settings" onSubmit={save} className="space-y-6">
      {!canEdit && <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)]">{t('pushPreferencesReadOnly')}</p>}
      <Section title={t('tableStatusInServiceColor')} desc={t('tableSettingsColorHint')}>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('tableSettingsColorPicker')}><input type="color" aria-label={t('tableSettingsColorPicker')} value={color ?? '#54D6A1'} disabled={!canEdit || saving} onChange={event => patch({ table_in_service_color: event.target.value })} className="size-10 rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] p-1 disabled:opacity-50" /></Field>
          <Field label={t('tableSettingsHex')} className="w-40"><Input ref={colorInput} dir="ltr" value={draft.table_in_service_color} readOnly={!canEdit || saving} onChange={event => patch({ table_in_service_color: event.target.value })} aria-label={t('tableSettingsHex')} aria-invalid={invalidColor || undefined} aria-describedby={invalidColor ? 'table-color-error' : undefined} spellCheck={false} /></Field>
        </div>
        {invalidColor && <p id="table-color-error" role="alert" className="mt-2 text-sm text-[var(--danger-500)]">{t('tableSettingsInvalidColor')}</p>}
      </Section>
      <Section title={t('tableStatusColorIndicators')}>
        <label className="flex items-start gap-4"><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t('tableStatusColorIndicatorsDesc')}</span><span className="mt-1 block text-sm leading-6 text-[var(--fg-muted)]">{t('tableSettingsClockHint')}</span></span><input role="switch" type="checkbox" aria-label={t('tableStatusColorIndicators')} checked={on} disabled={!canEdit || saving} onChange={event => patch({ floor_plan_color_indicators: event.target.checked })} className="mt-1 size-5 shrink-0 accent-[var(--action)]" /></label>
        {on ? <div className="mt-5 grid gap-4 sm:grid-cols-2 border-s-2 border-[var(--line)] ps-4">
          <Field label={t('tableStatusYellowAfter')} hint={t('minutes')}><NumberField required integer min={Math.min(1, baseline?.table_yellow_after_minutes ?? 1)} max={Math.max(240, baseline?.table_yellow_after_minutes ?? 240)} value={draft.table_yellow_after_minutes} format={String} readOnly={!canEdit || saving} onChange={table_yellow_after_minutes => patch({ table_yellow_after_minutes })} dir="ltr" aria-label={t('tableStatusYellowAfter')} /></Field>
          <Field label={t('tableStatusRedAfter')} hint={t('minutes')}><NumberField required integer min={Math.min(1, baseline?.table_red_after_minutes ?? 1)} max={Math.max(480, baseline?.table_red_after_minutes ?? 480)} value={draft.table_red_after_minutes} format={String} readOnly={!canEdit || saving} onChange={table_red_after_minutes => patch({ table_red_after_minutes })} dir="ltr" aria-label={t('tableStatusRedAfter')} /></Field>
        </div> : <p className="mt-4 text-sm text-[var(--fg-muted)]">{t('tableStatusIndicatorsOffNote')}</p>}
        {on && draft.table_red_after_minutes < draft.table_yellow_after_minutes && <p className="mt-3 text-sm text-[var(--fg-muted)]">{t('tableSettingsReversed')}</p>}
      </Section>
      <Section title={t('tableSettingsPreview')} desc={t('tableSettingsPreviewHint')}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            { color: SWATCH.free, label: t('tableStatusLegendFree'), note: t('tableSettingsFreeHint') },
            { color, label: t('tableStatusLegendOccupied'), note: on ? <><bdi dir="ltr">{draft.table_red_after_minutes < draft.table_yellow_after_minutes ? `≤ ${draft.table_red_after_minutes}` : `< ${draft.table_yellow_after_minutes}`}</bdi> {t('minutes')}</> : t('tableSettingsOccupiedHint') },
            ...(on ? [{ color: SWATCH.warn, label: t('tableSettingsWarn'), note: draft.table_red_after_minutes < draft.table_yellow_after_minutes ? t('tableSettingsNoYellow') : <><bdi dir="ltr">{`${draft.table_yellow_after_minutes} – ${draft.table_red_after_minutes}`}</bdi> {t('minutes')}</> }, { color: SWATCH.late, label: t('tableSettingsLate'), note: <><bdi dir="ltr">{`> ${draft.table_red_after_minutes}`}</bdi> {t('minutes')}</> }] : []),
            { color: SWATCH.toSettle, label: t('tableStatusLegendToSettle'), note: t('tableSettingsSettleHint') },
          ].map((status, index) => <li key={index} className="flex items-start gap-3 rounded-r-md border border-[var(--line)] p-4"><span aria-hidden="true" className="mt-1 size-8 shrink-0 rounded-r-sm border border-[var(--line-strong)]" style={{ background: status.color }} /><div className="min-w-0"><p className="text-sm font-semibold">{status.label}</p><p className="mt-1 text-sm leading-6 text-[var(--fg-muted)]">{status.note}</p></div></li>)}
        </ul>
        <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-[var(--fg-muted)]"><Info aria-hidden="true" className="mt-1 size-4 shrink-0" />{t('tableSettingsPriority')}</p>
      </Section>
      {saveError && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('tableSettingsSaveFailed')}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5"><p role="status" className="text-sm text-[var(--fg-muted)]">{t(saving ? 'saving' : dirty ? 'settingsUnsaved' : saved ? 'saved' : 'settingsUnchanged')}</p>{canEdit && <div className="flex gap-2"><Button type="button" variant="secondary" disabled={!dirty || saving} onClick={() => setLeaving('reset')}>{t('reset')}</Button><Button type="submit" disabled={!dirty || saving}>{t(saving ? 'saving' : 'saveChanges')}</Button></div>}</div>
    </form>}
    <ConfirmDialog open={leaving !== null} onOpenChange={open => { if (!open) setLeaving(null); }} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { const target = leaving; setLeaving(null); setDraft(baseline); setInvalidColor(false); setSaveError(false); setSaved(false); if (target && target !== 'reset') router.push(target); }} />
  </div>;
}
