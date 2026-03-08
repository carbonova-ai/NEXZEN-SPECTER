'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PolymarketMarket } from '@/lib/polymarket/types';
import { fetchCryptoEvents, filterBTCMarkets } from '@/lib/polymarket/gamma-api';
import { fetchMidpointsForMarkets, computeSentimentFromMarkets } from '@/lib/polymarket/clob-api';
import { savePolymarketSnapshot } from '@/lib/supabase/polymarket';
import { usePolymarketStream } from './usePolymarketStream';

const MARKET_DISCOVERY_INTERVAL = 5 * 60_000; // Discover new markets every 5 min

export function usePolymarketData() {
  const [markets, setMarkets] = useState<PolymarketMarket[]>([]);
  const [midpoints, setMidpoints] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const marketsRef = useRef<PolymarketMarket[]>([]);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Extract token IDs for WebSocket subscription
  const polymarketIds = useMemo(
    () => markets.flatMap(m => m.clobTokenIds || []).filter(Boolean).slice(0, 20),
    [markets]
  );

  // Real-time WebSocket prices
  const { prices: wsPrices, status: wsStatus, lastTick } = usePolymarketStream(polymarketIds);

  // Merge WebSocket prices into midpoints for real-time sentiment
  const liveMidpoints = useMemo(() => {
    if (wsPrices.size === 0) return midpoints;
    const merged = new Map(midpoints);
    wsPrices.forEach((price, tokenId) => {
      merged.set(tokenId, price);
    });
    return merged;
  }, [midpoints, wsPrices]);

  // Debounced sentiment: recompute max every 500ms (not every WS tick)
  const [sentimentScore, setSentimentScore] = useState<number | null>(null);
  const sentimentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveMidpointsRef = useRef(liveMidpoints);
  liveMidpointsRef.current = liveMidpoints;

  useEffect(() => {
    if (markets.length === 0) return;
    if (sentimentTimerRef.current) return; // Already scheduled
    sentimentTimerRef.current = setTimeout(() => {
      sentimentTimerRef.current = null;
      setSentimentScore(computeSentimentFromMarkets(markets, liveMidpointsRef.current));
    }, 500);
    return () => {
      if (sentimentTimerRef.current) {
        clearTimeout(sentimentTimerRef.current);
        sentimentTimerRef.current = null;
      }
    };
  }, [markets, liveMidpoints]);

  // Fetch markets and initial midpoints via HTTP
  const fetchData = useCallback(async () => {
    try {
      const events = await fetchCryptoEvents();
      const btcMarkets = filterBTCMarkets(events);
      marketsRef.current = btcMarkets;
      setMarkets(btcMarkets);

      if (btcMarkets.length > 0) {
        const mids = await fetchMidpointsForMarkets(btcMarkets);
        setMidpoints(mids);

        const sentiment = computeSentimentFromMarkets(btcMarkets, mids);
        savePolymarketSnapshot(btcMarkets, mids, sentiment).catch(() => {});
      }

      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Polymarket unavailable';
      setError(message);

      retryTimeoutRef.current = setTimeout(fetchData, 60_000);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Only re-discover markets periodically (not midpoints — those come from WS now)
    const discoveryInterval = setInterval(fetchData, MARKET_DISCOVERY_INTERVAL);

    return () => {
      clearInterval(discoveryInterval);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [fetchData]);

  return {
    markets,
    sentimentScore,
    midpoints: liveMidpoints,
    isLoading,
    error,
    lastUpdated: lastTick || lastUpdated,
    wsStatus,
  };
}
