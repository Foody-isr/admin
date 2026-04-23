'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useI18n } from '@/lib/i18n';
import { useAi } from '@/lib/ai-context';
import { ArrowUpIcon } from 'lucide-react';

const PLACEHOLDER_KEYS = [
  'aiPromptPlaceholder1',
  'aiPromptPlaceholder2',
  'aiPromptPlaceholder3',
  'aiPromptPlaceholder4',
];

const SUGGESTION_KEYS = [
  'aiPromptPlaceholder1',
  'aiPromptPlaceholder2',
  'aiPromptPlaceholder3',
  'aiPromptPlaceholder4',
];

export default function AiPromptBar() {
  const { t } = useI18n();
  const { sendMessage, openDrawer } = useAi();
  const [input, setInput] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Rotate placeholder text with fade animation
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderVisible(false);
      setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_KEYS.length);
        setPlaceholderVisible(true);
      }, 400);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSubmit = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setInput('');
    setShowSuggestions(false);
    sendMessage(trimmed);
    openDrawer();
  }, [sendMessage, openDrawer]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(input);
    }
  };

  return (
    <div ref={containerRef} className="relative mb-6">
      <div className="ai-prompt-bar">
        {/* Pins chip */}
        <button
          type="button"
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium shrink-0"
          style={{ background: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}
          title={t('comingSoon')}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="17" x2="12" y2="22" />
            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
          </svg>
          {t('aiPins')}
        </button>

        {/* Input with animated placeholder */}
        <div className="flex-1 relative min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent border-none outline-none text-sm text-fg-primary"
            style={{ padding: 0 }}
          />
          {!input && (
            <span
              className="ai-prompt-placeholder"
              style={{ opacity: placeholderVisible ? 1 : 0, top: '50%', transform: 'translateY(-50%)', left: 0 }}
            >
              {t(PLACEHOLDER_KEYS[placeholderIndex])}
            </span>
          )}
        </div>

        {/* Send button */}
        <button
          type="button"
          onClick={() => handleSubmit(input)}
          disabled={!input.trim()}
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors"
          style={{
            background: input.trim() ? 'var(--text-primary)' : 'var(--surface-subtle)',
            color: input.trim() ? 'var(--surface)' : 'var(--text-secondary)',
          }}
        >
          <ArrowUpIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && !input && (
        <div
          className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-10 shadow-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          {SUGGESTION_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className="w-full text-left px-4 py-3 text-sm text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors"
              style={{ borderBottom: '1px solid var(--divider)' }}
              onClick={() => handleSubmit(t(key))}
            >
              {t(key)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
