'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface GeoMarket {
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
  // Delta tracking
  prevYesPrice: number | null; // previous fetch price for trend
  priceDirection: 'up' | 'down' | 'stable';
  priceChangePct: number; // % change since last fetch
  // Metadata
  category: string; // which geo category matched
  lastUpdated: string;
}

const GEO_KEYWORDS_WEIGHTED: [string, string][] = [
  // [keyword, category]
  ['war', 'war'], ['conflict', 'war'], ['peace', 'war'], ['military', 'war'],
  ['invasion', 'war'], ['ceasefire', 'war'], ['missile', 'war'], ['troops', 'war'],
  ['drone', 'war'], ['airstrike', 'war'], ['bombing', 'war'],
  ['sanctions', 'sanctions'], ['embargo', 'sanctions'], ['tariff', 'sanctions'],
  ['trade war', 'sanctions'], ['ban', 'sanctions'],
  ['election', 'elections'], ['president', 'elections'], ['vote', 'elections'],
  ['prime minister', 'elections'], ['parliament', 'elections'],
  ['nato', 'diplomacy'], ['un ', 'diplomacy'], ['g7', 'diplomacy'],
  ['g20', 'diplomacy'], ['summit', 'diplomacy'], ['treaty', 'diplomacy'],
  ['iran', 'geopolitics'], ['russia', 'geopolitics'], ['china', 'geopolitics'],
  ['ukraine', 'geopolitics'], ['israel', 'geopolitics'], ['gaza', 'geopolitics'],
  ['taiwan', 'geopolitics'], ['north korea', 'geopolitics'],
  ['nuclear', 'geopolitics'], ['coup', 'geopolitics'], ['regime', 'geopolitics'],
  ['oil', 'energy'], ['opec', 'energy'], ['energy', 'energy'],
  ['fed', 'economy'], ['recession', 'economy'], ['inflation', 'economy'],
  ['interest rate', 'economy'], ['central bank', 'economy'],
  ['bitcoin', 'crypto'], ['crypto', 'crypto'], ['cbdc', 'crypto'],
  ['diplomat', 'diplomacy'], ['alliance', 'diplomacy'],
  ['refugee', 'humanitarian'], ['humanitarian', 'humanitarian'],
  // Country/leader names for broader capture
  ['putin', 'geopolitics'], ['xi jinping', 'geopolitics'], ['zelensky', 'geopolitics'],
  ['netanyahu', 'geopolitics'], ['trump', 'elections'], ['biden', 'elections'],
  ['modi', 'elections'], ['erdogan', 'geopolitics'],
  ['syria', 'geopolitics'], ['yemen', 'geopolitics'], ['libya', 'geopolitics'],
  ['sudan', 'geopolitics'], ['venezuela', 'geopolitics'], ['myanmar', 'geopolitics'],
  ['afghanistan', 'geopolitics'], ['pakistan', 'geopolitics'],
  ['south china sea', 'geopolitics'], ['arctic', 'geopolitics'],
];

export function usePolymarketGeo() {
  const [markets, setMarkets] = useState<GeoMarket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const prevPricesRef = useRef<Map<string, number>>(new Map());

  const fetchMarkets = useCallback(async () => {
    try {
      // Fetch more events for better geo coverage
      const res = await fetch('/api/polymarket/gamma/events?closed=false&active=true&limit=100');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const events = Array.isArray(data) ? data : data.events || data.data || [];

      const geoMarkets: GeoMarket[] = [];

      for (const event of events) {
        const eventMarkets = event.markets || [];
        for (const m of eventMarkets) {
          const question = (m.question || m.groupItemTitle || '').toLowerCase();

          // Find matching geo keyword and category
          let matchedCategory = '';
          for (const [kw, cat] of GEO_KEYWORDS_WEIGHTED) {
            if (question.includes(kw)) {
              matchedCategory = cat;
              break;
            }
          }
          if (!matchedCategory) continue;

          let outcomePrices: number[] = [];
          try {
            const raw = m.outcomePrices;
            if (typeof raw === 'string') {
              outcomePrices = JSON.parse(raw).map(Number);
            } else if (Array.isArray(raw)) {
              outcomePrices = raw.map(Number);
            }
          } catch { /* ignore */ }

          let outcomes: string[] = [];
          try {
            outcomes = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : m.outcomes || [];
          } catch { /* ignore */ }

          const marketId = m.id || m.conditionId || '';
          const yesPrice = outcomePrices[0] ?? 0;
          const prevPrice = prevPricesRef.current.get(marketId);

          let priceDirection: 'up' | 'down' | 'stable' = 'stable';
          let priceChangePct = 0;

          if (prevPrice !== undefined && prevPrice > 0) {
            const diff = yesPrice - prevPrice;
            priceChangePct = (diff / prevPrice) * 100;
            if (Math.abs(priceChangePct) > 0.5) {
              priceDirection = diff > 0 ? 'up' : 'down';
            }
          }

          // Parse liquidity
          let liquidity = 0;
          try {
            liquidity = parseFloat(m.liquidity || m.liquidityNum || '0');
          } catch { /* ignore */ }

          geoMarkets.push({
            id: marketId,
            question: m.question || m.groupItemTitle || '',
            slug: m.slug || event.slug || '',
            endDate: m.endDate || event.endDate || '',
            active: m.active !== false,
            closed: m.closed === true,
            volume: parseFloat(m.volume || m.volumeNum || '0'),
            liquidity,
            outcomes,
            outcomePrices,
            prevYesPrice: prevPrice ?? null,
            priceDirection,
            priceChangePct,
            category: matchedCategory,
            lastUpdated: new Date().toISOString(),
          });
        }
      }

      // Sort by volume descending, but boost markets with price movement
      geoMarkets.sort((a, b) => {
        // Boost moving markets
        const aMoving = Math.abs(a.priceChangePct) > 1 ? 1.5 : 1;
        const bMoving = Math.abs(b.priceChangePct) > 1 ? 1.5 : 1;
        return (b.volume * bMoving) - (a.volume * aMoving);
      });

      const finalMarkets = geoMarkets.slice(0, 30);

      // Store current prices for next delta calculation
      const newPrices = new Map<string, number>();
      for (const m of finalMarkets) {
        newPrices.set(m.id, m.outcomePrices[0] ?? 0);
      }
      prevPricesRef.current = newPrices;

      setMarkets(finalMarkets);
      setLastRefreshed(new Date().toISOString());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch Polymarket');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkets();
    const interval = setInterval(fetchMarkets, 30_000); // 30s refresh (was 60s)
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  return { markets, isLoading, error, lastRefreshed, refresh: fetchMarkets };
}
