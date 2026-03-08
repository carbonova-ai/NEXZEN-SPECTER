import { TickerData, CandleData } from '@/lib/types';

// Combined stream: ticker + kline + aggTrade in a single WebSocket
const BINANCE_COMBINED_URL =
  'wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/btcusdt@kline_5m/btcusdt@aggTrade';

// ── Price Integrity ──
// BTC sanity bounds: reject obviously wrong prices (API glitch, injection, stale data)
const BTC_PRICE_MIN = 1_000;     // BTC below $1k = clearly wrong
const BTC_PRICE_MAX = 1_000_000; // BTC above $1M = clearly wrong
const MAX_TICK_JUMP = 0.05;      // 5% single-tick jump = suspicious
const MAX_EVENT_AGE_MS = 10_000; // Reject events older than 10s (stale/replay)

let lastValidPrice = 0;

export function validatePrice(price: number): boolean {
  if (!Number.isFinite(price)) return false;
  if (price < BTC_PRICE_MIN || price > BTC_PRICE_MAX) return false;

  // Check for suspicious single-tick jump
  if (lastValidPrice > 0) {
    const change = Math.abs(price - lastValidPrice) / lastValidPrice;
    if (change > MAX_TICK_JUMP) return false;
  }

  lastValidPrice = price;
  return true;
}

export function validateEventTime(eventTime: number): boolean {
  if (!Number.isFinite(eventTime)) return false;
  const age = Date.now() - eventTime;
  return age >= -2000 && age <= MAX_EVENT_AGE_MS; // Allow 2s clock skew forward
}

export interface BinanceTickerMessage {
  e: string;
  E: number;
  s: string;
  c: string;
  o: string;
  h: string;
  l: string;
  v: string;
  q: string;
  p: string;
  P: string;
}

export interface BinanceKlineMessage {
  e: string;
  E: number;
  s: string;
  k: {
    t: number;
    T: number;
    s: string;
    i: string;
    o: string;
    c: string;
    h: string;
    l: string;
    v: string;
    x: boolean;
  };
}

export interface BinanceAggTradeMessage {
  e: string;
  E: number;
  s: string;
  p: string;  // Price
  q: string;  // Quantity
  T: number;  // Trade time
}

export function parseTicker(msg: BinanceTickerMessage): TickerData {
  return {
    symbol: msg.s,
    price: parseFloat(msg.c),
    volume24h: parseFloat(msg.q),
    priceChange24h: parseFloat(msg.p),
    priceChangePercent24h: parseFloat(msg.P),
    high24h: parseFloat(msg.h),
    low24h: parseFloat(msg.l),
    timestamp: msg.E,
  };
}

export function parseKline(msg: BinanceKlineMessage): CandleData & { isClosed: boolean } {
  return {
    open: parseFloat(msg.k.o),
    high: parseFloat(msg.k.h),
    low: parseFloat(msg.k.l),
    close: parseFloat(msg.k.c),
    volume: parseFloat(msg.k.v),
    timestamp: msg.k.t,
    isClosed: msg.k.x,
  };
}

export type BinanceStreamType = 'ticker' | 'kline';

export interface CombinedStreamCallbacks {
  onTicker: (data: BinanceTickerMessage) => void;
  onKline: (data: BinanceKlineMessage) => void;
  onTrade: (data: BinanceAggTradeMessage) => void;
  onStatusChange: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  onLatency: (ms: number) => void;
}

export function createBinanceCombinedStream(callbacks: CombinedStreamCallbacks) {
  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let isIntentionalClose = false;
  let latencySampleCounter = 0;

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return;

    isIntentionalClose = false;
    callbacks.onStatusChange('connecting');

    ws = new WebSocket(BINANCE_COMBINED_URL);

    ws.onopen = () => {
      reconnectAttempts = 0;
      callbacks.onStatusChange('connected');
    };

    ws.onmessage = (event) => {
      try {
        const wrapper = JSON.parse(event.data);
        const data = wrapper.data;
        if (!data?.e) return;

        // Reject stale/replayed events
        if (data.E && !validateEventTime(data.E)) return;

        // Sample latency every 10th message
        if (data.E && ++latencySampleCounter % 10 === 0) {
          callbacks.onLatency(Date.now() - data.E);
        }

        switch (data.e) {
          case '24hrTicker': {
            const price = parseFloat(data.c);
            if (!validatePrice(price)) return;
            callbacks.onTicker(data as BinanceTickerMessage);
            break;
          }
          case 'kline': {
            const kClose = parseFloat(data.k?.c);
            if (!validatePrice(kClose)) return;
            callbacks.onKline(data as BinanceKlineMessage);
            break;
          }
          case 'aggTrade': {
            const tradePrice = parseFloat(data.p);
            if (!validatePrice(tradePrice)) return;
            callbacks.onTrade(data as BinanceAggTradeMessage);
            break;
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      callbacks.onStatusChange('error');
    };

    ws.onclose = () => {
      if (isIntentionalClose) {
        callbacks.onStatusChange('disconnected');
        return;
      }
      callbacks.onStatusChange('disconnected');
      reconnectAttempts++;
      const delay = Math.min(500 * Math.pow(1.5, reconnectAttempts), 15000);
      reconnectTimeout = setTimeout(connect, delay);
    };
  }

  function disconnect() {
    isIntentionalClose = true;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (ws) {
      ws.close();
      ws = null;
    }
  }

  return { connect, disconnect };
}

// Legacy single-stream factory (kept for backward compat but not used)
export function createBinanceStream(
  type: BinanceStreamType,
  onMessage: (data: unknown) => void,
  onStatusChange: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void
): { connect: () => void; disconnect: () => void } {
  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let isIntentionalClose = false;

  const url =
    type === 'ticker'
      ? 'wss://stream.binance.com:9443/ws/btcusdt@ticker'
      : 'wss://stream.binance.com:9443/ws/btcusdt@kline_5m';

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return;
    isIntentionalClose = false;
    onStatusChange('connecting');
    ws = new WebSocket(url);
    ws.onopen = () => { reconnectAttempts = 0; onStatusChange('connected'); };
    ws.onmessage = (event) => { try { onMessage(JSON.parse(event.data)); } catch {} };
    ws.onerror = () => { onStatusChange('error'); };
    ws.onclose = () => {
      if (isIntentionalClose) { onStatusChange('disconnected'); return; }
      onStatusChange('disconnected');
      reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      reconnectTimeout = setTimeout(connect, delay);
    };
  }

  function disconnect() {
    isIntentionalClose = true;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (ws) { ws.close(); ws = null; }
  }

  return { connect, disconnect };
}
