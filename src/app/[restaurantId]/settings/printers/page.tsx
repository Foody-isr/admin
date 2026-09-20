'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Clock3,
  History,
  ListX,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wifi,
  XCircle,
} from 'lucide-react';
import {
  cancelPendingPrintJobs,
  cancelPrintJob,
  deletePrinterConfiguration,
  getPrinterConfiguration,
  getPrintingOverview,
  reprintOrder,
  savePrinterConfiguration,
  testPrinterConfiguration,
  type PrintJob,
  type PrintPrinter,
  type PrintingOverview,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, PageHead, Section, Select } from '@/components/ds';

type PrinterProfile = PrintPrinter['profile'];
type QueueAction = { kind: 'job'; job: PrintJob } | { kind: 'printer' };

const MODELS: Record<PrinterProfile, string> = {
  tm_u220iib: 'Epson TM-U220IIB',
  tm_m30iii: 'Epson TM-m30III',
};

const EMPTY_OVERVIEW: PrintingOverview = {
  printers: [],
  stations: [],
  routing_rules: [],
  jobs: [],
  summary: { queued: 0, claimed: 0, printed: 0, failed: 0, uncertain: 0, cancelled: 0 },
};

export default function PrintersSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { locale, t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('printers.manage');

  const [printer, setPrinter] = useState<PrintPrinter | null>(null);
  const [overview, setOverview] = useState<PrintingOverview>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<PrinterProfile>('tm_u220iib');
  const [host, setHost] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activityBusy, setActivityBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [queueAction, setQueueAction] = useState<QueueAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activityNotice, setActivityNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  const loadConfiguration = useCallback(async () => {
    if (!rid) return;
    setLoading(true);
    setError(null);
    try {
      setPrinter(await getPrinterConfiguration(rid));
    } catch {
      setError(t('printerLoadError'));
    } finally {
      setLoading(false);
    }
  }, [rid, t]);

  const loadActivity = useCallback(async (quiet = false) => {
    if (!rid) return;
    if (!quiet) setActivityLoading(true);
    try {
      setOverview(await getPrintingOverview(rid));
      setActivityError(null);
    } catch {
      setActivityError(t('printerActivityLoadError'));
    } finally {
      if (!quiet) setActivityLoading(false);
    }
  }, [rid, t]);

  useEffect(() => {
    void loadConfiguration();
    void loadActivity();
    const timer = window.setInterval(() => void loadActivity(true), 5000);
    return () => window.clearInterval(timer);
  }, [loadActivity, loadConfiguration]);

  const monitoredPrinter = useMemo(
    () => overview.printers.find((candidate) => candidate.id === printer?.id) ?? printer,
    [overview.printers, printer],
  );

  const jobs = useMemo(
    () => overview.jobs.filter((job) => !printer || job.current_printer_id === printer.id),
    [overview.jobs, printer],
  );

  const recentCounts = useMemo(() => jobs.reduce((counts, job) => {
    if (job.state === 'queued' || job.state === 'claimed') counts.pending += 1;
    if (job.state === 'printed') counts.printed += 1;
    if (job.state === 'failed' || job.state === 'uncertain') counts.attention += 1;
    return counts;
  }, { pending: 0, printed: 0, attention: 0 }), [jobs]);

  const pendingCount = monitoredPrinter?.pending_job_count ?? recentCounts.pending;

  const startEditing = () => {
    setProfile(printer?.profile ?? 'tm_u220iib');
    setHost(printer?.host ?? '');
    setNotice(null);
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    const normalizedHost = host.trim();
    if (!normalizedHost || normalizedHost.includes('://') || /[\s/:?#@\\]/.test(normalizedHost)) {
      setError(t('printerAddressError'));
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await savePrinterConfiguration(rid, {
        profile,
        host: normalizedHost,
        port: 80,
        use_https: false,
        device_id: 'local_printer',
        compatibility_port: 9100,
        enabled: true,
      });
      setPrinter(next);
      setEditing(false);
      setNotice(t('printerSaved'));
      await loadActivity(true);
    } catch {
      setError(t('printerSaveError'));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      await testPrinterConfiguration(rid, locale);
      setNotice(t('printerTestQueued'));
      await loadActivity(true);
    } catch {
      setError(t('printerTestError'));
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deletePrinterConfiguration(rid);
      setPrinter(null);
      setOverview(EMPTY_OVERVIEW);
      setEditing(false);
      setConfirmDelete(false);
      setNotice(null);
    } catch {
      setError(t('printerDeleteError'));
    } finally {
      setDeleting(false);
    }
  };

  const confirmQueueAction = async () => {
    const action = queueAction;
    if (!action || !printer) return;
    setQueueAction(null);
    setActivityBusy(action.kind === 'job' ? action.job.id : 'queue');
    setActivityError(null);
    setActivityNotice(null);
    try {
      if (action.kind === 'job') {
        await cancelPrintJob(rid, action.job.id, t('printingCancelledByOperator'));
      } else {
        await cancelPendingPrintJobs(rid, printer.id, t('printingQueueClearedByOperator'));
      }
      setActivityNotice(t('printerQueueActionDone'));
      await loadActivity(true);
    } catch {
      setActivityError(t('printerActivityActionError'));
    } finally {
      setActivityBusy(null);
    }
  };

  const reprint = async (job: PrintJob) => {
    if (!job.order_id) return;
    setActivityBusy(job.id);
    setActivityError(null);
    setActivityNotice(null);
    try {
      await reprintOrder(rid, job.order_id);
      setActivityNotice(t('printerReprintQueued'));
      await loadActivity(true);
    } catch {
      setActivityError(t('printerActivityActionError'));
    } finally {
      setActivityBusy(null);
    }
  };

  const status = useMemo(() => {
    switch (monitoredPrinter?.status) {
      case 'online':
        return { label: t('printerOnline'), tone: 'success' as const };
      case 'offline':
        return { label: t('printerOffline'), tone: 'warning' as const };
      case 'error':
        return { label: t('printerError'), tone: 'danger' as const };
      default:
        return { label: t('printerWaiting'), tone: 'neutral' as const };
    }
  }, [monitoredPrinter?.status, t]);

  const lastSeen = monitoredPrinter?.last_seen_at
    ? formatDate(monitoredPrinter.last_seen_at, locale)
    : null;

  return (
    <div className="max-w-[960px]">
      <PageHead
        title={t('printers')}
        desc={t('printerPageDesc')}
        actions={canEdit && printer && !editing ? (
          <Button variant="secondary" size="md" onClick={startEditing}>
            <Pencil />
            {t('edit')}
          </Button>
        ) : undefined}
      />

      {loading ? (
        <Section>
          <div className="flex items-center justify-center gap-[var(--s-2)] py-[var(--s-12)] text-fs-sm text-[var(--fg-muted)]">
            <RefreshCw className="h-4 w-4 animate-spin" />
            {t('loading')}
          </div>
        </Section>
      ) : error && !printer && !editing ? (
        <Section>
          <EmptyState
            icon={<CircleAlert />}
            title={error}
            action={<Button variant="secondary" size="md" onClick={() => void loadConfiguration()}><RefreshCw />{t('retry')}</Button>}
          />
        </Section>
      ) : !printer && !editing ? (
        <Section>
          <EmptyState
            icon={<Printer />}
            title={t('printerEmptyTitle')}
            desc={t('printerEmptyDesc')}
            action={canEdit ? <Button variant="primary" size="md" onClick={startEditing}><Plus />{t('addPrinter')}</Button> : undefined}
          />
        </Section>
      ) : editing ? (
        <Section title={printer ? t('printerEditTitle') : t('addPrinter')} desc={t('printerFormDesc')}>
          <div className="max-w-[480px] space-y-[var(--s-4)]">
            <Field label={t('printerModel')} grow>
              <Select value={profile} onChange={(event) => setProfile(event.target.value as PrinterProfile)}>
                {Object.entries(MODELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label={t('printerAddress')} hint={t('printerAddressHint')} grow>
              <Input
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder="192.168.1.48"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            {error && <Feedback tone="danger" text={error} />}
            <div className="flex flex-wrap gap-[var(--s-2)] pt-[var(--s-2)]">
              <Button variant="primary" size="md" onClick={() => void save()} disabled={saving}>
                {saving ? t('saving') : t('saveChanges')}
              </Button>
              <Button variant="secondary" size="md" onClick={() => setEditing(false)} disabled={saving}>{t('cancel')}</Button>
            </div>
          </div>
        </Section>
      ) : printer ? (
        <Section>
          <div className="flex flex-col gap-[var(--s-5)]">
            <div className="flex flex-col gap-[var(--s-4)] sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-[var(--s-3)]">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-r-md bg-[var(--surface-2)] text-[var(--fg-muted)]">
                  <Printer className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-fs-md font-semibold text-[var(--fg)]">{t('printerMain')}</div>
                  <div className="mt-1 text-fs-sm text-[var(--fg-muted)]">{MODELS[printer.profile] ?? printer.model}</div>
                  <div className="mt-1 font-mono text-fs-xs text-[var(--fg-subtle)]">{printer.host}</div>
                </div>
              </div>
              <Badge tone={status.tone} dot>{status.label}</Badge>
            </div>

            <div className="rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] px-[var(--s-4)] py-[var(--s-3)]">
              <div className="flex items-start gap-[var(--s-3)]">
                <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-[var(--fg-muted)]" />
                <div>
                  <div className="text-fs-sm font-medium text-[var(--fg)]">{t('printerConnectionTitle')}</div>
                  <div className="mt-1 text-fs-xs leading-relaxed text-[var(--fg-subtle)]">
                    {lastSeen ? `${t('printerLastSeen')} ${lastSeen}` : t('printerConnectionWaiting')}
                  </div>
                  {monitoredPrinter?.last_error && <div className="mt-2 text-fs-xs text-[var(--danger-500)]">{monitoredPrinter.last_error}</div>}
                </div>
              </div>
            </div>

            {notice && <Feedback tone="success" text={notice} />}
            {error && <Feedback tone="danger" text={error} />}

            {canEdit && (
              <div className="flex flex-wrap items-center gap-[var(--s-2)] border-t border-[var(--line)] pt-[var(--s-4)]">
                <Button variant="primary" size="md" onClick={() => void test()} disabled={testing}>
                  <ReceiptText />
                  {testing ? t('printerTestSending') : t('printerTestTicket')}
                </Button>
                <Button variant="ghost" size="md" onClick={() => setConfirmDelete(true)}><Trash2 />{t('remove')}</Button>
              </div>
            )}
          </div>
        </Section>
      ) : null}

      {printer && !editing && (
        <Section
          className="mt-[var(--s-5)]"
          title={t('printingRecentJobs')}
          desc={t('printerActivityDesc')}
          aside={(
            <div className="flex flex-wrap gap-[var(--s-2)]">
              <Button variant="ghost" size="sm" onClick={() => void loadActivity()} disabled={activityLoading}>
                <RefreshCw className={activityLoading ? 'animate-spin' : ''} />
                {t('refresh')}
              </Button>
              {canEdit && pendingCount > 0 && (
                <Button variant="danger" size="sm" onClick={() => setQueueAction({ kind: 'printer' })} disabled={activityBusy !== null}>
                  <ListX />
                  {t('printingClearQueue')}
                </Button>
              )}
            </div>
          )}
        >
          <div className="overflow-hidden rounded-r-md border border-[var(--line)] bg-[var(--surface-2)]">
            <div className="grid divide-y divide-[var(--line)] sm:grid-cols-3 sm:divide-x sm:divide-y-0 rtl:sm:divide-x-reverse">
              <ActivityMetric icon={<Clock3 />} value={pendingCount} label={t('printerActivityPending')} tone="warning" />
              <ActivityMetric icon={<CheckCircle2 />} value={recentCounts.printed} label={t('printerActivityPrinted')} tone="success" />
              <ActivityMetric icon={<AlertTriangle />} value={recentCounts.attention} label={t('printerActivityAttention')} tone="danger" />
            </div>
          </div>

          {activityNotice && <div className="mt-[var(--s-4)]"><Feedback tone="success" text={activityNotice} /></div>}
          {activityError && <div className="mt-[var(--s-4)]"><Feedback tone="danger" text={activityError} /></div>}

          {activityLoading && jobs.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-[var(--s-10)] text-fs-sm text-[var(--fg-muted)]">
              <RefreshCw className="h-4 w-4 animate-spin" />
              {t('loading')}
            </div>
          ) : jobs.length === 0 ? (
            <div className="py-[var(--s-8)]">
              <EmptyState icon={<History />} title={t('printingNoJobs')} />
            </div>
          ) : (
            <div className="mt-[var(--s-5)] divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {jobs.map((job) => {
                const station = overview.stations.find((candidate) => candidate.id === job.station_id);
                const pending = job.state === 'queued' || job.state === 'claimed';
                const kitchenTicket = job.kind === 'kitchen_ticket' || job.kind === 'production';
                const busy = activityBusy === job.id;
                return (
                  <div key={job.id} className="grid gap-[var(--s-3)] py-[var(--s-4)] md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-fs-sm font-semibold text-[var(--fg)]">
                          {job.order_id
                            ? t('orderNumber').replace('{id}', String(job.order_id))
                            : job.kind === 'test'
                              ? t('printerTestTicket')
                              : t('printingJobs')}
                        </span>
                        {station && <Badge tone="neutral">{station.name}</Badge>}
                        <Badge tone={jobTone(job.state)} dot>{t(`printingJob_${job.state}`)}</Badge>
                      </div>
                      <div className="mt-1 text-fs-xs text-[var(--fg-subtle)]">
                        {formatDate(job.created_at, locale)}
                        {job.attempts > 1 ? ` · ${job.attempts} ${t('printingAttempts')}` : ''}
                      </div>
                      {job.last_error && (
                        <div className={`mt-2 text-fs-xs leading-relaxed ${job.state === 'cancelled' ? 'text-[var(--fg-muted)]' : 'text-[var(--danger-500)] dark:text-[#fb7185]'}`}>
                          {job.last_error}
                        </div>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        {pending && (
                          <Button
                            variant={job.state === 'claimed' ? 'danger' : 'ghost'}
                            size="sm"
                            disabled={busy || activityBusy !== null}
                            onClick={() => setQueueAction({ kind: 'job', job })}
                          >
                            <XCircle />
                            {job.state === 'claimed' ? t('printerUnblockPrinter') : t('printingCancelJob')}
                          </Button>
                        )}
                        {kitchenTicket && job.order_id && !pending && (
                          <Button variant="secondary" size="sm" disabled={busy || activityBusy !== null} onClick={() => void reprint(job)}>
                            <RotateCcw />
                            {t('printingReprint')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('printerDeleteTitle')}
        description={t('printerDeleteConfirm')}
        confirmLabel={deleting ? t('saving') : t('remove')}
        cancelLabel={t('cancel')}
        danger
        onConfirm={() => void remove()}
      />

      <ConfirmDialog
        open={queueAction !== null}
        onOpenChange={(open) => { if (!open) setQueueAction(null); }}
        title={queueAction?.kind === 'printer' ? t('printingClearQueueTitle') : t('printingCancelJobTitle')}
        description={queueAction?.kind === 'printer'
          ? t('printingClearQueueWarning')
          : queueAction?.job.state === 'claimed'
            ? t('printingCancelClaimedWarning')
            : t('printingCancelQueuedWarning')}
        confirmLabel={queueAction?.kind === 'printer'
          ? t('printingClearQueue')
          : queueAction?.job.state === 'claimed'
            ? t('printerUnblockPrinter')
            : t('printingCancelJob')}
        cancelLabel={t('cancel')}
        danger
        onConfirm={() => void confirmQueueAction()}
      />
    </div>
  );
}

function ActivityMetric({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone: 'success' | 'warning' | 'danger';
}) {
  const toneClass = tone === 'success'
    ? 'text-[var(--success-500)]'
    : tone === 'warning'
      ? 'text-[var(--warning-500)]'
      : 'text-[var(--danger-500)]';
  return (
    <div className="flex min-w-0 items-center gap-2 px-[var(--s-3)] py-[var(--s-4)] sm:px-[var(--s-5)]">
      <span className={`hidden h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--surface-1)] sm:grid [&>svg]:h-4 [&>svg]:w-4 ${toneClass}`}>{icon}</span>
      <div className="min-w-0">
        <div className={`text-fs-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
        <div className="truncate text-fs-xs text-[var(--fg-muted)]">{label}</div>
      </div>
    </div>
  );
}

function jobTone(state: PrintJob['state']): 'success' | 'danger' | 'warning' | 'neutral' {
  if (state === 'printed') return 'success';
  if (state === 'failed') return 'danger';
  if (state === 'claimed' || state === 'uncertain') return 'warning';
  return 'neutral';
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function Feedback({ tone, text }: { tone: 'success' | 'danger'; text: string }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={tone === 'success'
        ? 'flex items-start gap-2 rounded-r-md bg-[var(--success-50)] px-3 py-2 text-fs-xs text-[var(--success-500)]'
        : 'flex items-start gap-2 rounded-r-md bg-[var(--danger-50)] px-3 py-2 text-fs-xs text-[var(--danger-500)]'}
    >
      <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
