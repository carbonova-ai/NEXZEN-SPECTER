/**
 * Market Scanner — Multi-category market discovery for Polymarket
 *
 * Extends the crypto-only gamma-api.ts to scan politics, economics,
 * and other categories. Filters by tradability criteria and scores
 * markets by edge potential.
 */

import type { PolymarketEvent, PolymarketMarket } from './types';

const PROXY_BASE = '/api/polymarket/gamma';

// ── Polymarket Gamma API tag IDs ──

export const SCAN_CATEGORIES = {
  crypto: '21',
  politics: '1',
  economics: '22',
  science: '11',
} as const;

export type ScanCategory = keyof typeof SCAN_CATEGORIES;

// ── Tradability Criteria (Section 02 of the plan) ──

export const MARKET_FILTERS = {
  minVolume: 50_000,        // > $50K total volume
  minLiquidity: 10_000,     // > $10K available liquidity
  maxSpread: 0.03,          // < 3 cents bid-ask spread
  minPrice: 0.08,           // Don't buy extreme longshots
  maxPrice: 0.92,           // Don't buy near-certainties
  minHoursToResolution: 1,  // At least 1 hour to resolution
  maxDaysToResolution: 14,  // At most 14 days to resolution
} as const;

// ── Scan Result Interface ──

export interface MarketScanResult {
  market: PolymarketMarket;
  category: ScanCategory;
  eventTitle: string;
  spread: number;
  hoursToResolution: number;
  tradabilityScore: number;
  yesPrice: number;
  noPrice: number;
  passesFilter: boolean;
  filterReason: string | null;
}

// ── Fetch events for a specific category ──

async function fetchEventsByCategory(category: ScanCategory): Promise<PolymarketEvent[]> {
  const params = new URLSearchParams({
    tag_id: SCAN_CATEGORIES[category],
    closed: 'false',
    active: 'true',
    limit: '50',
  });

  const res = await fetch(`${PROXY_BASE}/events?${params}`, {
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) return [];
  return res.json();
}

function parseJsonField<T>(value: T | string): T {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value as T; }
  }
  return value;
}

// ── Compute spread from outcome prices ──

function computeSpread(market: PolymarketMarket): { yesPrice: number; noPrice: number; spread: number } {
  const prices = parseJsonField<string[]>(market.outcomePrices);
  if (!prices || prices.length < 2) return { yesPrice: 0.5, noPrice: 0.5, spread: 1 };

  const yesPrice = parseFloat(prices[0]) || 0.5;
  const noPrice = parseFloat(prices[1]) || 0.5;

  // Spread = how far the prices deviate from summing to 1.0
  // In practice, sum > 1.0 (the overround). Spread ≈ sum - 1.0
  const spread = Math.abs((yesPrice + noPrice) - 1.0);

  return { yesPrice, noPrice, spread };
}

// ── Hours until resolution ──

function hoursToResolution(market: PolymarketMarket): number {
  if (!market.endDate) return Infinity;
  const end = new Date(market.endDate).getTime();
  const now = Date.now();
  return Math.max(0, (end - now) / (1000 * 60 * 60));
}

// ── Filter a single market ──

