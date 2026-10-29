/** Semantic elements shared with the public renderer's editor interaction contract. */
export const EDITOR_ELEMENTS: Record<string, readonly string[]> = {
  hero_banner: ["headline", "subheadline", "cta_text", "image_url"],
  text_and_image: ["title", "body", "image_url", "cta_text"],
  text: ["title", "subtitle", "body", "cta_text"],
  button: ["cta_text"],
  menu_highlights: ["title", "subtitle", "cta_text"],
  featured_menu: ["title", "subtitle", "cta_text"],
  scrolling_text: ["text"],
  animated_text: ["text"],
  donation: ["title", "body", "cta_text", "image_url"],
  promo_banner: ["title", "body", "image_url"],
};

/** Rejects unknown fields; preview messages must never become arbitrary draft paths. */
export function isEditorElement(type: string, field: unknown): field is string {
  return (
    typeof field === "string" &&
    ((type === "hero_banner" && /^slides\.[0-5]\.(headline|subheadline|cta_text|image_url)$/.test(field)) ||
    (Array.isArray(EDITOR_ELEMENTS[type]) && EDITOR_ELEMENTS[type].includes(field)))
  );
}

/** Only plain text is editable in the canvas; media keeps its upload workflow. */
export function isInlineTextElement(
  type: string,
  field: unknown,
): field is string {
  return isEditorElement(type, field) && field !== "image_url" && !field.endsWith(".image_url");
}

/** Resolves only whitelisted campaign fields to bounded array paths. */
export function editorElementContentPath(type: string, field: string): (string | number)[] {
  if (!isEditorElement(type,field)) return [];
  const nested = /^slides\.([0-5])\.(headline|subheadline|cta_text|image_url)$/.exec(field);
  return nested ? ["slides",Number(nested[1]),nested[2]] : [field];
}

/** Validates a canvas edit against the latest value, preventing stale edits from overwriting undo or reload. */
export function acceptsInlineEdit(
  section: { section_type: string; content: Record<string, unknown> },
  data: { field?: unknown; value?: unknown; previousValue?: unknown },
): data is { field: string; value: string; previousValue: string } {
  const path = typeof data.field === "string" ? editorElementContentPath(section.section_type,data.field) : [];
  const current = path.reduce<unknown>((value,key) => value && typeof value === "object" ? (value as Record<string | number, unknown>)[key] : undefined,section.content);
  return (
    isInlineTextElement(section.section_type, data.field) &&
    typeof data.value === "string" &&
    data.value.length <= 10000 &&
    typeof data.previousValue === "string" &&
    (path.length === 1 || current !== undefined) &&
    String(current ?? "") === data.previousValue
  );
}
