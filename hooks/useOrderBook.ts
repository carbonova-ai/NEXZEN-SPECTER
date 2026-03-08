'use client';

import { useState, useEffect, useRef } from 'react';
import { fetchOrderBookSignal, type OrderBookAnalysis } from '@/lib/signals/order-book';

const POLL_INTERVAL = 15_000; // Poll every 15s

/**
 * useOrderBook — fetches and analyzes CLOB order book.
 * Returns the order book signal and analysis data.
 */
export function useOrderBook(tokenId: string | null) {
  const [analysis, setAnalysis] = useState<OrderBookAnalysis | null>(null);
  const [signal, setSignal] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!tokenId) return;

    async function poll() {
      const result = await fetchOrderBookSignal(tokenId!);
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
  }, [tokenId]);

  return { analysis, signal };
}
