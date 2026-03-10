/**
 * Edge Detector — Identifies specific mispricing patterns on Polymarket
 *
 * Detects:
 * 1. Stale Price: News velocity high but market hasn't moved
 * 2. Cross-Market Inconsistency: Logically related markets with contradictory prices
 * 3. Oracle Lag Amplified: Chainlink delta exceeds threshold, 5-min market stale
 */

import type { MarketScanResult } from '@/lib/polymarket/market-scanner';

// ── Edge Signal Types ──

export type EdgeType = 'STALE_PRICE' | 'CROSS_MARKET' | 'ORACLE_LAG';

export interface EdgeSignal {
  type: EdgeType;
  strength: number;       // 0-1 (higher = more confident)
  marketId: string;
  marketQuestion: string;
  explanation: string;
  detectedAt: number;
  suggestedDirection: 'YES' | 'NO' | null;  // Which side to trade, if determinable
}

// ── News Article (simplified for edge detection) ──

export interface NewsArticle {
  title: string;
  source: string;
  publishedAt: number;
  tags: string[];
  urgencyScore: number;
}

// ── Stale Price Detection ──
// When 3+ news articles about a topic appear in <1 hour but the market hasn't moved >2c

export function detectStalePrice(
  scanResult: MarketScanResult,
  recentArticles: NewsArticle[],
  priceChangeLastHour: number = 0
): EdgeSignal | null {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  // Find articles relevant to this market (simple keyword matching)
  const marketWords = scanResult.market.question.toLowerCase().split(/\s+/);
  const significantWords = marketWords.filter(w => w.length > 3);

  const relevantArticles = recentArticles.filter(article => {
    if (article.publishedAt < oneHourAgo) return false;
    const titleLower = article.title.toLowerCase();
    const matchCount = significantWords.filter(w => titleLower.includes(w)).length;
    return matchCount >= 2; // At least 2 significant words match
  });

  if (relevantArticles.length < 3) return null;

  // Market hasn't moved significantly
  if (Math.abs(priceChangeLastHour) > 0.02) return null;

  // Calculate signal strength based on article urgency and count
  const avgUrgency = relevantArticles.reduce((s, a) => s + a.urgencyScore, 0) / relevantArticles.length;
  const countFactor = Math.min(1, relevantArticles.length / 5); // caps at 5 articles
  const strength = Math.min(1, (avgUrgency / 15) * 0.6 + countFactor * 0.4);

  if (strength < 0.3) return null;

  return {
    type: 'STALE_PRICE',
    strength,
    marketId: scanResult.market.id,
    marketQuestion: scanResult.market.question,
    explanation: `${relevantArticles.length} articles in last hour (avg urgency ${avgUrgency.toFixed(1)}) but market moved only ${(priceChangeLastHour * 100).toFixed(1)}c`,
    detectedAt: now,
    suggestedDirection: null, // Need sentiment analysis to determine direction
  };
}

// ── Cross-Market Inconsistency Detection ──
// Finds logically related markets with contradictory prices

interface MarketPair {
  a: MarketScanResult;
  b: MarketScanResult;
  inconsistencyScore: number;
  explanation: string;
}

/**
 * Detect logical inconsistencies between related markets.
 * Example: "BTC above $100K" at 0.70 but "BTC above $95K" at 0.65
 * is logically impossible (if BTC > $100K implies BTC > $95K).
 */
export function detectCrossMarketInconsistency(
  markets: MarketScanResult[]
): EdgeSignal[] {
  const edges: EdgeSignal[] = [];
  const now = Date.now();

  // Group markets by common keywords to find related pairs
  const pairs = findRelatedPairs(markets);

  for (const pair of pairs) {
    if (pair.inconsistencyScore < 0.3) continue;

    // Create edge signal for the mispriced side
    edges.push({
      type: 'CROSS_MARKET',
      strength: pair.inconsistencyScore,
      marketId: pair.a.market.id,
      marketQuestion: `${pair.a.market.question} vs ${pair.b.market.question}`,
      explanation: pair.explanation,
      detectedAt: now,
      suggestedDirection: null,
    });
  }

  return edges;
}

