'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import { API_URL, getToken } from '@/lib/api';

export interface WsEvent {
  type: string;
  payload: Record<string, unknown>;
}

type WsStatus = 'connecting' | 'connected' | 'disconnected';

interface WsContextType {
  status: WsStatus;
  lastEvent: WsEvent | null;
  addProcessingGuard: (orderId: number) => void;
  removeProcessingGuard: (orderId: number) => void;
  isProcessing: (orderId: number) => boolean;
}

const WsContext = createContext<WsContextType>({
  status: 'disconnected',
  lastEvent: null,
  addProcessingGuard: () => {},
  removeProcessingGuard: () => {},
  isProcessing: () => false,
});

function buildWsUrl(restaurantId: number): string {
  const base = API_URL.replace(/^http/, 'ws');
  const token = getToken();
  return `${base}/ws?restaurant_id=${restaurantId}${token ? `&token=${token}` : ''}`;
}

const MAX_RECONNECT_ATTEMPTS = 10;

export function WsProvider({ restaurantId, children }: { restaurantId: number; children: ReactNode }) {
  const [status, setStatus] = useState<WsStatus>('disconnected');
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);
  const processingRef = useRef<Set<number>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const disposed = useRef(false);

  const connect = useCallback(() => {
    if (disposed.current) return;

    const token = getToken();
    if (!token || !restaurantId) {
      setStatus('disconnected');
      return;
    }

    setStatus('connecting');
    const url = buildWsUrl(restaurantId);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      retryCount.current = 0;

      // Ping keepalive every 30s
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type) {
          setLastEvent({ type: data.type, payload: data.payload || data });
        }
      } catch {
        // ignore non-JSON messages (pong, etc.)
      }
    };

    ws.onclose = () => {
      cleanup();
      if (!disposed.current) {
        setStatus('disconnected');
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }, [restaurantId]);

  const cleanup = useCallback(() => {
    if (pingTimer.current) {
      clearInterval(pingTimer.current);
      pingTimer.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (disposed.current) return;
    if (retryCount.current >= MAX_RECONNECT_ATTEMPTS) {
      // Server appears to be down — stop retrying to avoid infinite 502 loops.
      // The user can refresh the page to reconnect.
      setStatus('disconnected');
      return;
    }
    const delay = Math.min(Math.pow(2, retryCount.current) * 1000, 30000);
    retryCount.current++;
    retryTimer.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  useEffect(() => {
    disposed.current = false;
    retryCount.current = 0;
    connect();

    return () => {
      disposed.current = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      cleanup();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, cleanup]);

  const addProcessingGuard = useCallback((orderId: number) => {
    processingRef.current.add(orderId);
  }, []);

  const removeProcessingGuard = useCallback((orderId: number) => {
    // Grace period to absorb WS echoes
    setTimeout(() => {
      processingRef.current.delete(orderId);
    }, 1500);
  }, []);

  const isProcessing = useCallback((orderId: number) => {
    return processingRef.current.has(orderId);
  }, []);

  return (
    <WsContext.Provider value={{ status, lastEvent, addProcessingGuard, removeProcessingGuard, isProcessing }}>
      {children}
    </WsContext.Provider>
  );
}

export function useWs() {
  return useContext(WsContext);
}
