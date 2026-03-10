'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ConnectionStatus } from '@/lib/types';
import type { ChainlinkPrice } from '@/lib/chainlink/types';
import { POLL_INTERVAL_MS } from '@/lib/chainlink/config';

interface UseChainlinkPriceReturn {
  price: ChainlinkPrice | null;
  status: ConnectionStatus;
  isStale: boolean;
  error: string | null;
}

export function useChainlinkPrice(
  pollIntervalMs = POLL_INTERVAL_MS
): UseChainlinkPriceReturn {
  const [price, setPrice] = useState<ChainlinkPrice | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const consecutiveFailures = useRef(0);

  const fetchPrice = useCallback(async () => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch('/api/chainlink/price', {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();

      setPrice({
        price: data.price,
        roundId: data.roundId,
        updatedAt: data.updatedAt,
        staleness: data.staleness,
        network: data.network,
        timestamp: data.timestamp,
      });
      setIsStale(data.isStale ?? false);
      setStatus('connected');
      setError(null);
      consecutiveFailures.current = 0;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;

      consecutiveFailures.current++;
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);

      // After 3 consecutive failures, mark as error
      if (consecutiveFailures.current >= 3) {
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchPrice();

    // Poll interval — back off to 30s on persistent failures
    const getInterval = () =>
      consecutiveFailures.current >= 3 ? 30_000 : pollIntervalMs;

    let timer: ReturnType<typeof setTimeout>;

    function scheduleNext() {
      timer = setTimeout(async () => {
        await fetchPrice();
        scheduleNext();
      }, getInterval());
    }

    scheduleNext();

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [fetchPrice, pollIntervalMs]);

  return { price, status, isStale, error };
}
