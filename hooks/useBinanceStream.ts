'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { TickerData, CandleData, ConnectionStatus } from '@/lib/types';
import {
  createBinanceCombinedStream,
  parseTicker,
  parseKline,
  BinanceTickerMessage,
  BinanceKlineMessage,
  BinanceAggTradeMessage,
} from '@/lib/websocket/binance';

const MAX_CANDLES = 200;
const TICKER_THROTTLE_MS = 100; // Max 10 ticker renders/sec — speed-critical for delta detection
const CROSS_VALIDATION_TOLERANCE = 0.005; // 0.5% max divergence between aggTrade and ticker

export function useBinanceStream() {
  const [ticker, setTicker] = useState<TickerData | null>(null);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [latency, setLatency] = useState<number>(0);
  const [tradePrice, setTradePrice] = useState<number | null>(null);
  const [priceIntegrity, setPriceIntegrity] = useState<'verified' | 'unverified' | 'divergent'>('unverified');

  const candlesRef = useRef<CandleData[]>([]);
  const initializedRef = useRef(false);

  // RAF-batch refs: accumulate data, flush at screen refresh rate
  const tradePriceRef = useRef<number | null>(null);
  const latencyRef = useRef<number>(0);
  const tickerRef = useRef<TickerData | null>(null);
  const rafIdRef = useRef<number>(0);
  const dirtyRef = useRef(false);
  const lastTickerRenderRef = useRef<number>(0);
  const integrityRef = useRef<'verified' | 'unverified' | 'divergent'>('unverified');

  // RAF flush: sync refs → state at 60fps max
  useEffect(() => {
    function flush() {
      if (dirtyRef.current) {
        dirtyRef.current = false;

        // Always flush trade price (highest priority, lowest latency)
        if (tradePriceRef.current !== null) {
          setTradePrice(tradePriceRef.current);
        }

        // Throttle ticker renders
        const now = performance.now();
        if (tickerRef.current && now - lastTickerRenderRef.current > TICKER_THROTTLE_MS) {
          setTicker(tickerRef.current);
          lastTickerRenderRef.current = now;
        }

        // Latency
        setLatency(latencyRef.current);

        // Cross-validate aggTrade vs ticker (detect feed divergence)
        const tp = tradePriceRef.current;
        const tk = tickerRef.current?.price;
        if (tp && tk) {
          const divergence = Math.abs(tp - tk) / tk;
          const newIntegrity = divergence > CROSS_VALIDATION_TOLERANCE ? 'divergent' : 'verified';
          if (newIntegrity !== integrityRef.current) {
            integrityRef.current = newIntegrity;
            setPriceIntegrity(newIntegrity);
          }
        }
      }
      rafIdRef.current = requestAnimationFrame(flush);
    }

    rafIdRef.current = requestAnimationFrame(flush);
    return () => cancelAnimationFrame(rafIdRef.current);
  }, []);

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

  // Handle kline updates (low frequency ~every few seconds, no throttle needed)
  const handleKline = useCallback((data: BinanceKlineMessage) => {
    if (!data.k) return;

    const parsed = parseKline(data);

    setCandles(prev => {
      const updated = [...prev];
      const lastIndex = updated.length - 1;

      if (lastIndex >= 0 && updated[lastIndex].timestamp === parsed.timestamp) {
        updated[lastIndex] = {
          open: parsed.open,
          high: parsed.high,
          low: parsed.low,
          close: parsed.close,
          volume: parsed.volume,
          timestamp: parsed.timestamp,
        };
      } else if (parsed.isClosed || lastIndex < 0 || parsed.timestamp > updated[lastIndex].timestamp) {
        updated.push({
          open: parsed.open,
          high: parsed.high,
          low: parsed.low,
          close: parsed.close,
          volume: parsed.volume,
          timestamp: parsed.timestamp,
        });
      }

      if (updated.length > MAX_CANDLES) {
        updated.splice(0, updated.length - MAX_CANDLES);
      }

      candlesRef.current = updated;
      return updated;
    });
  }, []);

  // Handle ticker — write to ref, RAF flushes to state
  const handleTicker = useCallback((data: BinanceTickerMessage) => {
    if (!data.c) return;
    tickerRef.current = parseTicker(data);
    dirtyRef.current = true;
  }, []);

  // Handle aggTrade — write to ref, RAF flushes to state (zero-copy path)
  const handleTrade = useCallback((data: BinanceAggTradeMessage) => {
    tradePriceRef.current = parseFloat(data.p);
    dirtyRef.current = true;
  }, []);

  // Handle latency — write to ref only
  const handleLatency = useCallback((ms: number) => {
    latencyRef.current = ms;
    dirtyRef.current = true;
  }, []);

  // Single combined WebSocket connection
  useEffect(() => {
    const stream = createBinanceCombinedStream({
      onTicker: handleTicker,
      onKline: handleKline,
      onTrade: handleTrade,
      onStatusChange: setStatus,
      onLatency: handleLatency,
    });

    stream.connect();

    return () => {
      stream.disconnect();
    };
  }, [handleTicker, handleKline, handleTrade, handleLatency]);

  return { ticker, candles, status, latency, tradePrice, priceIntegrity };
}
