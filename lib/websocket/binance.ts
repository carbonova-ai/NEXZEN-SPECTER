import { TickerData, CandleData } from '@/lib/types';

const BINANCE_WS_URL = 'wss://stream.binance.com:9443/ws/btcusdt@ticker';
const BINANCE_KLINE_WS_URL = 'wss://stream.binance.com:9443/ws/btcusdt@kline_5m';

export interface BinanceTickerMessage {
  e: string;      // Event type
  E: number;      // Event time
  s: string;      // Symbol
  c: string;      // Close/current price
  o: string;      // Open price
  h: string;      // High price
  l: string;      // Low price
  v: string;      // Total traded volume
  q: string;      // Total traded quote asset volume
  p: string;      // Price change
  P: string;      // Price change percent
}

export interface BinanceKlineMessage {
  e: string;
  E: number;
  s: string;
  k: {
    t: number;    // Kline start time
    T: number;    // Kline close time
    s: string;    // Symbol
    i: string;    // Interval
    o: string;    // Open
    c: string;    // Close
    h: string;    // High
    l: string;    // Low
    v: string;    // Volume
    x: boolean;   // Is this kline closed?
  };
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

export function createBinanceStream(
  type: BinanceStreamType,
  onMessage: (data: unknown) => void,
  onStatusChange: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void
): { connect: () => void; disconnect: () => void } {
  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let isIntentionalClose = false;

  const url = type === 'ticker' ? BINANCE_WS_URL : BINANCE_KLINE_WS_URL;

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return;

    isIntentionalClose = false;
    onStatusChange('connecting');

    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttempts = 0;
      onStatusChange('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      onStatusChange('error');
    };

    ws.onclose = () => {
      if (isIntentionalClose) {
        onStatusChange('disconnected');
        return;
      }

      onStatusChange('disconnected');
      reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
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
