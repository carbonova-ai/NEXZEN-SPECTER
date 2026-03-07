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
