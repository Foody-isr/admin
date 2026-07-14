// Serialize combo draft steps to the server's ComboStepInput shape.
//
// Shared by the create (new) and edit ([itemId]) item pages so the dynamic-mode
// rules live in one place. Dynamic steps (category/group) drop their explicit
// items and carry their source binding + optional size pin; explicit steps
// carry their item rows.

import type { ComboStepInput } from '@/lib/api';
import type { ComboStepDraft } from './types';

export function toComboStepInputs(steps: ComboStepDraft[]): ComboStepInput[] {
  return steps.map((s, i) => {
    const isGroup = s.source_type === 'group';
    // Per-size rules and a single force-pin are mutually exclusive. When rules
    // are present, drop the single label so the server enters customer-choice
    // mode; otherwise keep the legacy single-pin behaviour.
    const variantRules = isGroup
      ? (s.variant_rules ?? []).filter((r) => r.variant_label.trim() !== '')
      : [];
    return {
      name: s.name || `Choice ${i + 1}`,
      description: s.description || '',
      min_picks: s.min_picks,
      max_picks: s.max_picks,
      sort_order: i,
      source_type: s.source_type,
      source_group_id: isGroup ? s.source_group_id : undefined,
      source_variant_label:
        isGroup && variantRules.length === 0 ? (s.source_variant_label || null) : null,
      variant_rules: variantRules.map((r, ri) => ({
        variant_label: r.variant_label.trim(),
        min_picks: r.min_picks,
        max_picks: r.max_picks,
        sort_order: ri,
      })),
      max_per_item: s.max_per_item && s.max_per_item > 0 ? s.max_per_item : 0,
      item_limits: (s.item_limits ?? [])
        .filter((l) => l.menu_item_id > 0)
        .map((l) => ({ menu_item_id: l.menu_item_id, max_qty: Math.max(0, l.max_qty) })),
      items: isGroup
        ? []
        : s.items.map((si) => ({
            menu_item_id: si.menu_item_id,
            option_id: si.variant_id || undefined,
            price_delta: si.price_delta,
            force_off_carte: si.force_off_carte ?? true,
          })),
    };
  });
}
