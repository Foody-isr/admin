'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  getAllCategories, getRotationSchedules, setRotationSchedule, deleteRotationSchedule,
  renameRotationGroup, deleteRotationGroup, updateMenuItem,
  MenuCategory, MenuItem, RotationSchedule,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { PencilIcon, TrashIcon, PlusIcon, CheckIcon, XIcon } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the Monday (start of ISO week) for a given Date, as YYYY-MM-DD. */
function isoWeekMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  // ISO week: Monday = 1. Adjust so Monday = 0 offset.
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

/** Returns an array of 4 week start strings (Mondays) beginning from the current week. */
function getWeekStarts(count = 4): string[] {
  const weeks: string[] = [];
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monday = isoWeekMonday(base);
  const start = new Date(monday);
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i * 7);
    weeks.push(d.toISOString().split('T')[0]);
  }
  return weeks;
}

/** Formats a YYYY-MM-DD date as "Dec 30" etc. */
function formatWeekLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface RotationGroup {
  name: string;
  items: (MenuItem & { category_name: string })[];
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RotationPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [schedules, setSchedules] = useState<RotationSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const weekStarts = getWeekStarts(4);

  // ─── Derived: groups ──────────────────────────────────────────────────────

  const allItems: (MenuItem & { category_name: string })[] = categories.flatMap((c) =>
    (c.items ?? []).map((i) => ({ ...i, category_name: c.name }))
  );

  const groupMap = new Map<string, RotationGroup>();
  for (const item of allItems) {
    if (!item.rotation_group) continue;
    if (!groupMap.has(item.rotation_group)) {
      groupMap.set(item.rotation_group, { name: item.rotation_group, items: [] });
    }
    groupMap.get(item.rotation_group)!.items.push(item);
  }
  const groups = Array.from(groupMap.values());

  // All items NOT yet in a group (for adding to a new/existing group)
  const ungroupedItems = allItems.filter((i) => !i.rotation_group);

  // ─── Load ─────────────────────────────────────────────────────────────────

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, scheds] = await Promise.all([getAllCategories(rid), getRotationSchedules(rid, 4)]);
      setCategories(cats);
      setSchedules(scheds);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  // ─── Schedule lookup: group + weekStart → schedule ────────────────────────

  const scheduleMap = new Map<string, RotationSchedule>();
  for (const s of schedules) {
    const key = `${s.rotation_group}__${s.week_start.split('T')[0]}`;
    scheduleMap.set(key, s);
  }

  const getScheduled = (group: string, weekStart: string) =>
    scheduleMap.get(`${group}__${weekStart}`);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleSetSchedule = async (group: string, menuItemId: number, weekStart: string) => {
    await setRotationSchedule(rid, { rotation_group: group, menu_item_id: menuItemId, week_start: weekStart });
    reload();
  };

  const handleClearSchedule = async (scheduleId: number) => {
    await deleteRotationSchedule(rid, scheduleId);
    reload();
  };

  // ─── Group management ─────────────────────────────────────────────────────

  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [addingItems, setAddingItems] = useState<string | null>(null); // group name being added to
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupInput, setNewGroupInput] = useState('');

  const handleRenameGroup = async (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) { setEditingGroup(null); return; }
    await renameRotationGroup(rid, oldName, newName.trim());
    setEditingGroup(null);
    reload();
  };

  const handleDeleteGroup = async (name: string) => {
    if (!confirm(`${t('deleteGroupConfirm')} "${name}"?`)) return;
    await deleteRotationGroup(rid, name);
    reload();
  };

  const handleAddItemToGroup = async (item: MenuItem, groupName: string) => {
    await updateMenuItem(rid, item.id, { rotation_group: groupName } as Partial<MenuItem>);
    setAddingItems(null);
    reload();
  };

  const handleRemoveItemFromGroup = async (item: MenuItem) => {
    if (!confirm(`${t('removeFromGroupConfirm')} "${item.name}"?`)) return;
    await updateMenuItem(rid, item.id, { rotation_group: null } as unknown as Partial<MenuItem>);
    reload();
  };

  const handleCreateGroup = async () => {
    if (!newGroupInput.trim()) return;
    // Groups are created implicitly by assigning the first item
    // We need at least one item to assign
    if (ungroupedItems.length === 0) {
      alert(t('noUngroupedItems'));
      setCreatingGroup(false);
      return;
    }
    const item = ungroupedItems[0];
    await updateMenuItem(rid, item.id, { rotation_group: newGroupInput.trim() } as Partial<MenuItem>);
    setCreatingGroup(false);
    setNewGroupInput('');
    reload();
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-fg-primary">{t('weeklyRotation')}</h1>
          <p className="text-sm text-fg-secondary mt-1">{t('weeklyRotationDesc')}</p>
        </div>
        <button
          onClick={() => setCreatingGroup(true)}
          className="btn-primary flex items-center gap-2"
        >
          <PlusIcon className="w-4 h-4" />
          {t('newGroup')}
        </button>
      </div>

      {/* Create group inline form */}
      {creatingGroup && (
        <div className="card flex items-center gap-3">
          <input
            autoFocus
            className="input flex-1 text-sm"
            placeholder={t('groupNamePlaceholder')}
            value={newGroupInput}
            onChange={(e) => setNewGroupInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateGroup(); if (e.key === 'Escape') setCreatingGroup(false); }}
          />
          <button onClick={handleCreateGroup} className="btn-primary text-sm">{t('create')}</button>
          <button onClick={() => setCreatingGroup(false)} className="btn-secondary text-sm">{t('cancel')}</button>
        </div>
      )}

      {groups.length === 0 && !creatingGroup && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="text-4xl">🔄</div>
          <h2 className="text-lg font-semibold text-fg-primary">{t('noRotationGroups')}</h2>
          <p className="text-sm text-fg-secondary max-w-sm text-center">{t('noRotationGroupsDesc')}</p>
        </div>
      )}

      {/* Groups + schedule grid */}
      {groups.map((group) => (
        <div key={group.name} className="card space-y-4">
          {/* Group header */}
          <div className="flex items-center gap-3">
            {editingGroup === group.name ? (
              <form
                className="flex items-center gap-2 flex-1"
                onSubmit={(e) => { e.preventDefault(); handleRenameGroup(group.name, newGroupName); }}
              >
                <input
                  autoFocus
                  className="input text-sm flex-1"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                />
                <button type="submit" className="p-1 rounded text-brand-500 hover:bg-[var(--surface-subtle)]">
                  <CheckIcon className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setEditingGroup(null)} className="p-1 rounded hover:bg-[var(--surface-subtle)]">
                  <XIcon className="w-4 h-4 text-fg-secondary" />
                </button>
              </form>
            ) : (
              <>
                <h2 className="text-base font-semibold text-fg-primary flex-1">{group.name}</h2>
                <button
                  onClick={() => { setEditingGroup(group.name); setNewGroupName(group.name); }}
                  className="p-1.5 rounded hover:bg-[var(--surface-subtle)]"
                  title={t('renameGroup')}
                >
                  <PencilIcon className="w-4 h-4 text-fg-secondary" />
                </button>
                <button
                  onClick={() => handleDeleteGroup(group.name)}
                  className="p-1.5 rounded hover:bg-red-500/10 text-red-400"
                  title={t('deleteGroup')}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Items in this group */}
          <div>
            <div className="text-xs text-fg-secondary font-medium mb-2 uppercase tracking-wider">
              {t('itemsInGroup')}
            </div>
            <div className="flex flex-wrap gap-2">
              {group.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
                  style={{ background: 'var(--surface-subtle)', color: 'var(--text-primary)' }}
                >
                  {item.name}
                  <button
                    onClick={() => handleRemoveItemFromGroup(item)}
                    className="text-fg-secondary hover:text-red-400"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {/* Add item to group */}
              <div className="relative">
                <button
                  onClick={() => setAddingItems(addingItems === group.name ? null : group.name)}
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-fg-secondary border hover:border-brand-500 hover:text-brand-500 transition-colors"
                  style={{ borderColor: 'var(--divider)' }}
                >
                  <PlusIcon className="w-3 h-3" />
                  {t('addItem')}
                </button>
                {addingItems === group.name && (
                  <div
                    className="absolute top-full left-0 mt-1 rounded-standard py-1 w-56 z-50 shadow-lg"
                    style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
                  >
                    {ungroupedItems.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-fg-secondary">{t('noUngroupedItems')}</div>
                    ) : (
                      ungroupedItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleAddItemToGroup(item, group.name)}
                          className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)]"
                        >
                          <span className="flex-1">{item.name}</span>
                          <span className="text-fg-secondary">{item.category_name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Schedule grid: 4 weeks */}
          <div>
            <div className="text-xs text-fg-secondary font-medium mb-3 uppercase tracking-wider">
              {t('weeklySchedule')}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {weekStarts.map((weekStart, wi) => {
                const scheduled = getScheduled(group.name, weekStart);
                const scheduledItem = scheduled
                  ? group.items.find((i) => i.id === scheduled.menu_item_id)
                  : null;
                const isCurrentWeek = wi === 0;

                return (
                  <div
                    key={weekStart}
                    className="rounded-standard p-3 space-y-2"
                    style={{
                      background: isCurrentWeek ? 'var(--brand-subtle, rgba(248,131,121,0.08))' : 'var(--surface-subtle)',
                      border: isCurrentWeek ? '1px solid var(--brand-200, rgba(248,131,121,0.3))' : '1px solid var(--divider)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-fg-secondary">
                        {isCurrentWeek ? `${t('thisWeek')} ·` : ''} {formatWeekLabel(weekStart)}
                      </span>
                      {scheduled && (
                        <button
                          onClick={() => handleClearSchedule(scheduled.id)}
                          className="text-fg-secondary hover:text-red-400"
                          title={t('clear')}
                        >
                          <XIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Item selector */}
                    <select
                      className="input w-full text-xs py-1"
                      value={scheduled?.menu_item_id ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                          if (scheduled) handleClearSchedule(scheduled.id);
                        } else {
                          handleSetSchedule(group.name, parseInt(val), weekStart);
                        }
                      }}
                    >
                      <option value="">{t('notScheduled')}</option>
                      {group.items.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>

                    {scheduledItem && (
                      <div className="text-xs text-fg-secondary truncate">{scheduledItem.category_name}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
