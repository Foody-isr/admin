import type { ItemType, PricingMode, MenuItemCustomerFacts } from '@/lib/api';
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
  portion: string;
  categoryId: number;
  isActive: boolean;
  itemType: ItemType;
  comboSteps: ComboStepDraft[];
  selectedGroupIds: number[];
  selectedModifierSetIds: number[];
  variantGroups: VariantGroupState[];
  activeTab: MenuItemSection;
  // Optional for backward compatibility with existing version-1 drafts.
  pricingMode?: PricingMode;
  pricePerKg?: number;
  estimatedWeightGrams?: number;
  aiContext?: string;
  customerFacts?: MenuItemCustomerFacts;
  allowNotes?: boolean;
  comboAllowQuantity?: boolean;
}

export type ItemDraftInput = Omit<ItemDraft, 'version' | 'savedAt'>;

function keyFor(rid: number): string {
  return `${STORAGE_PREFIX}${rid}`;
}

export function isMeaningfulDraft(input: ItemDraftInput): boolean {
  return (
    input.pricingMode === 'by_weight' || (input.pricePerKg ?? 0) > 0 || !!input.aiContext?.trim() ||
    input.allowNotes === false || input.comboAllowQuantity === false ||
    !!input.customerFacts?.ingredients?.some(ingredient => ingredient.name.trim()) ||
    !!input.customerFacts?.allergens?.length || !!input.customerFacts?.may_contain?.length ||
    !!input.customerFacts?.dietary_tags?.length || !!input.customerFacts?.complete ||
    !!input.portion?.trim() || !input.isActive || input.itemType === 'combo' ||
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
    clearItemDraft(rid);
    return null;
  }
}

/** Stores a recoverable draft and reports unavailable browser storage. */
export function saveItemDraft(rid: number, input: ItemDraftInput): boolean {
  if (typeof window === 'undefined') return false;
  if (!isMeaningfulDraft(input)) return clearItemDraft(rid);
  const draft: ItemDraft = {
    version: CURRENT_VERSION,
    savedAt: Date.now(),
    ...input,
  };
  try {
    window.localStorage.setItem(keyFor(rid), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/** Removes the local draft and reports browser storage failures. */
export function clearItemDraft(rid: number): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.removeItem(keyFor(rid));
    return true;
  } catch {
    return false;
  }
}
