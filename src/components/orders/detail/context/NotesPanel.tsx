'use client';

// Internal staff notes. Moved verbatim from OrderDetailDrawer.tsx (1112-1236);
// still self-fetching, which A4 revisits alongside the activity timeline.

import { useEffect, useState } from 'react';
import { Trash2Icon } from 'lucide-react';
import { Button, Textarea } from '@/components/ds';
import { getOrderNotes, addOrderNote, deleteOrderNote, type Order, type OrderNote } from '@/lib/api';

// ─── Internal order notes ─────────────────────────────────────────────────────
// Self-contained: fetches its own notes for the order and handles add/delete via
// the API, so every host that renders the drawer gets notes with no extra wiring.
// Staff-only and never shown to the customer.
export function OrderNotesSection({
  order, t, direction,
}: {
  order: Order;
  t: (k: string) => string;
  direction: 'ltr' | 'rtl';
}) {
  const restaurantId = order.restaurant_id;
  const [notes, setNotes] = useState<OrderNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    getOrderNotes(restaurantId, order.id)
      .then((rows) => { if (alive) setNotes(rows); })
      .catch(() => { if (alive) setError(t('orderNotesLoadError') || 'Could not load notes'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [restaurantId, order.id, t]);

  async function submit() {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    setError(null);
    try {
      const note = await addOrderNote(restaurantId, order.id, body);
      setNotes((prev) => [note, ...prev]);
      setDraft('');
    } catch {
      setError(t('orderNotesSaveError') || 'Could not add note');
    } finally {
      setSaving(false);
    }
  }

  async function remove(noteId: number) {
    const prev = notes;
    setNotes((rows) => rows.filter((n) => n.id !== noteId)); // optimistic
    try {
      await deleteOrderNote(restaurantId, order.id, noteId);
    } catch {
      setNotes(prev); // rollback
      setError(t('orderNotesDeleteError') || 'Could not delete note');
    }
  }

  return (
    <div className="flex flex-col gap-[var(--s-3)]">
      {loading ? (
        <div className="text-fs-sm text-[var(--fg-subtle)]">{t('loading') || '…'}</div>
      ) : notes.length === 0 ? (
        <div className="text-fs-sm text-[var(--fg-subtle)]">{t('orderNotesEmpty') || 'Aucune note'}</div>
      ) : (
        <ul className="flex flex-col gap-[var(--s-2)]">
          {notes.map((n) => (
            <li
              key={n.id}
              className="group rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] px-[var(--s-3)] py-[var(--s-2)]"
            >
              <div className="flex items-start justify-between gap-[var(--s-2)]">
                <div className="text-fs-xs text-[var(--fg-subtle)]">
                  {[n.author_name, formatNoteTime(n.created_at, t)].filter(Boolean).join(' · ')}
                </div>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  aria-label={t('delete') || 'Supprimer'}
                  className="shrink-0 text-[var(--fg-subtle)] hover:text-[var(--danger-500)] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <Trash2Icon className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-fs-sm text-[var(--fg)] mt-0.5 whitespace-pre-wrap break-words">{n.body}</div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-[var(--s-2)]">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('orderNotesPlaceholder') || 'Ajouter une note…'}
          rows={2}
          dir={direction}
          maxLength={2000}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void submit(); }
          }}
        />
        <div className="flex items-center justify-between gap-[var(--s-2)]">
          <span className="text-fs-xs text-[var(--danger-500)]">{error || ''}</span>
          <Button variant="primary" size="sm" onClick={() => void submit()} disabled={!draft.trim() || saving}>
            {saving ? (t('saving') || '…') : (t('orderNotesAdd') || 'Ajouter')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// formatNoteTime renders a note's timestamp compactly using the browser locale;
// falls back to the raw ISO string if it can't be parsed.
function formatNoteTime(iso: string, _t: (k: string) => string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}