function findRelatedPairs(markets: MarketScanResult[]): MarketPair[] {
  const pairs: MarketPair[] = [];

  for (let i = 0; i < markets.length; i++) {
    for (let j = i + 1; j < markets.length; j++) {
      const a = markets[i];
      const b = markets[j];

      // Check if questions share enough keywords to be related
      const wordsA = new Set(a.market.question.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      const wordsB = new Set(b.market.question.toLowerCase().split(/\s+/).filter(w => w.length > 3));

      let overlap = 0;
      for (const w of wordsA) {
        if (wordsB.has(w)) overlap++;
      }

      const similarity = overlap / Math.max(wordsA.size, wordsB.size);
      if (similarity < 0.4) continue; // Not related enough

      // Check for price inconsistency
      // If market A implies market B (e.g., "above $100K" implies "above $95K"),
      // then priceA should be <= priceB
      const priceDiff = Math.abs(a.yesPrice - b.yesPrice);
      if (priceDiff < 0.05) continue; // Too close, no inconsistency

      // Score the inconsistency
      const inconsistencyScore = Math.min(1, priceDiff * similarity * 3);

      pairs.push({
        a,
        b,
        inconsistencyScore,
        explanation: `Related markets with ${(priceDiff * 100).toFixed(0)}c price gap (${a.yesPrice.toFixed(2)} vs ${b.yesPrice.toFixed(2)}, similarity ${(similarity * 100).toFixed(0)}%)`,
      });
    }
  }

  return pairs.sort((a, b) => b.inconsistencyScore - a.inconsistencyScore);
}

// ── Oracle Lag Edge Detection ──
// Amplifies the chainlink delta signal when the lag is extreme

export function detectOracleLagEdge(
  chainlinkDelta: number,   // -1 to +1, positive = Binance ahead
  threshold: number = 0.3   // Minimum delta to trigger
): EdgeSignal | null {
  const absDelta = Math.abs(chainlinkDelta);

  if (absDelta < threshold) return null;

  const now = Date.now();
  const strength = Math.min(1, absDelta / 0.8);

  return {
    type: 'ORACLE_LAG',
    strength,
    marketId: 'btc-5m',
    marketQuestion: 'BTC 5-minute Up or Down',
    explanation: `Chainlink delta ${(chainlinkDelta * 100).toFixed(1)}% — oracle lagging ${chainlinkDelta > 0 ? 'bullish' : 'bearish'} move`,
    detectedAt: now,
    suggestedDirection: chainlinkDelta > 0 ? 'YES' : 'NO',
  };
}

// ── Aggregate Edge Signals ──

/**
 * Run all edge detectors and return signals sorted by strength.
 */
export function detectAllEdges(
  scanResults: MarketScanResult[],
  recentArticles: NewsArticle[],
  chainlinkDelta: number,
  priceChanges: Map<string, number> // marketId → price change in last hour
): EdgeSignal[] {
  const signals: EdgeSignal[] = [];

  // 1. Stale price detection on each market
  for (const result of scanResults) {
    if (!result.passesFilter) continue;
    const priceChange = priceChanges.get(result.market.id) ?? 0;
    const signal = detectStalePrice(result, recentArticles, priceChange);
    if (signal) signals.push(signal);
  }

  // 2. Cross-market inconsistency
  const passingMarkets = scanResults.filter(r => r.passesFilter);
  signals.push(...detectCrossMarketInconsistency(passingMarkets));

  // 3. Oracle lag
  const oracleLag = detectOracleLagEdge(chainlinkDelta);
  if (oracleLag) signals.push(oracleLag);

  // Sort by strength descending
  signals.sort((a, b) => b.strength - a.strength);
  return signals;
}
