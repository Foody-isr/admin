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
    <aside
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        height: '100%',
        width: 384,
        background: 'var(--surface-1, white)',
        borderLeft: '1px solid var(--line)',
        boxShadow: '-4px 0 24px rgba(0,0,0,.08)',
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>{t('labRefineTitle')}</h2>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--fg-muted)',
            fontSize: 20,
            lineHeight: 1,
            padding: '0 4px',
          }}
          aria-label={t('labRefineClose')}
        >
          ×
        </button>
      </header>

      {/* Message history */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {history.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
            {t('labRefineExamples')}
          </p>
        )}

        {history.map((m, i) => (
          <div
            key={i}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              fontSize: 14,
              lineHeight: 1.45,
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              background:
                m.role === 'user'
                  ? 'rgba(59,130,246,.1)'
                  : 'var(--bg-subtle, #f3f4f6)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {m.content}
          </div>
        ))}

        {submitting && (
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
            {t('labRefineThinking')}
          </p>
        )}
      </div>

      {/* Input area */}
      <div
        style={{
          padding: 12,
          borderTop: '1px solid var(--line)',
          flexShrink: 0,
        }}
      >
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
          style={{
            width: '100%',
            padding: 8,
            borderRadius: 6,
            border: '1px solid var(--line)',
            fontSize: 14,
            resize: 'vertical',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            color: 'var(--fg)',
            background: 'var(--bg, white)',
          }}
        />
        <button
          onClick={() => void send()}
          disabled={!text.trim() || submitting}
          style={{
            marginTop: 8,
            width: '100%',
            padding: '8px 0',
            borderRadius: 6,
            background: 'rgb(249,115,22)',
            color: 'white',
            border: 'none',
            fontSize: 14,
            fontWeight: 500,
            cursor: !text.trim() || submitting ? 'not-allowed' : 'pointer',
            opacity: !text.trim() || submitting ? 0.5 : 1,
          }}
        >
          {t('labRefineSend')}
        </button>
      </div>
    </aside>
  );
}
