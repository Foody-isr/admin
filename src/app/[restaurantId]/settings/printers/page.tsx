'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, Check, ClipboardList, ListX, Pencil, Plus, Printer, ReceiptText, RefreshCw, Route, Send, Trash2, XCircle } from 'lucide-react';
import {
  API_URL,
  cancelPendingPrintJobs, cancelPrintJob,
  deletePrinter, deletePrintStation, getAllCategories, getPrintingOverview, getRestaurant,
  getRestaurantSettings, listAllItems, registerPrinter, replacePrintRoutingRules,
  reprintOrder, savePrintStation, testPrinter, updatePrinter, updateRestaurantSettings,
  type MenuCategory, type MenuItem, type PrintJob, type PrintPrinter, type PrintRoutingRule,
  type PrintStation, type PrinterRegistration,
  type PrinterProtocol, type PrinterVendor, type PrintingOverview, type RestaurantSettings, type TranslationMap,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { isPrintingConfigurationReady } from '@/lib/printing-routing';
import {
  Badge, Button, ConfirmDialog, Drawer, EmptyState, Field, Input, NumberField, PageHead,
  Section, Select, Tab, Tabs, TabsContent, TabsList,
} from '@/components/ds';
import { LocaleEditingBanner } from '@/components/i18n/LocaleEditingBanner';
import { LocaleTabs, type Locale } from '@/components/i18n/LocaleTabs';

const SUPPORTED_LOCALES: Locale[] = ['en', 'he', 'fr'];
const RECEIPT_ORDER_TYPES = ['dine_in', 'pickup', 'delivery'] as const;

const EMPTY_OVERVIEW: PrintingOverview = { printers: [], stations: [], routing_rules: [], jobs: [], summary: { queued: 0, claimed: 0, printed: 0, failed: 0, uncertain: 0, cancelled: 0 } };

type QueueAction =
  | { kind: 'job'; job: PrintJob }
  | { kind: 'printer'; printer: PrintPrinter; count: number };

const newStation = (): Omit<PrintStation, 'id' | 'restaurant_id'> => ({
  name: '',
  translations: {},
  primary_printer_id: undefined,
  fallback_printer_id: undefined,
  receives_full_order: false,
  show_table: true,
  show_order_type: true,
  ticket_split_mode: 'grouped',
  copies: 1,
  cut_mode: 'full',
  buzzer: false,
  font_size: 28,
  locale: 'he',
  enabled: true,
});

const newPrinter = () => ({
  connection: 'lan' as 'lan' | 'cloud', name: '', vendor: 'epson' as PrinterVendor,
  identifier: `foody_lan_${Date.now()}`, epson_polling_id: '', gateway_printer_id: '',
  protocol: 'spooler' as PrinterProtocol, model: 'Epson TM-m30III', profile: 'tm_m30iii' as PrintPrinter['profile'],
  host: '', port: 80, compatibility_port: 9100, receives_receipts: true,
  receipt_order_types: [] as PrintPrinter['receipt_order_types'], receipt_copies: 1,
  paper_width_dots: 576 as 384 | 576,
  expected_poll_seconds: 2, station_id: '', new_station_name: '',
});

function statusTone(status: PrintPrinter['status']): 'success' | 'danger' | 'warning' | 'neutral' {
  if (status === 'online') return 'success';
  if (status === 'error') return 'danger';
  if (status === 'offline') return 'warning';
  return 'neutral';
}

function formatSeen(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function jobTone(state: PrintJob['state']): 'success' | 'danger' | 'warning' | 'neutral' {
  if (state === 'printed') return 'success';
  if (state === 'failed') return 'danger';
  if (state === 'claimed' || state === 'uncertain') return 'warning';
  return 'neutral';
}

function isLocale(value?: string): value is Locale {
  return value === 'en' || value === 'he' || value === 'fr';
}

function setStationNameTranslation(
  translations: TranslationMap | undefined,
  locale: Locale,
  value: string,
): TranslationMap {
  const names = { ...(translations?.name ?? {}) };
  if (value === '') delete names[locale];
  else names[locale] = value;
  return Object.keys(names).length > 0 ? { ...(translations ?? {}), name: names } : {};
}

function localizedStationName(station: PrintStation, locale: string): string {
  const language = locale.split(/[-_]/, 1)[0] as Locale;
  return station.translations?.name?.[language]?.trim() || station.name;
}

export default function PrintersSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { locale, t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('printers.manage');

  const [overview, setOverview] = useState<PrintingOverview>(EMPTY_OVERVIEW);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printerOpen, setPrinterOpen] = useState(false);
  const [editingPrinterId, setEditingPrinterId] = useState<string>();
  const [stationOpen, setStationOpen] = useState(false);
  const [editingStationId, setEditingStationId] = useState<string>();
  const [credentials, setCredentials] = useState<PrinterRegistration | null>(null);
  const [queueAction, setQueueAction] = useState<QueueAction | null>(null);
  const [stationDraft, setStationDraft] = useState(newStation);
  const [sourceLocale, setSourceLocale] = useState<Locale>('en');
  const [stationNameLocale, setStationNameLocale] = useState<Locale>('en');
  const [rulesDraft, setRulesDraft] = useState<PrintRoutingRule[]>([]);
  const [printerDraft, setPrinterDraft] = useState(newPrinter);
  const autoActivationInFlight = useRef(false);
  const [overrideDraft, setOverrideDraft] = useState({
    component: 'item' as 'item' | 'modifier' | 'option', component_id: '', station_id: '', channel: '',
  });

  const load = useCallback(async (quiet = false) => {
    if (!rid) return;
    if (!quiet) setLoading(true);
    try {
      if (quiet) {
        const nextOverview = await getPrintingOverview(rid);
        setOverview(nextOverview);
        setError(null);
        return;
      }
      const [nextOverview, nextSettings, nextCategories, nextItems, restaurant] = await Promise.all([
        getPrintingOverview(rid), getRestaurantSettings(rid), getAllCategories(rid), listAllItems(rid), getRestaurant(rid),
      ]);
      setOverview(nextOverview);
      setSettings(nextSettings);
      setCategories(nextCategories);
      setItems(nextItems);
      setRulesDraft(nextOverview.routing_rules);
      if (isLocale(restaurant.default_locale)) {
        setSourceLocale(restaurant.default_locale);
        setStationNameLocale(restaurant.default_locale);
      }
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('printingLoadFailed'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [rid, t]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const modifiers = useMemo(
    () => items.flatMap((item) => (item.modifiers ?? []).map((modifier) => ({ ...modifier, itemName: item.name }))),
    [items],
  );

  const options = useMemo(() => items.flatMap((item) => [
    ...(item.variant_groups ?? []).flatMap((group) => group.variants.map((option) => ({ id: option.id, name: `${item.name} · ${group.title} · ${option.name}` }))),
    ...(item.option_sets ?? []).flatMap((set) => (set.options ?? []).map((option) => ({ id: option.id, name: `${item.name} · ${set.name} · ${option.name}` }))),
  ]), [items]);

  const epsonGateways = useMemo(
    () => overview.printers.filter((printer) => printer.vendor === 'epson' && !printer.gateway_printer_id),
    [overview.printers],
  );

  const categoryHasDestination = useCallback((categoryId: number) => (
    overview.stations.some((station) => station.enabled && station.receives_full_order)
    || rulesDraft.some((rule) => rule.component_type === 'category' && rule.category_id === categoryId)
  ), [overview.stations, rulesDraft]);

  const unroutedCategories = useMemo(
    () => categories.filter((category) => !categoryHasDestination(category.id)),
    [categories, categoryHasDestination],
  );

  const configurationReady = useMemo(() => isPrintingConfigurationReady({
    printers: overview.printers,
    stations: overview.stations,
    routingRules: overview.routing_rules,
  }), [overview.printers, overview.routing_rules, overview.stations]);

  useEffect(() => {
    if (!canManage || !settings || autoActivationInFlight.current) return;
    if (settings.server_printing_enabled === configurationReady
      && (!configurationReady || settings.auto_print_kitchen_ticket)) return;

    autoActivationInFlight.current = true;
    setSaving(true);
    void updateRestaurantSettings(rid, {
      server_printing_enabled: configurationReady,
      ...(configurationReady ? { auto_print_kitchen_ticket: true } : {}),
      print_poll_interval_seconds: 2,
    }).then((next) => {
      setSettings(next);
      setError(null);
    }).catch((cause) => {
      setError(cause instanceof Error ? cause.message : t('printingSaveFailed'));
    }).finally(() => {
      autoActivationInFlight.current = false;
      setSaving(false);
    });
  }, [canManage, configurationReady, rid, settings, t]);

  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('printingSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const confirmQueueAction = () => {
    const action = queueAction;
    if (!action) return;
    setQueueAction(null);
    void run(async () => {
      if (action.kind === 'job') {
        await cancelPrintJob(rid, action.job.id, t('printingCancelledByOperator'));
      } else {
        await cancelPendingPrintJobs(rid, action.printer.id, t('printingQueueClearedByOperator'));
      }
      await load(true);
    });
  };
  const openPrinter = (printer?: PrintPrinter) => {
    if (!printer) {
      setEditingPrinterId(undefined);
      setPrinterDraft(newPrinter());
    } else {
      setEditingPrinterId(printer.id);
      setPrinterDraft({
        ...newPrinter(), connection: printer.protocol === 'spooler' ? 'lan' : 'cloud',
        name: printer.name, identifier: printer.identifier, vendor: printer.vendor,
        epson_polling_id: printer.epson_polling_id ?? '', gateway_printer_id: printer.gateway_printer_id ?? '',
        protocol: printer.protocol, model: printer.model ?? '', profile: printer.profile,
        host: printer.host, port: printer.port, compatibility_port: printer.compatibility_port,
        receives_receipts: printer.receives_receipts ?? false,
        receipt_order_types: printer.receipt_order_types ?? [], receipt_copies: printer.receipt_copies || 1,
        paper_width_dots: printer.paper_width_dots as 384 | 576,
        station_id: overview.stations.find((station) => station.primary_printer_id === printer.id)?.id ?? '',
      });
    }
    setPrinterOpen(true);
  };

  const submitPrinter = () => run(async () => {
    const input = {
      name: printerDraft.name,
      identifier: printerDraft.identifier,
      vendor: printerDraft.vendor,
      protocol: editingPrinterId ? undefined : printerDraft.protocol,
      model: printerDraft.model || undefined,
      profile: printerDraft.profile,
      host: printerDraft.host,
      port: printerDraft.port,
      use_https: false,
      device_id: 'local_printer',
      compatibility_port: printerDraft.compatibility_port,
      receives_receipts: printerDraft.receives_receipts,
      receipt_order_types: printerDraft.receipt_order_types,
      receipt_copies: printerDraft.receipt_copies,
      paper_width_dots: printerDraft.paper_width_dots,
      expected_poll_seconds: printerDraft.expected_poll_seconds,
      epson_polling_id: printerDraft.vendor === 'epson' && !printerDraft.gateway_printer_id ? printerDraft.epson_polling_id : undefined,
      gateway_printer_id: printerDraft.vendor === 'epson' && printerDraft.gateway_printer_id ? printerDraft.gateway_printer_id : undefined,
    };
    const registration = editingPrinterId
      ? { printer: await updatePrinter(rid, editingPrinterId, input), username: '', password: '', realm: '' }
      : await registerPrinter(rid, input);
    if (printerDraft.station_id) {
      const station = overview.stations.find((value) => value.id === printerDraft.station_id);
      if (station) {
        const { id, restaurant_id: _restaurantId, ...input } = station;
        void _restaurantId;
        await savePrintStation(rid, { ...input, primary_printer_id: registration.printer.id }, id);
      }
    } else if (printerDraft.new_station_name.trim()) {
      await savePrintStation(rid, {
        ...newStation(), name: printerDraft.new_station_name.trim(), primary_printer_id: registration.printer.id,
      });
    }
    setCredentials(!editingPrinterId && registration.password ? registration : null);
    setPrinterOpen(false);
    setEditingPrinterId(undefined);
    setPrinterDraft(newPrinter());
    await load();
  });

  const openStation = (station?: PrintStation) => {
    if (station) {
      const { id, restaurant_id: _restaurantId, ...input } = station;
      void _restaurantId;
      setEditingStationId(id);
      setStationDraft({
        ...input,
        translations: input.translations ?? {},
        show_table: input.show_table ?? true,
        show_order_type: input.show_order_type ?? true,
        ticket_split_mode: input.ticket_split_mode ?? 'grouped',
      });
    } else {
      setEditingStationId(undefined);
      setStationDraft(newStation());
    }
    setStationNameLocale(sourceLocale);
    setStationOpen(true);
  };

  const submitStation = () => run(async () => {
    await savePrintStation(rid, stationDraft, editingStationId);
    setStationOpen(false);
    await load();
  });

  const hasCategoryRoute = (categoryId: number, stationId: string) => rulesDraft.some(
    (rule) => rule.component_type === 'category' && rule.category_id === categoryId && rule.station_id === stationId,
  );

  const toggleCategoryRoute = (categoryId: number, stationId: string) => {
    const exists = hasCategoryRoute(categoryId, stationId);
    setRulesDraft((current) => exists
      ? current.filter((rule) => !(rule.component_type === 'category' && rule.category_id === categoryId && rule.station_id === stationId))
      : [...current, { component_type: 'category', category_id: categoryId, station_id: stationId }]);
  };

  const addOverride = () => {
    const componentId = Number(overrideDraft.component_id);
    if (!componentId || !overrideDraft.station_id) return;
    const shared = { station_id: overrideDraft.station_id, channel: overrideDraft.channel || undefined };
    const rule: PrintRoutingRule = overrideDraft.component === 'item'
      ? { component_type: 'item', menu_item_id: componentId, ...shared }
      : overrideDraft.component === 'modifier'
        ? { component_type: 'modifier', menu_item_modifier_id: componentId, ...shared }
        : { component_type: 'option', option_id: componentId, ...shared };
    setRulesDraft((current) => [
      ...current.filter((value) => !(value.component_type === rule.component_type
        && value.menu_item_id === rule.menu_item_id
        && value.menu_item_modifier_id === rule.menu_item_modifier_id
        && value.option_id === rule.option_id
        && (value.channel ?? '') === (rule.channel ?? ''))),
      rule,
    ]);
    setOverrideDraft((current) => ({ ...current, component_id: '', station_id: '' }));
  };

  const stationNameValue = stationNameLocale === sourceLocale
    ? stationDraft.name
    : stationDraft.translations?.name?.[stationNameLocale] ?? '';
  const missingStationNames = Object.fromEntries(
    SUPPORTED_LOCALES.map((language) => [
      language,
      language !== sourceLocale && !(stationDraft.translations?.name?.[language] ?? '').trim(),
    ]),
  ) as Partial<Record<Locale, boolean>>;

  const saveRules = () => run(async () => {
    const routing_rules = await replacePrintRoutingRules(rid, rulesDraft.map(({ id: _id, ...rule }) => rule));
    setOverview((current) => ({ ...current, routing_rules }));
    setRulesDraft(routing_rules);
  });

  if (loading) {
    return <div className="py-[var(--s-16)] text-center text-fs-sm text-[var(--fg-muted)]">{t('loading')}</div>;
  }

  return (
    <div className="max-w-[1120px]">
      <PageHead title={t('printingTitle')} desc={t('printingDescription')} />

      {error && (
        <div role="alert" className="mb-[var(--s-4)] flex items-start gap-[var(--s-3)] rounded-r-md border border-[var(--danger-500)]/30 bg-[var(--danger-50)] p-[var(--s-3)] text-fs-sm text-[var(--danger-500)] dark:text-[#fb7185]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void load()}>{t('retry')}</Button>
        </div>
      )}

      <Tabs defaultValue="printers" variant="underline">
        <TabsList className="overflow-x-auto">
          <Tab value="printers" className="inline-flex shrink-0 items-center gap-2 [&_svg]:h-4 [&_svg]:w-4"><Printer />{t('printers')}</Tab>
          <Tab value="stations" className="inline-flex shrink-0 items-center gap-2 [&_svg]:h-4 [&_svg]:w-4"><ClipboardList />{t('printingStations')}</Tab>
          <Tab value="routing" className="inline-flex shrink-0 items-center gap-2 [&_svg]:h-4 [&_svg]:w-4"><Route />{t('printingRouting')}</Tab>
          <Tab value="jobs" className="inline-flex shrink-0 items-center gap-2 [&_svg]:h-4 [&_svg]:w-4"><Send />{t('printingJobs')}</Tab>
        </TabsList>

        <TabsContent value="printers">
          <Section title={t('printingLivePrinters')} desc={t('printingLiveHint')}
            aside={canManage ? <Button size="sm" variant="secondary" onClick={() => openPrinter()}><Plus />{t('printingAddPrinter')}</Button> : undefined}>
            {overview.printers.length === 0 ? (
              <EmptyState icon={<Printer />} title={t('printingNoPrinters')} desc={t('printingNoPrintersHint')} />
            ) : (
              <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
                {overview.printers.map((printer) => (
                  <div key={printer.id} className="grid gap-[var(--s-3)] py-[var(--s-4)] md:grid-cols-[1fr_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--fg)]">{printer.name}</span>
                        <Badge tone={statusTone(printer.status)} dot>{t(`printingStatus_${printer.status}`)}</Badge>
                        {!printer.enabled && <Badge tone="neutral">{t('disabled')}</Badge>}
                      </div>
                      <div className="mt-1 font-mono text-fs-xs text-[var(--fg-subtle)]">
                        {printer.protocol === 'spooler'
                          ? `EPSON ePOS · FOODY SPOOLER · LAN · ${printer.model || printer.identifier} · ${printer.paper_width_dots}px`
                          : `${printer.vendor === 'epson' ? 'EPSON SDP' : 'STAR'} · ${printer.protocol.toUpperCase()} · ${printer.model || printer.identifier} · ${printer.paper_width_dots}px`}
                      </div>
                      {printer.protocol === 'spooler' ? (
                        <div className="mt-1 text-fs-xs text-[var(--fg-muted)]">
                          {printer.host}:{printer.compatibility_port} · {printer.receives_receipts ? t('printingReceiptPrinter') : t('printingKitchenOnly')}
                        </div>
                      ) : printer.vendor === 'epson' && (
                        <div className="mt-1 text-fs-xs text-[var(--fg-muted)]">
                          {printer.gateway_printer_id
                            ? `${t('printingEpsonDeviceId')}: ${printer.identifier} · ${t('printingEpsonViaGateway')}`
                            : `${t('printingEpsonPollingId')}: ${printer.epson_polling_id} · ${t('printingEpsonDeviceId')}: ${printer.identifier}`}
                        </div>
                      )}
                      <div className="mt-1 text-fs-xs text-[var(--fg-muted)]">
                        {t('printingLastSeen')}: {formatSeen(printer.last_seen_at)}
                        <span className="ms-3">{t('printingLastTest')}: {formatSeen(printer.last_test_succeeded_at)}</span>
                        {printer.last_error && <span className="ms-3 text-[var(--danger-500)] dark:text-[#fb7185]">{printer.last_error}</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-fs-xs text-[var(--fg-muted)]">
                        <span>{t('printingAssignedPasses')}:</span>
                        {overview.stations.filter((station) => station.primary_printer_id === printer.id || station.fallback_printer_id === printer.id).length === 0
                          ? <Badge tone="warning">{t('printingUnassigned')}</Badge>
                          : overview.stations.filter((station) => station.primary_printer_id === printer.id || station.fallback_printer_id === printer.id).map((station) => (
                            <Badge key={station.id} tone="neutral">{localizedStationName(station, locale)}</Badge>
                          ))}
                      </div>
                    </div>
                    {canManage && <div className="flex flex-wrap gap-2">
                      {(printer.pending_job_count ?? 0) > 0 && <Button variant="danger" size="sm" disabled={saving} onClick={() => setQueueAction({ kind: 'printer', printer, count: printer.pending_job_count ?? 0 })}><ListX />{t('printingClearQueue')} ({printer.pending_job_count})</Button>}
                      <Button variant="secondary" size="sm" disabled={saving} onClick={() => void run(async () => { await testPrinter(rid, printer.id); await load(true); })}>{t('printingTestTicket')}</Button>
                      {printer.protocol === 'spooler' && <Button variant="ghost" size="sm" disabled={saving} onClick={() => openPrinter(printer)}><Pencil />{t('edit')}</Button>}
                      <Button variant="ghost" size="sm" disabled={saving} onClick={() => void run(async () => { await updatePrinter(rid, printer.id, { enabled: !printer.enabled }); await load(); })}>{printer.enabled ? t('disable') : t('enable')}</Button>
                      <Button icon variant="ghost" size="sm" aria-label={t('delete')} disabled={saving} onClick={() => {
                        if (window.confirm(t('printingDeletePrinterConfirm'))) void run(async () => { await deletePrinter(rid, printer.id); await load(); });
                      }}><Trash2 /></Button>
                    </div>}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="stations">
          <Section title={t('printingStations')} desc={t('printingStationsHint')}
            aside={canManage ? <Button size="sm" variant="secondary" onClick={() => openStation()}><Plus />{t('printingAddStation')}</Button> : undefined}>
            {overview.stations.length === 0 ? (
              <EmptyState icon={<ClipboardList />} title={t('printingNoStations')} desc={t('printingNoStationsHint')} />
            ) : <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {overview.stations.map((station) => {
                const primary = overview.printers.find((printer) => printer.id === station.primary_printer_id);
                const fallback = overview.printers.find((printer) => printer.id === station.fallback_printer_id);
                const categoryCount = station.receives_full_order ? categories.length : new Set(rulesDraft.filter((rule) => rule.component_type === 'category' && rule.station_id === station.id).map((rule) => rule.category_id)).size;
                return <div key={station.id} className="flex flex-wrap items-center gap-[var(--s-3)] py-[var(--s-4)]">
                  <div className="min-w-64 flex-1"><div className="font-semibold text-[var(--fg)]">{localizedStationName(station, locale)}</div><div className="mt-1 text-fs-xs text-[var(--fg-muted)]">{primary?.name ?? t('printingUnassigned')}{fallback && ` → ${fallback.name}`} · {station.copies}× · {station.cut_mode} · {station.locale?.toUpperCase() ?? 'HE'}</div><div className="mt-1 text-fs-xs text-[var(--fg-subtle)]">{categoryCount}/{categories.length} {t('printingCategoriesRouted')}</div></div>
                  {station.receives_full_order && <Badge tone="neutral">{t('printingFullOrder')}</Badge>}
                  {canManage && <>{primary && <Button size="sm" variant="secondary" disabled={saving} onClick={() => void run(async () => { await testPrinter(rid, primary.id); await load(true); })}>{t('printingTestTicket')}</Button>}<Button size="sm" variant="ghost" onClick={() => openStation(station)}>{t('edit')}</Button><Button icon size="sm" variant="ghost" aria-label={t('delete')} onClick={() => {
                    if (window.confirm(t('printingDeleteStationConfirm'))) void run(async () => { await deletePrintStation(rid, station.id); await load(); });
                  }}><Trash2 /></Button></>}
                </div>;
              })}
            </div>}
          </Section>
        </TabsContent>

        <TabsContent value="routing">
          <Section title={t('printingCategoryMatrix')} desc={t('printingCategoryMatrixHint')}
            aside={canManage ? <Button size="sm" disabled={saving} onClick={() => void saveRules()}><Check />{t('save')}</Button> : undefined}>
            {overview.stations.length === 0 ? <EmptyState icon={<Route />} title={t('printingNoStations')} desc={t('printingRoutingNeedsStations')} /> : (
              <div>
                <div className={`mb-4 flex items-start gap-3 rounded-r-md border p-3 text-fs-sm ${unroutedCategories.length > 0 ? 'border-[var(--warning-500)]/40 bg-[var(--warning-50)] text-[var(--warning-500)] dark:text-[#fbbf24]' : 'border-[var(--success-500)]/30 bg-[var(--success-50)] text-[var(--success-500)] dark:text-[#4ade80]'}`}>
                  {unroutedCategories.length > 0 ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
                  <div>
                    <div className="font-semibold">{unroutedCategories.length > 0 ? `${unroutedCategories.length} ${t('printingCategoriesWithoutRoute')}` : t('printingAllCategoriesRouted')}</div>
                    {unroutedCategories.length > 0 && <div className="mt-1 text-fs-xs">{unroutedCategories.slice(0, 6).map((category) => category.name).join(' · ')}{unroutedCategories.length > 6 ? '…' : ''}</div>}
                  </div>
                </div>
                <div className="overflow-x-auto rounded-r-md border border-[var(--line)]">
                  <table className="w-full min-w-[720px] border-collapse text-fs-sm">
                    <thead className="bg-[var(--surface-2)] text-[var(--fg-muted)]"><tr><th className="sticky start-0 z-10 min-w-48 border-e border-[var(--line)] bg-[var(--surface-2)] p-3 text-start font-medium">{t('category')}</th>{overview.stations.map((station) => {
                      const primary = overview.printers.find((printer) => printer.id === station.primary_printer_id);
                      return <th key={station.id} className="min-w-40 p-3 text-center font-medium"><div className="font-semibold text-[var(--fg)]">{localizedStationName(station, locale)}</div><div className="mt-1 flex items-center justify-center gap-1.5 text-fs-xs font-normal"><span className={`h-1.5 w-1.5 rounded-full ${primary?.status === 'online' ? 'bg-[var(--success-500)]' : primary?.status === 'error' ? 'bg-[var(--danger-500)]' : 'bg-[var(--warning-500)]'}`} />{primary?.name ?? t('printingUnassigned')}</div>{station.receives_full_order && <div className="mt-1"><Badge tone="neutral">{t('printingFullOrder')}</Badge></div>}</th>;
                    })}</tr></thead>
                    <tbody className="divide-y divide-[var(--line)]">{categories.map((category) => <tr key={category.id} className="hover:bg-[var(--surface-2)]/50"><td className="sticky start-0 z-[5] border-e border-[var(--line)] bg-[var(--surface)] p-3 font-medium text-[var(--fg)]">{category.name}</td>{overview.stations.map((station) => {
                      const explicit = hasCategoryRoute(category.id, station.id);
                      const selected = station.receives_full_order || explicit;
                      return <td key={station.id} className="p-3 text-center"><button type="button" disabled={!canManage || station.receives_full_order} aria-pressed={selected} aria-label={`${category.name} → ${localizedStationName(station, locale)}`} onClick={() => toggleCategoryRoute(category.id, station.id)} className={`mx-auto flex h-9 w-9 items-center justify-center rounded-r-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-500)] disabled:cursor-not-allowed ${selected ? 'border-[var(--brand-500)] bg-[var(--brand-500)] text-white' : 'border-[var(--line-strong)] bg-[var(--surface)] text-transparent hover:border-[var(--brand-400)]'}`}><Check className="h-4 w-4" /></button></td>;
                    })}</tr>)}</tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>

          <Section title={t('printingOverrides')} desc={t('printingOverridesHint')}>
            {canManage && <div className="mb-4 grid gap-3 md:grid-cols-[140px_1fr_140px_1fr_auto] md:items-end">
              <Field label={t('printingOverrideType')}><Select value={overrideDraft.component} onChange={(event) => setOverrideDraft((current) => ({ ...current, component: event.target.value as 'item' | 'modifier' | 'option', component_id: '' }))}><option value="item">{t('item')}</option><option value="modifier">{t('modifier')}</option><option value="option">{t('printingOption')}</option></Select></Field>
              <Field label={t('printingComponent')}><Select value={overrideDraft.component_id} onChange={(event) => setOverrideDraft((current) => ({ ...current, component_id: event.target.value }))}><option value="">{t('select')}</option>{overrideDraft.component === 'item' ? items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>) : overrideDraft.component === 'modifier' ? modifiers.map((modifier) => <option key={modifier.id} value={modifier.id}>{modifier.itemName} · {modifier.kitchen_name || modifier.name}</option>) : options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</Select></Field>
              <Field label={t('printingChannel')}><Select value={overrideDraft.channel} onChange={(event) => setOverrideDraft((current) => ({ ...current, channel: event.target.value }))}><option value="">{t('printingAllChannels')}</option><option value="dine_in">{t('dineIn')}</option><option value="pickup">{t('pickup')}</option><option value="delivery">{t('delivery')}</option></Select></Field>
              <Field label={t('printingStation')}><Select value={overrideDraft.station_id} onChange={(event) => setOverrideDraft((current) => ({ ...current, station_id: event.target.value }))}><option value="">{t('select')}</option>{overview.stations.map((station) => <option key={station.id} value={station.id}>{localizedStationName(station, locale)}</option>)}</Select></Field>
              <Button variant="secondary" disabled={!overrideDraft.component_id || !overrideDraft.station_id} onClick={addOverride}>{t('add')}</Button>
            </div>}
            <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {rulesDraft.filter((rule) => rule.component_type !== 'category').map((rule, index) => {
                const label = rule.component_type === 'item' ? items.find((item) => item.id === rule.menu_item_id)?.name : rule.component_type === 'modifier' ? modifiers.find((modifier) => modifier.id === rule.menu_item_modifier_id)?.kitchen_name : options.find((option) => option.id === rule.option_id)?.name;
                const station = overview.stations.find((value) => value.id === rule.station_id)?.name;
                return <div key={rule.id ?? `${rule.component_type}-${index}`} className="flex items-center gap-3 py-3"><Badge tone="neutral">{t(rule.component_type)}</Badge><span className="flex-1">{label ?? '—'} → {station ?? '—'}{rule.channel ? ` · ${rule.channel}` : ''}</span>{canManage && <Button icon size="sm" variant="ghost" aria-label={t('delete')} onClick={() => setRulesDraft((current) => current.filter((value) => value !== rule))}><Trash2 /></Button>}</div>;
              })}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="jobs">
          <div className="mb-[var(--s-3)] grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {(['queued', 'claimed', 'printed', 'failed', 'uncertain', 'cancelled'] as const).map((state) => (
              <div key={state} className="rounded-r-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
                <div className="text-fs-xs text-[var(--fg-muted)]">{t(`printingJob_${state}`)}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--fg)]">{overview.summary[state] ?? 0}</div>
              </div>
            ))}
          </div>
          <Section title={t('printingRecentJobs')} desc={t('printingRecentJobsHint')} aside={<Button size="sm" variant="ghost" onClick={() => void load(true)}><RefreshCw />{t('refresh')}</Button>}>
            {overview.jobs.length === 0 ? <EmptyState icon={<Send />} title={t('printingNoJobs')} /> : <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {overview.jobs.map((job) => {
                const station = overview.stations.find((value) => value.id === job.station_id);
                const isKitchenTicket = job.kind === 'kitchen_ticket' || job.kind === 'production';
                const isPending = job.state === 'queued' || job.state === 'claimed';
                return <div key={job.id} className="grid gap-2 py-3 md:grid-cols-[1fr_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="text-fs-sm font-medium text-[var(--fg)]">{job.order_id ? `#${job.order_id}` : job.kind}</span>{station && <Badge tone="neutral">{localizedStationName(station, locale)}</Badge>}</div><div className="mt-1 text-fs-xs text-[var(--fg-subtle)]">{formatSeen(job.created_at)}{job.attempts > 1 ? ` · ${job.attempts} ${t('printingAttempts')}` : ''}</div>{job.last_error && <div className={`mt-1 text-fs-xs ${job.state === 'cancelled' ? 'text-[var(--fg-muted)]' : 'text-[var(--danger-500)] dark:text-[#fb7185]'}`}>{job.last_error}</div>}</div><div className="flex flex-wrap items-center gap-2"><Badge tone={jobTone(job.state)} dot>{t(`printingJob_${job.state}`)}</Badge>{canManage && isPending && <Button size="sm" variant={job.state === 'claimed' ? 'danger' : 'ghost'} disabled={saving} onClick={() => setQueueAction({ kind: 'job', job })}><XCircle />{job.state === 'claimed' ? t('printingCancelBlockingJob') : t('printingCancelJob')}</Button>}{canManage && isKitchenTicket && job.order_id && !isPending && <Button size="sm" variant="ghost" disabled={saving} onClick={() => void run(async () => { await reprintOrder(rid, job.order_id!); await load(true); })}>{t('printingReprint')}</Button>}</div></div>;
              })}
            </div>}
          </Section>
        </TabsContent>
      </Tabs>

      <Drawer open={printerOpen} onOpenChange={setPrinterOpen} title={editingPrinterId ? t('printingEditPrinter') : t('printingAddPrinter')} subtitle={t('printingRegisterHint')}
        onSave={() => void submitPrinter()} saveLabel={editingPrinterId ? t('save') : t('register')}
        saveDisabled={saving || !printerDraft.name.trim() || !printerDraft.identifier.trim()
          || (printerDraft.connection === 'lan' ? !printerDraft.host.trim() : printerDraft.vendor === 'epson' && !printerDraft.gateway_printer_id && !printerDraft.epson_polling_id.trim())}>
        <div className="grid gap-4">
          <Field label={t('name')}><Input value={printerDraft.name} onChange={(event) => setPrinterDraft((current) => ({ ...current, name: event.target.value }))} /></Field>
          <Field label={t('printingConnectionMode')}><Select disabled={Boolean(editingPrinterId)} value={printerDraft.connection} onChange={(event) => {
            const connection = event.target.value as 'lan' | 'cloud';
            setPrinterDraft((current) => ({ ...current, connection, protocol: connection === 'lan' ? 'spooler' : 'http', receives_receipts: connection === 'lan' }));
          }}><option value="lan">{t('printingFoodyLan')}</option><option value="cloud">{t('printingCloudDevice')}</option></Select></Field>
          {printerDraft.connection === 'lan' ? <>
            <Field label={t('model')}><Select value={printerDraft.profile} onChange={(event) => {
              const profile = event.target.value as PrintPrinter['profile'];
              setPrinterDraft((current) => ({ ...current, profile, model: profile === 'tm_m30iii' ? 'Epson TM-m30III' : 'Epson TM-U220IIB', paper_width_dots: profile === 'tm_m30iii' ? 576 : 384 }));
            }}><option value="tm_m30iii">Epson TM-m30III · 80 mm</option><option value="tm_u220iib">Epson TM-U220IIB · 76 mm</option></Select></Field>
            <Field label={t('printingLanAddress')} hint={t('printingLanAddressHint')}><Input value={printerDraft.host} placeholder="192.168.1.48" inputMode="url" autoCapitalize="none" onChange={(event) => setPrinterDraft((current) => ({ ...current, host: event.target.value }))} /></Field>
            <div className="rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-4">
              <label className="flex items-center gap-2 text-fs-sm font-semibold text-[var(--fg)]"><input type="checkbox" checked={printerDraft.receives_receipts} onChange={(event) => setPrinterDraft((current) => ({ ...current, receives_receipts: event.target.checked }))} /><ReceiptText className="h-4 w-4" />{t('printingReceiptPrinter')}</label>
              {printerDraft.receives_receipts && <div className="mt-4 grid gap-3">
                <div className="text-fs-xs text-[var(--fg-muted)]">{t('printingReceiptChannelsHint')}</div>
                <div className="flex flex-wrap gap-4">{RECEIPT_ORDER_TYPES.map((orderType) => <label key={orderType} className="flex items-center gap-2 text-fs-sm"><input type="checkbox" checked={printerDraft.receipt_order_types.includes(orderType)} onChange={(event) => setPrinterDraft((current) => ({ ...current, receipt_order_types: event.target.checked ? [...current.receipt_order_types, orderType] : current.receipt_order_types.filter((value) => value !== orderType) }))} />{t(`printingOrderType_${orderType}`)}</label>)}</div>
                <Field label={t('printingReceiptCopies')}><NumberField min={1} max={5} value={printerDraft.receipt_copies} onChange={(value) => setPrinterDraft((current) => ({ ...current, receipt_copies: value }))} /></Field>
              </div>}
            </div>
          </> : <>
            <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('printingVendor')}><Select value={printerDraft.vendor} onChange={(event) => {
              const vendor = event.target.value as PrinterVendor;
              setPrinterDraft((current) => ({
                ...current, vendor, protocol: 'http', gateway_printer_id: '', epson_polling_id: '',
                identifier: vendor === 'epson' ? 'local_printer' : '',
                model: vendor === 'epson' ? 'TM-U220IIB-i' : '',
                paper_width_dots: vendor === 'epson' ? 384 : 576,
              }));
            }}><option value="epson">Epson Server Direct Print</option><option value="star">Star CloudPRNT</option></Select></Field>
            <Field label={t('model')}><Input value={printerDraft.model} onChange={(event) => setPrinterDraft((current) => ({ ...current, model: event.target.value }))} /></Field>
          </div>
          {printerDraft.vendor === 'epson' && <div role="note" className="rounded-r-md border border-[var(--warning-500)]/35 bg-[var(--warning-50)] p-3 text-fs-sm text-[var(--warning-500)] dark:text-[#fbbf24]">
            <div className="font-semibold">{t('printingEpsonModelWarningTitle')}</div>
            <div className="mt-1 text-fs-xs leading-relaxed">{t('printingEpsonModelWarning')}</div>
          </div>}
          {printerDraft.vendor === 'epson' && <div role="note" className="rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-3 text-fs-xs leading-relaxed text-[var(--fg-muted)]">{t('printingServerDirectNoIp')}</div>}
          {printerDraft.vendor === 'epson' && <Field label={t('printingEpsonGateway')} hint={t('printingEpsonGatewayHint')}><Select value={printerDraft.gateway_printer_id} onChange={(event) => setPrinterDraft((current) => ({ ...current, gateway_printer_id: event.target.value, epson_polling_id: '' }))}><option value="">{t('printingEpsonDirect')}</option>{epsonGateways.map((gateway) => <option key={gateway.id} value={gateway.id}>{gateway.name} · {gateway.epson_polling_id}</option>)}</Select></Field>}
          <Field label={t('printingProtocol')} hint={printerDraft.vendor === 'epson' ? t('printingEpsonProtocolHint') : t('printingProtocolHint')}>
            {printerDraft.vendor === 'epson' ? <Input readOnly value="Server Direct Print · HTTP(S)" /> : <Select value={printerDraft.protocol} onChange={(event) => setPrinterDraft((current) => ({ ...current, protocol: event.target.value as 'http' | 'mqtt' }))}><option value="http">HTTP polling</option><option value="mqtt">MQTT Trigger POST + HTTP fallback</option></Select>}
          </Field>
          {printerDraft.vendor === 'epson' && !printerDraft.gateway_printer_id && <Field label={t('printingEpsonPollingId')} hint={t('printingEpsonPollingIdHint')}><Input value={printerDraft.epson_polling_id} placeholder="restaurant-kitchen-01" onChange={(event) => setPrinterDraft((current) => ({ ...current, epson_polling_id: event.target.value }))} /></Field>}
          <Field label={printerDraft.vendor === 'epson' ? t('printingEpsonDeviceId') : t('printingIdentifier')} hint={printerDraft.vendor === 'epson' ? t('printingEpsonDeviceIdHint') : t('printingIdentifierHint')}><Input value={printerDraft.identifier} onChange={(event) => setPrinterDraft((current) => ({ ...current, identifier: event.target.value }))} /></Field>
          <Field label={t('printingPaperWidth')}><Select value={printerDraft.paper_width_dots} onChange={(event) => setPrinterDraft((current) => ({ ...current, paper_width_dots: Number(event.target.value) as 384 | 576 }))}>{printerDraft.vendor === 'epson' ? <><option value={384}>TM-U220 · 76 mm · 384 dots</option><option value={576}>Epson thermal · 576 dots</option></> : <><option value={384}>58 mm · 384 px</option><option value={576}>80 mm · 576 px</option></>}</Select></Field>
          </>}
          <Field label={t('printingAssignStation')}><Select value={printerDraft.station_id} onChange={(event) => setPrinterDraft((current) => ({ ...current, station_id: event.target.value, new_station_name: '' }))}><option value="">{t('printingCreateStationBelow')}</option>{overview.stations.map((station) => <option key={station.id} value={station.id}>{localizedStationName(station, locale)}</option>)}</Select></Field>
          {!printerDraft.station_id && <Field label={t('printingNewStationName')} hint={t('printingPassNameHint')}><Input value={printerDraft.new_station_name} placeholder={t('printingPassNamePlaceholder')} onChange={(event) => setPrinterDraft((current) => ({ ...current, new_station_name: event.target.value }))} /></Field>}
        </div>
      </Drawer>

      <Drawer open={stationOpen} onOpenChange={setStationOpen} title={editingStationId ? t('printingEditStation') : t('printingAddStation')}
        onSave={() => void submitStation()} saveLabel={t('save')} saveDisabled={saving || !stationDraft.name.trim()}>
        <div className="grid gap-4">
          <LocaleTabs locales={SUPPORTED_LOCALES} source={sourceLocale} active={stationNameLocale} onChange={setStationNameLocale} missing={missingStationNames} />
          <LocaleEditingBanner active={stationNameLocale} source={sourceLocale} />
          <Field label={t('name')} hint={t('printingStationNameHint')}><Input value={stationNameValue} dir={stationNameLocale === 'he' ? 'rtl' : 'ltr'} maxLength={120} onChange={(event) => {
            const value = event.target.value;
            if (stationNameLocale === sourceLocale) {
              setStationDraft((current) => ({ ...current, name: value }));
            } else {
              setStationDraft((current) => ({ ...current, translations: setStationNameTranslation(current.translations, stationNameLocale, value) }));
            }
          }} /></Field>
          <Field label={t('printingPrimaryPrinter')}><Select value={stationDraft.primary_printer_id ?? ''} onChange={(event) => setStationDraft((current) => ({ ...current, primary_printer_id: event.target.value || undefined }))}><option value="">{t('printingUnassigned')}</option>{overview.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}</Select></Field>
          <p className="-mt-2 text-fs-xs leading-relaxed text-[var(--fg-muted)]">{t('printingSharedPrinterHint')}</p>
          <Field label={t('printingFallbackPrinter')}><Select value={stationDraft.fallback_printer_id ?? ''} onChange={(event) => setStationDraft((current) => ({ ...current, fallback_printer_id: event.target.value || undefined }))}><option value="">{t('printingUnassigned')}</option>{overview.printers.filter((printer) => printer.id !== stationDraft.primary_printer_id).map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}</Select></Field>
          <div className="grid gap-4 sm:grid-cols-3"><Field label={t('printingCopies')}><NumberField min={1} max={5} value={stationDraft.copies} onChange={(value) => setStationDraft((current) => ({ ...current, copies: value }))} /></Field><Field label={t('printingFontSize')}><NumberField min={18} max={40} value={stationDraft.font_size} onChange={(value) => setStationDraft((current) => ({ ...current, font_size: value }))} /></Field><Field label={t('language')}><Select value={stationDraft.locale ?? 'he'} onChange={(event) => {
            const nextLocale = event.target.value as Locale;
            setStationDraft((current) => ({ ...current, locale: nextLocale }));
            setStationNameLocale(nextLocale);
          }}><option value="he">עברית</option><option value="fr">Français</option><option value="en">English</option></Select></Field></div>
          <label className="flex items-center gap-2 text-fs-sm"><input type="checkbox" checked={stationDraft.receives_full_order} onChange={(event) => setStationDraft((current) => ({ ...current, receives_full_order: event.target.checked }))} />{t('printingFullOrder')}</label>
          <div className="rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-4">
            <div className="font-semibold text-[var(--fg)]">{t('printingTicketContent')}</div>
            <p className="mt-1 text-fs-xs leading-relaxed text-[var(--fg-muted)]">{t('printingTicketContentHint')}</p>
            <div className="mt-4 grid gap-3">
              <label className="flex items-center gap-2 text-fs-sm"><input type="checkbox" checked={stationDraft.show_table} onChange={(event) => setStationDraft((current) => ({ ...current, show_table: event.target.checked }))} />{t('printingShowTable')}</label>
              <label className="flex items-center gap-2 text-fs-sm"><input type="checkbox" checked={stationDraft.show_order_type} onChange={(event) => setStationDraft((current) => ({ ...current, show_order_type: event.target.checked }))} />{t('printingShowOrderType')}</label>
            </div>
          </div>
          <Field label={t('printingTicketSplitMode')} hint={t('printingTicketSplitHint')}><Select value={stationDraft.ticket_split_mode} onChange={(event) => setStationDraft((current) => ({ ...current, ticket_split_mode: event.target.value as 'grouped' | 'item_unit' }))}><option value="grouped">{t('printingTicketSplitGrouped')}</option><option value="item_unit">{t('printingTicketSplitItemUnit')}</option></Select></Field>
          <Field label={t('printingCutMode')}><Select value={stationDraft.cut_mode} onChange={(event) => setStationDraft((current) => ({ ...current, cut_mode: event.target.value as 'none' | 'partial' | 'full' }))}><option value="none">{t('printingCutNone')}</option><option value="partial">{t('printingCutPartial')}</option><option value="full">{t('printingCutFull')}</option></Select></Field>
          <label className="flex items-center gap-2 text-fs-sm"><input type="checkbox" checked={stationDraft.buzzer} onChange={(event) => setStationDraft((current) => ({ ...current, buzzer: event.target.checked }))} />{t('printingBuzzer')}</label>
        </div>
      </Drawer>

      <Drawer open={credentials !== null} onOpenChange={(open) => { if (!open) setCredentials(null); }} title={t('printingCredentials')}
        subtitle={t('printingCredentialsOnce')} footer={<Button className="w-full" onClick={() => setCredentials(null)}>{t('done')}</Button>}>
        {credentials && <div className="grid gap-4">
          {credentials.printer.vendor === 'epson' && <div className="rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-3 text-fs-sm leading-relaxed text-[var(--fg-muted)]">{t('printingEpsonWebConfigSteps')}</div>}
          {credentials.printer.vendor === 'epson' && <Field label={t('printingEpsonPrintUrl')}><Input readOnly className="font-mono" value={`${API_URL.replace(/\/$/, '')}/api/v1/public/printing/epson/server-direct-print`} /></Field>}
          {credentials.printer.vendor === 'epson' && <Field label={t('printingEpsonStatusUrl')}><Input readOnly className="font-mono" value={`${API_URL.replace(/\/$/, '')}/api/v1/public/printing/epson/status`} /></Field>}
          <Field label={credentials.printer.vendor === 'epson' ? t('printingEpsonPollingId') : t('username')}><Input readOnly className="font-mono" value={credentials.username} /></Field>
          <Field label={t('password')}><Input readOnly className="font-mono" value={credentials.password} /></Field>
          <Field label={t('printingRealm')}><Input readOnly className="font-mono" value={credentials.realm} /></Field>
        </div>}
      </Drawer>

      <ConfirmDialog
        open={queueAction !== null}
        onOpenChange={(open) => { if (!open) setQueueAction(null); }}
        title={queueAction?.kind === 'printer' ? `${t('printingClearQueueTitle')} (${queueAction.count})` : t('printingCancelJobTitle')}
        description={queueAction?.kind === 'printer'
          ? t('printingClearQueueWarning')
          : queueAction?.job.state === 'claimed'
            ? t('printingCancelClaimedWarning')
            : t('printingCancelQueuedWarning')}
        confirmLabel={queueAction?.kind === 'printer' ? t('printingClearQueue') : t('printingCancelJob')}
        cancelLabel={t('cancel')}
        danger
        onConfirm={confirmQueueAction}
      />
    </div>
  );
}
