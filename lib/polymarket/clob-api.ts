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

/**
 * Compute time-horizon weight: short-term markets (hours/days) get
 * exponentially more weight than long-term markets (months) since we
 * make 5-minute predictions.
 *
 * - Ends in < 1 day   → weight 10x
 * - Ends in < 7 days  → weight 3x
 * - Ends in < 30 days → weight 1x
 * - Ends in > 30 days → weight 0.1x (near-zero influence)
 */
function timeHorizonMultiplier(endDate: string): number {
  const end = new Date(endDate).getTime();
  if (isNaN(end)) return 0.1;
  const daysUntilEnd = (end - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntilEnd <= 0) return 0; // expired
  if (daysUntilEnd < 1) return 10;
  if (daysUntilEnd < 7) return 3;
  if (daysUntilEnd < 30) return 1;
  return 0.1;
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

    // Get the "Yes" price — try midpoint first, fallback to outcomePrices from Gamma API
    const tokenId = market.clobTokenIds?.[0];
    const midpointPrice = tokenId ? midpoints.get(tokenId) : undefined;
    const rawFallback = market.outcomePrices?.[0] ? parseFloat(market.outcomePrices[0]) : NaN;
    const fallbackPrice = Number.isFinite(rawFallback) ? rawFallback : null;
    const yesPrice = midpointPrice ?? fallbackPrice;

    if (yesPrice === null || yesPrice === undefined || !Number.isFinite(yesPrice)) continue;

    // Weight by volume, sqrt of liquidity, and time horizon
    const volume = Number.isFinite(market.volume) && market.volume > 0 ? market.volume : 1;
    const liquidity = Number.isFinite(market.liquidity) && market.liquidity > 0 ? market.liquidity : 1;
    const timeMult = timeHorizonMultiplier(market.endDate);
    if (timeMult === 0) continue; // skip expired markets

    const weight = volume * Math.sqrt(liquidity) * timeMult;

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

  if (totalWeight === 0 || !Number.isFinite(totalWeight)) return 0;
  const result = weightedSum / totalWeight;
  return Number.isFinite(result) ? Math.max(-1, Math.min(1, result)) : 0;
}
