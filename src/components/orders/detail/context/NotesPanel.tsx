'use client';

// Internal staff notes: the list, and the composer. Staff-only, never shown to
// the customer.
//
// Driven entirely by props. The fixed dock must show the note count while this
// drawer body is unmounted, so the fetch lives in use-order-notes.ts.
//
// The composer is two-step. An always-open <Textarea> cost 128px of a screen
// the whole redesign is trying to stop staff from scrolling, on every order,
// whether or not anyone was writing. A button costs 28px and opens the same
// field.

import { useState } from 'react';
import { Trash2Icon, PlusIcon } from 'lucide-react';
import { Button, Textarea } from '@/components/ds';
import type { OrderNote } from '@/lib/api';

export function OrderNotesSection({
  notes,
  status,
  onAdd,
  onRemove,
  t,
  direction,
}: {
  notes: OrderNote[];
  status: 'loading' | 'ready' | 'error';
  /** Resolves false on failure. */
  onAdd: (body: string) => Promise<boolean>;
  /** Optimistic, with rollback. Resolves false on failure. */
  onRemove: (noteId: number) => Promise<boolean>;
  t: (k: string) => string;
  direction: 'ltr' | 'rtl';
}) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    setError(null);
    const ok = await onAdd(body);
    setSaving(false);
    if (ok) {
      setDraft('');
      setComposing(false);
    } else {
      setError(t('orderNotesSaveError') || 'Could not add note');
    }
  }

  async function remove(noteId: number) {
    setError(null);
    const ok = await onRemove(noteId);
    if (!ok) setError(t('orderNotesDeleteError') || 'Could not delete note');
  }

  return (
    <div className="flex flex-col gap-[var(--s-3)]">
      {status === 'loading' ? (
        <div className="text-fs-sm text-[var(--fg-subtle)]">{t('loading') || '…'}</div>
      ) : status === 'error' ? (
        // Never "no notes": an empty list under a failed fetch means we don't
        // know, and the heading withholds its count for the same reason.
        <div className="text-fs-sm text-[var(--danger-500)]">
          {t('orderNotesLoadError') || 'Could not load notes'}
        </div>
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
                  {[n.author_name, formatNoteTime(n.created_at)].filter(Boolean).join(' · ')}
                </div>
                <button
                  type="button"
                  onClick={() => void remove(n.id)}
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

      {composing ? (
        <div className="flex flex-col gap-[var(--s-2)]">
          {/* maxLength and the ⌘/Ctrl+Enter shortcut stay on the view: the first
              is an input constraint that also blocks a paste, the second is a
              keyboard affordance. Neither is the hook's business. */}
          <Textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('orderNotesPlaceholder') || 'Ajouter une note…'}
            rows={2}
            dir={direction}
            maxLength={2000}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void submit(); }
              if (e.key === 'Escape' && !draft.trim()) setComposing(false);
            }}
          />
          <div className="flex items-center justify-end gap-[var(--s-2)]">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setDraft(''); setComposing(false); setError(null); }}
              disabled={saving}
            >
              {t('cancel')}
            </Button>
            <Button variant="primary" size="sm" onClick={() => void submit()} disabled={!draft.trim() || saving}>
              {saving ? (t('saving') || '…') : (t('orderNotesAdd') || 'Ajouter')}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="secondary" size="sm" onClick={() => setComposing(true)}>
            <PlusIcon /> {t('addNote')}
          </Button>
        </div>
      )}

      {/* Rendered only when there is something to say — an always-present empty
          line reserved height on every order for a message almost none get. */}
      {error && <div className="text-fs-xs text-[var(--danger-500)]">{error}</div>}
    </div>
  );
}

// formatNoteTime renders a note's timestamp compactly using the browser locale;
// falls back to an empty string if it can't be parsed.
function formatNoteTime(iso: string): string {
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
