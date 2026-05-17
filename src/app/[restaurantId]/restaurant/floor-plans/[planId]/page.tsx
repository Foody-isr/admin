'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getFloorPlan, listSections, updateFloorPlan, deleteFloorPlan,
  saveFloorPlanLayout, createSection,
  FloorPlan, TableSection, PlacementInput, DecorationInput, SectionInput,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
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
} from 'lucide-react';
import { NumberInput } from '@/components/ui/NumberInput';
import { TableEditorModal } from '@/components/tables/TableEditorModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CanvasPlacement {
  tableId: number;
  tableName: string;
  x: number;        // %
  y: number;        // %
  width: number;    // %
  height: number;   // %
  shape: 'square' | 'circle';
  rotation: number; // degrees
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

const MIN_ITEM_SIZE = 3; // percent
const MAX_ITEM_SIZE = 60; // percent

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="card w-full max-w-lg p-6 space-y-5 overflow-y-auto max-h-[90vh]" style={{ background: 'var(--bg)' }}>
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
  { handle: 'nw', top: '-6px', left: '-6px', cursor: 'nwse-resize' },
  { handle: 'n', top: '-6px', left: '50%', cursor: 'ns-resize' },
  { handle: 'ne', top: '-6px', right: '-6px', cursor: 'nesw-resize' },
  { handle: 'e', top: '50%', right: '-6px', cursor: 'ew-resize' },
  { handle: 'se', bottom: '-6px', right: '-6px', cursor: 'nwse-resize' },
  { handle: 's', bottom: '-6px', left: '50%', cursor: 'ns-resize' },
  { handle: 'sw', bottom: '-6px', left: '-6px', cursor: 'nesw-resize' },
  { handle: 'w', top: '50%', left: '-6px', cursor: 'ew-resize' },
];

