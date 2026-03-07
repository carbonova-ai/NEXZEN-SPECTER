'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PolymarketMarket } from '@/lib/polymarket/types';
import { fetchCryptoEvents, filterBTCMarkets } from '@/lib/polymarket/gamma-api';
import { fetchMidpointsForMarkets, computeSentimentFromMarkets } from '@/lib/polymarket/clob-api';
import { savePolymarketSnapshot } from '@/lib/supabase/polymarket';

const POLL_INTERVAL = 30_000;
const RETRY_DELAY = 60_000;

export function usePolymarketData() {
  const [markets, setMarkets] = useState<PolymarketMarket[]>([]);
  const [sentimentScore, setSentimentScore] = useState<number | null>(null);
  const [midpoints, setMidpoints] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const marketsRef = useRef<PolymarketMarket[]>([]);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        setSentimentScore(sentiment);

        // Snapshot to Supabase on full fetch
        savePolymarketSnapshot(btcMarkets, mids, sentiment).catch(() => {});
      } else {
        setSentimentScore(null);
      }

      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Polymarket unavailable';
      setError(message);
      setSentimentScore(null);

      // Retry after delay
      retryTimeoutRef.current = setTimeout(fetchData, RETRY_DELAY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh just midpoints (lighter operation)
  const refreshMidpoints = useCallback(async () => {
    if (marketsRef.current.length === 0) return;

    try {
      const mids = await fetchMidpointsForMarkets(marketsRef.current);
      setMidpoints(mids);

      const sentiment = computeSentimentFromMarkets(marketsRef.current, mids);
      setSentimentScore(sentiment);
      setLastUpdated(Date.now());
      setError(null);
    } catch {
      // Non-fatal: keep last known values
    }
  }, []);

  useEffect(() => {
    fetchData();

    const pollInterval = setInterval(refreshMidpoints, POLL_INTERVAL);

    // Full refresh every 5 minutes (discover new markets)
    const fullRefreshInterval = setInterval(fetchData, 5 * 60_000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(fullRefreshInterval);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [fetchData, refreshMidpoints]);

  return {
    markets,
    sentimentScore,
    midpoints,
    isLoading,
    error,
    lastUpdated,
  };
}
