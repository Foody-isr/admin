'use client';
import * as React from 'react';
import { Plus } from 'lucide-react';
import {
  POS_GRID_COLUMNS,
  POS_TILE_SPANS,
  type PosDisplayTile,
} from '@/lib/posDisplay';
import { PosTile, type PosTileRef } from './PosTile';

export interface PosTileCanvasProps {
  /** Tiles sorted by `position`. */
  tiles: PosDisplayTile[];
  /** Resolves display data (name, price, imageUrl) for a tile from external state. */
  resolve: (t: PosDisplayTile) => PosTileRef;
  selectedIndex: number | null;
  onSelect: (i: number) => void;
  /** Drill into a group tile to show its child layout. */
  onDrill: (i: number) => void;
  /** Open the add-tile modal / picker. */
  onAdd: () => void;
  /** Reorder a tile from index `from` to index `to`. */
  onReorder: (from: number, to: number) => void;
}

/**
 * 4-column CSS grid that places POS display tiles.
 *
 * - Each tile spans `col` × `row` cells according to its size (petit 1×1, large 2×1, grand 2×2).
 * - `grid-auto-flow: dense` allows smaller tiles to backfill gaps left by larger ones.
 * - Trailing `+` button opens the add-tile flow.
 * - Native HTML5 drag-and-drop handles reordering; the parent is responsible for
 *   updating the `tiles` array via `onReorder(from, to)`.
 */
export function PosTileCanvas({
  tiles,
  resolve,
  selectedIndex,
  onSelect,
  onDrill,
  onAdd,
  onReorder,
}: PosTileCanvasProps) {
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);

  return (
    <div
      className="grid gap-2.5"
      style={{
        gridTemplateColumns: `repeat(${POS_GRID_COLUMNS}, 151px)`,
        gridAutoRows: '64px',
        gridAutoFlow: 'dense',
      }}
    >
      {tiles.map((t, i) => {
        const span = POS_TILE_SPANS[t.size];
        return (
          <div
            key={t.id ?? `idx-${i}`}
            style={{
              gridColumn: `span ${span.col}`,
              gridRow: `span ${span.row}`,
            }}
            onDragOver={(e) => {
              if (dragFrom !== null) e.preventDefault();
            }}
            onDrop={() => {
              if (dragFrom !== null && dragFrom !== i) {
                onReorder(dragFrom, i);
              }
              setDragFrom(null);
            }}
          >
            <PosTile
              tile={t}
              refData={resolve(t)}
              selected={selectedIndex === i}
              onClick={() => onSelect(i)}
              onDrill={t.tile_type === 'group' ? () => onDrill(i) : undefined}
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragEnd={() => setDragFrom(null)}
            />
          </div>
        );
      })}

      {/* Trailing add-tile cell */}
      <button
        type="button"
        onClick={onAdd}
        aria-label="Ajouter une tuile"
        className="grid place-items-center rounded-[14px] border border-dashed border-[var(--line)] text-[var(--fg-subtle)] hover:bg-[var(--surface-subtle)] transition"
        style={{ minHeight: 64 }}
      >
        <Plus />
      </button>
    </div>
  );
}
