"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * SelectionOverlay — direct-selection layer drawn ABOVE the live preview
 * iframe. Receives section bounds from the iframe via postMessage and
 * renders hover/selection outlines + a floating toolbar.
 *
 * The overlay div is `pointer-events: none` by default; only the toolbar
 * buttons capture events. Clicks on the body of a section pass through to
 * the iframe (where SectionRenderer's wrapper handles them and emits
 * `foody-section-click`).
 */

export type SectionBounds = {
  id: number | string;
  top: number;
  left: number;
  width: number;
  height: number;
};

type Props = {
  /** Position relative to the iframe element (the overlay sits over it). */
  iframeRect: { top: number; left: number; width: number; height: number } | null;
  /** Scale factor — iframe content may be at a different visual size than
   *  its document size (e.g. desktop content scaled into a mobile frame). */
  scale: number;
  /** Currently selected section's id (positive int, or synthetic negative for
   *  unpublished new sections, or string tmp_id). */
  selectedId: number | string | null;
  /** Bounds reported by the iframe content. */
  bounds: SectionBounds[];
  /** Scroll offset published by the iframe (so we can compensate when the
   *  iframe content scrolls). */
  iframeScrollY: number;
  /** Section action handlers — wired by the editor page. */
  onSelect: (id: number | string) => void;
  onMoveUp: (id: number | string) => void;
  onMoveDown: (id: number | string) => void;
  onToggleVisibility: (id: number | string) => void;
  onDelete: (id: number | string) => void;
  /** Some sections (footer, menu_grid) shouldn't be deletable. */
  isDeletable: (id: number | string) => boolean;
};

export function SelectionOverlay({
  iframeRect,
  scale,
  selectedId,
  bounds,
  iframeScrollY,
  onSelect,
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
  onDelete,
  isDeletable,
}: Props) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);

  // Clear hover when bounds change (sections re-flow) — prevents stale highlights.
  useEffect(() => {
    setHoveredId(null);
  }, [bounds.length]);

  if (!iframeRect) return null;

  /** Translate iframe-document coordinates into viewport (overlay) coordinates. */
  const toViewport = useCallback(
    (b: SectionBounds) => {
      const top = iframeRect.top + (b.top - iframeScrollY) * scale;
      const left = iframeRect.left + b.left * scale;
      const width = b.width * scale;
      const height = b.height * scale;
      return { top, left, width, height };
    },
    [iframeRect, scale, iframeScrollY]
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 40,
      }}
    >
      {bounds.map((b) => {
        const vp = toViewport(b);
        const isSelected = selectedId === b.id;
        const isHovered = hoveredId === b.id && !isSelected;
        if (!isSelected && !isHovered) {
          // Invisible hitbox for hover tracking. Toolbar/outline are only
          // rendered for hovered or selected sections.
          return (
            <div
              key={b.id}
              onMouseEnter={() => setHoveredId(b.id)}
              onMouseLeave={() => setHoveredId((cur) => (cur === b.id ? null : cur))}
              onClick={() => onSelect(b.id)}
              style={{
                position: "absolute",
                top: vp.top,
                left: vp.left,
                width: vp.width,
                height: vp.height,
                pointerEvents: "auto",
                cursor: "pointer",
              }}
            />
          );
        }
        return (
          <div
            key={b.id}
            onMouseEnter={() => setHoveredId(b.id)}
            onMouseLeave={() => setHoveredId((cur) => (cur === b.id ? null : cur))}
            onClick={() => onSelect(b.id)}
            style={{
              position: "absolute",
              top: vp.top,
              left: vp.left,
              width: vp.width,
              height: vp.height,
              pointerEvents: "auto",
              cursor: "pointer",
              border: isSelected ? "2px solid #EB5204" : "2px dashed #EB5204",
              borderRadius: 4,
              boxSizing: "border-box",
              background: "transparent",
            }}
          >
            {isSelected && (
              <FloatingToolbar
                sectionId={b.id}
                canDelete={isDeletable(b.id)}
                onMoveUp={() => onMoveUp(b.id)}
                onMoveDown={() => onMoveDown(b.id)}
                onToggleVisibility={() => onToggleVisibility(b.id)}
                onDelete={() => onDelete(b.id)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FloatingToolbar({
  sectionId,
  canDelete,
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
  onDelete,
}: {
  sectionId: number | string;
  canDelete: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
}) {
  const btn = "w-7 h-7 flex items-center justify-center text-white/90 hover:bg-white/10 transition rounded";
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: -36,
        left: 0,
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "3px 4px",
        background: "#EB5204",
        borderRadius: 6,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        pointerEvents: "auto",
        whiteSpace: "nowrap",
      }}
    >
      <button onClick={onMoveUp} className={btn} title="Monter">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 15l-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button onClick={onMoveDown} className={btn} title="Descendre">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.3)", margin: "0 2px" }} />
      <button onClick={onToggleVisibility} className={btn} title="Visibilité">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      {canDelete && (
        <button onClick={onDelete} className={btn} title="Supprimer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
