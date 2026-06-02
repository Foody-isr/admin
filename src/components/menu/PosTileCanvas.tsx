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

/** Minimum visible grid rows so the canvas always shows a Square-style empty layout. */
const MIN_GRID_ROWS = 8;

/**
 * 4-column CSS grid that places POS display tiles, Square POS-style.
 *
 * - Each tile spans `col` × `row` cells according to its size.
 * - `grid-auto-flow: dense` lets smaller tiles backfill gaps left by larger ones.
 * - Every unoccupied cell renders an `+` placeholder that opens the add-tile flow.
 * - Native HTML5 drag-and-drop handles reordering between existing tiles.
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

  // Pad with empty cells so the grid always fills at least MIN_GRID_ROWS rows
  // (plus one extra row of slack when tiles overflow), matching Square's
  // always-visible placeholder grid.
  const tileCells = tiles.reduce((sum, t) => {
    const s = POS_TILE_SPANS[t.size];
    return sum + s.col * s.row;
  }, 0);
  const overflowRows = Math.ceil(tileCells / POS_GRID_COLUMNS);
  const totalRows = Math.max(MIN_GRID_ROWS, overflowRows + 1);
  const emptyCount = Math.max(0, totalRows * POS_GRID_COLUMNS - tileCells);

  return (
    <div
      className="grid gap-2"
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

      {Array.from({ length: emptyCount }, (_, i) => (
        <button
          key={`empty-${i}`}
          type="button"
          onClick={onAdd}
          aria-label="Ajouter une tuile"
          className="grid place-items-center rounded-md bg-white/[0.04] text-[var(--fg-subtle)] hover:bg-white/[0.08] transition"
        >
          <Plus className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}
