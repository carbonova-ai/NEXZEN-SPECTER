'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePolymarketWS, type WSPriceUpdate } from './usePolymarketWS';

// ══════════════════════════════════════════════════════════════
// useWarMarkets — Real-time War Prediction Markets Hook
//
// HYBRID ARCHITECTURE for maximum speed:
//   1. REST poll /api/polymarket/gamma/war-markets every 5s
//      for market discovery (new markets, metadata, volume)
//   2. CLOB WebSocket for real-time price updates (sub-second)
//
// Previously: 15s REST-only polling. Now: sub-second price data.
// ══════════════════════════════════════════════════════════════

export interface WarMarket {
  id: string;
  question: string;
  slug: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  volume: number;
  liquidity: number;
  outcomes: string[];
  outcomePrices: number[];
  theater: 'iran' | 'ukraine' | 'both';
  // Delta tracking (computed client-side)
  prevYesPrice: number | null;
  priceDirection: 'up' | 'down' | 'stable';
  priceChangePct: number;
}

interface UseWarMarketsReturn {
  iranMarkets: WarMarket[];
  ukraineMarkets: WarMarket[];
  isLoading: boolean;
  error: string | null;
  lastRefreshed: string | null;
  wsStatus: string;
  wsLatencyMs: number;
  refresh: () => void;
}

export function useWarMarkets(refreshInterval = 5_000): UseWarMarketsReturn {
  const [iranMarkets, setIranMarkets] = useState<WarMarket[]>([]);
  const [ukraineMarkets, setUkraineMarkets] = useState<WarMarket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const prevIranPrices = useRef<Map<string, number>>(new Map());
  const prevUkrainePrices = useRef<Map<string, number>>(new Map());
  const marketIdsRef = useRef<Set<string>>(new Set());

  // ── CLOB WebSocket for real-time price updates ──
  const ws = usePolymarketWS(true);

  // Subscribe to market IDs when they change
  useEffect(() => {
    const allIds = [...iranMarkets, ...ukraineMarkets].map(m => m.id).filter(Boolean);
    const newIds = allIds.filter(id => !marketIdsRef.current.has(id));
    if (newIds.length > 0) {
      ws.subscribe(newIds);
      for (const id of newIds) marketIdsRef.current.add(id);
    }
  }, [iranMarkets, ukraineMarkets, ws]);

  // Apply WebSocket price updates to markets (sub-second)
  useEffect(() => {
    if (ws.priceUpdates.size === 0) return;

    let iranChanged = false;
    let ukraineChanged = false;

    const updatedIran = iranMarkets.map(m => {
      const update = ws.priceUpdates.get(m.id);
      if (!update) return m;

      const prevPrice = m.outcomePrices[0] ?? 0;
      const newPrice = update.price;
      if (Math.abs(newPrice - prevPrice) < 0.001) return m; // no meaningful change

      iranChanged = true;
      const diff = newPrice - prevPrice;
      const changePct = prevPrice > 0 ? (diff / prevPrice) * 100 : 0;

      return {
        ...m,
        outcomePrices: [newPrice, 1 - newPrice],
        prevYesPrice: prevPrice,
        priceDirection: Math.abs(changePct) > 0.5
          ? (diff > 0 ? 'up' as const : 'down' as const)
          : 'stable' as const,
        priceChangePct: changePct,
      };
    });

    const updatedUkraine = ukraineMarkets.map(m => {
      const update = ws.priceUpdates.get(m.id);
      if (!update) return m;

      const prevPrice = m.outcomePrices[0] ?? 0;
      const newPrice = update.price;
      if (Math.abs(newPrice - prevPrice) < 0.001) return m;

      ukraineChanged = true;
      const diff = newPrice - prevPrice;
      const changePct = prevPrice > 0 ? (diff / prevPrice) * 100 : 0;

      return {
        ...m,
        outcomePrices: [newPrice, 1 - newPrice],
        prevYesPrice: prevPrice,
        priceDirection: Math.abs(changePct) > 0.5
          ? (diff > 0 ? 'up' as const : 'down' as const)
          : 'stable' as const,
        priceChangePct: changePct,
      };
    });

    if (iranChanged) setIranMarkets(updatedIran);
    if (ukraineChanged) setUkraineMarkets(updatedUkraine);
  }, [ws.priceUpdates, iranMarkets, ukraineMarkets]);

  const enrichWithDelta = (
    markets: Array<Omit<WarMarket, 'prevYesPrice' | 'priceDirection' | 'priceChangePct'>>,
    prevPrices: React.RefObject<Map<string, number>>,
  ): WarMarket[] => {
    return markets.map(m => {
      const yesPrice = m.outcomePrices[0] ?? 0;
      const prevPrice = prevPrices.current?.get(m.id);

      let priceDirection: 'up' | 'down' | 'stable' = 'stable';
      let priceChangePct = 0;

      if (prevPrice !== undefined && prevPrice > 0) {
        const diff = yesPrice - prevPrice;
        priceChangePct = (diff / prevPrice) * 100;
        if (Math.abs(priceChangePct) > 0.5) {
          priceDirection = diff > 0 ? 'up' : 'down';
        }
      }

      return { ...m, prevYesPrice: prevPrice ?? null, priceDirection, priceChangePct };
    });
  };

  // ── REST polling for market discovery (5s) ──
  const fetchMarkets = useCallback(async () => {
    try {
      const res = await fetch('/api/polymarket/gamma/war-markets');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const iranRaw = data.iran || [];
      const ukraineRaw = data.ukraine || [];

      const enrichedIran = enrichWithDelta(iranRaw, prevIranPrices);
      const enrichedUkraine = enrichWithDelta(ukraineRaw, prevUkrainePrices);

      // Store current prices for next delta
      const newIranPrices = new Map<string, number>();
      for (const m of enrichedIran) newIranPrices.set(m.id, m.outcomePrices[0] ?? 0);
      prevIranPrices.current = newIranPrices;

      const newUkrainePrices = new Map<string, number>();
      for (const m of enrichedUkraine) newUkrainePrices.set(m.id, m.outcomePrices[0] ?? 0);
      prevUkrainePrices.current = newUkrainePrices;

      setIranMarkets(enrichedIran);
      setUkraineMarkets(enrichedUkraine);
      setLastRefreshed(new Date().toISOString());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch war markets');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkets();
    const interval = setInterval(fetchMarkets, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchMarkets, refreshInterval]);

  return {
    iranMarkets,
    ukraineMarkets,
    isLoading,
    error,
    lastRefreshed,
    wsStatus: ws.status,
    wsLatencyMs: ws.latencyMs,
    refresh: fetchMarkets,
  };
}
