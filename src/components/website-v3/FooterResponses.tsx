"use client";
import { useState } from "react";
import { listWebsiteFormResponses } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

/** Lists saved footer subscriptions through the restaurant-scoped form API. */
export function FooterResponses({
  restaurantId,
  sectionId,
}: {
  restaurantId: number;
  sectionId?: number;
}) {
  const { t } = useI18n();
  const [responses, setResponses] = useState<Awaited<
    ReturnType<typeof listWebsiteFormResponses>
  > | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [more, setMore] = useState(false);
  if (!sectionId || !restaurantId) return null;
  const load = async (append = false) => {
    setBusy(true);
    setError(false);
    try {
      const page = await listWebsiteFormResponses(
        restaurantId,
        sectionId,
        append ? responses?.at(-1)?.id : undefined,
      );
      setResponses(append ? [...(responses ?? []), ...page] : page);
      setMore(page.length === 100);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <button
        type="button"
        className="sqe-button"
        disabled={busy}
        onClick={() => void load()}
      >
        {t("editorResponses")}
      </button>
      {error && <p role="alert">{t("editorResponsesError")}</p>}
      {responses?.length === 0 && <p>{t("editorNoResponses")}</p>}
      {responses?.map((response) => (
        <article className="border-b py-3 break-words" key={response.id}>
          <time>{new Date(response.created_at).toLocaleString()}</time>
          <p>{response.values.email}</p>
        </article>
      ))}
      {more && (
        <button
          type="button"
          className="sqe-button"
          disabled={busy}
          onClick={() => void load(true)}
        >
          {t("editorLoadMoreResponses")}
        </button>
      )}
    </div>
  );
}
