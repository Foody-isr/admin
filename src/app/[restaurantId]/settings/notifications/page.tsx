'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Bell, BellOff, Smartphone, AlertTriangle, ShoppingCart, XCircle, CreditCard } from 'lucide-react';
import { Badge, Button, PageHead } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import {
  getCurrentSubscription,
  getEnvironment,
  getNotificationPreferences,
  sendTestPush,
  subscribe,
  unsubscribe,
  updateNotificationPreferences,
  type NotificationPreferences,
  type NotificationPreferencesUpdate,
  type PushEnvironment,
} from '@/lib/push';

type Status = 'idle' | 'subscribing' | 'unsubscribing' | 'testing';

/** Subset of preference keys exposed in the UI today. The server schema
 *  also has `low_stock_enabled` and `big_order_enabled` but neither has
 *  a Web Push trigger wired yet — hide them from users to avoid the
 *  "I enabled it but get nothing" trap. Add back once their trigger
 *  sites land. */
type ExposedPrefKey =
  | 'new_order_enabled'
  | 'order_canceled_enabled'
  | 'payment_failure_enabled';

export default function NotificationsSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [env, setEnv] = useState<PushEnvironment | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [savingPref, setSavingPref] = useState<ExposedPrefKey | null>(null);

  const refresh = useCallback(async () => {
    setEnv(getEnvironment());
    const existing = await getCurrentSubscription();
    setSubscribed(Boolean(existing));
    // Fetch prefs in parallel — don't block the toggle UI if the
    // endpoint is slow. Errors here aren't fatal (the toggles just
    // won't show until next refresh).
    try {
      const p = await getNotificationPreferences(rid);
      setPrefs(p);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[notifications] failed to load prefs:', err);
    }
  }, [rid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleTogglePref = async (key: ExposedPrefKey, next: boolean) => {
    if (!prefs) return;
    // Optimistic update so the switch flips instantly; revert on failure.
    const prev = prefs[key];
    setPrefs({ ...prefs, [key]: next });
    setSavingPref(key);
    try {
      const update: NotificationPreferencesUpdate = { [key]: next };
      const fresh = await updateNotificationPreferences(rid, update);
      setPrefs(fresh);
    } catch (err) {
      setPrefs({ ...prefs, [key]: prev });
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingPref(null);
    }
  };

  const handleEnable = async () => {
    setError(null);
    setStatus('subscribing');
    try {
      await subscribe(rid);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStatus('idle');
    }
  };

  const handleDisable = async () => {
    setError(null);
    setStatus('unsubscribing');
    try {
      await unsubscribe(rid);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStatus('idle');
    }
  };

  const handleTest = async () => {
    setError(null);
    setTestResult(null);
    setStatus('testing');
    try {
      const result = await sendTestPush(rid);
      setTestResult(
        result.sent > 0
          ? (t('testPushSent') || 'Notification de test envoyée. Si elle n’apparaît pas dans quelques secondes, vérifiez les autorisations système.')
          : (t('testPushNoneSent') || 'Aucune notification envoyée — vérifiez que vous êtes bien abonné depuis cet appareil.'),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStatus('idle');
    }
  };

  // Three top-level UI states, in priority order:
  //   1. Browser doesn't support Web Push at all → show a "not available" card
  //   2. iOS but not installed to Home Screen → show install instructions
  //   3. Supported and reachable → show the enable / disable toggle
  const showInstallHint = env?.supported && env.isIOS && !env.isStandalone;

  return (
    <div className="max-w-2xl">
      <PageHead
        title={t('notifications') || 'Notifications'}
        desc={
          t('notificationsDesc')
          || 'Recevez une alerte sur ce téléphone quand une nouvelle commande arrive.'
        }
      />

      {!env ? null : !env.supported ? (
        <UnsupportedCard t={t} />
      ) : showInstallHint ? (
        <InstallToHomeScreenCard t={t} />
      ) : env.permission === 'denied' ? (
        <PermissionDeniedCard t={t} />
      ) : (
        <ToggleCard
          subscribed={subscribed}
          status={status}
          onEnable={handleEnable}
          onDisable={handleDisable}
          onTest={handleTest}
          t={t}
        />
      )}

      {/* Per-event opt-ins. Only useful once subscribed (no point fine-tuning
          which events to receive when you receive none) — but we still
          render the card hidden so prefs aren't lost between sessions. */}
      {subscribed && prefs && (
        <div className="mt-[var(--s-4)]">
          <EventPreferences prefs={prefs} saving={savingPref} onToggle={handleTogglePref} t={t} />
        </div>
      )}

      {testResult && (
        <div className="mt-[var(--s-4)] p-[var(--s-4)] rounded-r-md bg-[var(--surface-2)] border border-[var(--line)] text-fs-sm text-[var(--fg-muted)]">
          {testResult}
        </div>
      )}

      {error && (
        <div className="mt-[var(--s-4)] p-[var(--s-4)] rounded-r-md bg-[color-mix(in_oklab,var(--danger-500)_8%,transparent)] border border-[color-mix(in_oklab,var(--danger-500)_30%,var(--line))] text-fs-sm text-[var(--danger-500)] flex items-start gap-[var(--s-2)]">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="min-w-0 break-words">{error}</div>
        </div>
      )}
    </div>
  );
}

function ToggleCard({
  subscribed,
  status,
  onEnable,
  onDisable,
  onTest,
  t,
}: {
  subscribed: boolean;
  status: Status;
  onEnable: () => void;
  onDisable: () => void;
  onTest: () => void;
  t: (k: string) => string;
}) {
  return (
    <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-[var(--s-5)]">
      <div className="flex items-start gap-[var(--s-4)]">
        <div
          className="w-10 h-10 shrink-0 rounded-r-md grid place-items-center"
          style={{
            background:
              'color-mix(in oklab, var(--brand-500) 14%, transparent)',
            color: 'var(--brand-500)',
          }}
        >
          {subscribed ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[var(--s-2)] flex-wrap">
            <h2 className="text-fs-md font-semibold text-[var(--fg)]">
              {t('newOrderAlerts') || 'Nouvelles commandes'}
            </h2>
            {subscribed && <Badge tone="success">{t('enabled') || 'Activées'}</Badge>}
          </div>
          <p className="text-fs-sm text-[var(--fg-muted)] mt-1.5">
            {t('newOrderAlertsDesc')
              || 'Une notification push apparaît sur ce téléphone à chaque nouvelle commande pour ce restaurant.'}
          </p>
        </div>
      </div>
      <div className="mt-[var(--s-5)] flex justify-end gap-[var(--s-2)] flex-wrap">
        {subscribed && (
          <Button
            variant="secondary"
            size="md"
            onClick={onTest}
            disabled={status !== 'idle'}
          >
            {status === 'testing'
              ? t('sendingTestPush') || 'Envoi…'
              : t('sendTestPush') || 'Envoyer un test'}
          </Button>
        )}
        {subscribed ? (
          <Button
            variant="secondary"
            size="md"
            onClick={onDisable}
            disabled={status !== 'idle'}
          >
            {status === 'unsubscribing'
              ? t('disabling') || 'Désactivation…'
              : t('disable') || 'Désactiver'}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="md"
            onClick={onEnable}
            disabled={status !== 'idle'}
          >
            <Bell className="w-4 h-4" />
            {status === 'subscribing'
              ? t('enabling') || 'Activation…'
              : t('enableNotifications') || 'Activer les notifications'}
          </Button>
        )}
      </div>
    </div>
  );
}

function InstallToHomeScreenCard({ t }: { t: (k: string) => string }) {
  return (
    <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-[var(--s-5)]">
      <div className="flex items-start gap-[var(--s-4)]">
        <div
          className="w-10 h-10 shrink-0 rounded-r-md grid place-items-center"
          style={{
            background:
              'color-mix(in oklab, var(--brand-500) 14%, transparent)',
            color: 'var(--brand-500)',
          }}
        >
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-fs-md font-semibold text-[var(--fg)]">
            {t('addToHomeScreenTitle') || "Ajouter à l'écran d'accueil d'abord"}
          </h2>
          <p className="text-fs-sm text-[var(--fg-muted)] mt-1.5">
            {t('addToHomeScreenDesc')
              || "iOS n'envoie de notifications que sur les applications installées. Touchez le bouton Partager dans Safari, puis « Sur l'écran d'accueil ». Rouvrez Foody Admin depuis l'icône installée et revenez sur cette page."}
          </p>
        </div>
      </div>
    </div>
  );
}

function PermissionDeniedCard({ t }: { t: (k: string) => string }) {
  return (
    <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-[var(--s-5)]">
      <div className="flex items-start gap-[var(--s-4)]">
        <div
          className="w-10 h-10 shrink-0 rounded-r-md grid place-items-center"
          style={{
            background:
              'color-mix(in oklab, var(--warning-500) 14%, transparent)',
            color: 'var(--warning-500)',
          }}
        >
          <BellOff className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-fs-md font-semibold text-[var(--fg)]">
            {t('notificationsBlocked') || 'Notifications bloquées'}
          </h2>
          <p className="text-fs-sm text-[var(--fg-muted)] mt-1.5">
            {t('notificationsBlockedDesc')
              || "Vous avez refusé les notifications pour ce site. Réautorisez-les dans les réglages du navigateur (ou de l'application installée), puis revenez sur cette page."}
          </p>
        </div>
      </div>
    </div>
  );
}

function UnsupportedCard({ t }: { t: (k: string) => string }) {
  return (
    <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-[var(--s-5)]">
      <p className="text-fs-sm text-[var(--fg-muted)]">
        {t('pushUnsupported')
          || "Ce navigateur ne prend pas en charge les notifications push. Essayez Chrome, Edge, Firefox, ou Safari sur iOS 16.4+ après avoir ajouté l'application à l'écran d'accueil."}
      </p>
    </div>
  );
}

// ─── Per-event preference toggles ───────────────────────────────────────────

interface EventDef {
  key: ExposedPrefKey;
  icon: React.ComponentType<{ className?: string }>;
  titleKey: string;
  titleFallback: string;
  descKey: string;
  descFallback: string;
}

// Order matters — most actionable / highest-frequency first.
const EVENTS: EventDef[] = [
  {
    key: 'new_order_enabled',
    icon: ShoppingCart,
    titleKey: 'prefNewOrderTitle',
    titleFallback: 'Nouvelle commande',
    descKey: 'prefNewOrderDesc',
    descFallback: 'Une notification dès qu’une commande payée arrive.',
  },
  {
    key: 'order_canceled_enabled',
    icon: XCircle,
    titleKey: 'prefOrderCanceledTitle',
    titleFallback: 'Commande annulée',
    descKey: 'prefOrderCanceledDesc',
    descFallback: 'Quand une commande déjà acceptée est annulée ou rejetée.',
  },
  {
    key: 'payment_failure_enabled',
    icon: CreditCard,
    titleKey: 'prefPaymentFailureTitle',
    titleFallback: 'Échec de paiement',
    descKey: 'prefPaymentFailureDesc',
    descFallback: 'Quand le débit d’un client échoue après confirmation.',
  },
];

function EventPreferences({
  prefs,
  saving,
  onToggle,
  t,
}: {
  prefs: NotificationPreferences;
  saving: ExposedPrefKey | null;
  onToggle: (key: ExposedPrefKey, next: boolean) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-[var(--s-5)]">
      <h3 className="text-fs-sm font-semibold uppercase tracking-[0.06em] text-[var(--fg-muted)] mb-[var(--s-4)]">
        {t('prefEventsHeading') || 'Que voulez-vous recevoir ?'}
      </h3>
      <ul className="flex flex-col gap-[var(--s-3)]">
        {EVENTS.map((ev) => {
          const Icon = ev.icon;
          const enabled = prefs[ev.key];
          const title = i18nOr(t, ev.titleKey, ev.titleFallback);
          const desc = i18nOr(t, ev.descKey, ev.descFallback);
          return (
            <li key={ev.key} className="flex items-start gap-[var(--s-3)]">
              <div
                className="w-9 h-9 shrink-0 rounded-r-md grid place-items-center bg-[var(--surface-2)]"
                aria-hidden
              >
                <Icon className="w-4 h-4 text-[var(--fg-muted)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-fs-md font-medium text-[var(--fg)]">{title}</p>
                <p className="text-fs-xs text-[var(--fg-muted)] mt-0.5 leading-snug">{desc}</p>
              </div>
              <PreferenceSwitch
                checked={enabled}
                disabled={saving === ev.key}
                onChange={(next) => onToggle(ev.key, next)}
                ariaLabel={title}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** t() returns the key on miss — `i18nOr` falls back to the supplied default
 *  string in that case so French copy stays readable while translations
 *  trickle in. */
function i18nOr(t: (k: string) => string, key: string, fallback: string): string {
  const v = t(key);
  return v && v !== key ? v : fallback;
}

/** Minimal ARIA-compliant toggle switch — the design system doesn't ship one
 *  so we inline a small implementation here. Brand-colored when checked, neutral
 *  when off, dimmed while a save round-trip is in flight. */
function PreferenceSwitch({
  checked,
  disabled,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-fast ${
        checked ? 'bg-[var(--brand-500)]' : 'bg-[var(--surface-2)] border border-[var(--line)]'
      } ${disabled ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-fast ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
