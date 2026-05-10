"use client";

import { useCallback, useRef, useState } from "react";

type Props = {
  src: string;
  focalX: number; // 0-100
  focalY: number; // 0-100
  onChange: (x: number, y: number) => void;
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function CoverFocalPicker({ src, focalX, focalY, onChange }: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const updateFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const frame = frameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      const x = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
      const y = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100);
      onChange(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
    },
    [onChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging(true);
    updateFromEvent(e.clientX, e.clientY);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    updateFromEvent(e.clientX, e.clientY);
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    setDragging(false);
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  const positionStyle = { objectPosition: `${focalX}% ${focalY}%` } as const;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-[var(--text-muted)]">
          Drag the dot to choose what stays visible when the image is cropped.
        </div>
        <div
          ref={frameRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative w-full max-w-2xl rounded-lg overflow-hidden border border-[var(--divider)] cursor-crosshair select-none touch-none"
          style={{ aspectRatio: "21 / 9" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="Cover focal picker"
            className="absolute inset-0 w-full h-full object-cover"
            style={positionStyle}
            draggable={false}
          />
          <div
            aria-hidden
            className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-white bg-brand-500 shadow-[0_0_0_2px_rgba(0,0,0,0.5)] pointer-events-none"
            style={{ left: `${focalX}%`, top: `${focalY}%` }}
          />
        </div>
      </div>

      <div className="flex items-end gap-3">
        <PreviewTile label="Desktop" ratio="21 / 9" widthClass="w-44" src={src} style={positionStyle} />
        <PreviewTile label="Mobile" ratio="4 / 5" widthClass="w-20" src={src} style={positionStyle} />
        <button
          type="button"
          onClick={() => onChange(50, 50)}
          className="ml-auto px-3 py-1.5 rounded-lg border border-[var(--divider)] text-xs font-medium hover:bg-[var(--surface-subtle)] transition"
        >
          Reset to center
        </button>
      </div>
    </div>
  );
}

function PreviewTile({
  label,
  ratio,
  widthClass,
  src,
  style,
}: {
  label: string;
  ratio: string;
  widthClass: string;
  src: string;
  style: React.CSSProperties;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div
        className={`${widthClass} rounded-md overflow-hidden border border-[var(--divider)]`}
        style={{ aspectRatio: ratio }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`${label} preview`} className="w-full h-full object-cover" style={style} />
      </div>
    </div>
  );
}
