'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { TickerData, CandleData, ConnectionStatus } from '@/lib/types';
import {
  createBinanceStream,
  parseTicker,
  parseKline,
  BinanceTickerMessage,
  BinanceKlineMessage,
} from '@/lib/websocket/binance';

const MAX_CANDLES = 200;

export function useBinanceStream() {
  const [ticker, setTicker] = useState<TickerData | null>(null);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [latency, setLatency] = useState<number>(0);
  const candlesRef = useRef<CandleData[]>([]);
  const initializedRef = useRef(false);

  // Fetch historical candles on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    async function fetchHistory() {
      try {
        const res = await fetch('/api/binance/candles?symbol=BTCUSDT&interval=5m&limit=100');
        if (res.ok) {
          const data: CandleData[] = await res.json();
          candlesRef.current = data;
          setCandles(data);
        }
      } catch {
        // Will populate from WebSocket stream
      }
    }

    fetchHistory();
  }, []);

  // Handle kline updates
  const handleKline = useCallback((data: unknown) => {
    const klineMsg = data as BinanceKlineMessage;
    if (!klineMsg.k) return;

    const parsed = parseKline(klineMsg);
    const now = Date.now();
    setLatency(now - klineMsg.E);

    setCandles(prev => {
      const updated = [...prev];
      const lastIndex = updated.length - 1;

      if (lastIndex >= 0 && updated[lastIndex].timestamp === parsed.timestamp) {
        // Update current candle
        updated[lastIndex] = {
          open: parsed.open,
          high: parsed.high,
          low: parsed.low,
          close: parsed.close,
          volume: parsed.volume,
          timestamp: parsed.timestamp,
        };
      } else if (parsed.isClosed || lastIndex < 0 || parsed.timestamp > updated[lastIndex].timestamp) {
        // New candle
        updated.push({
          open: parsed.open,
          high: parsed.high,
          low: parsed.low,
          close: parsed.close,
          volume: parsed.volume,
          timestamp: parsed.timestamp,
        });
      }

      // Keep max candles
      if (updated.length > MAX_CANDLES) {
        updated.splice(0, updated.length - MAX_CANDLES);
      }

      candlesRef.current = updated;
      return updated;
    });
  }, []);

  // Handle ticker updates
  const handleTicker = useCallback((data: unknown) => {
    const tickerMsg = data as BinanceTickerMessage;
    if (!tickerMsg.c) return;
    setTicker(parseTicker(tickerMsg));
  }, []);

  // Connect WebSocket streams
  useEffect(() => {
    const tickerStream = createBinanceStream('ticker', handleTicker, setStatus);
    const klineStream = createBinanceStream('kline', handleKline, () => {});

    tickerStream.connect();
    klineStream.connect();

    return () => {
      tickerStream.disconnect();
      klineStream.disconnect();
    };
  }, [handleTicker, handleKline]);

  return { ticker, candles, status, latency };
}
