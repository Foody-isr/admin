import type { PrintPrinter, PrintRoutingRule, PrintStation } from '@/lib/api';

interface PrintingConfiguration {
  printers: Pick<PrintPrinter, 'id' | 'enabled' | 'last_test_succeeded_at'>[];
  stations: Pick<PrintStation, 'id' | 'enabled' | 'primary_printer_id' | 'receives_full_order'>[];
  routingRules: Pick<PrintRoutingRule, 'station_id' | 'component_type' | 'category_id'>[];
  categoryIds: number[];
}

/**
 * Returns whether automatic kitchen printing has a tested destination for the
 * restaurant and every category is covered by the persisted routing rules.
 */
export function isPrintingConfigurationReady({
  printers,
  stations,
  routingRules,
  categoryIds,
}: PrintingConfiguration): boolean {
  const readyStationIds = new Set(stations.filter((station) => {
    if (!station.enabled || !station.primary_printer_id) return false;
    const printer = printers.find((candidate) => candidate.id === station.primary_printer_id);
    return Boolean(printer?.enabled && printer.last_test_succeeded_at);
  }).map((station) => station.id));
  if (readyStationIds.size === 0 || categoryIds.length === 0) return false;

  if (stations.some((station) => readyStationIds.has(station.id) && station.receives_full_order)) return true;

  const routedCategoryIds = new Set(
    routingRules
      .filter((rule) => rule.component_type === 'category'
        && rule.category_id
        && readyStationIds.has(rule.station_id))
      .map((rule) => rule.category_id),
  );
  return categoryIds.every((categoryId) => routedCategoryIds.has(categoryId));
}
