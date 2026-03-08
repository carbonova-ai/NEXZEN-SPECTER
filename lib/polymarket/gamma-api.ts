import { PolymarketEvent, PolymarketMarket } from './types';

const PROXY_BASE = '/api/polymarket/gamma';

const BTC_KEYWORDS = ['bitcoin', 'btc', 'satoshi'];
const BULLISH_KEYWORDS = ['above', 'over', 'higher', 'ath', 'all-time high', 'reach', 'hit', 'exceed', 'surpass', 'break', 'up or down', 'go up'];
const BEARISH_KEYWORDS = ['below', 'under', 'lower', 'crash', 'drop', 'fall', 'decline', 'dip', 'go down'];

export async function fetchCryptoEvents(): Promise<PolymarketEvent[]> {
  const params = new URLSearchParams({
    tag_id: '21',
    closed: 'false',
    active: 'true',
    limit: '50',
  });

  const res = await fetch(`${PROXY_BASE}/events?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
  return res.json();
}

export function filterBTCMarkets(events: PolymarketEvent[]): PolymarketMarket[] {
  const markets: PolymarketMarket[] = [];

  for (const event of events) {
    for (const market of event.markets) {
      if (!market.active || market.closed) continue;

      const questionLower = market.question.toLowerCase();
      const titleLower = event.title.toLowerCase();
      const combined = `${questionLower} ${titleLower}`;

      const isBTC = BTC_KEYWORDS.some(kw => combined.includes(kw));
      if (isBTC) markets.push(market);
    }
  }

  // Sort by volume descending
  markets.sort((a, b) => (b.volume || 0) - (a.volume || 0));
  return markets;
}

export function parseMarketDirection(question: string): 'bullish' | 'bearish' | 'neutral' {
  const lower = question.toLowerCase();

  const hasBullish = BULLISH_KEYWORDS.some(kw => lower.includes(kw));
  const hasBearish = BEARISH_KEYWORDS.some(kw => lower.includes(kw));

  if (hasBullish && !hasBearish) return 'bullish';
  if (hasBearish && !hasBullish) return 'bearish';
  return 'neutral';
}
