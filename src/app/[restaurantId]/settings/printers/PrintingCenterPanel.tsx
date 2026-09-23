'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle, Check, CircleDot, Clock3, Printer, RefreshCw, Route,
  Server, TestTube2, WifiOff, XCircle,
} from 'lucide-react';
import {
  cancelPendingPrintJobs, cancelPrintJob, testPrinter,
  type PrintingCenterIssue, type PrintingCenterSnapshot, type PrintingCenterStatus,
} from '@/lib/api';
import {
  Badge, Button, EmptyState, Section, Table, TableShell, Tbody, Td, Th, Thead, Tr,
} from '@/components/ds';

type T = (key: string) => string;
export type PrintingCenterTab = 'overview' | 'printers' | 'profiles' | 'queue';

interface Props {
  restaurantId: number;
  center: PrintingCenterSnapshot;
  tab: Exclude<PrintingCenterTab, 'profiles'>;
  canEdit: boolean;
  locale: string;
  t: T;
  onNavigate: (tab: PrintingCenterTab) => void;
  onRefresh: () => Promise<void>;
}

const stageIcons = {
  configuration: Printer,
  routing: Route,
  agent: Server,
  delivery: Check,
};

export default function PrintingCenterPanel(props: Props) {
  if (props.tab === 'printers') return <PrintersView {...props} />;
  if (props.tab === 'queue') return <QueueView {...props} />;
  return <OverviewView {...props} />;
}

function OverviewView({ center, locale, t, onNavigate }: Props) {
  return <div className="space-y-5">
    <section className="overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
        <div>
          <div className="flex items-center gap-2"><HealthBadge status={center.health} t={t} /><span className="text-fs-xs text-[var(--fg-subtle)]">{t('printingCenterEvidence')} {formatDate(center.generated_at, locale)}</span></div>
          <h2 className="mt-2 text-fs-lg font-semibold">{t('printingCenterPipelineTitle')}</h2>
          <p className="mt-1 text-fs-sm text-[var(--fg-muted)]">{t('printingCenterPipelineDesc')}</p>
        </div>
        <div className="flex gap-5 text-fs-xs tabular-nums">
          <Metric value={center.summary.queued + center.summary.claimed} label={t('printingCenterPending')} />
          <Metric value={center.summary.printed_24h} label={t('printingCenterPrinted24h')} />
          <Metric value={center.summary.failed_24h + center.summary.uncertain_24h} label={t('printingCenterAttention24h')} danger />
        </div>
      </div>
      <div className="grid md:grid-cols-4">
        {center.stages.map((stage, index) => {
          const Icon = stageIcons[stage.key];
          return <div key={stage.key} className="relative border-b border-[var(--line)] px-5 py-5 last:border-b-0 md:border-b-0 md:border-e md:last:border-e-0">
            <div className="flex items-center justify-between gap-2"><span className={`grid h-9 w-9 place-items-center rounded-full ${statusSurface(stage.status)}`}><Icon className="h-4 w-4" /></span><HealthIcon status={stage.status} /></div>
            <div className="mt-4 text-fs-sm font-semibold">{t(`printingCenterStage_${stage.key}`)}</div>
            <div className="mt-1 text-fs-xs text-[var(--fg-muted)]">{stage.issue_count ? `${stage.issue_count} ${t('printingCenterIssues')}` : t('printingCenterStageReady')}</div>
            <div className="mt-1 text-fs-xs text-[var(--fg-subtle)]">{stage.evidence_at ? formatDate(stage.evidence_at, locale) : t('printingCenterNoEvidence')}</div>
            {index < center.stages.length - 1 && <span className="absolute end-[-5px] top-9 z-10 hidden h-2 w-2 rotate-45 border-e border-t border-[var(--line)] bg-[var(--surface)] md:block" />}
          </div>;
        })}
      </div>
    </section>

    {center.issues.length > 0 ? <Section title={t('printingCenterRepairTitle')}>
      <div className="divide-y divide-[var(--line)]">
        {center.issues.map((issue, index) => <IssueRow key={`${issue.code}-${issue.printer_id ?? issue.spooler_id ?? index}`} issue={issue} t={t} onNavigate={onNavigate} />)}
      </div>
    </Section> : <Section><div className="flex items-center gap-3 py-2"><span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--success-50)] text-[var(--success-500)]"><Check className="h-4 w-4" /></span><div><div className="text-fs-sm font-semibold">{t('printingCenterHealthyTitle')}</div><div className="text-fs-xs text-[var(--fg-muted)]">{t('printingCenterHealthyDesc')}</div></div></div></Section>}

    <div className="grid gap-4 md:grid-cols-2">
      <Section title={t('printingCenterFleet')}>
        <button type="button" className="flex w-full items-center justify-between text-start" onClick={() => onNavigate('printers')}><span className="text-fs-sm text-[var(--fg-muted)]">{center.printers.length} {t('printers')} · {center.agents.filter((agent) => agent.health === 'ready').length}/{center.agents.length} {t('printingCenterAgentsOnline')}</span><span className="text-fs-sm font-semibold text-[var(--brand-500)]">{t('view')}</span></button>
      </Section>
      <Section title={t('printerProfilesTitle')}>
        <button type="button" className="flex w-full items-center justify-between text-start" onClick={() => onNavigate('profiles')}><span className="text-fs-sm text-[var(--fg-muted)]">{center.profiles.length} {t('printingCenterProfilesActive')}</span><span className="text-fs-sm font-semibold text-[var(--brand-500)]">{t('manage')}</span></button>
      </Section>
    </div>
  </div>;
}

