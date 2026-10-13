"use client";

import { useRef, useState } from "react";
import { uploadSectionVideo } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { InspectorField, controlClass } from "./controls";

/** Uploads restaurant-scoped videos for standalone sections and hero covers. */
export function VideoUploadField({
  restaurantId,
  currentUrl,
  posterUrl,
  cover = true,
  onUploaded,
  onRemove,
}: {
  restaurantId: number;
  currentUrl: string;
  posterUrl: string;
  cover?: boolean;
  onUploaded: (url: string) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!["video/mp4", "video/webm"].includes(file.type)) {
      setError(t("editorVideoInvalidType"));
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError(t("editorVideoTooLarge"));
      return;
    }
    setUploading(true);
    try {
      onUploaded(await uploadSectionVideo(restaurantId, file));
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : t("uploadFailed"),
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2" aria-busy={uploading}>
      <div>
        <p className="text-xs font-semibold text-slate-600">
          {t(cover ? "editorVideoCover" : "editorVideo")}
        </p>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
          {t("editorVideoUploadHint")}
          {cover ? ` ${t("editorVideoCoverHint")}` : ""}
        </p>
      </div>
      {currentUrl ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
          <video
            src={currentUrl}
            poster={posterUrl || undefined}
            muted={cover}
            loop={cover}
            playsInline
            controls
            preload="metadata"
            className="max-h-44 w-full object-cover"
          />
          <div className="flex gap-2 bg-white p-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {t(uploading ? "editorVideoUploading" : "replace")}
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => {
                setError(null);
                onRemove();
              }}
              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-50"
            >
              {t("editorDelete")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-xl border-2 border-dashed border-slate-200 px-3 py-6 text-sm font-semibold text-slate-600 hover:border-[#315fce] hover:text-[#315fce] disabled:opacity-50"
        >
          {t(uploading ? "editorVideoUploading" : "editorVideoAdd")}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm"
        aria-label={t("editorVideoAdd")}
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void upload(file);
        }}
        className="hidden"
      />
      <InspectorField label={t("editorField_video_url")}>
        <input
          type="url"
          data-field-id="section.content.video_url"
          value={currentUrl}
          disabled={uploading}
          onChange={(event) => {
            setError(null);
            onUploaded(event.target.value);
          }}
          className={controlClass}
          placeholder={t("editorVideoUrlPlaceholder")}
        />
      </InspectorField>
      {error ? (
        <p role="alert" className="text-xs text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
