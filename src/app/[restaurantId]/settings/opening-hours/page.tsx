'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import {
  getRestaurant,
  updateRestaurant,
  OpeningHoursConfig,
  DayHours,
  WeeklyHours,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, Field, Input, PageHead, Section } from '@/components/ds';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
type Day = typeof DAYS[number];

const ORDER_TYPES = ['pickup', 'dine_in', 'delivery'] as const;
type OrderType = typeof ORDER_TYPES[number];

const DEFAULT_DAY: DayHours = { open: '09:00', close: '22:00', closed: false };

function defaultWeek(): WeeklyHours {
  return Object.fromEntries(DAYS.map((d) => [d, { ...DEFAULT_DAY }])) as WeeklyHours;
}

function defaultConfig(): OpeningHoursConfig {
  return { pickup: defaultWeek(), dine_in: defaultWeek(), delivery: defaultWeek() };
}

interface ExceptionalClosure {
  id: string;
  date: string;
  reason: string;
}

export default function OpeningHoursPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<OrderType>('pickup');
  const [config, setConfig] = useState<OpeningHoursConfig>(defaultConfig());
  const [closures, setClosures] = useState<ExceptionalClosure[]>([]);

  useEffect(() => {
    getRestaurant(rid)
      .then((r) => {
        if (r.opening_hours_config) {
          const merged: OpeningHoursConfig = defaultConfig();
          for (const ot of ORDER_TYPES) {
            const src = (r.opening_hours_config as OpeningHoursConfig)[ot];
            if (src) {
              for (const day of DAYS) {
                if (src[day]) merged[ot]![day] = src[day];
              }
            }
          }
          setConfig(merged);
        }
      })
      .finally(() => setLoading(false));
  }, [rid]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRestaurant(rid, { opening_hours_config: config });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const updateDay = (orderType: OrderType, day: Day, patch: Partial<DayHours>) => {
    setConfig((prev) => ({
      ...prev,
      [orderType]: {
        ...prev[orderType],
        [day]: { ...prev[orderType]![day], ...patch },
      },
    }));
  };

  const isOpenNow = (() => {
    const week = config[activeTab] ?? defaultWeek();
    const now = new Date();
    const dayIdx = (now.getDay() + 6) % 7; // Mon=0
    const day = DAYS[dayIdx];
    const dh = week[day];
    if (!dh || dh.closed) return false;
    const cur = now.getHours() * 60 + now.getMinutes();
    const [oh, om] = dh.open.split(':').map(Number);
    const [ch, cm] = dh.close.split(':').map(Number);
    const o = oh * 60 + om;
    let c = ch * 60 + cm;
    if (c <= o) c += 24 * 60;
    return cur >= o && cur <= c;
  })();

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
      </div>
    );
  }

  const tabs: { key: OrderType; label: string }[] = [
    { key: 'pickup', label: t('pickup') || 'À emporter' },
    { key: 'dine_in', label: t('dineIn') || 'Sur place' },
    { key: 'delivery', label: t('delivery') || 'Livraison' },
  ];

  const weeklyHours = config[activeTab] ?? defaultWeek();

  return (
    <div className="max-w-[880px]">
      <PageHead
        title={t('openingHours') || 'Horaires'}
        desc={
          t('openingHoursDescNew') ||
          'Affichés sur votre menu en ligne. Les commandes sont bloquées en dehors de ces horaires.'
        }
        actions={
          <Badge tone={isOpenNow ? 'success' : 'neutral'} dot>
            {isOpenNow ? t('openNow') || 'Ouvert maintenant' : t('closedNow') || 'Fermé maintenant'}
          </Badge>
        }
      />

      <div className="inline-flex items-center gap-0.5 bg-[var(--surface-2)] p-1 rounded-r-md mb-[var(--s-4)]">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-selected={activeTab === key}
            onClick={() => setActiveTab(key)}
            className={`inline-flex items-center h-[30px] px-[var(--s-3)] rounded-r-sm text-fs-sm font-medium transition-colors duration-fast ${
              activeTab === key
                ? 'bg-[var(--surface)] text-[var(--fg)] shadow-1'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Section title={t('businessHours') || "Heures d'ouverture"}>
        <div className="border border-[var(--line)] rounded-r-md overflow-hidden">
          {DAYS.map((day, i) => {
            const dh = weeklyHours[day] ?? { ...DEFAULT_DAY };
            return (
              <div
                key={day}
                className="grid items-center gap-[var(--s-4)] px-[var(--s-4)] py-[var(--s-3)]"
                style={{
                  gridTemplateColumns: '140px 1fr 220px 80px',
                  borderTop: i > 0 ? '1px solid var(--line)' : 'none',
                  background: dh.closed ? 'var(--surface-2)' : 'transparent',
                }}
              >
                <div
                  className="text-fs-sm font-medium capitalize"
                  style={{ color: dh.closed ? 'var(--fg-muted)' : 'var(--fg)' }}
                >
                  {t(day) || day}
                </div>
                <div>
                  {dh.closed ? (
                    <span className="text-fs-sm text-[var(--fg-subtle)] italic">
                      {t('closedDay') || 'Fermé'}
                    </span>
                  ) : (
                    <div className="flex items-center gap-[var(--s-2)]">
                      <Input
                        type="time"
                        value={dh.open}
                        onChange={(e) => updateDay(activeTab, day, { open: e.target.value })}
                        className="font-mono text-center"
                        style={{ width: 100 }}
                      />
                      <span className="text-[var(--fg-subtle)]">—</span>
                      <Input
                        type="time"
                        value={dh.close}
                        onChange={(e) => updateDay(activeTab, day, { close: e.target.value })}
                        className="font-mono text-center"
                        style={{ width: 100 }}
                      />
                    </div>
                  )}
                </div>
                <div className="text-fs-xs text-[var(--fg-subtle)]">
                  {dh.closed ? '' : t('lastOrderHint') || 'Dernière commande −30 min'}
                </div>
                <label className="flex items-center justify-end gap-1.5 text-fs-xs text-[var(--fg-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dh.closed}
                    onChange={(e) => updateDay(activeTab, day, { closed: e.target.checked })}
                  />
                  {t('closedLabel') || 'Fermé'}
                </label>
              </div>
            );
          })}
        </div>
      </Section>

      <div className="flex items-center gap-[var(--s-3)] mb-[var(--s-5)]">
        <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('saveChanges')}
        </Button>
        {saved && (
          <span className="text-fs-sm text-[var(--success-500)] font-medium">{t('saved')}</span>
        )}
      </div>

      <Section title={t('exceptionalClosures') || 'Fermetures exceptionnelles'}>
        <div className="flex flex-col gap-[var(--s-2)]">
          {closures.length === 0 ? (
            <p className="text-fs-sm text-[var(--fg-subtle)]">
              {t('noClosures') || 'Aucune fermeture exceptionnelle.'}
            </p>
          ) : (
            closures.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] bg-[var(--surface-2)] rounded-r-sm"
              >
                <div className="flex items-center gap-[var(--s-3)] min-w-0">
                  <Calendar className="w-3.5 h-3.5 shrink-0 text-[var(--fg-muted)]" />
                  <div className="min-w-0">
                    <div className="text-fs-sm font-medium truncate">{c.date}</div>
                    <div className="text-fs-xs text-[var(--fg-subtle)] truncate">{c.reason}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="p-1.5 rounded-r-md text-[var(--fg-muted)] hover:text-[var(--danger-500)]"
                  onClick={() => setClosures((p) => p.filter((x) => x.id !== c.id))}
                  aria-label={t('remove') || 'Supprimer'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => {
              const date = window.prompt(t('closureDatePrompt') || 'Date (ex. 15 avril) :');
              if (!date) return;
              const reason = window.prompt(t('closureReasonPrompt') || 'Raison :') || '';
              setClosures((p) => [
                ...p,
                { id: Math.random().toString(36).slice(2), date, reason },
              ]);
            }}
          >
            <Plus />
            {t('addClosure') || 'Ajouter une fermeture'}
          </Button>
        </div>
      </Section>
    </div>
  );
}