function PrintersView({ restaurantId, center, canEdit, locale, t, onRefresh }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const act = async (id: string, action: () => Promise<unknown>, success: string) => {
    setBusy(id); setMessage(null);
    try { await action(); setMessage(success); await onRefresh(); }
    catch { setMessage(t('printerActivityActionError')); }
    finally { setBusy(null); }
  };
  if (center.printers.length === 0) return <Section><EmptyState icon={<Printer />} title={t('printerProfileNoDiscoveredPrinters')} desc={t('deviceManagementEmptyDesc')} /></Section>;
  return <div className="space-y-4">
    {message && <div role="status" className="rounded-r-md bg-[var(--surface-2)] px-4 py-3 text-fs-xs">{message}</div>}
    <TableShell className="overflow-x-auto"><Table className="min-w-[980px]"><Thead><Tr><Th>{t('printers')}</Th><Th>{t('status')}</Th><Th>{t('printerProfilesTitle')}</Th><Th>{t('printingCenterAgent')}</Th><Th>{t('printingCenterLastPrint')}</Th><Th>{t('printingCenterQueue')}</Th><Th className="w-[240px]">{t('actions')}</Th></Tr></Thead><Tbody>
      {center.printers.map((printer) => <Tr key={printer.id}><Td><div className="font-semibold">{printer.name}</div><div className="mt-1 text-fs-xs text-[var(--fg-muted)]">{printer.model} · {printer.host}</div></Td><Td><HealthBadge status={printer.health} t={t} /></Td><Td>{printer.profile_names.length ? printer.profile_names.join(', ') : <span className="text-[var(--fg-subtle)]">{t('printerProfileNoPrinter')}</span>}</Td><Td><div>{printer.agent_names.join(', ') || t('printingCenterNoAgent')}</div><div className="mt-1 text-fs-xs text-[var(--fg-subtle)]">{printer.last_observed_at ? formatDate(printer.last_observed_at, locale) : t('printingCenterNoEvidence')}</div></Td><Td>{printer.last_printed_at ? formatDate(printer.last_printed_at, locale) : t('printingCenterNever')}</Td><Td className="tabular-nums">{printer.pending_job_count ?? 0}</Td><Td><div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" disabled={!canEdit || busy === printer.id} onClick={() => void act(printer.id, () => testPrinter(restaurantId, printer.id, locale), t('printingCenterTestQueued'))}><TestTube2 />{t('printingCenterSpoolerTest')}</Button>{(printer.pending_job_count ?? 0) > 0 && <Button variant="ghost" size="sm" disabled={!canEdit || busy === printer.id} onClick={() => void act(printer.id, () => cancelPendingPrintJobs(restaurantId, printer.id, 'Printing Center operator'), t('printerQueueActionDone'))}><XCircle />{t('printingClearQueue')}</Button>}</div></Td></Tr>)}
    </Tbody></Table></TableShell>
    <p className="text-fs-xs text-[var(--fg-subtle)]">{t('printingCenterLocalTestHint')}</p>
  </div>;
}

function QueueView({ restaurantId, center, canEdit, locale, t, onRefresh }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const printerNames = useMemo(() => new Map(center.printers.map((printer) => [printer.id, printer.name])), [center.printers]);
  if (center.jobs.length === 0) return <Section><EmptyState icon={<Clock3 />} title={t('printingNoJobs')} desc={t('printingRecentJobsHint')} /></Section>;
  const cancel = async (jobId: string) => {
    setBusy(jobId); setMessage(null);
    try { await cancelPrintJob(restaurantId, jobId, 'Printing Center operator'); await onRefresh(); }
    catch { setMessage(t('printerActivityActionError')); }
    finally { setBusy(null); }
  };
  return <div className="space-y-4">
    {message && <div role="alert" className="rounded-r-md bg-[var(--danger-50)] px-4 py-3 text-fs-xs text-[var(--danger-500)]">{message}</div>}
    <TableShell className="overflow-x-auto"><Table className="min-w-[900px]"><Thead><Tr><Th>{t('time')}</Th><Th>{t('printingCenterJob')}</Th><Th>{t('printers')}</Th><Th>{t('status')}</Th><Th>{t('printingAttempts')}</Th><Th>{t('actions')}</Th></Tr></Thead><Tbody>{center.jobs.map((job) => <Tr key={job.id}><Td className="whitespace-nowrap">{formatDate(job.created_at, locale)}</Td><Td><div className="font-medium">{t(`printingCenterKind_${job.kind}`)}</div>{job.order_id && <div className="text-fs-xs text-[var(--fg-muted)]">#{job.order_id}</div>}</Td><Td>{printerNames.get(job.current_printer_id) ?? t('printingCenterUnknownPrinter')}</Td><Td><JobBadge state={job.state} t={t} />{job.last_error && <div className="mt-1 max-w-[280px] text-fs-xs text-[var(--danger-500)]">{job.last_error}</div>}</Td><Td className="tabular-nums">{job.attempts}</Td><Td>{canEdit && (job.state === 'queued' || job.state === 'claimed') && <Button variant="ghost" size="sm" disabled={busy === job.id} onClick={() => void cancel(job.id)}>{t('printingCancelJob')}</Button>}</Td></Tr>)}</Tbody></Table></TableShell>
  </div>;
}

function IssueRow({ issue, t, onNavigate }: { issue: PrintingCenterIssue; t: T; onNavigate: (tab: PrintingCenterTab) => void }) {
  const target: PrintingCenterTab = issue.action === 'assign_profile' || issue.action === 'create_profile' ? 'profiles' : issue.action === 'inspect_queue' ? 'queue' : 'printers';
  return <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${statusSurface(issue.severity)}`}>{issue.severity === 'blocked' ? <WifiOff className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><div className="text-fs-sm font-semibold">{t(`printingCenterIssue_${issue.code}`)}{(issue.count ?? 0) > 1 ? ` · ${issue.count}` : ''}</div><div className="mt-1 text-fs-xs text-[var(--fg-muted)]">{t(`printingCenterAction_${issue.action}`)}</div></div><Button variant="secondary" size="sm" onClick={() => onNavigate(target)}>{t('printingCenterRepair')}</Button></div>;
}

function HealthBadge({ status, t }: { status: PrintingCenterStatus; t: T }) { return <Badge dot tone={status === 'ready' ? 'success' : status === 'attention' ? 'warning' : 'danger'}>{t(`printingCenterStatus_${status}`)}</Badge>; }
function HealthIcon({ status }: { status: PrintingCenterStatus }) { return status === 'ready' ? <Check className="h-4 w-4 text-[var(--success-500)]" /> : status === 'attention' ? <AlertTriangle className="h-4 w-4 text-[var(--warning-500)]" /> : <XCircle className="h-4 w-4 text-[var(--danger-500)]" />; }
function JobBadge({ state, t }: { state: string; t: T }) { const tone = state === 'printed' ? 'success' : state === 'failed' || state === 'uncertain' ? 'danger' : state === 'cancelled' ? 'neutral' : 'warning'; return <Badge tone={tone}>{t(`printingJob_${state}`)}</Badge>; }
function Metric({ value, label, danger }: { value: number; label: string; danger?: boolean }) { return <div><div className={`text-fs-xl font-semibold ${danger && value ? 'text-[var(--danger-500)]' : ''}`}>{value}</div><div className="text-[var(--fg-muted)]">{label}</div></div>; }
function statusSurface(status: PrintingCenterStatus) { return status === 'ready' ? 'bg-[var(--success-50)] text-[var(--success-500)]' : status === 'attention' ? 'bg-[var(--warning-50)] text-[var(--warning-500)]' : 'bg-[var(--danger-50)] text-[var(--danger-500)]'; }
function formatDate(value: string, locale: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(date); }
