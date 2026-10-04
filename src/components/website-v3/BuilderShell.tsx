"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ExternalLink,
  Monitor,
  MoreHorizontal,
  Redo2,
  Smartphone,
  Undo2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { AutosaveStatus } from "@/lib/website-v3/autosave";
import type { PreviewDevice } from "@/lib/website-v3/types";

/** Houses the contextual editor and the persistent live preview. */
export function BuilderShell({
  status,
  previewStatus,
  device,
  publicUrl,
  publishBlockedReason,
  busy,
  onDeviceChange,
  onDiscard,
  onPublish,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  sidebar,
  preview,
  previewOnly,
  onPreviewChange,
}: {
  status: AutosaveStatus;
  previewStatus: "syncing" | "synced" | "stale";
  device: PreviewDevice;
  publicUrl: string | null;
  publishBlockedReason: string | null;
  busy: boolean;
  onDeviceChange: (device: PreviewDevice) => void;
  onDiscard: () => void;
  onPublish: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  sidebar: ReactNode;
  preview: ReactNode;
  previewOnly: boolean;
  onPreviewChange: (value: boolean) => void;
}) {
  const { t, direction } = useI18n();
  const [deviceMenu, setDeviceMenu] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDeviceMenu(false);
        if (previewOnly) onPreviewChange(false);
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input,textarea,select,[role="dialog"]'))
      )
        return;
      if (
        (!event.metaKey && !event.ctrlKey) ||
        event.key.toLowerCase() !== "z" ||
        busy ||
        previewOnly
      )
        return;
      if (event.shiftKey ? canRedo : canUndo) {
        event.preventDefault();
        if (event.shiftKey) onRedo();
        else onUndo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, canRedo, canUndo, onPreviewChange, onRedo, onUndo, previewOnly]);
  const statusText =
    status === "error"
      ? t("editorSaveError")
      : status === "saving"
        ? t("editorSaving")
        : previewStatus === "stale"
          ? t("editorPreviewStale")
          : t("editorSaved");
  return (
    <div
      className={`sqe ${previewOnly ? "sqe--preview" : ""}`}
      dir={direction}
      data-testid="website-editor"
    >
      <aside className="sqe-sidebar" hidden={previewOnly}>
        {sidebar}
      </aside>
      <div className="sqe-workspace">
        <header className="sqe-toolbar">
          <div className="sqe-device-wrap">
            <button
              className="sqe-button sqe-icon-button"
              aria-label={t("editorDevice")}
              aria-expanded={deviceMenu}
              onClick={() => setDeviceMenu(!deviceMenu)}
            >
              {device === "desktop" ? (
                <Monitor size={18} />
              ) : (
                <Smartphone size={18} />
              )}
              <ChevronDown size={14} />
            </button>
            {deviceMenu && (
              <>
                <button
                  className="sqe-dismiss"
                  aria-label={t("editorClose")}
                  onClick={() => setDeviceMenu(false)}
                />
                <div className="sqe-menu" role="menu">
                  {(["desktop", "mobile"] as const).map((value) => (
                    <button
                      key={value}
                      role="menuitemradio"
                      aria-checked={device === value}
                      onClick={() => {
                        onDeviceChange(value);
                        setDeviceMenu(false);
                      }}
                    >
                      {value === "desktop" ? (
                        <Monitor size={18} />
                      ) : (
                        <Smartphone size={18} />
                      )}
                      {t(
                        value === "desktop" ? "editorDesktop" : "editorMobile",
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {!previewOnly && (
            <div className="sqe-history">
              <button
                className="sqe-icon-button"
                disabled={!canUndo || busy}
                onClick={onUndo}
                title={t("editorUndo")}
                aria-label={t("editorUndo")}
              >
                <Undo2 size={18} />
              </button>
              <button
                className="sqe-icon-button"
                disabled={!canRedo || busy}
                onClick={onRedo}
                title={t("editorRedo")}
                aria-label={t("editorRedo")}
              >
                <Redo2 size={18} />
              </button>
            </div>
          )}
          <span
            className={`sqe-save-status ${status === "error" ? "sqe-save-status--error" : ""}`}
            role="status"
          >
            {statusText}
          </span>
          <div className="sqe-toolbar-actions">
            <details className="sqe-more">
              <summary className="sqe-icon-button" aria-label={t("editorMore")}>
                <MoreHorizontal size={20} />
              </summary>
              <div className="sqe-menu">
                {publicUrl && (
                  <a href={publicUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} />
                    {t("editorViewSite")}
                  </a>
                )}
                <button disabled={busy} onClick={onDiscard}>
                  {t("editorDiscard")}
                </button>
              </div>
            </details>
            <button
              className="sqe-button"
              onClick={() => onPreviewChange(!previewOnly)}
            >
              {t(previewOnly ? "editorClosePreview" : "editorPreview")}
            </button>
            <button
              className="sqe-button sqe-button--primary"
              disabled={busy}
              onClick={onPublish}
              title={publishBlockedReason ?? undefined}
            >
              {t("editorPublish")}
            </button>
          </div>
        </header>
        <main className="sqe-canvas">{preview}</main>
      </div>
    </div>
  );
}
