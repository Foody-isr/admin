import { apiFetch } from './api';

/** One configuration issue found for a série that could break or degrade ordering. */
export type CarteHealthProblem = {
  type: 'combo_step_under_min' | 'variant_pin_unmatched' | 'empty_group' | 'item_no_group';
  severity: 'error' | 'warning' | 'info';
  menu_id?: number;
  menu_name?: string;
  group_id?: number;
  group_name?: string;
  combo_id?: number;
  combo_name?: string;
  step_name?: string;
  item_id?: number;
  item_name?: string;
  variant_label?: string;
  available: number;
  required: number;
};

export type CarteHealthReport = {
  serie_date: string;
  problems: CarteHealthProblem[];
};

/**
 * Fetch carte configuration health for a série date (defaults to today when
 * omitted). Flags empty rotating groups, combo steps that resolve short,
 * unmatched variant pins, and items in no group. Reuses the same server-side
 * resolver as the live menu, so it can't drift from what customers actually get.
 */
export async function getCarteHealth(
  restaurantId: number,
  serieDate?: string,
): Promise<CarteHealthReport> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (serieDate) qs.set('serie_date', serieDate);
  return apiFetch<CarteHealthReport>(
    `/api/v1/menu/carte-health?${qs.toString()}`,
    restaurantId,
  );
}
