"use client";

import { useEffect, useState } from "react";
import {
  previewPreparation,
  type PreparationPreviewInput,
  type PreparationPreviewResponse,
} from "@/lib/api";
import { preparationDuration } from "@/lib/item-preparation";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ds";

/** Shows real service availability for the editor values, without persisting them. */
export default function PreparationPreview({
  rid,
  input,
  dirty,
}: {
  rid: number;
  input: PreparationPreviewInput | null;
  dirty: boolean;
}) {
  const { t, locale } = useI18n();
  const key = input ? JSON.stringify(input) : null;
  const [retry, setRetry] = useState(0);
  const [preview, setPreview] = useState<{
    key: string | null;
    status: "loading" | "ready" | "error";
    result?: PreparationPreviewResponse;
  }>({ key: null, status: "loading" });
  useEffect(() => {
    let current = true;
    setPreview({ key, status: "loading" });
    if (!key) return;
    const timer = setTimeout(() => {
      void previewPreparation(rid, JSON.parse(key))
        .then((result) => {
          if (
            !result ||
            !Number.isFinite(Date.parse(result.ordered_at)) ||
            !result.timezone ||
            result.lead_time_minutes !== input?.scheduling_lead_time_minutes ||
            !Array.isArray(result.services) ||
            result.services.length !== 2 ||
            result.services.some(
              (service) =>
                !["pickup", "delivery"].includes(service.order_type) ||
                typeof service.enabled !== "boolean" ||
                (service.first_slot &&
                  (!/^\d{4}-\d{2}-\d{2}$/.test(service.first_slot.date) ||
                    !/^\d{2}:\d{2}$/.test(service.first_slot.start) ||
                    !/^\d{2}:\d{2}$/.test(service.first_slot.end))),
            )
          )
            throw new Error("Incomplete preparation preview");
          if (current) setPreview({ key, status: "ready", result });
        })
        .catch(() => {
          if (current) setPreview({ key, status: "error" });
        });
    }, 400);
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // The serialized input guards against stale responses and unrelated editor renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rid, key, retry]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible")
        setRetry((value) => value + 1);
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const result =
    preview.key === key && preview.status === "ready"
      ? preview.result
      : undefined;
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: "UTC",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(`${date}T12:00:00Z`));
  return (
    <section
      aria-label={t("preparationPreviewTitle")}
      className="rounded-r-md border border-[var(--line)] bg-[var(--summary-bg)] p-4 text-sm leading-6"
      data-preparation-preview
    >
      <h3 className="font-semibold">{t("preparationPreviewTitle")}</h3>
      <p>{t(dirty ? "preparationPreviewDraft" : "preparationPreviewSaved")}</p>
      {!key ? (
        <p role="status">{t("preorderPreviewIncomplete")}</p>
      ) : preview.key !== key || preview.status === "loading" ? (
        <p role="status">{t("loading")}</p>
      ) : preview.status === "error" ? (
        <div role="alert">
          <p>{t("preorderPreviewFailed")}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            {t("retry")}
          </Button>
        </div>
      ) : (
        result && (
          <>
            <p className="mt-3">
              {t("preparationPreviewOrderedAt")}{" "}
              <bdi>
                {dateLabel(result.ordered_at.slice(0, 10))} ·{" "}
                {result.ordered_at.slice(11, 16)}
              </bdi>{" "}
              · <bdi>{result.timezone}</bdi>
            </p>
            <p>
              {t("preparationPreviewDelay")}{" "}
              <bdi>{preparationDuration(result.lead_time_minutes, locale)}</bdi>
            </p>
            <p>
              {t(`preparationClock_${result.preparation_time_basis}`)}
              {result.preparation_time_basis === "custom_start" && (
                <>
                  {" "}
                  · <bdi>{result.preparation_start_time}</bdi>
                </>
              )}
              {result.preparation_time_basis !== "elapsed" && (
                <>
                  {" "}
                  ·{" "}
                  {t(
                    result.preparation_splittable
                      ? "preparationPreviewSplit"
                      : "preparationPreviewSingle",
                  )}
                </>
              )}
            </p>
            <ul className="mt-3 space-y-3">
              {result.services.map((service) => (
                <li key={service.order_type}>
                  <p className="font-semibold">{t(service.order_type)}</p>
                  {!service.enabled ? (
                    <p>{t("preparationPreviewDisabled")}</p>
                  ) : service.first_slot ? (
                    <>
                      <p>
                        {t("preparationPreviewFirst")}{" "}
                        <bdi>
                          {dateLabel(service.first_slot.date)} ·{" "}
                          {service.first_slot.start}–{service.first_slot.end}
                        </bdi>
                      </p>
                      {service.service_hours?.open &&
                        service.service_hours.close && (
                          <p>
                            {t(
                              service.hours_defaulted
                                ? "preparationPreviewDefaultHours"
                                : "preparationPreviewServiceHours",
                            )}{" "}
                            <bdi>
                              {service.service_hours.open}–
                              {service.service_hours.close}
                            </bdi>
                          </p>
                        )}
                    </>
                  ) : (
                    <p>{t("preparationPreviewEmpty")}</p>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[var(--fg-muted)]">
              {t("preparationPreviewProducts")}
            </p>
          </>
        )
      )}
    </section>
  );
}
