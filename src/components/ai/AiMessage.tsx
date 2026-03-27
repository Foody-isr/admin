'use client';

import { type AiMessage as AiMessageType } from '@/lib/ai-context';

interface AiMessageProps {
  message: AiMessageType;
}

export default function AiMessage({ message }: AiMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-brand-500 text-white rounded-br-sm'
            : 'rounded-bl-sm'
        }`}
        style={isUser ? {} : { background: 'var(--surface-subtle)', color: 'var(--text-primary)' }}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          <div
            className="ai-markdown"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        )}
      </div>
    </div>
  );
}

// Lightweight markdown: bold, italic, bullet lists, numbered lists, line breaks
function renderMarkdown(text: string): string {
  return text
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Bold: **text**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic: *text*
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Bullet lists: lines starting with - or *
    .replace(/^[*-] (.+)$/gm, '<li>$1</li>')
    // Numbered lists: lines starting with 1. 2. etc.
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul class="list-disc pl-4 space-y-0.5 my-1">$1</ul>')
    // Line breaks
    .replace(/\n/g, '<br/>');
}
