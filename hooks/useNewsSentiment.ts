'use client';

import { useState, useEffect, useRef } from 'react';
import { type NewsSentimentAnalysis } from '@/lib/signals/news-sentiment';

const POLL_INTERVAL = 300_000; // Poll every 5 minutes (news doesn't change fast)

/**
 * useNewsSentiment — fetches and analyzes crypto news sentiment.
 * Returns the sentiment signal and analysis data.
 */
export function useNewsSentiment() {
  const [analysis, setAnalysis] = useState<NewsSentimentAnalysis | null>(null);
  const [signal, setSignal] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch('/api/signals/news');
        if (res.ok) {
          const data: NewsSentimentAnalysis = await res.json();
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
