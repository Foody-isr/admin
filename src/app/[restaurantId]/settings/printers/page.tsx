'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { CircleAlert, Pencil, Plus, Printer, ReceiptText, RefreshCw, Trash2, Wifi } from 'lucide-react';
import {
  deletePrinterConfiguration,
  getPrinterConfiguration,
  savePrinterConfiguration,
  testPrinterConfiguration,
  type PrintPrinter,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, PageHead, Section, Select } from '@/components/ds';

type PrinterProfile = PrintPrinter['profile'];

const MODELS: Record<PrinterProfile, string> = {
  tm_u220iib: 'Epson TM-U220IIB',
  tm_m30iii: 'Epson TM-m30III',
};

export default function PrintersSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { locale, t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('printers.manage');

  const [printer, setPrinter] = useState<PrintPrinter | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<PrinterProfile>('tm_u220iib');
  const [host, setHost] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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

  useEffect(() => {
    void load();
  }, [load]);

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
      setEditing(false);
      setConfirmDelete(false);
      setNotice(null);
    } catch {
      setError(t('printerDeleteError'));
    } finally {
      setDeleting(false);
    }
  };

  const status = useMemo(() => {
    switch (printer?.status) {
      case 'online':
        return { label: t('printerOnline'), tone: 'success' as const };
      case 'offline':
        return { label: t('printerOffline'), tone: 'warning' as const };
      case 'error':
        return { label: t('printerError'), tone: 'danger' as const };
      default:
        return { label: t('printerWaiting'), tone: 'neutral' as const };
    }
  }, [printer?.status, t]);

  const lastSeen = printer?.last_seen_at
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(printer.last_seen_at))
    : null;

  return (
    <div className="max-w-[760px]">
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
            action={<Button variant="secondary" size="md" onClick={() => void load()}><RefreshCw />{t('retry')}</Button>}
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
                  {printer.last_error && <div className="mt-2 text-fs-xs text-[var(--danger-500)]">{printer.last_error}</div>}
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
    </div>
  );
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
