'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ConnectionStatus } from '@/lib/types';
import { createPolymarketStream } from '@/lib/websocket/polymarket';

export function usePolymarketStream(marketIds: string[]) {
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const streamRef = useRef<ReturnType<typeof createPolymarketStream> | null>(null);

  const handlePriceUpdate = useCallback((tokenId: string, price: number) => {
    setPrices(prev => {
      const next = new Map(prev);
      next.set(tokenId, price);
      return next;
    });
  }, []);

  useEffect(() => {
    if (marketIds.length === 0) return;

    const stream = createPolymarketStream(handlePriceUpdate, setStatus);
    streamRef.current = stream;
    stream.connect();
    stream.subscribe(marketIds);

    return () => {
      stream.disconnect();
    };
  }, [marketIds, handlePriceUpdate]);

  return { prices, status };
}
