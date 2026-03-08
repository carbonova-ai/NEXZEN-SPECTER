'use client';

import { useState, useEffect, useRef } from 'react';
import { type OnChainAnalysis } from '@/lib/signals/on-chain';

const POLL_INTERVAL = 120_000; // Poll every 2 minutes

/**
 * useOnChainSignal — fetches on-chain whale activity data.
 * Returns the exchange flow signal and analysis.
 */
export function useOnChainSignal() {
  const [analysis, setAnalysis] = useState<OnChainAnalysis | null>(null);
  const [signal, setSignal] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch('/api/signals/on-chain');
        if (res.ok) {
          const data: OnChainAnalysis = await res.json();
          setAnalysis(data);
          setSignal(data.signal);
        }
      } catch { /* silent */ }
    }

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { analysis, signal };
}
