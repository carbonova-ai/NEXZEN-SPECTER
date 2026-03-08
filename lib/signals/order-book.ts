/**
 * Order Book Intelligence
 *
 * Analyzes Polymarket CLOB order book depth to detect:
 * - Bid/Ask imbalance (buying vs selling pressure)
 * - Whale orders (single orders > 10% of total depth)
 * - Depth-weighted price levels
 *
 * Signal: -1 (heavy selling pressure) to +1 (heavy buying pressure)
 */

export interface OrderBookLevel {
  price: string;
  size: string;
}

export interface OrderBookData {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface OrderBookAnalysis {
  signal: number;             // -1 to +1
  bidDepth: number;           // Total bid volume
  askDepth: number;           // Total ask volume
  imbalanceRatio: number;     // (bid - ask) / (bid + ask)
  whaleOrders: number;        // Count of whale-sized orders
  topBidPrice: number;
  topAskPrice: number;
  spread: number;             // Top ask - Top bid
  spreadPercent: number;
  confidence: number;         // 0 to 1 based on depth
}

const WHALE_THRESHOLD_PCT = 0.10;  // Order > 10% of total depth = whale
const MIN_DEPTH_FOR_SIGNAL = 100;  // Minimum total depth to generate signal

/**
 * Analyze CLOB order book and generate a trading signal.
 */
export function analyzeOrderBook(book: OrderBookData): OrderBookAnalysis {
  const bids = book.bids.map(b => ({ price: parseFloat(b.price), size: parseFloat(b.size) }));
  const asks = book.asks.map(a => ({ price: parseFloat(a.price), size: parseFloat(a.size) }));

  const bidDepth = bids.reduce((s, b) => s + b.size, 0);
  const askDepth = asks.reduce((s, a) => s + a.size, 0);
  const totalDepth = bidDepth + askDepth;

  const topBidPrice = bids.length > 0 ? bids[0].price : 0;
  const topAskPrice = asks.length > 0 ? asks[0].price : 0;
  const spread = topAskPrice - topBidPrice;
  const spreadPercent = topBidPrice > 0 ? spread / topBidPrice : 0;

  // Imbalance ratio: -1 (all asks) to +1 (all bids)
  const imbalanceRatio = totalDepth > 0 ? (bidDepth - askDepth) / totalDepth : 0;

  // Whale detection
  const whaleThreshold = totalDepth * WHALE_THRESHOLD_PCT;
  const whaleBids = bids.filter(b => b.size > whaleThreshold).length;
  const whaleAsks = asks.filter(a => a.size > whaleThreshold).length;
  const whaleOrders = whaleBids + whaleAsks;

  // Whale direction bias
  const whaleBias = whaleBids > whaleAsks ? 0.2 : whaleAsks > whaleBids ? -0.2 : 0;

  // Depth-weighted signal
  // Primary: imbalance ratio (60%)
  // Secondary: whale bias (25%)
  // Tertiary: spread tightness (15%) — tight spread = more conviction
  const spreadSignal = spreadPercent < 0.01 ? 0.15 : spreadPercent < 0.03 ? 0 : -0.15;

  let signal = imbalanceRatio * 0.6 + whaleBias * 0.25 + spreadSignal * 0.15;

  // Clamp to [-1, 1]
  signal = Math.max(-1, Math.min(1, signal));

  // Confidence based on depth
  const confidence = Math.min(1, totalDepth / (MIN_DEPTH_FOR_SIGNAL * 10));

  // Scale signal by confidence
  signal *= confidence;

  return {
    signal,
    bidDepth,
    askDepth,
    imbalanceRatio,
    whaleOrders,
    topBidPrice,
    topAskPrice,
    spread,
    spreadPercent,
    confidence,
  };
}

/**
 * Fetch and analyze order book for a given token.
 */
export async function fetchOrderBookSignal(tokenId: string): Promise<OrderBookAnalysis | null> {
  try {
    const res = await fetch(`/api/polymarket/clob/book?token_id=${tokenId}`);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.bids || !data.asks) return null;

    return analyzeOrderBook({
      bids: data.bids ?? [],
      asks: data.asks ?? [],
      timestamp: Date.now(),
    });
  } catch {
    return null;
  }
}
