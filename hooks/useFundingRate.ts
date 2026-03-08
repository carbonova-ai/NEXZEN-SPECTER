'use client';

import { useState, useEffect, useRef } from 'react';
import { fetchFundingRateSignal, type FundingRateAnalysis } from '@/lib/signals/funding-rate';

const POLL_INTERVAL = 60_000; // Poll every 60s (funding rate updates every 8h)

/**
 * useFundingRate — fetches Binance perpetual funding rate.
 * Returns the contrarian signal and analysis data.
 */
export function useFundingRate(symbol = 'BTCUSDT') {
  const [analysis, setAnalysis] = useState<FundingRateAnalysis | null>(null);
  const [signal, setSignal] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    async function poll() {
      const result = await fetchFundingRateSignal(symbol);
      if (result) {
        setAnalysis(result);
        setSignal(result.signal);
      }
    }

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [symbol]);

  return { analysis, signal };
}
