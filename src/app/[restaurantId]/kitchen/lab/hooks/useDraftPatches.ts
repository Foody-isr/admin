import type { DraftPayload, ChatPatch, Component } from '../types';

/**
 * applyPatches — immutably applies a sequence of ChatPatch operations to a
 * DraftPayload, returning the updated payload.
 *
 * Each patch is applied in order; the output of one patch is fed as the input
 * to the next, so the caller simply does:
 *
 *   const next = applyPatches(current, patches);
 *   setPayload(next);
 */
export function applyPatches(payload: DraftPayload, patches: ChatPatch[]): DraftPayload {
  let next = payload;
  for (const p of patches) next = applyPatch(next, p);
  return next;
}

/**
 * applyPatch — applies a single ChatPatch.
 *
 * Supported path forms:
 *   "components"           — top-level array (add only)
 *   "components[i]"        — a specific top-level component
 *   "components[i].ingredients[j]" — a specific ingredient inside a component
 */
function applyPatch(payload: DraftPayload, patch: ChatPatch): DraftPayload {
  const m = patch.path.match(/^components(?:\[(\d+)\])?(?:\.ingredients\[(\d+)\])?$/);
  if (!m) return payload;

  const i = m[1] !== undefined ? parseInt(m[1], 10) : -1;
  const j = m[2] !== undefined ? parseInt(m[2], 10) : -1;

  // ── op === 'add' on the top-level components array ──────────────────────
  if (patch.op === 'add' && i < 0 && j < 0 && patch.value) {
    return { ...payload, components: [...payload.components, patch.value as Component] };
  }

  if (i < 0) return payload;

  const components = [...payload.components];

  // ── Nested ingredient ops (j >= 0) ─────────────────────────────────────
  if (j >= 0) {
    const target = components[i];
    if (!target || !target.ingredients) return payload;
    const ings = [...target.ingredients];

    if (patch.op === 'remove') {
      ings.splice(j, 1);
    } else if (patch.op === 'set_qty') {
      ings[j] = {
        ...ings[j],
        qty: patch.new_qty ?? ings[j].qty,
        unit: patch.new_unit ?? ings[j].unit,
      };
    } else if (patch.op === 'swap_ingredient' && patch.value) {
      ings[j] = patch.value as Component;
    } else if (patch.op === 'add' && patch.value) {
      ings.push(patch.value as Component);
    }

    components[i] = { ...target, ingredients: ings };
    return { ...payload, components };
  }

  // ── Top-level component ops (i >= 0, j < 0) ────────────────────────────
  if (patch.op === 'remove') {
    components.splice(i, 1);
  } else if (patch.op === 'set_qty') {
    components[i] = {
      ...components[i],
      qty: patch.new_qty ?? components[i].qty,
      unit: patch.new_unit ?? components[i].unit,
    };
  } else if (patch.op === 'swap_ingredient' && patch.value) {
    components[i] = patch.value as Component;
  } else if (patch.op === 'regenerate_subtree' && patch.value) {
    components[i] = patch.value as Component;
  }

  return { ...payload, components };
}
