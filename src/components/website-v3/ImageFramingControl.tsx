"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useI18n } from "@/lib/i18n";
import {
  DEFAULT_IMAGE_FRAME,
  imageFrameRect,
  normalizeImageFraming,
  type ImageFrame,
  type ImageFraming,
} from "@/lib/website-v3/image-framing";
const COPY = {
  fr: {
    title: "Cadrer l’image",
    desktop: "Bureau",
    mobile: "Mobile",
    fit: "Affichage",
    cover: "Remplir le cadre",
    contain: "Image entière",
    zoom: "Zoom",
    x: "Position horizontale",
    y: "Position verticale",
    reset: "Réinitialiser",
    inherit: "Utiliser le cadrage bureau",
    hint: "Déplacez l’image dans le cadre ou utilisez les curseurs. Les réglages mobile sont indépendants.",
    preview: "Aperçu du cadrage",
    empty: "Impossible de charger l’image.",
  },
  en: {
    title: "Frame image",
    desktop: "Desktop",
    mobile: "Mobile",
    fit: "Display",
    cover: "Fill the frame",
    contain: "Entire image",
    zoom: "Zoom",
    x: "Horizontal position",
    y: "Vertical position",
    reset: "Reset",
    inherit: "Use desktop framing",
    hint: "Drag the image or use the sliders. Mobile framing is independent.",
    preview: "Framing preview",
    empty: "Unable to load image.",
  },
  he: {
    title: "מסגור תמונה",
    desktop: "מחשב",
    mobile: "נייד",
    fit: "תצוגה",
    cover: "מילוי המסגרת",
    contain: "התמונה כולה",
    zoom: "זום",
    x: "מיקום אופקי",
    y: "מיקום אנכי",
    reset: "איפוס",
    inherit: "שימוש במסגור המחשב",
    hint: "גררו את התמונה או השתמשו במחוונים. המסגור בנייד נפרד.",
    preview: "תצוגה מקדימה",
    empty: "לא ניתן לטעון את התמונה.",
  },
};
/** Provides accessible pan/zoom controls without modifying the uploaded image. */
export function ImageFramingControl({
  src,
  value,
  onChange,
  desktopRatio = 3,
  mobileRatio = 1.4,
}: {
  src: string;
  value: unknown;
  onChange: (value: ImageFraming | undefined) => void;
  desktopRatio?: number;
  mobileRatio?: number;
}) {
  const { locale } = useI18n(),
    c = COPY[locale as keyof typeof COPY] || COPY.fr;
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({
    width: 280,
    height: 280 / desktopRatio,
  });
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r?.width && r.height) setBounds({ width: r.width, height: r.height });
    });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, [src]);
  const drag = useRef<{
    x: number;
    y: number;
    frame: ImageFrame;
    dx: number;
    dy: number;
  } | null>(null);
  const framing = normalizeImageFraming(value),
    frame = framing?.[device] || framing?.desktop || DEFAULT_IMAGE_FRAME;
  const patch = (next: Partial<ImageFrame>) =>
    onChange({
      desktop: framing?.desktop || DEFAULT_IMAGE_FRAME,
      ...(!framing && device === "desktop"
        ? { mobile: DEFAULT_IMAGE_FRAME }
        : {}),
      ...framing,
      [device]: { ...frame, ...next },
    });
  const start = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const rect = imageFrameRect(
      bounds.width,
      bounds.height,
      natural.width,
      natural.height,
      frame,
    );
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      frame,
      dx: bounds.width - rect.width,
      dy: bounds.height - rect.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const rect = imageFrameRect(
    bounds.width || 280,
    bounds.height || 280 / (device === "desktop" ? desktopRatio : mobileRatio),
    natural.width,
    natural.height,
    frame,
  );
  if (!src) return null;
  return (
    <details className="sqe-image-framing rounded-xl border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        {c.title}
      </summary>
      <div className="mt-3 space-y-3">
        <div className="flex gap-2">
          {(["desktop", "mobile"] as const).map((d) => (
            <button
              type="button"
              key={d}
              aria-pressed={device === d}
              onClick={() => setDevice(d)}
              className={`flex-1 rounded-lg border px-2 py-2 text-xs ${device === d ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"}`}
            >
              {c[d]}
            </button>
          ))}
        </div>
        <div
          ref={host}
          aria-label={c.preview}
          style={{
            aspectRatio: device === "desktop" ? desktopRatio : mobileRatio,
            position: "relative",
            overflow: "hidden",
            touchAction: "none",
            cursor: "grab",
            background:
              "repeating-conic-gradient(#e2e8f0 0% 25%, #f8fafc 0% 50%) 50% / 16px 16px",
          }}
          onPointerDown={start}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            patch({
              x: Math.max(
                0,
                Math.min(
                  100,
                  d.frame.x +
                    (Math.abs(d.dx) > 1 ? ((e.clientX - d.x) / d.dx) * 100 : 0),
                ),
              ),
              y: Math.max(
                0,
                Math.min(
                  100,
                  d.frame.y +
                    (Math.abs(d.dy) > 1 ? ((e.clientY - d.y) / d.dy) * 100 : 0),
                ),
              ),
            });
          }}
        >
          <img
            key={src}
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) => {
              setNatural({
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              });
              setFailed(false);
            }}
            onError={() => setFailed(true)}
            style={{
              position: "absolute",
              maxWidth: "none",
              ...rect,
              pointerEvents: "none",
            }}
          />
        </div>
        {failed && (
          <p role="alert" className="text-xs text-red-600">
            {c.empty}
          </p>
        )}
        <label className="block text-xs">
          {c.fit}
          <select
            aria-label={c.fit}
            value={frame.fit}
            onChange={(e) =>
              patch({ fit: e.target.value as ImageFrame["fit"] })
            }
            className="mt-1 w-full rounded-lg border border-slate-200 p-2"
          >
            <option value="cover">{c.cover}</option>
            <option value="contain">{c.contain}</option>
          </select>
        </label>
        {(["zoom", "x", "y"] as const).map((key) => (
          <label key={key} className="block text-xs">
            {c[key]}{" "}
            <output>
              {Math.round(frame[key] * (key === "zoom" ? 100 : 1))}%
            </output>
            <input
              aria-label={c[key]}
              className="block w-full"
              type="range"
              min={key === "zoom" ? 0.5 : 0}
              max={key === "zoom" ? 3 : 100}
              step={key === "zoom" ? 0.01 : 1}
              value={frame[key]}
              onChange={(e) => patch({ [key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="text-xs underline"
            onClick={() => {
              if (device === "desktop")
                onChange(
                  framing?.mobile
                    ? { ...framing, desktop: DEFAULT_IMAGE_FRAME }
                    : undefined,
                );
              else patch(DEFAULT_IMAGE_FRAME);
            }}
          >
            {c.reset}
          </button>
          {device === "mobile" && (
            <button
              type="button"
              className="text-xs underline"
              onClick={() =>
                onChange(framing ? { desktop: framing.desktop } : undefined)
              }
            >
              {c.inherit}
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">{c.hint}</p>
      </div>
    </details>
  );
}
