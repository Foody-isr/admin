'use client';

import { useEffect, useState, useCallback, useRef, useReducer } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getRestaurant, getFloorPlan, listSections, deleteFloorPlan,
  saveFloorPlanLayout, createSection,
  FloorPlan, TableSection, PlacementInput, DecorationInput, SectionInput,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import {
  XIcon,
  TrashIcon,
  Plus,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
  AlignVerticalSpaceAround,
  RectangleHorizontal, Circle, RotateCw,
} from 'lucide-react';
import { NumberInput } from '@/components/ui/NumberInput';
import { TableEditorModal } from '@/components/tables/TableEditorModal';
import {
  FLOOR_PLAN_CANVAS_ASPECT,
  normalizeTablePlacement, authoredTablePlacement, resizeAuthoredTable, AUTHORED_TABLE_SIZE, FLOOR_PLAN_GRID_COLUMNS, FLOOR_PLAN_GRID_ROWS,
  tablePlacementCollisionIds,
} from '@/lib/floor-plan-layout';
import type { TableShape } from '@/lib/floor-plan-layout';
import { floorPlanHistoryReducer, type FloorPlanHistory, type FloorPlanHistoryAction } from '@/lib/floor-plan-history';
import styles from './editor.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CanvasPlacement {
  tableId: number;
  tableName: string;
  x: number;        // %
  y: number;        // %
  width: number;    // %
  height: number;   // %
  shape: TableShape;
  rotation: number; // degrees
  geometryVersion?: number;
}

interface CanvasDecoration {
  id: string;       // client-side key
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'rectangle' | 'circle';
  color: string;
  rotation: number; // degrees
}

type SelectedItem =
  | { type: 'table'; id: number }
  | { type: 'decoration'; id: string }
  | null;

