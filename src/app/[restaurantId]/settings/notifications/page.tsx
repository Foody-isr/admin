'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Bell, BellOff, Smartphone, AlertTriangle } from 'lucide-react';
import { Badge, Button, PageHead } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import {
  getCurrentSubscription,
  getEnvironment,
  sendTestPush,
  subscribe,
  unsubscribe,
  type PushEnvironment,
} from '@/lib/push';

type Status = 'idle' | 'subscribing' | 'unsubscribing' | 'testing';

export default function NotificationsSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [env, setEnv] = useState<PushEnvironment | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setEnv(getEnvironment());
    const existing = await getCurrentSubscription();
    setSubscribed(Boolean(existing));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