function filterMarket(
  market: PolymarketMarket,
  spread: number,
  yesPrice: number,
  hours: number
): { passes: boolean; reason: string | null } {
  if ((market.volume || 0) < MARKET_FILTERS.minVolume) {
    return { passes: false, reason: `Volume $${market.volume} < $${MARKET_FILTERS.minVolume}` };
  }
  if ((market.liquidity || 0) < MARKET_FILTERS.minLiquidity) {
    return { passes: false, reason: `Liquidity $${market.liquidity} < $${MARKET_FILTERS.minLiquidity}` };
  }
  if (spread > MARKET_FILTERS.maxSpread) {
    return { passes: false, reason: `Spread ${(spread * 100).toFixed(1)}c > ${MARKET_FILTERS.maxSpread * 100}c` };
  }
  if (yesPrice < MARKET_FILTERS.minPrice || yesPrice > MARKET_FILTERS.maxPrice) {
    return { passes: false, reason: `Price ${yesPrice.toFixed(2)} outside [${MARKET_FILTERS.minPrice}, ${MARKET_FILTERS.maxPrice}]` };
  }
  if (hours < MARKET_FILTERS.minHoursToResolution) {
    return { passes: false, reason: `Only ${hours.toFixed(1)}h to resolution (min ${MARKET_FILTERS.minHoursToResolution}h)` };
  }
  if (hours > MARKET_FILTERS.maxDaysToResolution * 24) {
    return { passes: false, reason: `${(hours / 24).toFixed(0)}d to resolution (max ${MARKET_FILTERS.maxDaysToResolution}d)` };
  }
  return { passes: true, reason: null };
}

// ── Tradability Score (0-1) ──
// Higher = better candidate for trading

function scoreTradability(
  market: PolymarketMarket,
  spread: number,
  hours: number
): number {
  // Volume weight: logarithmic scaling, caps at $1M
  const volumeScore = Math.min(1, Math.log10(Math.max(1, market.volume || 1)) / 6);

  // Spread tightness: 0 spread = 1.0, 3c spread = 0.0
  const spreadScore = Math.max(0, 1 - (spread / MARKET_FILTERS.maxSpread));

  // Time horizon fit: sweet spot is 24-72 hours
  let timeScore: number;
  if (hours >= 24 && hours <= 72) timeScore = 1.0;
  else if (hours >= 6 && hours < 24) timeScore = 0.7;
  else if (hours >= 72 && hours <= 168) timeScore = 0.7; // 3-7 days
  else if (hours >= 1 && hours < 6) timeScore = 0.4;
  else timeScore = 0.3;

  // Liquidity weight: logarithmic
  const liquidityScore = Math.min(1, Math.log10(Math.max(1, market.liquidity || 1)) / 5);

  return (
    volumeScore * 0.30 +
    spreadScore * 0.30 +
    timeScore * 0.20 +
    liquidityScore * 0.20
  );
}

// ── Main Scanner ──

/**
 * Scan multiple Polymarket categories and return scored, filtered results.
 * @param categories Which categories to scan (defaults to all)
 */
export async function scanAllMarkets(
  categories: ScanCategory[] = ['crypto', 'politics', 'economics']
): Promise<MarketScanResult[]> {
  // Fetch all categories in parallel
  const eventsByCategory = await Promise.all(
    categories.map(async (cat) => {
      const events = await fetchEventsByCategory(cat).catch(() => []);
      return { category: cat, events };
    })
  );

  const results: MarketScanResult[] = [];

  for (const { category, events } of eventsByCategory) {
    for (const event of events) {
      for (const market of event.markets) {
        if (!market.active || market.closed) continue;

        // Parse token IDs
        market.clobTokenIds = parseJsonField<string[]>(market.clobTokenIds);
        market.outcomePrices = parseJsonField<string[]>(market.outcomePrices);

        const { yesPrice, noPrice, spread } = computeSpread(market);
        const hours = hoursToResolution(market);
        const { passes, reason } = filterMarket(market, spread, yesPrice, hours);
        const tradabilityScore = scoreTradability(market, spread, hours);

        results.push({
          market,
          category,
          eventTitle: event.title,
          spread,
          hoursToResolution: hours,
          tradabilityScore,
          yesPrice,
          noPrice,
          passesFilter: passes,
          filterReason: reason,
        });
      }
    }
  }

  // Sort by tradability score descending
  results.sort((a, b) => b.tradabilityScore - a.tradabilityScore);
  return results;
}

/**
 * Get only markets that pass all filters, sorted by tradability.
 */
export function filterByEdgeCriteria(results: MarketScanResult[]): MarketScanResult[] {
  return results.filter(r => r.passesFilter);
}