type SelectionEntry =
  | { type: 'table'; id: number }
  | { type: 'decoration'; id: string };

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface ItemBox {
  type: 'table' | 'decoration';
  id: number | string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_ITEM_SIZE = .5; // percent
const MAX_ITEM_SIZE = 45; // percent
const SNAP_THRESHOLD = 1.2; // percent — within this distance, edges/centers snap together

// The canonical width/height ratio the canvas is rendered at, mirroring
// common.FloorPlanCanvasAspect on the server and kFloorPlanCanvasAspect in
// foodypos. Width is stored as a % of canvas width and height as a % of canvas
// height, so a placement only keeps its shape across surfaces when every
// surface letterboxes to this same ratio. Taken from the Figma canvas
// (1160x667). Do not change it here alone.

// Default size + spacing used when click-placing tables from the sidebar.
// Tables auto-fill the canvas row-by-row in a regular grid; the picker
// skips slots that overlap anything the user has already placed/moved.
//
// Width and height differ because they are percentages of different axes: on a
// canonical canvas these produce the intended physical table proportions.
// Equal percentages would instead inherit the canvas ratio and read as a flat
// letterbox. Kept in sync with common.DefaultPlacementWidth/Height (Go).
const DEFAULT_TABLE_W = AUTHORED_TABLE_SIZE.width;
const DEFAULT_TABLE_H = AUTHORED_TABLE_SIZE.height;
const AUTO_PLACE_GAP = 100 / FLOOR_PLAN_GRID_COLUMNS;           // % — gap between adjacent auto-placed tables
const AUTO_PLACE_MARGIN = 100 / FLOOR_PLAN_GRID_COLUMNS;        // % — margin from canvas edges

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/**
 * Finds the next empty grid slot for an auto-placed table, walking row-major
 * from the top-left and skipping any slot that overlaps an existing placement
 * or decoration. Falls back to the top-left corner if the canvas is full —
 * the user can manually rearrange from there.
 */
function nextAutoSlot(
  placements: CanvasPlacement[],
  decorations: CanvasDecoration[],
): { x: number; y: number } {
  const occupied = [
    ...placements.map((p) => ({ x: p.x, y: p.y, width: p.width, height: p.height })),
    ...decorations.map((d) => ({ x: d.x, y: d.y, width: d.width, height: d.height })),
  ];
  // Stride is per-axis: the slot is no longer square, so a single stride would
  // either overlap rows or leave a large gap between columns.
  const strideX = DEFAULT_TABLE_W + AUTO_PLACE_GAP;
  const strideY = DEFAULT_TABLE_H + 100 / FLOOR_PLAN_GRID_ROWS;
  for (let y = 100 / FLOOR_PLAN_GRID_ROWS; y + DEFAULT_TABLE_H <= 100 - 100 / FLOOR_PLAN_GRID_ROWS; y += strideY) {
    for (let x = AUTO_PLACE_MARGIN; x + DEFAULT_TABLE_W <= 100 - AUTO_PLACE_MARGIN; x += strideX) {
      const slot = { x, y, width: DEFAULT_TABLE_W, height: DEFAULT_TABLE_H };
      if (!occupied.some((o) => rectsOverlap(slot, o))) {
        return { x, y };
      }
    }
  }
  return { x: AUTO_PLACE_MARGIN, y: AUTO_PLACE_MARGIN };
}

interface SnapBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SnapResult {
  x: number;
  y: number;
  /** Vertical guide lines (x positions in % of canvas) shown during drag */
  vGuides: number[];
  /** Horizontal guide lines (y positions in % of canvas) shown during drag */
  hGuides: number[];
}

/**
 * Snaps a moving bbox to nearby static items and canvas centerlines.
 * Snap targets: each other item's left / center / right (X) and top / middle
 * / bottom (Y), plus the canvas edges and center. Within `SNAP_THRESHOLD` the
 * bbox is shifted to align exactly, and the matching target line is returned
 * for the renderer to draw.
 */
function computeSnap(bbox: SnapBox, others: SnapBox[]): SnapResult {
  const xAnchors = [bbox.x, bbox.x + bbox.width / 2, bbox.x + bbox.width];
  const yAnchors = [bbox.y, bbox.y + bbox.height / 2, bbox.y + bbox.height];

  const xTargets = [0, 50, 100, ...others.flatMap((o) => [o.x, o.x + o.width / 2, o.x + o.width])];
  const yTargets = [0, 50, 100, ...others.flatMap((o) => [o.y, o.y + o.height / 2, o.y + o.height])];

  let bestX: { target: number; delta: number } | null = null;
  for (const a of xAnchors) {
    for (const t of xTargets) {
      const diff = t - a;
      if (Math.abs(diff) <= SNAP_THRESHOLD && (bestX === null || Math.abs(diff) < Math.abs(bestX.delta))) {
        bestX = { target: t, delta: diff };
      }
    }
  }
  let bestY: { target: number; delta: number } | null = null;
  for (const a of yAnchors) {
    for (const t of yTargets) {
      const diff = t - a;
      if (Math.abs(diff) <= SNAP_THRESHOLD && (bestY === null || Math.abs(diff) < Math.abs(bestY.delta))) {
        bestY = { target: t, delta: diff };
      }
    }
  }

  return {
    x: bestX ? bbox.x + bestX.delta : bbox.x,
    y: bestY ? bbox.y + bestY.delta : bbox.y,
    vGuides: bestX ? [bestX.target] : [],
    hGuides: bestY ? [bestY.target] : [],
  };
}

const DECORATION_PRESETS = [
  { label: 'Cuisine',  shape: 'rectangle' as const, color: '#d1c4a8' },
  { label: 'Bar',      shape: 'rectangle' as const, color: '#b3cde0' },
  { label: 'Entrée',   shape: 'rectangle' as const, color: '#c8e6c9' },
  { label: 'Toilettes',shape: 'rectangle' as const, color: '#e1bee7' },
  { label: 'Caisse',   shape: 'rectangle' as const, color: '#ffe0b2' },
  { label: 'Forme',    shape: 'rectangle' as const, color: '#e5e7eb' },
];

const PALETTE_COLORS = ['#e5e7eb', '#d1c4a8', '#b3cde0', '#c8e6c9', '#e1bee7', '#ffe0b2', '#fce4ec', '#f5f5f5'];

// ─── Section Modal ────────────────────────────────────────────────────────────

function SectionModal({ restaurantId, onCreated, onClose }: {
  restaurantId: number;
  onCreated: (sectionId: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [count, setCount] = useState(0);
  const [autoNames, setAutoNames] = useState(true);
  const [customText, setCustomText] = useState('');
  const [saving, setSaving] = useState(false);

  const preview = autoNames
    ? Array.from({ length: count }, (_, i) => `${label || name} ${i + 1}`)
    : customText.split('\n').filter((l) => l.trim());

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const input: SectionInput = { name: name.trim(), label: label || name };
      if (autoNames) {
        input.table_count = count;
      } else {
        input.custom_names = customText.split('\n').map((l) => l.trim()).filter(Boolean);
      }
      const created = await createSection(restaurantId, input);
      onCreated(created.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pt-[max(var(--s-4),var(--safe-top))] pb-[max(var(--s-4),var(--safe-bottom))]" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="card w-full max-w-lg p-6 space-y-5 overflow-y-auto max-h-full" style={{ background: 'var(--bg)' }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-fg-primary">{t('newSection')}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--surface-subtle)]">
            <XIcon className="w-5 h-5 text-fg-secondary" />
          </button>
        </div>

        {/* Section name */}
        <div>
          <label className="text-xs font-medium text-fg-secondary block mb-1.5">{t('sectionName')}</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input text-sm w-full"
            placeholder={t('sectionName')}
          />
        </div>

        {/* Tables */}
        <div className="space-y-3" style={{ borderTop: '1px solid var(--divider)', paddingTop: '1rem' }}>
          <p className="text-sm font-semibold text-fg-primary">Tables</p>

          {/* Naming mode */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={autoNames} onChange={() => setAutoNames(true)} className="accent-brand-500" />
              <span className="text-sm text-fg-primary">{t('autoNames')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={!autoNames} onChange={() => setAutoNames(false)} className="accent-brand-500" />
              <span className="text-sm text-fg-primary">{t('customNames')}</span>
            </label>
          </div>

          {autoNames ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-fg-secondary block mb-1">{t('tableLabel')}</label>
                <input value={label} onChange={(e) => setLabel(e.target.value)} className="input text-sm w-full" placeholder={name} />
              </div>
              <div>
                <label className="text-xs text-fg-secondary block mb-1">{t('tableCount')}</label>
                <NumberInput integer min={1} max={50} value={count} onChange={setCount} className="input text-sm w-full" />
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs text-fg-secondary block mb-1">{t('customNames')} (one per line)</label>
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                rows={5}
                className="input text-sm w-full resize-y"
                placeholder={`Table 1\nTable 2\nTable 3`}
              />
            </div>
          )}

          {/* Preview list */}
          {preview.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {preview.map((n, i) => (
                <div key={i} className="text-sm text-fg-secondary px-2 py-0.5 rounded" style={{ background: 'var(--surface-subtle)' }}>
                  {n}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary px-4">{t('cancel')}</button>
          <button onClick={handleCreate} disabled={saving || !name.trim()} className="btn-primary px-6 disabled:opacity-50">
            {saving ? t('saving') : t('done')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Resize handles ──────────────────────────────────────────────────────────

const RESIZE_HANDLES: { handle: ResizeHandle; top?: string; bottom?: string; left?: string; right?: string; cursor: string }[] = [
  {handle:'n',top:'-4px',left:'50%',cursor:'ns-resize'},
  {handle:'e',top:'50%',right:'-4px',cursor:'ew-resize'},
  {handle:'s',bottom:'-4px',left:'50%',cursor:'ns-resize'},
  {handle:'w',top:'50%',left:'-4px',cursor:'ew-resize'},
];

function ResizeHandles({
  type,
  id,
  onPointerDown,
}: {
  type: 'table' | 'decoration';
  id: number | string;
  onPointerDown: (e: React.PointerEvent, type: 'table' | 'decoration', id: number | string, handle: ResizeHandle) => void;
}) {
  return (
    <>
      {RESIZE_HANDLES.map((h) => {
        const isHorizontalMid = h.handle === 'n' || h.handle === 's';
        const isVerticalMid = h.handle === 'e' || h.handle === 'w';
        return (
          <div
            key={h.handle}
            data-testid={`resize-${h.handle}`}
            onPointerDown={(e) => onPointerDown(e, type, id, h.handle)}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              width: '8px',
              height: '8px',
              background: '#ffffff',
              border: '1px solid #333',
              borderRadius: '50%',
              cursor: h.cursor,
              top: h.top,
              bottom: h.bottom,
              left: h.left,
              right: h.right,
              transform: isHorizontalMid
                ? 'translate(-50%, 0)'
                : isVerticalMid
                  ? 'translate(0, -50%)'
                  : undefined,
              zIndex: 11,
            }}
          />
        );
      })}
    </>
  );
}

// ─── Alignment toolbar ───────────────────────────────────────────────────────

function AlignmentToolbar({
  count,
  onAlignLeft,
  onAlignHCenter,
  onAlignRight,
  onAlignTop,
  onAlignVCenter,
  onAlignBottom,
  onDistributeH,
  onDistributeV,
  onDeleteAll,
}: {
  count: number;
  onAlignLeft: () => void;
  onAlignHCenter: () => void;
  onAlignRight: () => void;
  onAlignTop: () => void;
  onAlignVCenter: () => void;
  onAlignBottom: () => void;
  onDistributeH: () => void;
  onDistributeV: () => void;
  onDeleteAll: () => void;
}) {
  const Btn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <button
      title={title}
      onClick={onClick}
      className="p-1.5 rounded hover:bg-[var(--surface-subtle)] text-fg-secondary hover:text-fg-primary transition-colors"
    >
      {children}
    </button>
  );
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1.5 rounded-lg shadow-xl"
      style={{
        bottom: '24px',
        background: 'var(--surface)',
        border: '1px solid var(--divider)',
      }}
    >
      <span className="text-xs font-semibold text-fg-secondary px-2 select-none">
        {count} selected
      </span>
      <div className="w-px h-5 bg-[var(--divider)] mx-1" />
      <Btn title="Align left" onClick={onAlignLeft}><AlignStartVertical className="w-4 h-4" /></Btn>
      <Btn title="Align horizontal center" onClick={onAlignHCenter}><AlignCenterVertical className="w-4 h-4" /></Btn>
      <Btn title="Align right" onClick={onAlignRight}><AlignEndVertical className="w-4 h-4" /></Btn>
      <div className="w-px h-5 bg-[var(--divider)] mx-1" />
      <Btn title="Align top" onClick={onAlignTop}><AlignStartHorizontal className="w-4 h-4" /></Btn>
      <Btn title="Align vertical center" onClick={onAlignVCenter}><AlignCenterHorizontal className="w-4 h-4" /></Btn>
      <Btn title="Align bottom" onClick={onAlignBottom}><AlignEndHorizontal className="w-4 h-4" /></Btn>
      <div className="w-px h-5 bg-[var(--divider)] mx-1" />
      <Btn title="Distribute horizontally" onClick={onDistributeH}><AlignHorizontalDistributeCenter className="w-4 h-4" /></Btn>
      <Btn title="Distribute vertically" onClick={onDistributeV}><AlignVerticalSpaceAround className="w-4 h-4" /></Btn>
      <div className="w-px h-5 bg-[var(--divider)] mx-1" />
      <Btn title="Delete selection" onClick={onDeleteAll}>
        <TrashIcon className="w-4 h-4 text-red-500" />
      </Btn>
    </div>
  );
}

// ─── Main Editor ──────────────────────────────────────────────────────────────

export default function FloorPlanEditorPage() {
  const { restaurantId, planId } = useParams();
  const rid = Number(restaurantId);
  const pid = Number(planId);
  const router = useRouter();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('tables.manage');

  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [sections, setSections] = useState<TableSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  type Layout = { placements: CanvasPlacement[]; decorations: CanvasDecoration[] };
  const [history, dispatch] = useReducer(
    (state: FloorPlanHistory<Layout>, action: FloorPlanHistoryAction<Layout>) => floorPlanHistoryReducer(state, action),
    { present: { placements: [], decorations: [] }, past: [], future: [] },
  );
  const { placements, decorations } = history.present;
  const [original, setOriginal] = useState<Layout>({ placements: [], decorations: [] });
  const [error, setError] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const dirty = JSON.stringify(history.present) !== JSON.stringify(original);
  const setPlacements = (update: React.SetStateAction<CanvasPlacement[]>) => dispatch({ type:'update', update: current => ({ ...current, placements: typeof update === 'function' ? update(current.placements) : update }) });
  const setDecorations = (update: React.SetStateAction<CanvasDecoration[]>) => dispatch({ type:'update', update: current => ({ ...current, decorations: typeof update === 'function' ? update(current.decorations) : update }) });
  const travel = useCallback((type: 'undo' | 'redo') => { dispatch({ type }); setSelection([]); }, []);

  // Multi-selection. `selection[0]` is the "primary" — the property panel
  // shows its details. Other entries participate in multi-drag, alignment,
  // and group-delete. Empty array = nothing selected.
  const [selection, setSelection] = useState<SelectionEntry[]>([]);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [addTableTarget, setAddTableTarget] = useState<{
    sectionId: number;
    sectionName: string;
    nextIndex: number;
  } | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startMouseX: number;
    startMouseY: number;
    // Snapshot of initial positions for every item being dragged. Lets the
    // group move together with the cursor without React state staleness.
    initial: Array<{ type: 'table' | 'decoration'; id: number | string; x: number; y: number }>;
  } | null>(null);
  const rotateState = useRef<{
    kind: 'table' | 'decoration';
    id: number | string;
    centerX: number; centerY: number;
    startAngle: number; startRotation: number;
  } | null>(null);
  const resizeState = useRef<{
    type: 'table' | 'decoration';
    id: number | string;
    handle: ResizeHandle;
    startMouseX: number;
    startMouseY: number;
    initialX: number;
    initialY: number;
    initialWidth: number;
    initialHeight: number;
    rotation: number;
  } | null>(null);
  const dropState = useRef<{ tableId: number; tableName: string } | null>(null);
  // Rubber-band selection: click an empty spot of the canvas and drag a box;
  // every item the box covers becomes selected on mouse-up.
  const [rubberBand, setRubberBand] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const rubberBandStart = useRef<{ x: number; y: number } | null>(null);
  // Smart guides shown during a drag: orange dashed lines through the snap
  // targets the dragged item's edges/center are aligning to.
  const [snapGuides, setSnapGuides] = useState<{ vertical: number[]; horizontal: number[] }>({ vertical: [], horizontal: [] });

  const loadData = useCallback(async () => {
    try {
      const [fp, secs, restaurant] = await Promise.all([getFloorPlan(rid, pid), listSections(rid), getRestaurant(rid)]);
      setRestaurantName(restaurant.name);
      setPlan(fp);
      setSections(secs);
      const mapped: CanvasPlacement[] = (fp.placements ?? []).map((p) => authoredTablePlacement({
        geometryVersion: p.geometry_version ?? 0,
        tableId: p.table_id,
        tableName: p.table.name,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        shape: p.shape,
        rotation: p.rotation ?? 0,
      }));
      const mappedDecs: CanvasDecoration[] = (fp.decorations ?? []).map((d) => ({
        id: String(d.id),
        label: d.label,
        x: d.x,
        y: d.y,
        width: d.width,
        height: d.height,
        shape: d.shape,
        color: d.color,
        rotation: d.rotation ?? 0,
      }));
      const layout = { placements:mapped, decorations:mappedDecs };
      dispatch({ type:'reset', value:layout });
      setOriginal(layout);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('floorEditorLoadError'));
    } finally {
      setLoading(false);
    }
    // Locale changes must not reload over an unsaved layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rid, pid]);

  useEffect(() => { loadData(); }, [loadData]);

  const placedIds = new Set(placements.map((p) => p.tableId));
  const collisionIds = tablePlacementCollisionIds(placements);

  const visibleSections = sections;

  // ─── Selection helpers ───────────────────────────────────────────────────

  const isSelected = (type: 'table' | 'decoration', id: number | string) =>
    selection.some((s) => s.type === type && s.id === id);

  /**
   * Returns the selection that should be active for a drag/click starting on
   * (type, id). Pure — does not mutate state. Caller updates state with the
   * returned value AND uses it directly for the drag snapshot (avoids a
   * stale-state race condition).
   */
  const computeSelectionForClick = (
    type: 'table' | 'decoration',
    id: number | string,
    shiftKey: boolean,
  ): SelectionEntry[] => {
    const already = isSelected(type, id);
    if (shiftKey) {
      return already
        ? selection.filter((s) => !(s.type === type && s.id === id))
        : [...selection, { type, id } as SelectionEntry];
    }
    // Plain click on something already selected → keep the multi-selection
    // so the user can drag the whole group. Otherwise replace.
    return already ? selection : [{ type, id } as SelectionEntry];
  };

  type SnapshotEntry = { type: 'table' | 'decoration'; id: number | string; x: number; y: number };
  const snapshotPositions = (sel: SelectionEntry[]): SnapshotEntry[] => {
    const out: SnapshotEntry[] = [];
    for (const s of sel) {
      if (s.type === 'table') {
        const p = placements.find((pp) => pp.tableId === s.id);
        if (p) out.push({ type: 'table', id: s.id, x: p.x, y: p.y });
      } else {
        const d = decorations.find((dd) => dd.id === s.id);
        if (d) out.push({ type: 'decoration', id: s.id, x: d.x, y: d.y });
      }
    }
    return out;
  };

  // ─── Canvas drag (move tables and decorations) ────────────────────────────

  const handleTableMouseDown = (e: React.PointerEvent, tableId: number) => {
    e.preventDefault();
    e.stopPropagation();
    const next = computeSelectionForClick('table', tableId, e.shiftKey);
    setSelection(next);
    // Shift+click toggles — don't start dragging on a shift-click.
    if (e.shiftKey) return;
    dispatch({ type:'begin' });
    dragState.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      initial: snapshotPositions(next),
    };
  };

  const handleDecorationPointerDown = (e: React.PointerEvent, decId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const next = computeSelectionForClick('decoration', decId, e.shiftKey);
    setSelection(next);
    if (e.shiftKey) return;
    dispatch({ type:'begin' });
    dragState.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      initial: snapshotPositions(next),
    };
  };

  const handleRotateMouseDown = (e: React.PointerEvent, kind: 'table' | 'decoration', id: number | string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    let item: CanvasPlacement | CanvasDecoration | undefined;
    let startRotation = 0;
    if (kind === 'table') {
      item = placements.find((p) => p.tableId === id);
      startRotation = item?.rotation ?? 0;
    } else {
      item = decorations.find((d) => d.id === id);
      startRotation = (item as CanvasDecoration | undefined)?.rotation ?? 0;
    }
    if (!item) return;
    const centerX = rect.left + (item.x / 100) * rect.width + (item.width / 100) * rect.width / 2;
    const centerY = rect.top + (item.y / 100) * rect.height + (item.height / 100) * rect.height / 2;
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    dispatch({ type:'begin' });
    rotateState.current = { kind, id, centerX, centerY, startAngle, startRotation };
  };

  const handleResizeMouseDown = (
    e: React.PointerEvent,
    type: 'table' | 'decoration',
    id: number | string,
    handle: ResizeHandle,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const item: ItemBox | undefined =
      type === 'table'
        ? (() => {
            const p = placements.find((pp) => pp.tableId === id);
            return p ? { type, id, x: p.x, y: p.y, width: p.width, height: p.height } : undefined;
          })()
        : (() => {
            const d = decorations.find((dd) => dd.id === id);
            return d ? { type, id, x: d.x, y: d.y, width: d.width, height: d.height } : undefined;
          })();
    if (!item) return;
    dispatch({ type:'begin' });
    resizeState.current = {
      type,
      id,
      handle,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      initialX: item.x,
      initialY: item.y,
      initialWidth: item.width,
      initialHeight: item.height,
      rotation: type === 'table' ? placements.find(p => p.tableId === id)?.rotation ?? 0 : decorations.find(d => d.id === id)?.rotation ?? 0,
    };
  };

  // Mouse-down on the canvas background → start a rubber-band selection.
  const handleCanvasMouseDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.pointerType === 'touch') { setSelection([]); return; }
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    rubberBandStart.current = { x, y };
    if (!e.shiftKey) setSelection([]);
  };

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      // Rotation
      if (rotateState.current) {
        const { kind, id, centerX, centerY, startAngle, startRotation } = rotateState.current;
        const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
        const rotation = startRotation + (angle - startAngle);
        if (kind === 'table') {
          setPlacements((prev) => prev.map((p) => p.tableId === id ? normalizeTablePlacement({ ...p, rotation }) : p));
        } else {
          setDecorations((prev) => prev.map((d) => d.id === id ? { ...d, rotation } : d));
        }
        return;
      }

      // Resize via handle
      if (resizeState.current && canvasRef.current) {
        const rs = resizeState.current;
        const rect = canvasRef.current.getBoundingClientRect();
        const dx = ((e.clientX - rs.startMouseX) / rect.width) * 100;
        const dy = ((e.clientY - rs.startMouseY) / rect.height) * 100;

        if (rs.type === 'table') {
          setPlacements(prev => prev.map(p => p.tableId === rs.id ? resizeAuthoredTable({ ...p, x:rs.initialX, y:rs.initialY, width:rs.initialWidth, height:rs.initialHeight, rotation:rs.rotation }, rs.handle, dx, dy) : p));
          return;
        }

        let nx = rs.initialX;
        let ny = rs.initialY;
        let nw = rs.initialWidth;
        let nh = rs.initialHeight;

        if (rs.handle.includes('e')) nw = rs.initialWidth + dx;
        if (rs.handle.includes('w')) {
          nx = rs.initialX + dx;
          nw = rs.initialWidth - dx;
        }
        if (rs.handle.includes('s')) nh = rs.initialHeight + dy;
        if (rs.handle.includes('n')) {
          ny = rs.initialY + dy;
          nh = rs.initialHeight - dy;
        }

        // Clamp size; if it would go below the minimum, peg the position.
        if (nw < MIN_ITEM_SIZE) {
          if (rs.handle.includes('w')) nx = rs.initialX + (rs.initialWidth - MIN_ITEM_SIZE);
          nw = MIN_ITEM_SIZE;
        }
        if (nh < MIN_ITEM_SIZE) {
          if (rs.handle.includes('n')) ny = rs.initialY + (rs.initialHeight - MIN_ITEM_SIZE);
          nh = MIN_ITEM_SIZE;
        }
        if (nw > MAX_ITEM_SIZE) nw = MAX_ITEM_SIZE;
        if (nh > MAX_ITEM_SIZE) nh = MAX_ITEM_SIZE;
        // Keep inside the canvas.
        if (nx < 0) { nw += nx; nx = 0; }
        if (ny < 0) { nh += ny; ny = 0; }
        if (nx + nw > 100) nw = 100 - nx;
        if (ny + nh > 100) nh = 100 - ny;

        setDecorations((prev) => prev.map((d) => d.id === rs.id ? { ...d, x: nx, y: ny, width: nw, height: nh } : d));
        return;
      }

      // Multi-drag (move all selected items by the same delta)
      if (dragState.current && canvasRef.current) {
        const { initial, startMouseX, startMouseY } = dragState.current;
        const rect = canvasRef.current.getBoundingClientRect();
        const dx = ((e.clientX - startMouseX) / rect.width) * 100;
        const dy = ((e.clientY - startMouseY) / rect.height) * 100;

        // Clamp delta so no item leaves the canvas.
        let clampedDx = dx;
        let clampedDy = dy;
        for (const init of initial) {
          const w = init.type === 'table'
            ? placements.find((p) => p.tableId === init.id)?.width ?? 6
            : decorations.find((d) => d.id === init.id)?.width ?? 10;
          const h = init.type === 'table'
            ? placements.find((p) => p.tableId === init.id)?.height ?? 6
            : decorations.find((d) => d.id === init.id)?.height ?? 10;
          clampedDx = Math.max(-init.x, Math.min(100 - init.x - w, clampedDx));
          clampedDy = Math.max(-init.y, Math.min(100 - init.y - h, clampedDy));
        }

        // Smart guides: only meaningful for a single-item drag. For
        // multi-drag the snap target is ambiguous — keep guides off so the
        // group moves freely.
        let snappedDx = clampedDx;
        let snappedDy = clampedDy;
        if (initial.length === 1) {
          const init = initial[0];
          const item = init.type === 'table'
            ? placements.find((p) => p.tableId === init.id)
            : decorations.find((d) => d.id === init.id);
          if (item) {
            const proposed: SnapBox = {
              x: init.x + clampedDx,
              y: init.y + clampedDy,
              width: item.width,
              height: item.height,
            };
            const others: SnapBox[] = [];
            for (const p of placements) {
              if (!(init.type === 'table' && p.tableId === init.id)) {
                others.push({ x: p.x, y: p.y, width: p.width, height: p.height });
              }
            }
            for (const d of decorations) {
              if (!(init.type === 'decoration' && d.id === init.id)) {
                others.push({ x: d.x, y: d.y, width: d.width, height: d.height });
              }
            }
            const snap = computeSnap(proposed, others);
            snappedDx = snap.x - init.x;
            snappedDy = snap.y - init.y;
            setSnapGuides({ vertical: snap.vGuides, horizontal: snap.hGuides });
          }
        } else {
          setSnapGuides({ vertical: [], horizontal: [] });
        }

        setPlacements((prev) => prev.map((p) => {
          const init = initial.find((i) => i.type === 'table' && i.id === p.tableId);
          return init ? normalizeTablePlacement({ ...p, x: init.x + snappedDx, y: init.y + snappedDy }) : p;
        }));
        setDecorations((prev) => prev.map((d) => {
          const init = initial.find((i) => i.type === 'decoration' && i.id === d.id);
          return init ? { ...d, x: init.x + snappedDx, y: init.y + snappedDy } : d;
        }));
        return;
      }

      // Rubber-band selection box
      if (rubberBandStart.current && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        setRubberBand({
          startX: rubberBandStart.current.x,
          startY: rubberBandStart.current.y,
          currentX: x,
          currentY: y,
        });
      }
    };

    const onPointerUp = () => {
      // Finalize rubber-band: select every item whose bbox overlaps the box.
      if (rubberBand) {
        const minX = Math.min(rubberBand.startX, rubberBand.currentX);
        const minY = Math.min(rubberBand.startY, rubberBand.currentY);
        const maxX = Math.max(rubberBand.startX, rubberBand.currentX);
        const maxY = Math.max(rubberBand.startY, rubberBand.currentY);
        // Tiny boxes are accidental clicks; ignore them.
        const moved = (maxX - minX) > 0.5 || (maxY - minY) > 0.5;
        if (moved) {
          const next: SelectionEntry[] = [];
          for (const p of placements) {
            if (p.x < maxX && p.x + p.width > minX && p.y < maxY && p.y + p.height > minY) {
              next.push({ type: 'table', id: p.tableId });
            }
          }
          for (const d of decorations) {
            if (d.x < maxX && d.x + d.width > minX && d.y < maxY && d.y + d.height > minY) {
              next.push({ type: 'decoration', id: d.id });
            }
          }
          setSelection(next);
        }
      }
      dispatch({ type:'end' });
      dragState.current = null;
      rotateState.current = null;
      resizeState.current = null;
      rubberBandStart.current = null;
      setRubberBand(null);
      setSnapGuides({ vertical: [], horizontal: [] });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rubberBand, placements, decorations]);

  // ─── Drop chip onto canvas ────────────────────────────────────────────────

  const handleCanvasDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dropState.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    // Clamp per axis so the dropped chip lands fully inside the canvas.
    const x = Math.max(0, Math.min(100 - DEFAULT_TABLE_W, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100 - DEFAULT_TABLE_H, ((e.clientY - rect.top) / rect.height) * 100));
    const { tableId, tableName } = dropState.current;
    if (!placedIds.has(tableId)) {
      setPlacements((prev) => [...prev, { tableId, tableName, x, y, width: DEFAULT_TABLE_W, height: DEFAULT_TABLE_H, shape: 'square', rotation: 0, geometryVersion: 2 }]);
    }
    dropState.current = null;
  };

  // ─── Selected item controls ───────────────────────────────────────────────

  // Primary selection drives the property panel (first item the user clicked).
  const primary: SelectedItem = selection[0] ?? null;

  const selectedPlacement = primary?.type === 'table'
    ? placements.find((p) => p.tableId === primary.id)
    : undefined;

  const selectedDecoration = primary?.type === 'decoration'
    ? decorations.find((d) => d.id === primary.id)
    : undefined;

  const updateSelectedDecoration = (patch: Partial<CanvasDecoration>) => {
    if (primary?.type !== 'decoration') return;
    setDecorations((prev) => prev.map((d) => d.id === primary.id ? { ...d, ...patch } : d));
  };

  /** Removes every selected item from the canvas (placements and/or decorations). */
  const removeSelected = () => {
    if (selection.length === 0) return;
    dispatch({type:'begin'});
    const tableIds = new Set(selection.filter((s) => s.type === 'table').map((s) => s.id as number));
    const decIds = new Set(selection.filter((s) => s.type === 'decoration').map((s) => s.id as string));
    setPlacements((prev) => prev.filter((p) => !tableIds.has(p.tableId)));
    setDecorations((prev) => prev.filter((d) => !decIds.has(d.id)));
    dispatch({type:'end'});
    setSelection([]);
  };

  const addDecoration = (preset: typeof DECORATION_PRESETS[number]) => {
    const offset = decorations.length * 3;
    const x = Math.min(10 + offset, 55);
    const y = Math.min(10 + offset, 55);
    const id = `dec-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const dec: CanvasDecoration = { id, label: preset.label, x, y, width: 16, height: 10, shape: preset.shape, color: preset.color, rotation: 0 };
    setDecorations((prev) => [...prev, dec]);
    setSelection([{ type: 'decoration', id }]);
  };

  // ─── Alignment / distribution ─────────────────────────────────────────────

  /** Bounding boxes of every selected item (in canvas-percent units). */
  const selectionBoxes = (): ItemBox[] => {
    const boxes: ItemBox[] = [];
    for (const s of selection) {
      if (s.type === 'table') {
        const p = placements.find((pp) => pp.tableId === s.id);
        if (p) boxes.push({ type: 'table', id: s.id, x: p.x, y: p.y, width: p.width, height: p.height });
      } else {
        const d = decorations.find((dd) => dd.id === s.id);
        if (d) boxes.push({ type: 'decoration', id: s.id, x: d.x, y: d.y, width: d.width, height: d.height });
      }
    }
    return boxes;
  };

  /** Applies a per-item x/y adjustment to every selected item. */
  const applyAlignment = (compute: (b: ItemBox, all: ItemBox[]) => { x?: number; y?: number }) => {
    const boxes = selectionBoxes();
    if (boxes.length < 2) return;
    dispatch({type:'begin'});
    const updates = new Map<string, { x?: number; y?: number }>();
    for (const b of boxes) {
      updates.set(`${b.type}:${b.id}`, compute(b, boxes));
    }
    setPlacements((prev) => prev.map((p) => {
      const u = updates.get(`table:${p.tableId}`);
      return u ? { ...p, ...(u.x !== undefined ? { x: u.x } : {}), ...(u.y !== undefined ? { y: u.y } : {}) } : p;
    }));
    setDecorations((prev) => prev.map((d) => {
      const u = updates.get(`decoration:${d.id}`);
      return u ? { ...d, ...(u.x !== undefined ? { x: u.x } : {}), ...(u.y !== undefined ? { y: u.y } : {}) } : d;
    }));
    dispatch({type:'end'});
  };

  const alignLeft = () => {
    const minX = Math.min(...selectionBoxes().map((b) => b.x));
    applyAlignment((b) => ({ x: minX }));
  };
  const alignRight = () => {
    const maxRight = Math.max(...selectionBoxes().map((b) => b.x + b.width));
    applyAlignment((b) => ({ x: maxRight - b.width }));
  };
  const alignHCenter = () => {
    const boxes = selectionBoxes();
    const avgCenter = boxes.reduce((s, b) => s + b.x + b.width / 2, 0) / boxes.length;
    applyAlignment((b) => ({ x: avgCenter - b.width / 2 }));
  };
  const alignTop = () => {
    const minY = Math.min(...selectionBoxes().map((b) => b.y));
    applyAlignment((b) => ({ y: minY }));
  };
  const alignBottom = () => {
    const maxBottom = Math.max(...selectionBoxes().map((b) => b.y + b.height));
    applyAlignment((b) => ({ y: maxBottom - b.height }));
  };
  const alignVCenter = () => {
    const boxes = selectionBoxes();
    const avgCenter = boxes.reduce((s, b) => s + b.y + b.height / 2, 0) / boxes.length;
    applyAlignment((b) => ({ y: avgCenter - b.height / 2 }));
  };

  /** Distributes selected items evenly along an axis between the outer two. */
  const distribute = (axis: 'x' | 'y') => {
    const boxes = selectionBoxes();
    if (boxes.length < 3) return;
    dispatch({type:'begin'});
    const sorted = [...boxes].sort((a, b) => (axis === 'x' ? a.x - b.x : a.y - b.y));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const span = axis === 'x' ? (last.x - first.x) : (last.y - first.y);
    const step = span / (sorted.length - 1);
    const updates = new Map<string, { x?: number; y?: number }>();
    sorted.forEach((b, i) => {
      const next = (axis === 'x' ? first.x : first.y) + step * i;
      updates.set(`${b.type}:${b.id}`, axis === 'x' ? { x: next } : { y: next });
    });
    setPlacements((prev) => prev.map((p) => {
      const u = updates.get(`table:${p.tableId}`);
      return u ? { ...p, ...(u.x !== undefined ? { x: u.x } : {}), ...(u.y !== undefined ? { y: u.y } : {}) } : p;
    }));
    setDecorations((prev) => prev.map((d) => {
      const u = updates.get(`decoration:${d.id}`);
      return u ? { ...d, ...(u.x !== undefined ? { x: u.x } : {}), ...(u.y !== undefined ? { y: u.y } : {}) } : d;
    }));
    dispatch({type:'end'});
  };

  // ─── Save / Delete ────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (plan?.layout_geometry_version !== 2) { setError(t('floorEditorApiUpdate')); return; }
    setSaving(true);
    try {
      const inputs: PlacementInput[] = placements.map((p) => ({
        geometry_version: 2,
        table_id: p.tableId,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        shape: p.shape,
        rotation: p.rotation,
      }));
      const decInputs: DecorationInput[] = decorations.map((d) => ({
        label: d.label,
        x: d.x,
        y: d.y,
        width: d.width,
        height: d.height,
        shape: d.shape,
        color: d.color,
        rotation: d.rotation,
      }));
      const saved = await saveFloorPlanLayout(rid, pid, inputs, decInputs);
      if ((saved.placements ?? []).some(p => p.geometry_version !== 2)) throw new Error(t('floorEditorApiUpdate'));
      router.push(`/${rid}/restaurant/floor-plans`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('floorEditorSaveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('confirmDeleteFloorPlan'))) return;
    await deleteFloorPlan(rid, pid);
    router.push(`/${rid}/restaurant/floor-plans`);
  };

  const goBack = () => {
    if (dirty && !confirm(t('floorEditorDiscard'))) return;
    router.push(`/${rid}/restaurant/floor-plans`);
  };

  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!canManage || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault(); travel(event.shiftKey ? 'redo' : 'undo');
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [canManage, travel]);

  const updateSelectedTable = (patch: Partial<CanvasPlacement>) => {
    if (!selectedPlacement) return;
    setPlacements(prev => prev.map(p => p.tableId === selectedPlacement.tableId ? normalizeTablePlacement({ ...p, ...patch }) : p));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
      <div className={styles.editor} data-testid="floor-editor">

        <header className={styles.header}>
          <button onClick={goBack} className={styles.close} aria-label={t('close')}><XIcon size={22} /></button>
          <h1>{t('editFloorPlan')}</h1>
          {canManage && <div className={styles.headerActions}>
            <button disabled={!history.past.length || saving} onClick={() => travel('undo')}>{t('floorEditorUndo')}</button>
            <button disabled={!history.future.length || saving} onClick={() => travel('redo')}>{t('floorEditorRedo')}</button>
            <button onClick={handleDelete} disabled={saving} className={styles.destructive}>{t('deleteFloorPlan')}</button>
            <button onClick={handleSave} disabled={saving || !plan} className={styles.save}>{saving ? t('saving') : t('saveFloorPlan')}</button>
          </div>}
        </header>
        {error && <div role="alert" className={styles.error}>{error}{!plan && <button onClick={() => { setLoading(true); loadData(); }}>{t('retry')}</button>}</div>}

        {/* Body */}
        <div className={styles.body}>

          {canManage && (selectedPlacement || selectedDecoration) && <aside className={styles.properties} aria-label={t('floorEditorProperties')}>
            <p>{t('shape')}</p>
            <div className={styles.shapeButtons}>
              <button aria-label={t('rectangleShape')} aria-pressed={(selectedPlacement?.shape ?? selectedDecoration?.shape) !== 'circle'}
                onClick={() => selectedPlacement ? updateSelectedTable({ shape:'square' }) : updateSelectedDecoration({ shape:'rectangle' })}><RectangleHorizontal size={24} strokeWidth={1.5} /></button>
              <button aria-label={t('circleShape')} aria-pressed={(selectedPlacement?.shape ?? selectedDecoration?.shape) === 'circle'}
                onClick={() => selectedPlacement ? updateSelectedTable({ shape:'circle' }) : updateSelectedDecoration({ shape:'circle' })}><Circle size={24} strokeWidth={1.5} /></button>
            </div>
            {selectedDecoration && <label>{t('tableLabel')}<input value={selectedDecoration.label} onChange={e => updateSelectedDecoration({label:e.target.value})} /></label>}
            <label>{t('tableWidth')}<NumberInput aria-label={t('tableWidth')} min={1} max={48}
              value={Number(((selectedPlacement?.width ?? selectedDecoration!.width) / 100 * FLOOR_PLAN_GRID_COLUMNS).toFixed(1))}
              onChange={n => selectedPlacement ? updateSelectedTable({width:n/FLOOR_PLAN_GRID_COLUMNS*100}) : updateSelectedDecoration({width:n/FLOOR_PLAN_GRID_COLUMNS*100})} /></label>
            <label>{t('tableHeight')}<NumberInput aria-label={t('tableHeight')} min={1} max={32}
              value={Number(((selectedPlacement?.height ?? selectedDecoration!.height) / 100 * FLOOR_PLAN_GRID_ROWS).toFixed(1))}
              onChange={n => selectedPlacement ? updateSelectedTable({height:n/FLOOR_PLAN_GRID_ROWS*100}) : updateSelectedDecoration({height:n/FLOOR_PLAN_GRID_ROWS*100})} /></label>
            {selectedDecoration && <div className={styles.colors}>{PALETTE_COLORS.map(c => <button key={c} aria-label={c} onClick={() => updateSelectedDecoration({color:c})} style={{background:c}} />)}</div>}
            <button className={styles.removeItem} aria-label={t('floorEditorRemoveTable')} onClick={removeSelected}><TrashIcon size={22} /></button>
          </aside>}

          {/* Keep the canonical canvas ratio so authored dimensions match the POS. */}
          <div className={styles.stage}>
            <div
              ref={canvasRef}
              className={styles.canvas}
              data-testid="floor-canvas"
              style={{ aspectRatio: String(FLOOR_PLAN_CANVAS_ASPECT), '--grid-step': `${100/FLOOR_PLAN_GRID_COLUMNS}%` } as React.CSSProperties}
              onDragOver={canManage ? handleCanvasDragOver : undefined}
              onDrop={canManage ? handleCanvasDrop : undefined}
              onPointerDown={canManage ? handleCanvasMouseDown : undefined}
            >
              {/* Decorations — rendered first (behind tables) */}
              {decorations.map((d) => {
                const isSelectedDec = isSelected('decoration', d.id);
                const isPrimary = primary?.type === 'decoration' && primary.id === d.id;
                return (
                  <div
                    key={d.id}
                    style={{
                      position: 'absolute',
                      left: `${d.x}%`,
                      top: `${d.y}%`,
                      width: `${d.width}%`,
                      height: `${d.height}%`,
                      transform: `rotate(${d.rotation}deg)`,
                      transformOrigin: 'center center',
                      zIndex: 1,
                    }}
                  >
                    {/* Visible shape */}
                    <div
                      onPointerDown={canManage ? (e) => handleDecorationPointerDown(e, d.id) : undefined}
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: d.shape === 'circle' ? '50%' : '8px',
                        background: d.color,
                        border: isSelectedDec ? '2px dashed #F18A47' : '2px dashed rgba(0,0,0,0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'move',
                        userSelect: 'none',
                      }}
                    >
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(0,0,0,0.45)', textAlign: 'center', padding: '4px', lineHeight: 1.2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {d.label}
                      </span>
                    </div>
                    {/* Resize handles — only on the primary selected item */}
                    {canManage && isPrimary && <ResizeHandles type="decoration" id={d.id} onPointerDown={handleResizeMouseDown} />}
                    {/* Rotate handle */}
                    {canManage && isPrimary && (
                      <div
                        onPointerDown={(e) => handleRotateMouseDown(e, 'decoration', d.id)}
                        onClick={(e) => e.stopPropagation()}
                        title="Rotate"
                        style={{
                          position: 'absolute',
                          top: '-22px',
                          right: '-22px',
                          width: '20px',
                          height: '20px',
                          background: 'white',
                          border: '2px solid #F18A47',
                          borderRadius: '50%',
                          cursor: 'grab',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                          zIndex: 10,
                        }}
                      >
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                          <path d="M10 3C8.8 1.5 7 0.6 5 0.6C2.5 0.6 0.6 2.5 0.6 5s1.9 4.4 4.4 4.4c1.5 0 2.8-.7 3.7-1.8" stroke="#F18A47" strokeWidth="1.5" strokeLinecap="round"/>
                          <path d="M8.5 0.5L10 3L8 3.8" stroke="#F18A47" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Tables — rendered on top of decorations */}
              {placements.map((p) => {
                const isSelectedTbl = isSelected('table', p.tableId);
                const hasCollision = collisionIds.has(p.tableId);
                return (
                  <div
                    key={p.tableId}
                    data-testid={`floor-table-${p.tableId}`}
                    className={styles.table}
                    style={{
                      position: 'absolute',
                      left: `${p.x}%`,
                      top: `${p.y}%`,
                      width: `${p.width}%`,
                      height: `${p.height}%`,
                      transform: `rotate(${p.rotation}deg)`,
                      zIndex: isSelectedTbl ? 4 : 2,
                    }}
                  >
                    {/* Visible table */}
                    <div
                      onPointerDown={canManage ? (e) => handleTableMouseDown(e, p.tableId) : undefined}
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: p.shape === 'circle' ? '50%' : '1px',
                        background: isSelectedTbl ? 'var(--floor-selected)' : 'var(--floor-table)',
                        border: '1px solid var(--floor-table-border)',
                        outline: isSelectedTbl ? '1px solid var(--floor-selected)' : undefined,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'grab',
                        userSelect: 'none',
                        transition: 'border-color 0.1s',
                      }}
                      title={hasCollision ? t('floorPlanTableOverlap') : undefined}
                    >
                      <span style={{ color: 'white', fontSize: '14px', fontWeight: 500, textAlign: 'center', padding: '2px', lineHeight: 1.1, transform:`rotate(${-p.rotation}deg)` }}>
                        {p.tableName}
                      </span>
                    </div>
                    {canManage && primary?.type === 'table' && primary.id === p.tableId && <>
                      <ResizeHandles type="table" id={p.tableId} onPointerDown={handleResizeMouseDown} />
                      <button className={styles.rotateHandle} aria-label={t('rotation')} onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); updateSelectedTable({rotation:p.rotation+(e.key === 'ArrowRight'?15:-15)}); } }} onPointerDown={e => handleRotateMouseDown(e, 'table', p.tableId)}><RotateCw size={22}/></button>
                    </>}
                  </div>
                );
              })}

              {/* Smart guides — dashed orange lines that appear during drag
                  when an item's edge or center aligns with another item. */}
              {snapGuides.vertical.map((x, i) => (
                <div
                  key={`vg-${i}-${x}`}
                  style={{
                    position: 'absolute',
                    left: `${x}%`,
                    top: 0,
                    width: 0,
                    height: '100%',
                    borderLeft: '1px dashed #F18A47',
                    pointerEvents: 'none',
                    zIndex: 49,
                  }}
                />
              ))}
              {snapGuides.horizontal.map((y, i) => (
                <div
                  key={`hg-${i}-${y}`}
                  style={{
                    position: 'absolute',
                    top: `${y}%`,
                    left: 0,
                    height: 0,
                    width: '100%',
                    borderTop: '1px dashed #F18A47',
                    pointerEvents: 'none',
                    zIndex: 49,
                  }}
                />
              ))}

              {/* Rubber-band selection box */}
              {rubberBand && (() => {
                const minX = Math.min(rubberBand.startX, rubberBand.currentX);
                const minY = Math.min(rubberBand.startY, rubberBand.currentY);
                const w = Math.abs(rubberBand.currentX - rubberBand.startX);
                const h = Math.abs(rubberBand.currentY - rubberBand.startY);
                return (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${minX}%`,
                      top: `${minY}%`,
                      width: `${w}%`,
                      height: `${h}%`,
                      border: '1px dashed #F18A47',
                      background: 'rgba(241,138,71,0.08)',
                      pointerEvents: 'none',
                      zIndex: 50,
                    }}
                  />
                );
              })()}
            </div>

            {/* Floating alignment toolbar — shown when 2+ items are selected */}
            {canManage && selection.length >= 2 && (
              <AlignmentToolbar
                count={selection.length}
                onAlignLeft={alignLeft}
                onAlignHCenter={alignHCenter}
                onAlignRight={alignRight}
                onAlignTop={alignTop}
                onAlignVCenter={alignVCenter}
                onAlignBottom={alignBottom}
                onDistributeH={() => distribute('x')}
                onDistributeV={() => distribute('y')}
                onDeleteAll={removeSelected}
              />
            )}
          </div>

          <aside className={styles.palette} aria-label={t('tables')}>
            <div className={styles.planIdentity}><h2>{plan?.name}</h2><p>{restaurantName}</p></div>
            <div className={styles.paletteContent}>
              {visibleSections.length === 0 && <p className="text-sm text-fg-secondary">{t('noSectionsInPlanHint')}</p>}
              {visibleSections.map(section => <section key={section.id} className={styles.section}>
                <h3>{section.name}</h3>
                <div className={styles.tableGrid}>{(section.tables ?? []).map(tbl => {
                  const placed = placedIds.has(tbl.id);
                  return <button key={tbl.id} data-testid={`palette-table-${tbl.id}`} disabled={!canManage || placed}
                    draggable={canManage && !placed} onDragStart={() => {dropState.current={tableId:tbl.id,tableName:tbl.name};}}
                    onDragEnd={() => { dropState.current=null; }}
                    onClick={() => { const {x,y}=nextAutoSlot(placements,decorations); setPlacements(prev => [...prev, {tableId:tbl.id, tableName:tbl.name,x,y,width:DEFAULT_TABLE_W,height:DEFAULT_TABLE_H,shape:'square',rotation:0,geometryVersion:2}]); setSelection([{type:'table',id:tbl.id}]); }}
                    title={tbl.name}>{tbl.name}</button>;
                })}</div>
                {canManage && <button className={styles.addTable} onClick={() => setAddTableTarget({sectionId:section.id,sectionName:section.name,nextIndex:(section.tables??[]).length+1})}><Plus size={14}/>{t('addTable')}</button>}
              </section>)}
              {canManage && <details className={styles.landmarks}><summary>{t('floorEditorLandmarks')}</summary><div>{DECORATION_PRESETS.map(preset => <button key={preset.label} onClick={() => addDecoration(preset)} style={{background:preset.color}}>{preset.label}</button>)}</div></details>}
            </div>
            {canManage && <div className={styles.paletteFooter}>
              <button onClick={() => setShowSectionModal(true)}>{t('addSection')}</button>
            </div>}
          </aside>
        </div>
      </div>

      {/* Section creation modal */}
      {showSectionModal && (
        <SectionModal
          restaurantId={rid}
          onCreated={(newId) => {
            setShowSectionModal(false);
            listSections(rid).then(setSections).catch(err => setError(String(err)));
          }}
          onClose={() => setShowSectionModal(false)}
        />
      )}

      {/* Table creation modal (per-section) */}
      {addTableTarget && (
        <TableEditorModal
          restaurantId={rid}
          sectionId={addTableTarget.sectionId}
          sectionName={addTableTarget.sectionName}
          nextIndex={addTableTarget.nextIndex}
          onSaved={() => { setAddTableTarget(null); listSections(rid).then(setSections).catch(err => setError(String(err))); }}
          onDeleted={() => { setAddTableTarget(null); listSections(rid).then(setSections).catch(err => setError(String(err))); }}
          onClose={() => setAddTableTarget(null)}
        />
      )}

    </>
  );
}
