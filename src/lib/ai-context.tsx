'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { streamAiChat } from '@/lib/api';

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface AiContextValue {
  isOpen: boolean;
  messages: AiMessage[];
  isStreaming: boolean;
  toggleDrawer: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  sendMessage: (text: string) => Promise<void>;
  clearChat: () => void;
}

const AiContext = createContext<AiContextValue | null>(null);

export function useAi() {
  const ctx = useContext(AiContext);
  if (!ctx) throw new Error('useAi must be used inside AiChatProvider');
  return ctx;
}

const STORAGE_KEY = 'foody_ai_messages';

function loadMessages(): AiMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMessages(msgs: AiMessage[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
  } catch { /* ignore quota errors */ }
}

interface AiChatProviderProps {
  restaurantId: number;
  children: ReactNode;
}

export function AiChatProvider({ restaurantId, children }: AiChatProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AiMessage[]>(loadMessages);
  const [isStreaming, setIsStreaming] = useState(false);

  const toggleDrawer = useCallback(() => setIsOpen((p) => !p), []);
  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);

  const clearChat = useCallback(() => {
    setMessages([]);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: AiMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => {
      const next = [...prev, userMsg];
      saveMessages(next);
      return next;
    });

    setIsStreaming(true);
    const assistantId = `a-${Date.now()}`;
    // Add placeholder assistant message for streaming
    const placeholder: AiMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, placeholder]);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      await streamAiChat(
        restaurantId,
        text,
        history,
        (delta) => {
          // Append streaming text delta to the assistant message
          setMessages((prev) => {
            const updated = prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + delta } : m
            );
            saveMessages(updated);
            return updated;
          });
        },
      );
    } catch (err) {
      // Replace empty placeholder with error message
      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: err instanceof Error ? err.message : 'Something went wrong. Please try again.' }
            : m
        );
        saveMessages(updated);
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [restaurantId, messages]);

  return (
    <AiContext.Provider value={{ isOpen, messages, isStreaming, toggleDrawer, openDrawer, closeDrawer, sendMessage, clearChat }}>
      {children}
    </AiContext.Provider>
  );
}
