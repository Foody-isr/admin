"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { listWebsiteFormResponses } from "@/lib/api";
import type { DraftSectionPayload, StatePath } from "@/lib/website-v3/types";
import { InspectorField, ToggleField, controlClass } from "./controls";
import { ElementInspector } from "./ElementInspector";

export const SQUARE_CONTENT_TYPES = new Set([
  "text",
  "button",
  "video",
  "embed",
  "pdf",
  "forms",
  "newsletter",
  "location_hours",
  "rss_feed",
  "featured_categories",
  "donation",
  "events",
]);
/** Contextual content controls for the Square section catalogue. */
export function SquareContentEditor({
  section,
  restaurantId,
  onChange,
}: {
  section: DraftSectionPayload;
  restaurantId: number;
  onChange: (path: StatePath, value: unknown) => void;
}) {
  const { t } = useI18n();
  const c = section.content;
  const type = section.section_type;
  const [responses, setResponses] = useState<Awaited<
    ReturnType<typeof listWebsiteFormResponses>
  > | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const update = (key: string, value: unknown) =>
    onChange(["content", key], value);
  const fields =
    type === "button"
      ? ["cta_text", "cta_link"]
      : type === "video"
        ? ["title", "video_url"]
        : type === "pdf"
          ? ["title", "file_url"]
          : type === "embed"
            ? ["code"]
            : type === "rss_feed"
              ? ["title", "feed_url"]
              : type === "location_hours"
                ? ["title"]
                : type === "featured_categories" || type === "events"
                  ? ["title"]
                  : [
                      "title",
                      ...(type === "text" ? ["subtitle"] : []),
                      "body",
                      "cta_text",
                      ...(["text", "donation"].includes(type)
                        ? ["cta_link"]
                        : []),
                    ];
  return (
    <div className="space-y-5">
      {fields.map((field) => (
        <InspectorField key={field} label={t(`editorField_${field}`)}>
          {field === "body" || field === "code" ? (
            <textarea
              className={controlClass}
              value={String(c[field] ?? "")}
              rows={field === "code" ? 10 : 4}
              onChange={(e) => update(field, e.target.value)}
            />
          ) : (
            <input
              className={controlClass}
              value={String(c[field] ?? "")}
              onChange={(e) => update(field, e.target.value)}
            />
          )}
        </InspectorField>
      ))}
      {type === "donation" && (
        <ElementInspector
          restaurantId={restaurantId}
          section={section}
          field="image_url"
          onChange={onChange}
        />
      )}
      {type === "embed" && (
        <InspectorField label={t("editorSectionHeight")}>
          <input
            className={controlClass}
            type="number"
            min={80}
            max={1600}
            value={Number(section.settings.height_px) || 400}
            onChange={(e) =>
              onChange(["settings", "height_px"], Number(e.target.value))
            }
          />
        </InspectorField>
      )}
      {type === "location_hours" &&
        ["address", "phone", "hours", "map"].map((key) => (
          <ToggleField
            key={key}
            fieldId={`section.content.show_${key}`}
            label={t(`editorLocation_${key}`)}
            checked={c[`show_${key}`] !== false}
            onChange={(value) => update(`show_${key}`, value)}
          />
        ))}
      {(type === "forms" || type === "newsletter") && (
        <>
          {(Array.isArray(c.fields) ? c.fields : []).map(
            (field: Record<string, unknown>, index: number) => (
              <div key={String(field.id)} className="border-b py-4 space-y-3">
                <InspectorField label={t("editorFormField")}>
                  <input
                    className={controlClass}
                    value={String(field.label ?? "")}
                    onChange={(e) =>
                      update(
                        "fields",
                        (c.fields as unknown[]).map((value, i) =>
                          i === index
                            ? { ...field, label: e.target.value }
                            : value,
                        ),
                      )
                    }
                  />
                </InspectorField>
                <select
                  aria-label={t("editorFormField")}
                  className={controlClass}
                  value={String(field.type || "text")}
                  onChange={(e) =>
                    update(
                      "fields",
                      (c.fields as unknown[]).map((value, i) =>
                        i === index
                          ? { ...field, type: e.target.value }
                          : value,
                      ),
                    )
                  }
                >
                  {["text", "email", "tel", "textarea", "date", "number"].map(
                    (value) => (
                      <option key={value} value={value}>
                        {t(`editorFormType_${value}`)}
                      </option>
                    ),
                  )}
                </select>
                <ToggleField
                  fieldId={`form.${field.id}.required`}
                  label={t("editorRequired")}
                  checked={Boolean(field.required)}
                  onChange={(required) =>
                    update(
                      "fields",
                      (c.fields as unknown[]).map((value, i) =>
                        i === index ? { ...field, required } : value,
                      ),
                    )
                  }
                />
                <button
                  className="sqe-button"
                  onClick={() =>
                    update(
                      "fields",
                      (c.fields as unknown[]).filter((_, i) => i !== index),
                    )
                  }
                >
                  <Trash2 size={16} />
                  {t("editorDelete")}
                </button>
              </div>
            ),
          )}
          <button
            className="sqe-button"
            disabled={Array.isArray(c.fields) && c.fields.length >= 30}
            onClick={() =>
              update("fields", [
                ...(Array.isArray(c.fields) ? c.fields : []),
                {
                  id: crypto.randomUUID(),
                  type: "text",
                  label: t("editorFormField"),
                  required: false,
                },
              ])
            }
          >
            <Plus size={16} />
            {t("editorAddField")}
          </button>
          {section.id && (
            <button
              className="sqe-button"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                setError("");
                try {
                  const page = await listWebsiteFormResponses(
                    restaurantId,
                    section.id!,
                  );
                  setResponses(page);
                  setHasMore(page.length === 100);
                } catch {
                  setError(t("editorResponsesError"));
                } finally {
                  setLoading(false);
                }
              }}
            >
              {t("editorResponses")}
            </button>
          )}
          {error && <p role="alert">{error}</p>}
          {hasMore && responses && (
            <button
              className="sqe-button"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                setError("");
                try {
                  const page = await listWebsiteFormResponses(
                    restaurantId,
                    section.id!,
                    responses[responses.length - 1].id,
                  );
                  setResponses([...responses, ...page]);
                  setHasMore(page.length === 100);
                } catch {
                  setError(t("editorResponsesError"));
                } finally {
                  setLoading(false);
                }
              }}
            >
              {t("editorLoadMoreResponses")}
            </button>
          )}
          {responses && (
            <div>
              {responses.length === 0 ? (
                <p>{t("editorNoResponses")}</p>
              ) : (
                responses.map((response) => (
                  <article className="border-b py-4" key={response.id}>
                    <time>
                      {new Date(response.created_at).toLocaleString()}
                    </time>
                    <dl>
                      {Object.entries(response.values).map(([key, value]) => (
                        <div key={key}>
                          <dt className="font-medium">
                            {String(
                              (Array.isArray(c.fields) ? c.fields : []).find(
                                (field: Record<string, unknown>) =>
                                  field.id === key,
                              )?.label ?? key,
                            )}
                          </dt>
                          <dd className="whitespace-pre-wrap break-words">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))
              )}
            </div>
          )}
        </>
      )}
      {(type === "featured_categories" || type === "events") && (
        <>
          {(Array.isArray(c.cards) ? c.cards : []).map(
            (card: Record<string, unknown>, index: number) => (
              <div key={index} className="border-b py-4 space-y-3">
                {[
                  "title",
                  "body",
                  ...(type === "events" ? ["date"] : []),
                  "link",
                  "image_url",
                ].map((key) => (
                  <InspectorField
                    key={key}
                    label={t(
                      `editorField_${key === "link" ? "cta_link" : key}`,
                    )}
                  >
                    <input
                      className={controlClass}
                      value={String(card[key] ?? "")}
                      onChange={(e) =>
                        update(
                          "cards",
                          (c.cards as unknown[]).map((value, i) =>
                            i === index
                              ? { ...card, [key]: e.target.value }
                              : value,
                          ),
                        )
                      }
                    />
                  </InspectorField>
                ))}
                <button
                  className="sqe-button"
                  onClick={() =>
                    update(
                      "cards",
                      (c.cards as unknown[]).filter((_, i) => i !== index),
                    )
                  }
                >
                  {t("editorDelete")}
                </button>
              </div>
            ),
          )}
          <button
            className="sqe-button"
            onClick={() =>
              update("cards", [
                ...(Array.isArray(c.cards) ? c.cards : []),
                { title: "", body: "", link: "", image_url: "" },
              ])
            }
          >
            <Plus size={16} />
            {t("editorAdd")}
          </button>
        </>
      )}
    </div>
  );
}
