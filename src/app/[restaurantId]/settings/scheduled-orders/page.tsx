'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  getRestaurantSettings,
  updateRestaurantSettings,
  BatchFulfillmentDay,
  RestaurantSettings,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Field,
  Input,
  PageHead,
  Section,
  Select,
} from '@/components/ds';

type Mode = 'off' | 'batch';

const WEEKDAYS_FR = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

function makeDefaultDay(used: Set<number>): BatchFulfillmentDay {
  // Prefer Friday (5) since that's the canonical weekly-batch use case;
  // fall back to the first weekday not yet in the list.
  const candidates = [5, 4, 6, 0, 1, 2, 3];
  const day = candidates.find((d) => !used.has(d)) ?? 5;
  return {
    day,
    pickup_start: '10:00',
    pickup_end: '14:00',
    delivery_start: '14:00',
    delivery_end: '18:00',
  };
}

export default function ScheduledOrdersSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>('off');
  const [requirePrepayment, setRequirePrepayment] = useState(true);
  const [cutoffDay, setCutoffDay] = useState(3); // Wednesday
  const [cutoffTime, setCutoffTime] = useState('22:00');
  const [days, setDays] = useState<BatchFulfillmentDay[]>([]);

  useEffect(() => {
    getRestaurantSettings(rid)
      .then((s) => {
        setSettings(s);
        // Slot-based scheduling lives on the orders/settings page; here we
        // only deal with batch (every-Friday-style) pre-orders.
        setMode(s.batch_fulfillment_enabled ? 'batch' : 'off');
        setCutoffDay(s.batch_cutoff_day ?? 3);
        setCutoffTime(s.batch_cutoff_time || '22:00');
        setDays(s.batch_fulfillment_days ?? []);
        setRequirePrepayment(s.batch_require_prepayment ?? true);
      })
      .finally(() => setLoading(false));
  }, [rid]);

  const usedDays = useMemo(() => new Set(days.map((d) => d.day)), [days]);

  const addDay = () => setDays((p) => [...p, makeDefaultDay(usedDays)]);
  const removeDay = (idx: number) =>
    setDays((p) => p.filter((_, i) => i !== idx));
  const patchDay = (idx: number, patch: Partial<BatchFulfillmentDay>) =>
    setDays((p) => p.map((d, i) => (i === idx ? { ...d, ...patch } : d)));

  const isBatch = mode === 'batch';
  const noDays = isBatch && days.length === 0;

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateRestaurantSettings(rid, {
        batch_fulfillment_enabled: isBatch,
        batch_cutoff_day: cutoffDay,
        batch_cutoff_time: cutoffTime,
        batch_fulfillment_days: days,
        batch_require_prepayment: requirePrepayment,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Échec de l’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-[880px]">
      <PageHead
        title={t('scheduledOrders') || 'Commandes anticipées'}
        desc={
          t('scheduledOrdersPageDesc') ||
          'Vendez en pré-commande : les clients commandent pendant la semaine, vous livrez tout sur une journée fixe.'
        }
        actions={
          isBatch ? (
            <Badge tone="success" dot>
              {t('batchFulfillmentActive') || 'Pré-commandes actives'}
            </Badge>
          ) : (
            <Badge tone="neutral" dot>
              {t('batchFulfillmentDisabled') || 'Désactivé'}
            </Badge>
          )
        }
      />

      <Section
        title={t('mode') || 'Mode'}
        desc={
          t('scheduledOrdersModeDesc') ||
          'Le mode "Pré-commandes" prend le pas sur les horaires d’ouverture habituels pour la livraison.'
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--s-3)]">
          <ModeCard
            title={t('off') || 'Désactivé'}
            desc={
              t('preOrderOffDesc') ||
              'Le restaurant fonctionne en service immédiat selon les horaires d’ouverture.'
            }
            selected={mode === 'off'}
            onClick={() => setMode('off')}
          />
          <ModeCard
            title={t('preOrderBatchTitle') || 'Pré-commandes (lot hebdomadaire)'}
            desc={
              t('preOrderBatchDesc') ||
              'Les clients commandent en continu, et tout est livré ou retiré le(s) jour(s) que vous fixez.'
            }
            selected={mode === 'batch'}
            onClick={() => setMode('batch')}
          />
        </div>
      </Section>

      {isBatch && (
        <>
          <Section
            title={t('batchFulfillmentCutoff') || 'Clôture des commandes'}
            desc={
              t('batchFulfillmentCutoffDesc') ||
              'Date et heure auxquelles le carnet de commandes ferme pour le prochain lot.'
            }
          >
            <div className="flex flex-wrap gap-[var(--s-4)]">
              <Field label={t('batchFulfillmentCutoffDay') || 'Jour de clôture'}>
                <Select
                  value={String(cutoffDay)}
                  onChange={(e) => setCutoffDay(Number(e.target.value))}
                >
                  {WEEKDAYS_FR.map((label, i) => (
                    <option key={i} value={i}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('batchFulfillmentCutoffTime') || 'Heure de clôture'}>
                <Input
                  type="time"
                  value={cutoffTime}
                  onChange={(e) => setCutoffTime(e.target.value)}
                  className="font-mono text-center"
                  style={{ width: 120 }}
                />
              </Field>
            </div>
          </Section>

          <Section
            title={t('batchFulfillmentDays') || 'Jours de livraison / retrait'}
            desc={
              t('batchFulfillmentDaysDesc') ||
              'Définissez un ou plusieurs jours de la semaine pour livrer ou faire retirer les commandes.'
            }
            aside={
              <Button variant="secondary" size="sm" onClick={addDay}>
                <Plus />
                {t('batchFulfillmentAddDay') || 'Ajouter un jour'}
              </Button>
            }
          >
            {noDays ? (
              <div
                className="px-[var(--s-4)] py-[var(--s-3)] rounded-r-md text-fs-sm"
                style={{
                  background: 'color-mix(in oklab, var(--warning-500) 12%, transparent)',
                  color: 'var(--warning-500)',
                  border: '1px solid color-mix(in oklab, var(--warning-500) 35%, var(--line))',
                }}
              >
                {t('batchFulfillmentNoDays') ||
                  'Aucun jour défini. Ajoutez-en au moins un pour activer le mode pré-commandes.'}
              </div>
            ) : (
              <div className="flex flex-col gap-[var(--s-3)]">
                {days.map((d, idx) => (
                  <FulfillmentDayRow
                    key={idx}
                    value={d}
                    used={usedDays}
                    onChange={(patch) => patchDay(idx, patch)}
                    onRemove={() => removeDay(idx)}
                    t={t}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title={t('payment') || 'Paiement'}>
            <label className="flex items-start gap-[var(--s-3)] cursor-pointer px-[var(--s-3)] py-[var(--s-2)] rounded-r-md hover:bg-[var(--surface-2)] transition-colors">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={requirePrepayment}
                onChange={(e) => setRequirePrepayment(e.target.checked)}
              />
              <div>
                <div className="text-fs-sm font-medium text-[var(--fg)]">
                  {t('batchFulfillmentRequirePrepayment') || 'Paiement requis à la commande'}
                </div>
                <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">
                  {t('batchFulfillmentRequirePrepaymentSubtitle') ||
                    'Les clients doivent payer immédiatement lors d’une pré-commande.'}
                </div>
              </div>
            </label>
          </Section>
        </>
      )}

      <div className="flex items-center gap-[var(--s-3)] mb-[var(--s-5)] flex-wrap">
        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          disabled={saving || (isBatch && noDays)}
        >
          {saving ? t('saving') : t('saveChanges')}
        </Button>
        {saved && (
          <span className="text-fs-sm text-[var(--success-500)] font-medium">{t('saved')}</span>
        )}
        {saveError && (
          <span className="text-fs-sm text-[var(--danger-500)] font-medium">{saveError}</span>
        )}
      </div>
    </div>
  );
}

function ModeCard({
  title,
  desc,
  selected,
  onClick,
}: {
  title: string;
  desc: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left p-[var(--s-4)] rounded-r-md border transition-colors"
      style={{
        background: selected
          ? 'color-mix(in oklab, var(--brand-500) 10%, var(--surface))'
          : 'var(--surface)',
        borderColor: selected ? 'var(--brand-500)' : 'var(--line)',
      }}
    >
      <div className="text-fs-sm font-semibold text-[var(--fg)]">{title}</div>
      <div className="text-fs-xs text-[var(--fg-subtle)] mt-1">{desc}</div>
    </button>
  );
}

function FulfillmentDayRow({
  value,
  used,
  onChange,
  onRemove,
  t,
}: {
  value: BatchFulfillmentDay;
  used: Set<number>;
  onChange: (patch: Partial<BatchFulfillmentDay>) => void;
  onRemove: () => void;
  t: (key: string) => string;
}) {
  return (
    <div
      className="flex flex-wrap items-end gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] rounded-r-md border border-[var(--line)]"
      style={{ background: 'var(--surface-2)' }}
    >
      <Field label={t('day') || 'Jour'}>
        <Select
          value={String(value.day)}
          onChange={(e) => onChange({ day: Number(e.target.value) })}
        >
          {WEEKDAYS_FR.map((label, i) => (
            <option key={i} value={i} disabled={used.has(i) && i !== value.day}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t('batchFulfillmentPickupWindow') || 'Fenêtre retrait'}>
        <div className="flex items-center gap-[var(--s-2)]">
          <Input
            type="time"
            value={value.pickup_start ?? ''}
            onChange={(e) => onChange({ pickup_start: e.target.value })}
            className="font-mono text-center"
            style={{ width: 100 }}
          />
          <span className="text-[var(--fg-subtle)]">→</span>
          <Input
            type="time"
            value={value.pickup_end ?? ''}
            onChange={(e) => onChange({ pickup_end: e.target.value })}
            className="font-mono text-center"
            style={{ width: 100 }}
          />
        </div>
      </Field>

      <Field label={t('batchFulfillmentDeliveryWindow') || 'Fenêtre livraison'}>
        <div className="flex items-center gap-[var(--s-2)]">
          <Input
            type="time"
            value={value.delivery_start ?? ''}
            onChange={(e) => onChange({ delivery_start: e.target.value })}
            className="font-mono text-center"
            style={{ width: 100 }}
          />
          <span className="text-[var(--fg-subtle)]">→</span>
          <Input
            type="time"
            value={value.delivery_end ?? ''}
            onChange={(e) => onChange({ delivery_end: e.target.value })}
            className="font-mono text-center"
            style={{ width: 100 }}
          />
        </div>
      </Field>

      <button
        type="button"
        onClick={onRemove}
        className="self-end p-2 rounded-r-md text-[var(--fg-muted)] hover:text-[var(--danger-500)] transition-colors"
        aria-label={t('remove') || 'Supprimer'}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
