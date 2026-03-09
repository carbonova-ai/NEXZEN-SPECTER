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
const TICKER_THROTTLE_MS = 100;
const CROSS_VALIDATION_TOLERANCE = 0.005;
const WS_DATA_TIMEOUT = 4000; // If no WS data in 4s, start REST fallback
const REST_POLL_INTERVAL = 2000;

export function useBinanceStream() {
  const [ticker, setTicker] = useState<TickerData | null>(null);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [latency, setLatency] = useState<number>(0);
  const [tradePrice, setTradePrice] = useState<number | null>(null);
  const [priceIntegrity, setPriceIntegrity] = useState<'verified' | 'unverified' | 'divergent'>('unverified');

  const candlesRef = useRef<CandleData[]>([]);
  const initializedRef = useRef(false);

  // RAF-batch refs
  const tradePriceRef = useRef<number | null>(null);
  const latencyRef = useRef<number>(0);
  const tickerRef = useRef<TickerData | null>(null);
  const rafIdRef = useRef<number>(0);
  const dirtyRef = useRef(false);
  const lastTickerRenderRef = useRef<number>(0);
  const integrityRef = useRef<'verified' | 'unverified' | 'divergent'>('unverified');

  // Track whether WS is actually delivering data (not just connected)
  const wsDataReceivedRef = useRef(false);
  const restPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fullTickerLoadedRef = useRef(false);

  // RAF flush
  useEffect(() => {
    function flush() {
      if (dirtyRef.current) {
        dirtyRef.current = false;

        if (tradePriceRef.current !== null) {
          setTradePrice(tradePriceRef.current);
        }

        const now = performance.now();
        if (tickerRef.current && now - lastTickerRenderRef.current > TICKER_THROTTLE_MS) {
          setTicker(tickerRef.current);
          lastTickerRenderRef.current = now;
        }

        setLatency(latencyRef.current);

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

  // Handle kline updates
  const handleKline = useCallback((data: BinanceKlineMessage) => {
    if (!data.k) return;
    wsDataReceivedRef.current = true;

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

  // Handle ticker
  const handleTicker = useCallback((data: BinanceTickerMessage) => {
    if (!data.c) return;
    wsDataReceivedRef.current = true;
    tickerRef.current = parseTicker(data);
    dirtyRef.current = true;
  }, []);

  // Handle aggTrade
  const handleTrade = useCallback((data: BinanceAggTradeMessage) => {
    wsDataReceivedRef.current = true;
    tradePriceRef.current = parseFloat(data.p);
    dirtyRef.current = true;
  }, []);

  // Handle latency
  const handleLatency = useCallback((ms: number) => {
    latencyRef.current = ms;
    dirtyRef.current = true;
  }, []);

  // ── REST fallback ──

  const startRestFallback = useCallback(() => {
    if (restPollingRef.current) return;

    async function pollFull() {
      try {
        const res = await fetch('/api/binance/ticker?symbol=BTCUSDT', {
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.price) {
          tickerRef.current = data;
          tradePriceRef.current = data.price;
          dirtyRef.current = true;
          fullTickerLoadedRef.current = true;
          setStatus('connected');
        }
      } catch { /* retry */ }
    }

    async function pollFast() {
      try {
        const res = await fetch('/api/binance/ticker?symbol=BTCUSDT&fast=1', {
          signal: AbortSignal.timeout(2000),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.price) {
          tradePriceRef.current = data.price;
          if (tickerRef.current) {
            tickerRef.current = { ...tickerRef.current, price: data.price, timestamp: data.timestamp };
          }
          dirtyRef.current = true;
        }
      } catch { /* retry */ }
    }

    pollFull();
    let count = 0;
    restPollingRef.current = setInterval(() => {
      count++;
      // If WS starts delivering data, stop REST
      if (wsDataReceivedRef.current) {
        if (restPollingRef.current) {
          clearInterval(restPollingRef.current);
          restPollingRef.current = null;
        }
        return;
      }
      if (!fullTickerLoadedRef.current || count % 15 === 0) {
        pollFull();
      } else {
        pollFast();
      }
    }, REST_POLL_INTERVAL);
  }, []);

  const stopRestFallback = useCallback(() => {
    if (restPollingRef.current) {
      clearInterval(restPollingRef.current);
      restPollingRef.current = null;
    }
  }, []);

  // ── WebSocket + data watchdog ──
  useEffect(() => {
    const stream = createBinanceCombinedStream({
      onTicker: handleTicker,
      onKline: handleKline,
      onTrade: handleTrade,
      onStatusChange: setStatus,
      onLatency: handleLatency,
    });

    stream.connect();

    // Watchdog: if no WS DATA (not just connection) in 4s, start REST
    const watchdog = setTimeout(() => {
      if (!wsDataReceivedRef.current) {
        startRestFallback();
      }
    }, WS_DATA_TIMEOUT);

    return () => {
      clearTimeout(watchdog);
      stopRestFallback();
      stream.disconnect();
    };
  }, [handleTicker, handleKline, handleTrade, handleLatency, startRestFallback, stopRestFallback]);

  return { ticker, candles, status, latency, tradePrice, priceIntegrity };
}
