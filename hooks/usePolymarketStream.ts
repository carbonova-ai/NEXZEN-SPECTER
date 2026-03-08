'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ConnectionStatus } from '@/lib/types';
import { createPolymarketStream } from '@/lib/websocket/polymarket';

export function usePolymarketStream(marketIds: string[]) {
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastTick, setLastTick] = useState<number>(0);
  const streamRef = useRef<ReturnType<typeof createPolymarketStream> | null>(null);
  const marketIdsRef = useRef<string[]>([]);

  const handlePriceUpdate = useCallback((tokenId: string, price: number) => {
    setPrices(prev => {
      const next = new Map(prev);
      next.set(tokenId, price);
      return next;
    });
    setLastTick(Date.now());
  }, []);

  useEffect(() => {
    if (marketIds.length === 0) return;

    // Avoid reconnecting if same market IDs
    const idsKey = marketIds.join(',');
    const prevKey = marketIdsRef.current.join(',');

    if (streamRef.current && idsKey === prevKey) return;

    // Disconnect previous
    streamRef.current?.disconnect();

    marketIdsRef.current = marketIds;
    const stream = createPolymarketStream(handlePriceUpdate, setStatus);
    streamRef.current = stream;
    stream.connect();
    stream.subscribe(marketIds);

    return () => {
      stream.disconnect();
      streamRef.current = null;
    };
  }, [marketIds, handlePriceUpdate]);

  return { prices, status, lastTick };
}
