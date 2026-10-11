import type { HeaderElement } from "./header";
import {
  pageKey,
  type DraftStatePayload,
  type DraftPagePayload,
} from "./types";

export type OrderEditorRegion = "order-banner" | "order-items" | "order-fulfillment" | "order-journey";

export type RailSelection =
  | { kind: "site"; pageKey?: string; region?: "header" | "footer" | "footer-branding"; headerElement?: HeaderElement }
  | { kind: "page"; key: string; region?: OrderEditorRegion | "catering-content" | "branch-selector" }
  | { kind: "section"; pageKey: string; sectionKey: string; field?: string };

/** Keeps the current page visible when opening its shared header or footer. */
export function resolveSelectedPage(
  state: DraftStatePayload,
  selection: RailSelection,
): DraftPagePayload | null {
  const key = selection.kind === "page" ? selection.key : selection.pageKey;
  return (
    state.pages.find((page) => pageKey(page) === key) ??
    (selection.kind === "site"
      ? state.pages.find((page) => page.type === "landing")
      : undefined) ??
    state.pages[0] ??
    null
  );
}

/** Only menu regions are passed through to the order block editor and iframe. */
export function selectedOrderRegion(selection: RailSelection): OrderEditorRegion | undefined {
  return selection.kind === "page" && selection.region?.startsWith("order-")
    ? selection.region as OrderEditorRegion : undefined;
}
