import { PolymarketMarket, PriceGranularity } from './types';
import { parseMarketDirection } from './gamma-api';

const PROXY_BASE = '/api/polymarket/clob';

export async function fetchMidpoint(tokenId: string): Promise<number | null> {
  try {
    const res = await fetch(`${PROXY_BASE}/midpoint?token_id=${encodeURIComponent(tokenId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.mid !== undefined ? parseFloat(data.mid) : null;
  } catch {
    return null;
  }
}

export async function fetchPriceHistory(
  tokenId: string,
  granularity: PriceGranularity = '1h'
): Promise<{ timestamp: number; price: number }[]> {
  try {
    const res = await fetch(
      `${PROXY_BASE}/prices-history?token_id=${encodeURIComponent(tokenId)}&granularity=${granularity}`
    );
    if (!res.ok) return [];
    const data = await res.json();

    // Handle different response formats
    const history = data.history || data;
    if (!Array.isArray(history)) return [];

    return history.map((point: { t: number; p: number }) => ({
      timestamp: point.t,
      price: typeof point.p === 'string' ? parseFloat(point.p) : point.p,
    }));
  } catch {
    return [];
  }
}

export async function fetchMidpointsForMarkets(
  markets: PolymarketMarket[]
): Promise<Map<string, number>> {
  const midpoints = new Map<string, number>();

  // Fetch midpoints in parallel (max 10 concurrent)
  const tokenIds = markets
    .flatMap(m => m.clobTokenIds || [])
    .filter(Boolean)
    .slice(0, 20);

  const results = await Promise.allSettled(
    tokenIds.map(async (tokenId) => {
      const mid = await fetchMidpoint(tokenId);
      return { tokenId, mid };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.mid !== null) {
      midpoints.set(result.value.tokenId, result.value.mid);
    }
  }

  return midpoints;
}

export function computeSentimentFromMarkets(
  markets: PolymarketMarket[],
  midpoints: Map<string, number>
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const market of markets) {
    const direction = parseMarketDirection(market.question);
    if (direction === 'neutral') continue;

    // Get the "Yes" price (first outcome is typically "Yes")
    const tokenId = market.clobTokenIds?.[0];
    const yesPrice = tokenId
      ? midpoints.get(tokenId)
      : market.outcomePrices?.[0]
        ? parseFloat(market.outcomePrices[0])
        : null;

    if (yesPrice === null || yesPrice === undefined) continue;

    // Weight by volume and sqrt of liquidity
    const volume = market.volume || 1;
    const liquidity = market.liquidity || 1;
    const weight = volume * Math.sqrt(liquidity);

    // Convert yes price to sentiment:
    // Bullish market: high yes price = bullish sentiment (+1)
    // Bearish market: high yes price = bearish sentiment (-1)
    const sentimentValue = (yesPrice - 0.5) * 2; // Map 0-1 to -1..+1

    if (direction === 'bullish') {
      weightedSum += sentimentValue * weight;
    } else {
      weightedSum -= sentimentValue * weight;
    }

    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return Math.max(-1, Math.min(1, weightedSum / totalWeight));
}
