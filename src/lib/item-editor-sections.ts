/** Fields owned by each section of the continuous item editor. */
const SECTION_FIELDS: Record<string, readonly string[]> = {
  information: ['name', 'description', 'itemType'],
  pricing: [
    'price',
    'pricingMode',
    'pricePerKg',
    'estimatedWeightGrams',
    'portion',
    'variantGroups',
  ],
  personalizations: ['allowNotes', 'selectedModifierSetIds'],
  composition: ['comboSteps', 'comboAllowQuantity'],
  'customer-facts': ['customerFacts'],
  assistant: ['aiContext'],
};

/** Compares persisted form snapshots, ignoring navigation and field interaction. */
export function changedItemSections(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  return Object.entries(SECTION_FIELDS)
    .filter(([section, fields]) => {
      const translationFields =
        section === 'information'
          ? ['name', 'description']
          : section === 'pricing'
            ? ['portion']
            : [];
      const beforeTranslations = before.translations as
        | Record<string, unknown>
        | undefined;
      const afterTranslations = after.translations as
        | Record<string, unknown>
        | undefined;
      return (
        fields.some(
          (field) =>
            JSON.stringify(before[field]) !== JSON.stringify(after[field]),
        ) ||
        translationFields.some(
          (field) =>
            JSON.stringify(beforeTranslations?.[field]) !==
            JSON.stringify(afterTranslations?.[field]),
        )
      );
    })
    .map(([section]) => section);
}
