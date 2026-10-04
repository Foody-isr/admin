import type { PrintAgent, PrinterConfiguration, PrinterProfile, SavePrinterProfileInput, SavePrinterProfileAssignmentInput } from './api';

const booleans = ['auto_print_new_categories', 'one_item_per_ticket', 'print_recipient_information', 'hide_ticket_footer', 'print_kitchen_names', 'combine_identical_items', 'enabled'] as const;
const choices = { ticket_margins: ['none', 'top', 'bottom', 'both'], ticket_layout: ['classic', 'compact'], font_size: ['small', 'medium', 'large'], item_sort_order: ['default', 'alphabetical', 'category_alphabetical', 'category_custom', 'seat'] };
const jobs = ['receipts', 'dine_in_tickets', 'online_tickets'];
/** Validate a complete restaurant-owned profile before using it as saved state. */
export function checkedPrinterProfile(value: PrinterProfile, rid: number, id?: string): PrinterProfile {
  if (!value || typeof value.id !== 'string' || !value.id || (id && id !== value.id) || value.restaurant_id !== rid || typeof value.name !== 'string' || booleans.some(key => typeof value[key] !== 'boolean') || Object.entries(choices).some(([key, allowed]) => !allowed.includes(value[key as keyof typeof choices])) || !Number.isInteger(value.copies) || value.copies < 1 || value.copies > 5) throw new Error('Invalid printer profile');
  const result = { ...value, job_types: value.job_types === null ? [] : value.job_types, dine_in_category_ids: value.dine_in_category_ids === null ? [] : value.dine_in_category_ids, online_category_ids: value.online_category_ids === null ? [] : value.online_category_ids, assignments: value.assignments === null ? [] : value.assignments };
  if (!Array.isArray(result.job_types) || result.job_types.some(job => !jobs.includes(job)) || [result.dine_in_category_ids, result.online_category_ids].some(ids => !Array.isArray(ids) || ids.some(id => !Number.isInteger(id) || id <= 0)) || !Array.isArray(result.assignments) || result.assignments.some(row => !row || ['id', 'device_id', 'device_name', 'printer_id', 'printer_name', 'printer_model'].some(key => typeof row[key as keyof typeof row] !== 'string') || !row.device_id || !row.printer_id) || new Set(result.assignments.map(row => row.device_id)).size !== result.assignments.length) throw new Error('Invalid printer profile fields');
  return result;
}
/** Reject malformed or cross-restaurant profile inventories. */
export function checkedPrinterProfiles(values: PrinterProfile[], rid: number): PrinterProfile[] {
  if (!Array.isArray(values)) throw new Error('Invalid printer profiles');
  const rows = values.map(row => checkedPrinterProfile(row, rid));
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Duplicate printer profiles');
  return rows;
}
/** Preserve all writable settings while excluding identity and assignments. */
export function printerProfileInput(profile: SavePrinterProfileInput): SavePrinterProfileInput {
  return { name: profile.name.trim(), job_types: [...profile.job_types], dine_in_category_ids: [...profile.dine_in_category_ids], online_category_ids: [...profile.online_category_ids], auto_print_new_categories: profile.auto_print_new_categories, one_item_per_ticket: profile.one_item_per_ticket, print_recipient_information: profile.print_recipient_information, hide_ticket_footer: profile.hide_ticket_footer, ticket_margins: profile.ticket_margins, print_kitchen_names: profile.print_kitchen_names, combine_identical_items: profile.combine_identical_items, ticket_layout: profile.ticket_layout, font_size: profile.font_size, item_sort_order: profile.item_sort_order, copies: profile.copies, enabled: profile.enabled };
}
/** Compare persisted profile settings; category and job selections are sets. */
export function printerProfileSignature(profile: SavePrinterProfileInput): string {
  const input = printerProfileInput(profile);
  return JSON.stringify({ ...input, job_types: [...input.job_types].sort(), dine_in_category_ids: [...input.dine_in_category_ids].sort((a,b) => a-b), online_category_ids: [...input.online_category_ids].sort((a,b) => a-b) });
}
/** Match the backend's UTF-8 byte limit without truncating user input. */
export function validPrinterProfileName(name: string): boolean { return name.trim().length > 0 && new TextEncoder().encode(name.trim()).length <= 120; }
/** Compare full assignment replacement independently of display names and order. */
export function printerAssignmentSignature(rows: SavePrinterProfileAssignmentInput[]): string { return JSON.stringify(rows.map(row => [row.device_id, row.printer_id]).sort((a,b) => a[0].localeCompare(b[0]))); }
/** Validate the physical inventory used to offer assignment choices. */
export function checkedPrintHardware(agents: PrintAgent[], printers: PrinterConfiguration[], rid: number) {
  if (!Array.isArray(agents) || !Array.isArray(printers) || agents.some(row => !row || row.restaurant_id !== rid || typeof row.spooler_id !== 'string' || !row.spooler_id || typeof row.name !== 'string' || !(row.printer_ids === null || Array.isArray(row.printer_ids) && row.printer_ids.every(id => typeof id === 'string'))) || printers.some(row => !row || row.restaurant_id !== rid || typeof row.id !== 'string' || !row.id || typeof row.name !== 'string' || typeof row.model !== 'string') || new Set(agents.map(row => row.spooler_id)).size !== agents.length || new Set(printers.map(row => row.id)).size !== printers.length) throw new Error('Invalid printer hardware');
  return { agents: agents.map(row => ({ ...row, printer_ids: row.printer_ids ?? [] })), printers };
}
