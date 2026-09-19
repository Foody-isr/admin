import type { PrintPrinter, PrintRoutingRule, PrintStation } from '@/lib/api';

interface PrintingConfiguration {
  printers: Pick<PrintPrinter, 'id' | 'enabled' | 'last_test_succeeded_at'>[];
  stations: Pick<PrintStation, 'id' | 'enabled' | 'primary_printer_id' | 'receives_full_order'>[];
  routingRules: Pick<
    PrintRoutingRule,
    'station_id' | 'component_type' | 'category_id' | 'menu_item_id' | 'menu_item_modifier_id' | 'option_id'
  >[];
}

/**
 * Returns whether automatic kitchen printing has at least one tested,
 * persisted destination. Unrouted categories remain intentionally silent;
 * they must not disable tickets for categories that are already routed.
 */
export function isPrintingConfigurationReady({
  printers,
  stations,
  routingRules,
}: PrintingConfiguration): boolean {
  const readyStationIds = new Set(stations.filter((station) => {
    if (!station.enabled || !station.primary_printer_id) return false;
    const printer = printers.find((candidate) => candidate.id === station.primary_printer_id);
    return Boolean(printer?.enabled && printer.last_test_succeeded_at);
  }).map((station) => station.id));
  if (readyStationIds.size === 0) return false;

  if (stations.some((station) => readyStationIds.has(station.id) && station.receives_full_order)) return true;

  return routingRules.some((rule) => readyStationIds.has(rule.station_id));
}