function ResizeHandles({
  type,
  id,
  onMouseDown,
}: {
  type: 'table' | 'decoration';
  id: number | string;
  onMouseDown: (e: React.MouseEvent, type: 'table' | 'decoration', id: number | string, handle: ResizeHandle) => void;
}) {
  return (
    <>
      {RESIZE_HANDLES.map((h) => {
        const isHorizontalMid = h.handle === 'n' || h.handle === 's';
        const isVerticalMid = h.handle === 'e' || h.handle === 'w';
        return (
          <div
            key={h.handle}
            onMouseDown={(e) => onMouseDown(e, type, id, h.handle)}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              width: '12px',
              height: '12px',
              background: '#ffffff',
              border: '2px solid #F18A47',
              borderRadius: '2px',
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

// ─── Picker: bring an existing section into the current plan's sidebar ────────

function AddExistingSectionPicker({
  sections,
  onPick,
  onClose,
}: {
  sections: TableSection[];
  onPick: (sectionId: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-6 space-y-4 max-h-[80vh] overflow-y-auto"
        style={{ background: 'var(--bg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-fg-primary">{t('useExistingSection')}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--surface-subtle)]">
            <XIcon className="w-5 h-5 text-fg-secondary" />
          </button>
        </div>
        <p className="text-xs text-fg-secondary">{t('useExistingSectionHint')}</p>
        {sections.length === 0 ? (
          <p className="text-sm text-fg-secondary py-4 text-center">{t('noOtherSections')}</p>
        ) : (
          <div className="space-y-1.5">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => onPick(s.id)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-[var(--divider)] hover:border-[var(--brand-500)] hover:bg-[var(--surface-subtle)] transition-colors text-left"
              >
                <span className="font-medium text-fg-primary">{s.name}</span>
                <span className="text-xs text-fg-secondary">
                  {(s.tables ?? []).length} {t('tablesCount')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
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

  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [sections, setSections] = useState<TableSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Canvas placements (working copy)
  const [placements, setPlacements] = useState<CanvasPlacement[]>([]);
  const [originalPlacements, setOriginalPlacements] = useState<CanvasPlacement[]>([]);
  const [decorations, setDecorations] = useState<CanvasDecoration[]>([]);
  const [originalDecorations, setOriginalDecorations] = useState<CanvasDecoration[]>([]);

  // Multi-selection. `selection[0]` is the "primary" — the property panel
  // shows its details. Other entries participate in multi-drag, alignment,
  // and group-delete. Empty array = nothing selected.
  const [selection, setSelection] = useState<SelectionEntry[]>([]);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showAddSectionPicker, setShowAddSectionPicker] = useState(false);
  // Sections the user has explicitly brought into this plan's sidebar during
  // the current session. Combined with sections that already have placements,
  // this determines what's visible in the right panel. New plans start with
  // an empty sidebar so they aren't polluted by every restaurant-wide section.
  const [sessionAddedSectionIds, setSessionAddedSectionIds] = useState<Set<number>>(new Set());
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
  } | null>(null);
  const dropState = useRef<{ tableId: number; tableName: string } | null>(null);
  // Rubber-band selection: click an empty spot of the canvas and drag a box;
  // every item the box covers becomes selected on mouse-up.
  const [rubberBand, setRubberBand] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const rubberBandStart = useRef<{ x: number; y: number } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [fp, secs] = await Promise.all([getFloorPlan(rid, pid), listSections(rid)]);
      setPlan(fp);
      setSections(secs);
      const mapped: CanvasPlacement[] = (fp.placements ?? []).map((p) => ({
        tableId: p.table_id,
        tableName: p.table.name,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        shape: p.shape,
        rotation: p.rotation ?? 0,
      }));
      setPlacements(mapped);
      setOriginalPlacements(mapped);
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
      setDecorations(mappedDecs);
      setOriginalDecorations(mappedDecs);
    } finally {
      setLoading(false);
    }
  }, [rid, pid]);

  useEffect(() => { loadData(); }, [loadData]);

  const placedIds = new Set(placements.map((p) => p.tableId));

  // Sections visible in the right sidebar: sections that have at least one
  // table placed on this plan, plus any the user has explicitly added to this
  // plan during the current edit session.
  const visibleSections = sections.filter((s) => {
    if (sessionAddedSectionIds.has(s.id)) return true;
    return (s.tables ?? []).some((t) => placedIds.has(t.id));
  });
  const hiddenSections = sections.filter(
    (s) => !visibleSections.some((v) => v.id === s.id),
  );

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

  const handleTableMouseDown = (e: React.MouseEvent, tableId: number) => {
    e.preventDefault();
    e.stopPropagation();
    const next = computeSelectionForClick('table', tableId, e.shiftKey);
    setSelection(next);
    // Shift+click toggles — don't start dragging on a shift-click.
    if (e.shiftKey) return;
    dragState.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      initial: snapshotPositions(next),
    };
  };

  const handleDecorationMouseDown = (e: React.MouseEvent, decId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const next = computeSelectionForClick('decoration', decId, e.shiftKey);
    setSelection(next);
    if (e.shiftKey) return;
    dragState.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      initial: snapshotPositions(next),
    };
  };

  const handleRotateMouseDown = (e: React.MouseEvent, kind: 'table' | 'decoration', id: number | string) => {
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
    rotateState.current = { kind, id, centerX, centerY, startAngle, startRotation };
  };

  const handleResizeMouseDown = (
    e: React.MouseEvent,
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
    };
  };

  // Mouse-down on the canvas background → start a rubber-band selection.
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    rubberBandStart.current = { x, y };
    if (!e.shiftKey) setSelection([]);
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      // Rotation
      if (rotateState.current) {
        const { kind, id, centerX, centerY, startAngle, startRotation } = rotateState.current;
        const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
        const rotation = startRotation + (angle - startAngle);
        if (kind === 'table') {
          setPlacements((prev) => prev.map((p) => p.tableId === id ? { ...p, rotation } : p));
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

        if (rs.type === 'table') {
          setPlacements((prev) => prev.map((p) => p.tableId === rs.id ? { ...p, x: nx, y: ny, width: nw, height: nh } : p));
        } else {
          setDecorations((prev) => prev.map((d) => d.id === rs.id ? { ...d, x: nx, y: ny, width: nw, height: nh } : d));
        }
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

        setPlacements((prev) => prev.map((p) => {
          const init = initial.find((i) => i.type === 'table' && i.id === p.tableId);
          return init ? { ...p, x: init.x + clampedDx, y: init.y + clampedDy } : p;
        }));
        setDecorations((prev) => prev.map((d) => {
          const init = initial.find((i) => i.type === 'decoration' && i.id === d.id);
          return init ? { ...d, x: init.x + clampedDx, y: init.y + clampedDy } : d;
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

    const onMouseUp = () => {
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
      dragState.current = null;
      rotateState.current = null;
      resizeState.current = null;
      rubberBandStart.current = null;
      setRubberBand(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rubberBand, placements, decorations]);

  // ─── Drop chip onto canvas ────────────────────────────────────────────────

  const handleCanvasDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dropState.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(94, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(94, ((e.clientY - rect.top) / rect.height) * 100));
    const { tableId, tableName } = dropState.current;
    if (!placedIds.has(tableId)) {
      setPlacements((prev) => [...prev, { tableId, tableName, x, y, width: 6, height: 6, shape: 'square', rotation: 0 }]);
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

  const updateSelected = (patch: Partial<CanvasPlacement>) => {
    if (primary?.type !== 'table') return;
    setPlacements((prev) => prev.map((p) => p.tableId === primary.id ? { ...p, ...patch } : p));
  };

  const updateSelectedDecoration = (patch: Partial<CanvasDecoration>) => {
    if (primary?.type !== 'decoration') return;
    setDecorations((prev) => prev.map((d) => d.id === primary.id ? { ...d, ...patch } : d));
  };

  /** Removes every selected item from the canvas (placements and/or decorations). */
  const removeSelected = () => {
    if (selection.length === 0) return;
    const tableIds = new Set(selection.filter((s) => s.type === 'table').map((s) => s.id as number));
    const decIds = new Set(selection.filter((s) => s.type === 'decoration').map((s) => s.id as string));
    setPlacements((prev) => prev.filter((p) => !tableIds.has(p.tableId)));
    setDecorations((prev) => prev.filter((d) => !decIds.has(d.id)));
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
  };

  // ─── Save / Delete ────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      const inputs: PlacementInput[] = placements.map((p) => ({
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
      await saveFloorPlanLayout(rid, pid, inputs, decInputs);
      router.push(`/${rid}/restaurant/floor-plans`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('confirmDeleteFloorPlan'))) return;
    await deleteFloorPlan(rid, pid);
    router.push(`/${rid}/restaurant/floor-plans`);
  };

  const handleReset = () => {
    setPlacements(originalPlacements);
    setDecorations(originalDecorations);
    setSelection([]);
  };

  const goBack = () => router.push(`/${rid}/restaurant/floor-plans`);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--divider)' }}>
          <button onClick={goBack} className="w-10 h-10 rounded-full flex items-center justify-center text-fg-secondary hover:text-fg-primary transition-colors" style={{ border: '1px solid var(--divider)' }}>
            <XIcon className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold text-fg-primary">{plan ? (plan.name ? t('editFloorPlan') + ' — ' + plan.name : t('editFloorPlan')) : t('editFloorPlan')}</h1>
          <div className="flex items-center gap-2">
            <button onClick={handleReset} className="btn-secondary px-4 text-sm">{t('resetLayout')}</button>
            <button onClick={handleDelete} className="btn-secondary px-4 text-sm text-red-400 border-red-400/30">{t('deleteFloorPlan')}</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary px-5 text-sm disabled:opacity-50">
              {saving ? t('saving') : t('saveFloorPlan')}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left panel — selected item controls */}
          <div className="w-32 flex-shrink-0 flex flex-col gap-3 p-3" style={{ borderRight: '1px solid var(--divider)' }}>
            {selectedPlacement && (
              <>
                <p className="text-xs font-semibold text-fg-secondary uppercase tracking-wider">Table</p>
                <div>
                  <p className="text-xs text-fg-secondary mb-1.5">{t('shape')}</p>
                  <div className="flex flex-col gap-1">
                    {(['square', 'circle'] as const).map((s) => (
                      <button key={s}
                        onClick={() => updateSelected({ shape: s })}
                        className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${selectedPlacement.shape === s ? 'bg-brand-500 text-white' : 'text-fg-secondary hover:text-fg-primary'}`}
                        style={selectedPlacement.shape !== s ? { background: 'var(--surface-subtle)' } : {}}
                      >
                        {s === 'square' ? t('squareShape') : t('circleShape')}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-fg-secondary mb-1">{t('tableWidth')}</p>
                  <NumberInput min={3} max={30}
                    value={Math.round(selectedPlacement.width * 10) / 10}
                    onChange={(n) => updateSelected({ width: n })}
                    className="input text-xs w-full" />
                </div>
                <div>
                  <p className="text-xs text-fg-secondary mb-1">{t('tableHeight')}</p>
                  <NumberInput min={3} max={30}
                    value={Math.round(selectedPlacement.height * 10) / 10}
                    onChange={(n) => updateSelected({ height: n })}
                    className="input text-xs w-full" />
                </div>
                <button onClick={removeSelected} className="p-2 rounded-md hover:bg-red-500/10 self-start">
                  <TrashIcon className="w-4 h-4 text-red-400" />
                </button>
              </>
            )}

            {selectedDecoration && (
              <>
                <p className="text-xs font-semibold text-fg-secondary uppercase tracking-wider">Forme</p>
                <div>
                  <p className="text-xs text-fg-secondary mb-1">Étiquette</p>
                  <input
                    value={selectedDecoration.label}
                    onChange={(e) => updateSelectedDecoration({ label: e.target.value })}
                    className="input text-xs w-full"
                    placeholder="Cuisine..."
                  />
                </div>
                <div>
                  <p className="text-xs text-fg-secondary mb-1.5">{t('shape')}</p>
                  <div className="flex flex-col gap-1">
                    {(['rectangle', 'circle'] as const).map((s) => (
                      <button key={s}
                        onClick={() => updateSelectedDecoration({ shape: s })}
                        className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${selectedDecoration.shape === s ? 'bg-brand-500 text-white' : 'text-fg-secondary hover:text-fg-primary'}`}
                        style={selectedDecoration.shape !== s ? { background: 'var(--surface-subtle)' } : {}}
                      >
                        {s === 'rectangle' ? 'Carré' : 'Cercle'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-fg-secondary mb-1">{t('tableWidth')}</p>
                  <NumberInput integer min={4} max={60}
                    value={Math.round(selectedDecoration.width)}
                    onChange={(n) => updateSelectedDecoration({ width: n })}
                    className="input text-xs w-full" />
                </div>
                <div>
                  <p className="text-xs text-fg-secondary mb-1">{t('tableHeight')}</p>
                  <NumberInput integer min={4} max={60}
                    value={Math.round(selectedDecoration.height)}
                    onChange={(n) => updateSelectedDecoration({ height: n })}
                    className="input text-xs w-full" />
                </div>
                <div>
                  <p className="text-xs text-fg-secondary mb-1.5">Couleur</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PALETTE_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => updateSelectedDecoration({ color: c })}
                        style={{ background: c, width: 20, height: 20, borderRadius: 4, border: selectedDecoration.color === c ? '2px solid #F18A47' : '1px solid rgba(0,0,0,0.15)' }}
                      />
                    ))}
                  </div>
                </div>
                <button onClick={removeSelected} className="p-2 rounded-md hover:bg-red-500/10 self-start">
                  <TrashIcon className="w-4 h-4 text-red-400" />
                </button>
              </>
            )}
          </div>

          {/* Center — canvas */}
          <div className="flex-1 overflow-auto p-4 relative">
            <div
              ref={canvasRef}
              className="relative w-full select-none"
              style={{
                height: '70vh',
                background: 'white',
                backgroundImage: 'linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
                borderRadius: '8px',
                border: '1px solid var(--divider)',
              }}
              onDragOver={handleCanvasDragOver}
              onDrop={handleCanvasDrop}
              onMouseDown={handleCanvasMouseDown}
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
                      onMouseDown={(e) => handleDecorationMouseDown(e, d.id)}
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
                    {isPrimary && <ResizeHandles type="decoration" id={d.id} onMouseDown={handleResizeMouseDown} />}
                    {/* Rotate handle */}
                    {isPrimary && (
                      <div
                        onMouseDown={(e) => handleRotateMouseDown(e, 'decoration', d.id)}
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
                const isPrimary = primary?.type === 'table' && primary.id === p.tableId;
                return (
                  <div
                    key={p.tableId}
                    style={{
                      position: 'absolute',
                      left: `${p.x}%`,
                      top: `${p.y}%`,
                      width: `${p.width}%`,
                      height: `${p.height}%`,
                      transform: `rotate(${p.rotation}deg)`,
                      transformOrigin: 'center center',
                      zIndex: 2,
                    }}
                  >
                    {/* Visible table */}
                    <div
                      onMouseDown={(e) => handleTableMouseDown(e, p.tableId)}
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: p.shape === 'circle' ? '50%' : '6px',
                        background: '#1a1a1a',
                        border: isSelectedTbl ? '2px solid #F18A47' : '2px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'grab',
                        userSelect: 'none',
                        transition: 'border-color 0.1s',
                      }}
                    >
                      <span style={{ color: 'white', fontSize: '11px', fontWeight: 600, textAlign: 'center', padding: '2px', lineHeight: 1.2 }}>
                        {p.tableName}
                      </span>
                    </div>
                    {/* Resize handles — only on the primary selected item */}
                    {isPrimary && <ResizeHandles type="table" id={p.tableId} onMouseDown={handleResizeMouseDown} />}
                    {/* Rotate handle */}
                    {isPrimary && (
                      <div
                        onMouseDown={(e) => handleRotateMouseDown(e, 'table', p.tableId)}
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
            {selection.length >= 2 && (
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

          {/* Right panel — sections palette */}
          <div className="w-64 flex-shrink-0 overflow-y-auto p-4 space-y-4" style={{ borderLeft: '1px solid var(--divider)' }}>
            {/* Plan name */}
            {plan && (
              <div>
                <p className="font-semibold text-fg-primary">{plan.name}</p>
              </div>
            )}

            {/* Empty-state hint when no sections are active in this plan */}
            {visibleSections.length === 0 && (
              <p className="text-xs text-fg-secondary">
                {t('noSectionsInPlanHint')}
              </p>
            )}

            {/* Sections — filtered to only those active in this plan */}
            {visibleSections.map((section) => {
              const tables = section.tables ?? [];
              const unplaced = tables.filter((t) => !placedIds.has(t.id));
              const placed = tables.filter((t) => placedIds.has(t.id));
              return (
                <div key={section.id}>
                  <p className="text-xs font-semibold text-fg-secondary uppercase tracking-wider mb-2">{section.name}</p>
                  {tables.length === 0 && (
                    <p className="text-xs text-fg-secondary">{t('noTablesInSection')}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {/* Unplaced — click to place, also draggable */}
                    {unplaced.map((tbl) => (
                      <div
                        key={tbl.id}
                        draggable
                        onDragStart={() => { dropState.current = { tableId: tbl.id, tableName: tbl.name }; }}
                        onClick={() => {
                          // Place at a staggered position so multiple clicks don't stack
                          const offset = placements.length * 2;
                          const x = Math.min(10 + offset, 60);
                          const y = Math.min(10 + offset, 60);
                          setPlacements((prev) => [...prev, { tableId: tbl.id, tableName: tbl.name, x, y, width: 6, height: 6, shape: 'square', rotation: 0 }]);
                          setSelection([{ type: 'table', id: tbl.id }]);
                        }}
                        className="px-2.5 py-1.5 rounded text-xs font-medium cursor-pointer select-none transition-opacity hover:opacity-80"
                        style={{ background: '#1a1a1a', color: 'white' }}
                        title={tbl.name}
                      >
                        {tbl.name}
                      </div>
                    ))}
                    {/* Already placed — greyed */}
                    {placed.map((tbl) => (
                      <div
                        key={tbl.id}
                        className="px-2.5 py-1.5 rounded text-xs font-medium select-none opacity-30"
                        style={{ background: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}
                        title={tbl.name}
                      >
                        {tbl.name}
                      </div>
                    ))}
                    {/* + Add table — the primary table creation entry point */}
                    <button
                      onClick={() =>
                        setAddTableTarget({
                          sectionId: section.id,
                          sectionName: section.name,
                          nextIndex: tables.length + 1,
                        })
                      }
                      className="px-2 py-1.5 rounded text-xs font-medium cursor-pointer flex items-center gap-1 hover:bg-[var(--surface-subtle)] text-fg-secondary"
                      style={{ border: '1px dashed var(--divider)' }}
                      title={t('addTable')}
                    >
                      <Plus className="w-3 h-3" />
                      {t('addTable')}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Decoration presets */}
            <div style={{ borderTop: '1px solid var(--divider)', paddingTop: '1rem' }}>
              <p className="text-xs font-semibold text-fg-secondary uppercase tracking-wider mb-2">Formes</p>
              <div className="flex flex-wrap gap-1.5">
                {DECORATION_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => addDecoration(preset)}
                    className="px-2.5 py-1.5 rounded text-xs font-medium cursor-pointer transition-opacity hover:opacity-80"
                    style={{ background: preset.color, color: 'rgba(0,0,0,0.6)', border: '1px solid rgba(0,0,0,0.1)' }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Use an existing section on this plan */}
            {hiddenSections.length > 0 && (
              <button
                onClick={() => setShowAddSectionPicker(true)}
                className="w-full text-sm text-brand-500 hover:underline text-left mt-2"
              >
                + {t('useExistingSection')}
              </button>
            )}

            {/* Create a brand-new section */}
            <button
              onClick={() => setShowSectionModal(true)}
              className="w-full text-sm text-brand-500 hover:underline text-left mt-2"
            >
              + {t('addSection')}
            </button>
          </div>
        </div>
      </div>

      {/* Section creation modal */}
      {showSectionModal && (
        <SectionModal
          restaurantId={rid}
          onCreated={(newId) => {
            setShowSectionModal(false);
            // Newly created sections start visible in this plan's sidebar so
            // the user can immediately drop their tables onto the canvas.
            setSessionAddedSectionIds((prev) => {
              const next = new Set(prev);
              next.add(newId);
              return next;
            });
            loadData();
          }}
          onClose={() => setShowSectionModal(false)}
        />
      )}

      {/* Picker — bring an existing section into this plan's sidebar */}
      {showAddSectionPicker && (
        <AddExistingSectionPicker
          sections={hiddenSections}
          onPick={(sectionId) => {
            setSessionAddedSectionIds((prev) => {
              const next = new Set(prev);
              next.add(sectionId);
              return next;
            });
            setShowAddSectionPicker(false);
          }}
          onClose={() => setShowAddSectionPicker(false)}
        />
      )}

      {/* Table creation modal (per-section) */}
      {addTableTarget && (
        <TableEditorModal
          restaurantId={rid}
          sectionId={addTableTarget.sectionId}
          sectionName={addTableTarget.sectionName}
          nextIndex={addTableTarget.nextIndex}
          onSaved={() => { setAddTableTarget(null); loadData(); }}
          onDeleted={() => { setAddTableTarget(null); loadData(); }}
          onClose={() => setAddTableTarget(null)}
        />
      )}

    </>
  );
}
