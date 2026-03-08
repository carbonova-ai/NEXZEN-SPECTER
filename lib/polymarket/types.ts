// ── Gamma API Responses ──

export interface PolymarketTag {
  id: number;
  label: string;
}

export interface PolymarketMarket {
  id: string;
  question: string;
  slug: string;
  conditionId: string;
  outcomes: string[];
  outcomePrices: string[];
  clobTokenIds: string[];
  volume: number;
  liquidity: number;
  endDate: string;
  closed: boolean;
  active: boolean;
}

export interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  description: string;
  startDate: string;
  endDate: string;
  closed: boolean;
  markets: PolymarketMarket[];
  tags: PolymarketTag[];
}

// ── CLOB API Responses ──

export interface ClobOrderBookEntry {
  price: string;
  size: string;
}

export interface ClobOrderBook {
  bids: ClobOrderBookEntry[];
  asks: ClobOrderBookEntry[];
}

export interface ClobPricePoint {
  t: number;
  p: number;
}

export interface ClobPriceHistory {
  history: ClobPricePoint[];
}

// ── Internal Derived Types ──

export interface PolymarketSentiment {
  marketId: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  lastUpdated: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  relevanceScore: number;
}

export type PriceGranularity = '1m' | '5m' | '15m' | '1h' | '6h' | '1d' | '1w';

// ── CLOB Order Types ──

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'GTC' | 'GTD' | 'FOK';
export type OrderStatus = 'LIVE' | 'MATCHED' | 'CANCELLED' | 'EXPIRED';

export interface ClobOrderRequest {
  tokenId: string;
  side: OrderSide;
  price: number;           // 0-1 for outcome token price
  size: number;             // Number of outcome tokens
  orderType: OrderType;
  expiration?: number;      // Unix timestamp (0 = no expiration)
}

export interface ClobSignedOrder {
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  feeRateBps: string;
  side: number;             // 0 = BUY, 1 = SELL
  signatureType: number;
  signature: string;
}

export interface ClobOrderResponse {
  orderID: string;
  status: OrderStatus;
  transactionsHashes?: string[];
  createdAt?: number;
}

export interface ClobOrderStatusResponse {
  id: string;
  status: OrderStatus;
  price: string;
  original_size: string;
  size_matched: string;
  outcome: string;
  owner: string;
  created_at: number;
}

export interface TradeRequest {
  predictionId: string;
  direction: 'UP' | 'DOWN';
  confidence: 'LOW' | 'MED' | 'HIGH';
  probability: number;
  targetMarketId?: string;  // Specific market, or auto-discover
}

export interface TradeResult {
  success: boolean;
  orderId: string | null;
  tokenId: string;
  side: OrderSide;
  price: number;
  size: number;
  stake: number;            // USDC amount
  error: string | null;
  timestamp: number;
}
