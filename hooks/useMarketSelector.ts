'use client';

import { useState, useCallback } from 'react';
import { MARKETS, DEFAULT_MARKET, type MarketConfig } from '@/lib/config/markets';

const STORAGE_KEY = 'nexzen_selected_market';

/**
 * useMarketSelector — manages the active trading market.
 *
 * Persists selection to localStorage.
 * Returns the active market config and a setter.
 */
export function useMarketSelector() {
  const [activeMarket, setActiveMarket] = useState<MarketConfig>(() => {
    if (typeof window === 'undefined') return DEFAULT_MARKET;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const found = MARKETS.find(m => m.id === saved);
      if (found) return found;
    }
    return DEFAULT_MARKET;
  });

  const selectMarket = useCallback((id: string) => {
    const market = MARKETS.find(m => m.id === id);
    if (market) {
      setActiveMarket(market);
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  return {
    activeMarket,
    selectMarket,
    availableMarkets: MARKETS,
  };
}
