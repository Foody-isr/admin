import type { PrintStation } from '@/lib/api';

export type PrintStationInput = Omit<PrintStation, 'id' | 'restaurant_id'>;

const SIMULATION_STATIONS = ['PIZZA', 'BAR'] as const;

/**
 * Builds only the missing home-simulation stations. Both destinations share
 * one physical printer while remaining separate routing targets and PrintJobs.
 */
export function buildSharedPrinterSimulationStations(
  printerId: string,
  existingStations: Pick<PrintStation, 'name'>[],
): PrintStationInput[] {
  const existingNames = new Set(
    existingStations.map((station) => station.name.trim().toLocaleUpperCase()),
  );

  return SIMULATION_STATIONS
    .filter((name) => !existingNames.has(name))
    .map((name) => ({
      name,
      primary_printer_id: printerId,
      fallback_printer_id: undefined,
      receives_full_order: false,
      show_table: true,
      show_order_type: true,
      ticket_split_mode: 'grouped' as const,
      copies: 1,
      cut_mode: 'full' as const,
      buzzer: false,
      font_size: 28,
      locale: 'fr' as const,
      enabled: true,
    }));
}
