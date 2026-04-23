'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useAi } from '@/lib/ai-context';
import { Sparkles } from 'lucide-react';
import { Button, Chip } from '@/components/ds';

const PLACEHOLDER_KEYS = [
  'aiPromptPlaceholder1',
  'aiPromptPlaceholder2',
  'aiPromptPlaceholder3',
  'aiPromptPlaceholder4',
];

const SUGGESTION_KEYS = [
  'aiWeekSales',
  'aiOutOfStock',
];

/**
 * Pinned AI prompt card — matches design-reference/design/screens/dashboard.jsx:32-43.
 * Sparkles tile on the left + "Demandez à Foody AI…" label with example prompt,
 * suggestion chips, and a "Demander" primary button.
 */
export default function AiPromptBar() {
  const { t } = useI18n();
  const { sendMessage, openDrawer } = useAi();
  const [input, setInput] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Rotate example prompt every 4s when input is empty and not focused
  useEffect(() => {
    if (focused || input) return;
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_KEYS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [focused, input]);

  const handleSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setInput('');
      sendMessage(trimmed);
      openDrawer();
    },
    [sendMessage, openDrawer],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(input);
    }
  };

  const example = t(PLACEHOLDER_KEYS[placeholderIndex]);

  return (
    <div
      className="rounded-r-lg shadow-1 flex items-center gap-[var(--s-3)] p-[var(--s-4)]"
      style={{
        background:
          'linear-gradient(135deg, color-mix(in oklab, var(--brand-500) 4%, var(--surface)), var(--surface))',
        border:
          '1px solid color-mix(in oklab, var(--brand-500) 20%, var(--line))',
      }}
    >
      {/* Sparkles icon tile */}
      <div
        className="w-9 h-9 rounded-r-md grid place-items-center shrink-0"
        style={{
          background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)',
          color: 'var(--brand-500)',
        }}
      >
        <Sparkles className="w-4 h-4" />
      </div>

      {/* Prompt label + input */}
      <div className="flex-1 min-w-0">
        <div className="text-fs-sm text-[var(--fg-muted)] truncate">
          {t('askFoodyAi') || 'Demandez à Foody AI…'}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          placeholder={`"${example}"`}
          className="w-full bg-transparent border-none outline-none text-fs-sm text-[var(--fg)] p-0 placeholder:text-[var(--fg)] placeholder:italic"
        />
      </div>

      {/* Suggestion chips */}
      <div className="hidden lg:flex items-center gap-[var(--s-2)] shrink-0">
        {SUGGESTION_KEYS.map((key) => (
          <Chip key={key} onClick={() => handleSubmit(t(key))}>
            {t(key)}
          </Chip>
        ))}
      </div>

      {/* Ask button */}
      <Button
        variant="primary"
        size="sm"
        onClick={() => handleSubmit(input || example)}
        className="shrink-0"
      >
        {t('aiAsk') || 'Demander'}
      </Button>
    </div>
  );
}
