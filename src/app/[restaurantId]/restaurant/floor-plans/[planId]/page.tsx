'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getFloorPlan, listSections, updateFloorPlan, deleteFloorPlan,
  saveFloorPlanLayout, createSection,
  FloorPlan, FloorPlanPlacement, TableSection, PlacementInput, SectionInput,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CanvasPlacement {
  tableId: number;
  tableName: string;
  x: number;     // %
  y: number;     // %
  width: number; // %
  height: number;// %
  shape: 'square' | 'circle';
}

// ─── Section Modal ────────────────────────────────────────────────────────────

function SectionModal({ restaurantId, onCreated, onClose }: {
  restaurantId: number;
  onCreated: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [count, setCount] = useState(5);
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
      await createSection(restaurantId, input);
      onCreated();
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
            <XMarkIcon className="w-5 h-5 text-fg-secondary" />
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
                <input type="number" min="1" max="50" value={count} onChange={(e) => setCount(Number(e.target.value))} className="input text-sm w-full" />
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
  // Original placements for reset
  const [originalPlacements, setOriginalPlacements] = useState<CanvasPlacement[]>([]);

  const [selected, setSelected] = useState<number | null>(null); // tableId
  const [showSectionModal, setShowSectionModal] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ tableId: number; startMouseX: number; startMouseY: number; startX: number; startY: number } | null>(null);
  const dropState = useRef<{ tableId: number; tableName: string } | null>(null);

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
      }));
      setPlacements(mapped);
      setOriginalPlacements(mapped);
    } finally {
      setLoading(false);
    }
  }, [rid, pid]);

  useEffect(() => { loadData(); }, [loadData]);

  const placedIds = new Set(placements.map((p) => p.tableId));

  // ─── Canvas drag (move existing tables) ───────────────────────────────────

  const handleTableMouseDown = (e: React.MouseEvent, tableId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(tableId);
    const placement = placements.find((p) => p.tableId === tableId);
    if (!placement) return;
    dragState.current = {
      tableId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: placement.x,
      startY: placement.y,
    };
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragState.current || !canvasRef.current) return;
      // Destructure synchronously — dragState.current may be nulled by onMouseUp
      // before the setPlacements callback runs.
      const { tableId, startMouseX, startMouseY, startX, startY } = dragState.current;
      const rect = canvasRef.current.getBoundingClientRect();
      const dx = ((e.clientX - startMouseX) / rect.width) * 100;
      const dy = ((e.clientY - startMouseY) / rect.height) * 100;
      const newX = Math.max(0, Math.min(94, startX + dx));
      const newY = Math.max(0, Math.min(94, startY + dy));
      setPlacements((prev) =>
        prev.map((p) => p.tableId === tableId ? { ...p, x: newX, y: newY } : p)
      );
    };
    const onMouseUp = () => { dragState.current = null; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

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
      setPlacements((prev) => [...prev, { tableId, tableName, x, y, width: 6, height: 6, shape: 'square' }]);
    }
    dropState.current = null;
  };

  // ─── Selected table controls ──────────────────────────────────────────────

  const selectedPlacement = placements.find((p) => p.tableId === selected);

  const updateSelected = (patch: Partial<CanvasPlacement>) => {
    if (selected === null) return;
    setPlacements((prev) => prev.map((p) => p.tableId === selected ? { ...p, ...patch } : p));
  };

  const removeSelected = () => {
    if (selected === null) return;
    setPlacements((prev) => prev.filter((p) => p.tableId !== selected));
    setSelected(null);
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
      }));
      await saveFloorPlanLayout(rid, pid, inputs);
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
    setSelected(null);
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
            <XMarkIcon className="w-5 h-5" />
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

          {/* Left panel — selected table controls */}
          <div className="w-28 flex-shrink-0 flex flex-col gap-3 p-3" style={{ borderRight: '1px solid var(--divider)' }}>
            {selectedPlacement && (
              <>
                {/* Shape */}
                <div>
                  <p className="text-xs text-fg-secondary mb-1.5">{t('shape')}</p>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => updateSelected({ shape: 'square' })}
                      className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${selectedPlacement.shape === 'square' ? 'bg-brand-500 text-white' : 'text-fg-secondary hover:text-fg-primary'}`}
                      style={selectedPlacement.shape !== 'square' ? { background: 'var(--surface-subtle)' } : {}}
                    >
                      {t('squareShape')}
                    </button>
                    <button
                      onClick={() => updateSelected({ shape: 'circle' })}
                      className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${selectedPlacement.shape === 'circle' ? 'bg-brand-500 text-white' : 'text-fg-secondary hover:text-fg-primary'}`}
                      style={selectedPlacement.shape !== 'circle' ? { background: 'var(--surface-subtle)' } : {}}
                    >
                      {t('circleShape')}
                    </button>
                  </div>
                </div>

                {/* Width */}
                <div>
                  <p className="text-xs text-fg-secondary mb-1">{t('tableWidth')}</p>
                  <input
                    type="number" min="3" max="30" step="0.5"
                    value={Math.round(selectedPlacement.width * 10) / 10}
                    onChange={(e) => updateSelected({ width: Number(e.target.value) })}
                    className="input text-xs w-full"
                  />
                </div>

                {/* Height */}
                <div>
                  <p className="text-xs text-fg-secondary mb-1">{t('tableHeight')}</p>
                  <input
                    type="number" min="3" max="30" step="0.5"
                    value={Math.round(selectedPlacement.height * 10) / 10}
                    onChange={(e) => updateSelected({ height: Number(e.target.value) })}
                    className="input text-xs w-full"
                  />
                </div>

                {/* Delete */}
                <button onClick={removeSelected} className="p-2 rounded-md hover:bg-red-500/10 self-start">
                  <TrashIcon className="w-4 h-4 text-red-400" />
                </button>
              </>
            )}
          </div>

          {/* Center — canvas */}
          <div className="flex-1 overflow-auto p-4">
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
              onClick={() => setSelected(null)}
            >
              {placements.map((p) => (
                <div
                  key={p.tableId}
                  onMouseDown={(e) => handleTableMouseDown(e, p.tableId)}
                  onClick={(e) => { e.stopPropagation(); setSelected(p.tableId); }}
                  style={{
                    position: 'absolute',
                    left: `${p.x}%`,
                    top: `${p.y}%`,
                    width: `${p.width}%`,
                    height: `${p.height}%`,
                    borderRadius: p.shape === 'circle' ? '50%' : '6px',
                    background: '#1a1a1a',
                    border: selected === p.tableId ? '2px solid #F18A47' : '2px solid transparent',
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
              ))}
            </div>
          </div>

          {/* Right panel — sections palette */}
          <div className="w-64 flex-shrink-0 overflow-y-auto p-4 space-y-4" style={{ borderLeft: '1px solid var(--divider)' }}>
            {/* Plan name */}
            {plan && (
              <div>
                <p className="font-semibold text-fg-primary">{plan.name}</p>
              </div>
            )}

            {/* Sections */}
            {sections.map((section) => {
              const unplaced = section.tables.filter((t) => !placedIds.has(t.id));
              const placed = section.tables.filter((t) => placedIds.has(t.id));
              return (
                <div key={section.id}>
                  <p className="text-xs font-semibold text-fg-secondary uppercase tracking-wider mb-2">{section.name}</p>
                  {section.tables.length === 0 && (
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
                          setPlacements((prev) => [...prev, { tableId: tbl.id, tableName: tbl.name, x, y, width: 6, height: 6, shape: 'square' }]);
                          setSelected(tbl.id);
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
                  </div>
                </div>
              );
            })}

            {/* Add section */}
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
          onCreated={() => { setShowSectionModal(false); loadData(); }}
          onClose={() => setShowSectionModal(false)}
        />
      )}
    </>
  );
}
