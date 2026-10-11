"use client";

import { useI18n } from "@/lib/i18n";
import { InspectorGroup } from "./controls";

/** Offers footer creation from both the shared site and dedicated footer panels. */
export function MissingFooter({ onCreate }: { onCreate: () => void }) {
  const { t } = useI18n();
  return (
    <InspectorGroup title={t("editorFooter")} description={t("editorNoFooter")}>
      <button type="button" className="sqe-button" onClick={onCreate}>
        {t("editorAddFooter")}
      </button>
    </InspectorGroup>
  );
}
