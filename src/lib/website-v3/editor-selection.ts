import type { HeaderElement } from "./header";
import {
  pageKey,
  type DraftStatePayload,
  type DraftPagePayload,
} from "./types";

export type OrderEditorRegion = "order-banner" | "order-items" | "order-fulfillment";

export type RailSelection =
  | { kind: "site"; pageKey?: string; region?: "header" | "footer" | "footer-branding"; headerElement?: HeaderElement }
  | { kind: "page"; key: string; region?: OrderEditorRegion }
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
