'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

interface RawMarket {
  id: string;
  question: string;
  slug: string;
  conditionId: string;
  outcomes: string[];
  outcomePrices: string | string[];
  clobTokenIds: string | string[];
  volume: number;
  liquidity: number;
  endDate: string;
  closed: boolean;
  active: boolean;
}

interface RawEvent {
  id: string;
  title: string;
  slug: string;
  markets: RawMarket[];
}

export interface Btc5mMarket {
  id: string;
  question: string;
  outcomes: string[];
  endDate: string;
  volume: number;
  liquidity: number;
  upTokenId: string | null;
  downTokenId: string | null;
}

export interface Btc5mData {
  market: Btc5mMarket | null;
  odds: { up: number | null; down: number | null };
  window: { start: number; end: number };
  timestamp: number;
}

function parseJsonField<T>(value: T | string): T {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value as T; }
  }
  return value;
}

function isBtc5m(question: string, title: string): boolean {
  const text = `${question} ${title}`.toLowerCase();
  return (text.includes('bitcoin') || text.includes('btc')) &&
         text.includes('up') && text.includes('down') &&
         (text.includes('5 min') || text.includes('5-min') || text.includes('5m'));
}

/**
 * Dedicated hook for BTC Up/Down 5-min market.
 *
 * Uses existing /api/polymarket/gamma/events for discovery (every 30s)
 * and /api/polymarket/clob/midpoint for live odds (every 3s).
 */
export function useBtc5mMarket() {
  const [market, setMarket] = useState<Btc5mMarket | null>(null);
  const [odds, setOdds] = useState<{ up: number | null; down: number | null }>({ up: null, down: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  // Ref copy of market — lets the discovery interval read current market without being a dep
  const marketRef = useRef<Btc5mMarket | null>(null);
  useEffect(() => { marketRef.current = market; }, [market]);

  // ── 1. Discover the active BTC 5m market (every 30s) ──
  const discoverMarket = useCallback(async () => {
    try {
      const res = await fetch('/api/polymarket/gamma/events?tag_id=21&closed=false&active=true&limit=20', {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Events API ${res.status}`);
      const events: RawEvent[] = await res.json();

      const candidates: Btc5mMarket[] = [];
      for (const event of events) {
        for (const m of event.markets) {
          if (!m.active || m.closed) continue;
          if (!isBtc5m(m.question, event.title)) continue;

          const tokenIds = parseJsonField<string[]>(m.clobTokenIds) || [];
          const rawOutcomes = (m.outcomes || []).map((o: string) => o.toLowerCase());
          const upIdx = rawOutcomes.findIndex((o: string) => o === 'up' || o === 'yes');
          const downIdx = rawOutcomes.findIndex((o: string) => o === 'down' || o === 'no');

          candidates.push({
            id: m.id,
            question: m.question,
            outcomes: m.outcomes,
            endDate: m.endDate,
            volume: m.volume,
            liquidity: m.liquidity,
            upTokenId: tokenIds[upIdx >= 0 ? upIdx : 0] ?? null,
            downTokenId: tokenIds[downIdx >= 0 ? downIdx : 1] ?? null,
          });
        }
      }

      // Pick soonest-expiring active market (= current window)
      const now = Date.now();
      const active = candidates
        .filter(c => new Date(c.endDate).getTime() > now)
        .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());

      if (mountedRef.current) {
        setMarket(active[0] ?? null);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Discovery failed');
      }
    }
  }, []);

  // ── 2. Poll CLOB midpoints (every 3s) ──
  const pollOdds = useCallback(async (m: Btc5mMarket) => {
    const fetchMid = async (tokenId: string | null): Promise<number | null> => {
      if (!tokenId) return null;
      try {
        const res = await fetch(`/api/polymarket/clob/midpoint?token_id=${encodeURIComponent(tokenId)}`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.mid !== undefined ? parseFloat(data.mid) : null;
      } catch { return null; }
    };

    const [up, down] = await Promise.all([fetchMid(m.upTokenId), fetchMid(m.downTokenId)]);
    if (mountedRef.current) {
      setOdds({ up, down });
      setLoading(false);
    }
  }, []);

  // Discovery on mount + adaptive self-scheduling timeout (faster when no market found).
  // Uses marketRef instead of `market` state to avoid re-running this effect on every
  // market change (which would call discoverMarket immediately after every successful
  // discovery and create a mountedRef race between cleanup and the new effect run).
  useEffect(() => {
    mountedRef.current = true;
    discoverMarket();
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      // Re-read ref each tick so the delay adapts when market becomes available
      const delay = marketRef.current ? 30_000 : 8_000;
      timeoutId = setTimeout(() => {
        discoverMarket();
        schedule();
      }, delay);
    };
    schedule();
    return () => { mountedRef.current = false; clearTimeout(timeoutId); };
  }, [discoverMarket]); // marketRef is a ref — safe to omit from deps

  // Adaptive odds polling: faster near window end for maximum edge
  useEffect(() => {
    if (!market) { setLoading(false); return; }
    pollOdds(market);

    let timeout: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const end = new Date(market.endDate).getTime();
      const remaining = end - Date.now();

      if (remaining <= 0) {
        discoverMarket();
        timeout = setTimeout(scheduleNext, 5_000);
        return;
      }

      // Adaptive speed: faster near expiry, but capped to avoid request flooding
      // > 3min: 5s | 1-3min: 3s | < 1min: 1.5s | < 15s: 1s
      const delay = remaining < 15_000 ? 1_000
        : remaining < 60_000 ? 1_500
        : remaining < 180_000 ? 3_000
        : 5_000;

      timeout = setTimeout(() => {
        if (new Date(market.endDate).getTime() > Date.now()) {
          pollOdds(market);
        } else {
          discoverMarket();
        }
        scheduleNext();
      }, delay);
    };
    scheduleNext();

    return () => clearTimeout(timeout);
  }, [market, pollOdds, discoverMarket]);

  const data: Btc5mData = useMemo(() => {
    const endTime = market ? new Date(market.endDate).getTime() : 0;
    return {
      market,
      odds,
      window: { start: endTime - 5 * 60 * 1000, end: endTime },
      timestamp: Date.now(),
    };
  }, [market, odds]);

  return { data, loading, error };
}
