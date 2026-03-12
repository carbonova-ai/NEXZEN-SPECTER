'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ══════════════════════════════════════════════════════════════
// usePolymarketWS — Real-time Polymarket CLOB WebSocket
//
// Replaces 15s REST polling with sub-second price updates.
// Connects to Polymarket's CLOB WebSocket for live orderbook
// and price data. Falls back to REST if WS fails.
//
// Protocol:
//   wss://ws-subscriptions-clob.polymarket.com/ws/market
//   Subscribe: { type: "market", asset_id: "..." }
//   Receive:   { event_type: "price_change", ... }
// ══════════════════════════════════════════════════════════════

export interface WSPriceUpdate {
  assetId: string;
  price: number;
  timestamp: number;
}

export type WSStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error';

interface UsePolymarketWSReturn {
  priceUpdates: Map<string, WSPriceUpdate>;
  status: WSStatus;
  latencyMs: number;
  subscribe: (assetIds: string[]) => void;
  unsubscribe: (assetIds: string[]) => void;
}

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const PING_INTERVAL = 10_000;
const RECONNECT_DELAYS = [500, 1000, 2000, 5000]; // fast reconnect

export function usePolymarketWS(enabled = true): UsePolymarketWSReturn {
  const [status, setStatus] = useState<WSStatus>('connecting');
  const [latencyMs, setLatencyMs] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const priceMapRef = useRef<Map<string, WSPriceUpdate>>(new Map());
  const subscribedRef = useRef<Set<string>>(new Set());
  const reconnectAttemptRef = useRef(0);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listenersRef = useRef<Set<() => void>>(new Set());

  // Force re-render on price updates (batched)
  const [, forceUpdate] = useState(0);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleBatchUpdate = useCallback(() => {
    if (batchTimerRef.current) return;
    batchTimerRef.current = setTimeout(() => {
      batchTimerRef.current = null;
      forceUpdate(n => n + 1);
    }, 100); // batch updates every 100ms for performance
  }, []);

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const subscribe = useCallback((assetIds: string[]) => {
    for (const id of assetIds) {
      subscribedRef.current.add(id);
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      for (const id of assetIds) {
        sendMessage({ auth: {}, type: 'market', assets_ids: [id] });
      }
    }
  }, [sendMessage]);

  const unsubscribe = useCallback((assetIds: string[]) => {
    for (const id of assetIds) {
      subscribedRef.current.delete(id);
      priceMapRef.current.delete(id);
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      setStatus('connecting');
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        reconnectAttemptRef.current = 0;

        // Re-subscribe to all tracked assets
        for (const id of subscribedRef.current) {
          sendMessage({ auth: {}, type: 'market', assets_ids: [id] });
        }

        // Start ping/pong keepalive
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        const t0 = Date.now();

        if (event.data === 'pong' || event.data === 'PONG') return;

        try {
          const data = JSON.parse(event.data);

          // Handle different message formats from Polymarket WS
          if (data.length && Array.isArray(data)) {
            // Array of price updates
            for (const update of data) {
              processUpdate(update, t0);
            }
          } else if (data.asset_id || data.market) {
            processUpdate(data, t0);
          }
        } catch {
          // Non-JSON message (pong, etc.)
        }
      };

      ws.onerror = () => {
        setStatus('error');
      };

      ws.onclose = () => {
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        wsRef.current = null;

        const attempt = reconnectAttemptRef.current;
        if (attempt < RECONNECT_DELAYS.length) {
          setStatus('reconnecting');
          reconnectAttemptRef.current++;
          setTimeout(connect, RECONNECT_DELAYS[attempt]);
        } else {
          setStatus('closed');
        }
      };
    } catch {
      setStatus('error');
    }
  }, [enabled, sendMessage]);

  const processUpdate = useCallback((data: Record<string, unknown>, receiveTime: number) => {
    // Extract price from various Polymarket WS formats
    const assetId = (data.asset_id || data.market || '') as string;
    if (!assetId) return;

    let price = 0;
    if (typeof data.price === 'number') {
      price = data.price;
    } else if (typeof data.price === 'string') {
      price = parseFloat(data.price);
    } else if (data.changes && Array.isArray(data.changes) && data.changes.length > 0) {
      // Order book change format
      const change = data.changes[0] as { price?: string | number };
      if (change.price) price = typeof change.price === 'string' ? parseFloat(change.price) : change.price;
    } else if (typeof data.best_bid === 'string' || typeof data.best_ask === 'string') {
      // Midpoint from bid/ask
      const bid = parseFloat(data.best_bid as string || '0');
      const ask = parseFloat(data.best_ask as string || '0');
      if (bid > 0 && ask > 0) price = (bid + ask) / 2;
    }

    if (price <= 0 || price > 1) return;

    const timestamp = typeof data.timestamp === 'number' ? data.timestamp : receiveTime;
    priceMapRef.current.set(assetId, { assetId, price, timestamp });
    setLatencyMs(receiveTime - timestamp);
    scheduleBatchUpdate();
  }, [scheduleBatchUpdate]);

  // Connect on mount
  useEffect(() => {
    if (enabled) connect();

    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, connect]);

  return {
    priceUpdates: priceMapRef.current,
    status,
    latencyMs,
    subscribe,
    unsubscribe,
  };
}
