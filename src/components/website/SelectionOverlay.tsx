"use client";

/**
 * SelectionOverlay — direct-selection layer drawn ABOVE the live preview
 * iframe. Receives section bounds from the iframe via postMessage and
 * renders selection outlines + a floating toolbar for the selected section.
 *
 * CRITICAL: the outline boxes are `pointer-events: none` so wheel and click
 * pass THROUGH to the cross-origin iframe. The iframe scrolls natively (and
 * reports its scrollY so the outlines follow), and its in-preview section
 * wrappers emit `foody-section-click` to drive selection (see foodyweb
 * PreviewSectionWrapper). If these boxes captured pointer events they would eat
 * the wheel — the preview could not be scrolled, and the stray scroll would
 * bubble out and move the whole editor. Only the floating toolbar captures
 * events.
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
  /** Section action handlers — wired by the editor page. Selection itself is
   *  driven by the iframe's own click (foody-section-click), not the overlay. */
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
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
  onDelete,
  isDeletable,
}: Props) {
  if (!iframeRect) return null;

  // Translate iframe-document coordinates into viewport (overlay) coordinates.
  // Inline so it sits AFTER any conditional return without breaking hook order.
  const toViewport = (b: SectionBounds) => {
    const top = iframeRect.top + (b.top - iframeScrollY) * scale;
    const left = iframeRect.left + b.left * scale;
    const width = b.width * scale;
    const height = b.height * scale;
    return { top, left, width, height };
  };

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
        // ALL sections show a subtle outline by default so the user can tell the
        // preview is interactive; the selected one is solid. These boxes are
        // pointer-events:none (see file header) — selection comes from the
        // iframe's click, not from here.
        const border = isSelected
          ? "2px solid #EB5204"
          : "1px dashed rgba(235, 82, 4, 0.45)";
        return (
          <div
            key={b.id}
            style={{
              position: "absolute",
              top: vp.top,
              left: vp.left,
              width: vp.width,
              height: vp.height,
              pointerEvents: "none",
              border,
              borderRadius: 4,
              boxSizing: "border-box",
              transition: "border-color 120ms ease",
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
