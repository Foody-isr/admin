'use client';
import { useState, useEffect, useRef } from 'react';
import { useRefineDraft } from '../hooks/useRefineDraft';
import { useI18n } from '@/lib/i18n';
import type { ChatPatch } from '../types';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * RefineDrawer — right-side slide-in panel for natural-language recipe refinement.
 *
 * The user types a message (e.g. "swap mozzarella for halloumi") and the AI
 * returns an assistant reply + structured ChatPatch[] that the parent applies
 * to the DraftPayload via applyPatches().
 *
 * Props:
 *   restaurantId — used to authenticate API calls
 *   draftId      — the draft being refined (null = drawer is idle)
 *   open         — controls visibility; no DOM is rendered when false
 *   onClose      — called when the user closes the drawer
 *   onPatches    — called with the patches returned by the AI; parent applies them
 */
export function RefineDrawer({
  restaurantId,
  draftId,
  open,
  onClose,
  onPatches,
}: {
  restaurantId: number;
  draftId: number | null;
  open: boolean;
  onClose: () => void;
  onPatches: (patches: ChatPatch[]) => void;
}) {
  const { t } = useI18n();
  const { refine, submitting } = useRefineDraft(restaurantId, draftId);
  const [text, setText] = useState('');
  const [history, setHistory] = useState<Msg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when new messages arrive.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, submitting]);

  // Reset conversation when a new draft is selected.
  useEffect(() => {
    setHistory([]);
    setText('');
  }, [draftId]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || submitting) return;
    setHistory((h) => [...h, { role: 'user', content: msg }]);
    setText('');
    const res = await refine(msg);
    if (!res) {
      setHistory((h) => [...h, { role: 'assistant', content: t('labRefineError') }]);
      return;
    }
    setHistory((h) => [...h, { role: 'assistant', content: res.assistant_message }]);
    if (res.patches.length > 0) onPatches(res.patches);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" onClick={onClose}>
      <aside className="absolute inset-0 flex flex-col bg-[var(--surface)] pb-[var(--safe-bottom)] pt-[var(--safe-top)] shadow-2xl sm:inset-y-0 sm:start-auto sm:w-96 sm:border-s sm:border-[var(--line)]" onClick={(event) => event.stopPropagation()}>
      <header className="flex min-h-14 shrink-0 items-center justify-between border-b border-[var(--line)] px-4 py-3">
        <h2 className="m-0 text-base font-semibold text-[var(--fg)]">{t('labRefineTitle')}</h2>
        <button
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-[9px] text-xl leading-none text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
          aria-label={t('labRefineClose')}
        >
          ×
        </button>
      </header>

      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
      >
        {history.length === 0 && (
          <p className="m-0 text-sm leading-6 text-[var(--fg-muted)]">
            {t('labRefineExamples')}
          </p>
        )}

        {history.map((m, i) => (
          <div
            key={i}
            className={`max-w-[88%] whitespace-pre-wrap break-words rounded-[12px] px-3 py-2.5 text-sm leading-6 ${m.role === 'user' ? 'self-end bg-[color-mix(in_oklab,var(--brand-500)_10%,var(--surface))]' : 'self-start bg-[var(--surface-2)]'}`}
          >
            {m.content}
          </div>
        ))}

        {submitting && (
          <p className="m-0 text-sm text-[var(--fg-muted)]">
            {t('labRefineThinking')}
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--line)] p-3">
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={t('labRefinePlaceholder')}
          className="w-full resize-y rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-base text-[var(--fg)] outline-none focus:border-[var(--brand-500)] focus:shadow-[var(--focus-ring)] sm:text-sm"
        />
        <button
          onClick={() => void send()}
          disabled={!text.trim() || submitting}
          className="mt-2 min-h-11 w-full rounded-[9px] bg-[var(--brand-500)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-600)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('labRefineSend')}
        </button>
      </div>
      </aside>
    </div>
  );
}
