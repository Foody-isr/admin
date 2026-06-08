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
    return {
      name: s.name || `Choice ${i + 1}`,
      description: s.description || '',
      min_picks: s.min_picks,
      max_picks: s.max_picks,
      sort_order: i,
      source_type: s.source_type,
      source_group_id: isGroup ? s.source_group_id : undefined,
      source_variant_label: isGroup ? (s.source_variant_label || null) : null,
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
