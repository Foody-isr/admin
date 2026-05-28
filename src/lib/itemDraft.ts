import type { ItemType } from '@/lib/api';
import type { ComboStepDraft } from '@/components/menu-item/combo/types';
import type { VariantGroupState } from '@/components/menu-item/VariantsEditor';
import type { MenuItemSection } from '@/components/menu-item/TabBar';

const STORAGE_PREFIX = 'foody.menu.itemDraft.';
const CURRENT_VERSION = 1;
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ItemDraft {
  version: number;
  savedAt: number;
  name: string;
  price: number;
  description: string;
  categoryId: number;
  isActive: boolean;
  itemType: ItemType;
  comboSteps: ComboStepDraft[];
  selectedGroupIds: number[];
  selectedModifierSetIds: number[];
  variantGroups: VariantGroupState[];
  activeTab: MenuItemSection;
}

export type ItemDraftInput = Omit<ItemDraft, 'version' | 'savedAt'>;

function keyFor(rid: number): string {
  return `${STORAGE_PREFIX}${rid}`;
}

export function isMeaningfulDraft(input: ItemDraftInput): boolean {
  return (
    input.name.trim().length > 0 ||
    input.price > 0 ||
    input.description.trim().length > 0 ||
    input.comboSteps.length > 0 ||
    input.selectedGroupIds.length > 0 ||
    input.selectedModifierSetIds.length > 0 ||
    input.variantGroups.length > 0
  );
}

export function loadItemDraft(rid: number): ItemDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(keyFor(rid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ItemDraft;
    if (parsed.version !== CURRENT_VERSION) {
      window.localStorage.removeItem(keyFor(rid));
      return null;
    }
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      window.localStorage.removeItem(keyFor(rid));
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(keyFor(rid));
    return null;
  }
}

export function saveItemDraft(rid: number, input: ItemDraftInput): void {
  if (typeof window === 'undefined') return;
  if (!isMeaningfulDraft(input)) {
    clearItemDraft(rid);
    return;
  }
  const draft: ItemDraft = {
    version: CURRENT_VERSION,
    savedAt: Date.now(),
    ...input,
  };
  try {
    window.localStorage.setItem(keyFor(rid), JSON.stringify(draft));
  } catch {
    // Quota or serialization issue — silently drop. Draft is best-effort.
  }
}

export function clearItemDraft(rid: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(keyFor(rid));
  } catch {
    // ignore
  }
}
