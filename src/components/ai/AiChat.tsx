'use client';

import { useRef, useEffect, FormEvent } from 'react';
import { useAi } from '@/lib/ai-context';
import { useI18n } from '@/lib/i18n';
import AiMessage from './AiMessage';
import AiWelcome from './AiWelcome';
import { SendIcon } from 'lucide-react';

export default function AiChat({ input, onInputChange }: { input: string; onInputChange: (value: string) => void }) {
  const { messages, isStreaming, sendMessage } = useAi();
  const { t, direction } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isRtl = direction === 'rtl';

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    onInputChange('');
    await sendMessage(text);
    inputRef.current?.focus();
  };

  return (
    <>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <AiWelcome />
        ) : (
          messages.map((msg) => (
            <AiMessage key={msg.id} message={msg} />
          ))
        )}
        {isStreaming && (
          <div className="flex items-center gap-2 text-fg-secondary text-sm">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            {t('aiThinking')}
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="shrink-0 p-3 border-t" style={{ borderColor: 'var(--divider)' }}>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            aria-label={t('aiPlaceholder')}
            placeholder={t('aiPlaceholder')}
            disabled={isStreaming}
            className="input flex-1 text-sm"
            dir={isRtl ? 'rtl' : 'ltr'}
          />
          <button
            type="submit"
            aria-label={t('send')}
            disabled={!input.trim() || isStreaming}
            className="h-10 w-10 flex items-center justify-center rounded-r-md bg-[var(--action)] text-[var(--action-fg)] disabled:opacity-40 hover:bg-[var(--action-hover)] transition-colors"
          >
            <SendIcon className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </form>
    </>
  );
}
