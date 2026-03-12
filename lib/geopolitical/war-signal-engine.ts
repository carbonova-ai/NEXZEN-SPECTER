// ══════════════════════════════════════════════════════════════
// WAR SIGNAL ENGINE — Information Asymmetry Detector
//
// The core money-making engine. Detects when:
// 1. News breaks BEFORE Polymarket prices move (speed edge)
// 2. AI assessment diverges from market price (analytical edge)
// 3. Escalation pattern suggests imminent phase transition
// 4. Multiple sources confirm what market hasn't priced
//
// This is our unfair advantage: process information faster
// and more accurately than the crowd.
// ══════════════════════════════════════════════════════════════

import type { GeoArticle } from './types';
import type { GeoMarket } from '@/hooks/usePolymarketGeo';
import {
  analyzeIranArticle,
  type IranAnalysis,
  type IranMarketSignal,
  type EscalationState,
} from './iran-intelligence';
import {
  analyzeUkraineArticle,
  type UkraineAnalysis,
  type UkraineMarketSignal,
  type UkraineEscalationState,
} from './ukraine-intelligence';

export type Theater = 'iran' | 'ukraine';

// ── Core Types ──

export interface WarSignal {
  id: string;
  type: WarSignalType;
  strength: number;          // 0-100 signal strength
  confidence: number;        // 0-1 how sure we are
  source: 'SPEED' | 'ANALYTICAL' | 'PATTERN' | 'MULTI_SOURCE';
  timestamp: string;
  expiresAt: string;         // signal decay time
  article: GeoArticle;
  iranAnalysis: IranAnalysis;
  theater: Theater;          // which theater generated this signal
  marketTarget: MarketTarget | null;
  description: string;
  actionable: boolean;       // can we trade on this?
}

export type WarSignalType =
  | 'SPEED_EDGE'             // News broke, market hasn't moved
  | 'MISPRICING'             // AI says X%, market says Y%, gap > threshold
  | 'ESCALATION_SHIFT'       // Phase transition detected
  | 'SOURCE_CONVERGENCE'     // Multiple independent sources confirm
  | 'CONTRARIAN'             // Market overreacted, de-escalation signal
  | 'PROXY_CASCADE'          // Proxy events cascading (domino effect)
  | 'NUCLEAR_MILESTONE'      // Nuclear program milestone
  | 'OIL_DISRUPTION';        // Oil supply disruption signal

export interface MarketTarget {
  marketId: string;
  question: string;
  currentYesPrice: number;
  estimatedFairPrice: number;
  edge: number;              // fair - current (positive = buy YES, negative = buy NO)
  edgePercent: number;       // edge as % of current price
  direction: 'BUY_YES' | 'BUY_NO';
  expectedValue: number;     // EV per dollar risked
  kelly: number;             // Kelly criterion bet fraction
}

export interface SignalSummary {
  totalSignals: number;
  actionableSignals: number;
  topSignals: WarSignal[];
  overallEdge: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
  recommendation: string;
  totalEV: number;           // sum of all actionable signal EVs
}

// ── Configuration ──

const SPEED_EDGE_WINDOW_MS = 5 * 60 * 1000;    // 5 min window for speed edge
const MISPRICING_THRESHOLD = 0.08;               // 8% gap = actionable mispricing
const SIGNAL_EXPIRY_MS = 30 * 60 * 1000;        // signals expire after 30 min
const MIN_SIGNAL_STRENGTH = 25;                   // minimum to be actionable
const MIN_CONFIDENCE = 0.4;                       // minimum confidence to trade
const CONVERGENCE_THRESHOLD = 3;                  // 3+ sources = convergence

// ── Speed Edge Detection ──
// Detects when a significant Iran event hits news before the market reacts.

function detectSpeedEdge(
  article: GeoArticle,
  iranAnalysis: IranAnalysis,
  markets: GeoMarket[],
): WarSignal | null {
  // Only care about high-relevance articles
  if (iranAnalysis.relevanceScore < 30) return null;

  const articleAge = Date.now() - new Date(article.seenAt).getTime();
  if (articleAge > SPEED_EDGE_WINDOW_MS) return null; // too old

  // Find related markets that HAVEN'T moved yet
  const staleMarkets = markets.filter(m => {
    const isRelated = iranAnalysis.marketSignals.some(s =>
      m.question.toLowerCase().includes(s.market.toLowerCase()) ||
      matchMarketToSignal(m.question, s)
    );
    const hasntMoved = Math.abs(m.priceChangePct) < 1.0; // less than 1% move
    return isRelated && hasntMoved;
  });

  if (staleMarkets.length === 0) return null;

  // Find the best market target
  const bestMarket = staleMarkets[0];
  const relevantSignal = iranAnalysis.marketSignals[0];
  if (!relevantSignal) return null;

  const currentPrice = bestMarket.outcomePrices[0] ?? 0.5;
  const estimatedFair = estimateFairPrice(currentPrice, relevantSignal, iranAnalysis);
  const edge = estimatedFair - currentPrice;

  if (Math.abs(edge) < MISPRICING_THRESHOLD) return null;

  const direction: MarketTarget['direction'] = edge > 0 ? 'BUY_YES' : 'BUY_NO';
  const edgeAbs = Math.abs(edge);
  const kelly = computeKellyFraction(edgeAbs, relevantSignal.confidence);

  return {
    id: `speed-${article.id}-${Date.now()}`,
    type: 'SPEED_EDGE',
    strength: Math.min(100, iranAnalysis.relevanceScore + (1 - articleAge / SPEED_EDGE_WINDOW_MS) * 30),
    confidence: relevantSignal.confidence * 0.9, // slight discount for speed signals
    source: 'SPEED',
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SIGNAL_EXPIRY_MS).toISOString(),
    article,
    iranAnalysis,
    marketTarget: {
      marketId: bestMarket.id,
      question: bestMarket.question,
      currentYesPrice: currentPrice,
      estimatedFairPrice: estimatedFair,
      edge,
      edgePercent: (edgeAbs / Math.max(0.01, currentPrice)) * 100,
      direction,
      expectedValue: edgeAbs * relevantSignal.confidence,
      kelly,
    },
    theater: 'iran' as Theater,
    description: `SPEED EDGE: "${article.title}" (${Math.round(articleAge / 1000)}s ago) → ${bestMarket.question} hasn't moved (${Math.round(currentPrice * 100)}%)`,
    actionable: edgeAbs >= MISPRICING_THRESHOLD && relevantSignal.confidence >= MIN_CONFIDENCE,
  };
}

// ── Mispricing Detection ──
// Compares AI probability assessment with Polymarket prices.

function detectMispricing(
  article: GeoArticle,
  iranAnalysis: IranAnalysis,
  markets: GeoMarket[],
): WarSignal | null {
  if (iranAnalysis.relevanceScore < 20) return null;

  for (const signal of iranAnalysis.marketSignals) {
    // Find matching market
    const market = markets.find(m => matchMarketToSignal(m.question, signal));
    if (!market) continue;

    const currentPrice = market.outcomePrices[0] ?? 0.5;
    const estimatedFair = estimateFairPrice(currentPrice, signal, iranAnalysis);
    const edge = estimatedFair - currentPrice;

    if (Math.abs(edge) < MISPRICING_THRESHOLD) continue;

    const edgeAbs = Math.abs(edge);
    const direction: MarketTarget['direction'] = edge > 0 ? 'BUY_YES' : 'BUY_NO';
    const kelly = computeKellyFraction(edgeAbs, signal.confidence);

    return {
      id: `misprice-${article.id}-${market.id}`,
      type: 'MISPRICING',
      strength: Math.min(100, edgeAbs * 200 + iranAnalysis.relevanceScore * 0.5),
      confidence: signal.confidence,
      source: 'ANALYTICAL',
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SIGNAL_EXPIRY_MS).toISOString(),
      article,
      iranAnalysis,
      marketTarget: {
        marketId: market.id,
        question: market.question,
        currentYesPrice: currentPrice,
        estimatedFairPrice: estimatedFair,
        edge,
        edgePercent: (edgeAbs / Math.max(0.01, currentPrice)) * 100,
        direction,
        expectedValue: edgeAbs * signal.confidence,
        kelly,
      },
      theater: 'iran' as Theater,
      description: `MISPRICING: "${market.question}" at ${Math.round(currentPrice * 100)}%, AI estimates ${Math.round(estimatedFair * 100)}% (edge: ${edge > 0 ? '+' : ''}${Math.round(edge * 100)}%)`,
      actionable: edgeAbs >= MISPRICING_THRESHOLD && signal.confidence >= MIN_CONFIDENCE,
    };
  }

  return null;
}

// ── Escalation Shift Detection ──
// Detects when the escalation phase is transitioning.

function detectEscalationShift(
  article: GeoArticle,
  iranAnalysis: IranAnalysis,
  escalationState: EscalationState,
  markets: GeoMarket[],
): WarSignal | null {
  if (!iranAnalysis.isIranRelated) return null;

  // Check if this article signals a phase transition
  const PHASE_ORDER: Record<string, number> = {
    'BASELINE': 0, 'DIPLOMATIC_TENSION': 1, 'SANCTIONS_WAVE': 2,
    'PROXY_ACTIVATION': 3, 'MILITARY_POSTURE': 4,
    'NUCLEAR_ESCALATION': 5, 'DIRECT_CONFRONTATION': 6, 'WAR_FOOTING': 7,
  };

  const currentLevel = PHASE_ORDER[escalationState.phase] ?? 0;
  const articleLevel = PHASE_ORDER[iranAnalysis.escalationPhase] ?? 0;

  // Phase escalation detected
  if (articleLevel > currentLevel + 1) {
    const strength = Math.min(100, (articleLevel - currentLevel) * 25 + iranAnalysis.relevanceScore * 0.5);

    // Find best market target for escalation
    let marketTarget: MarketTarget | null = null;
    for (const signal of iranAnalysis.marketSignals) {
      const market = markets.find(m => matchMarketToSignal(m.question, signal));
      if (market) {
        const currentPrice = market.outcomePrices[0] ?? 0.5;
        const estimatedFair = estimateFairPrice(currentPrice, signal, iranAnalysis);
        const edge = estimatedFair - currentPrice;
        if (Math.abs(edge) > 0.05) {
          marketTarget = {
            marketId: market.id,
            question: market.question,
            currentYesPrice: currentPrice,
            estimatedFairPrice: estimatedFair,
            edge,
            edgePercent: (Math.abs(edge) / Math.max(0.01, currentPrice)) * 100,
            direction: edge > 0 ? 'BUY_YES' : 'BUY_NO',
            expectedValue: Math.abs(edge) * signal.confidence,
            kelly: computeKellyFraction(Math.abs(edge), signal.confidence),
          };
          break;
        }
      }
    }

    return {
      id: `escalation-${article.id}-${Date.now()}`,
      type: 'ESCALATION_SHIFT',
      strength,
      confidence: Math.min(0.9, iranAnalysis.relevanceScore / 100 + 0.2),
      source: 'PATTERN',
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SIGNAL_EXPIRY_MS * 2).toISOString(),
      article,
      iranAnalysis,
      marketTarget,
      theater: 'iran' as Theater,
      description: `ESCALATION SHIFT: ${escalationState.phase} → ${iranAnalysis.escalationPhase} (jumped ${articleLevel - currentLevel} levels)`,
      actionable: strength >= MIN_SIGNAL_STRENGTH && marketTarget !== null,
    };
  }

  return null;
}

// ── Source Convergence Detection ──
// Multiple independent sources reporting the same event = high confidence.

function detectSourceConvergence(
  articles: GeoArticle[],
  markets: GeoMarket[],
): WarSignal[] {
  const signals: WarSignal[] = [];
  const recentIranArticles = articles.filter(a => {
    const age = Date.now() - new Date(a.seenAt).getTime();
    return age < 60 * 60 * 1000; // last hour
  });

  // Group by similar topic (using tags)
  const topicGroups = new Map<string, { articles: GeoArticle[]; analyses: IranAnalysis[] }>();

  for (const article of recentIranArticles) {
    const analysis = analyzeIranArticle(article);
    if (!analysis.isIranRelated || analysis.relevanceScore < 20) continue;

    // Use primary Iran tag as group key
    const primaryTag = analysis.iranTags[0] || 'general';
    if (!topicGroups.has(primaryTag)) {
      topicGroups.set(primaryTag, { articles: [], analyses: [] });
    }
    const group = topicGroups.get(primaryTag)!;
    group.articles.push(article);
    group.analyses.push(analysis);
  }

  for (const [topic, group] of topicGroups) {
    if (group.articles.length < CONVERGENCE_THRESHOLD) continue;

    // Count unique sources
    const uniqueSources = new Set(group.articles.map(a => a.source));
    if (uniqueSources.size < CONVERGENCE_THRESHOLD) continue;

    const bestAnalysis = group.analyses.sort((a, b) => b.relevanceScore - a.relevanceScore)[0];
    const bestArticle = group.articles[0];

    // Find market target
    let marketTarget: MarketTarget | null = null;
    for (const signal of bestAnalysis.marketSignals) {
      const market = markets.find(m => matchMarketToSignal(m.question, signal));
      if (market) {
        const currentPrice = market.outcomePrices[0] ?? 0.5;
        // Convergence increases our confidence in fair price estimate
        const estimatedFair = estimateFairPrice(currentPrice, signal, bestAnalysis, 1.2);
        const edge = estimatedFair - currentPrice;
        if (Math.abs(edge) > 0.05) {
          marketTarget = {
            marketId: market.id,
            question: market.question,
            currentYesPrice: currentPrice,
            estimatedFairPrice: estimatedFair,
            edge,
            edgePercent: (Math.abs(edge) / Math.max(0.01, currentPrice)) * 100,
            direction: edge > 0 ? 'BUY_YES' : 'BUY_NO',
            expectedValue: Math.abs(edge) * signal.confidence * 1.2,
            kelly: computeKellyFraction(Math.abs(edge), signal.confidence * 1.2),
          };
          break;
        }
      }
    }

    signals.push({
      id: `convergence-${topic}-${Date.now()}`,
      type: 'SOURCE_CONVERGENCE',
      strength: Math.min(100, uniqueSources.size * 20 + bestAnalysis.relevanceScore * 0.5),
      confidence: Math.min(0.95, 0.5 + uniqueSources.size * 0.1),
      source: 'MULTI_SOURCE',
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SIGNAL_EXPIRY_MS).toISOString(),
      article: bestArticle,
      iranAnalysis: bestAnalysis,
      marketTarget,
      theater: 'iran' as Theater,
      description: `SOURCE CONVERGENCE: ${uniqueSources.size} sources confirm "${topic}" (${group.articles.length} articles)`,
      actionable: marketTarget !== null,
    });
  }

  return signals;
}

// ── Helper Functions ──

function matchMarketToSignal(question: string, signal: IranMarketSignal): boolean {
  const q = question.toLowerCase();
  const s = signal.market.toLowerCase();

  // Direct keyword match
  if (q.includes(s)) return true;

  // Fuzzy matching for common patterns
  const patterns: [string, string[]][] = [
    ['iran', ['iran', 'iranian', 'tehran']],
    ['nuclear', ['nuclear', 'enrichment', 'weapon']],
    ['war', ['war', 'conflict', 'military', 'strike', 'attack']],
    ['oil', ['oil', 'crude', 'brent', 'energy']],
    ['sanctions', ['sanctions', 'embargo', 'restrict']],
    ['red sea', ['red sea', 'houthi', 'shipping']],
  ];

  for (const [signalWord, questionWords] of patterns) {
    if (s.includes(signalWord)) {
      if (questionWords.some(w => q.includes(w))) return true;
    }
  }

  return false;
}

function estimateFairPrice(
  currentPrice: number,
  signal: IranMarketSignal,
  analysis: IranAnalysis,
  convergenceMultiplier = 1.0,
): number {
  // Base adjustment from signal direction and confidence
  let adjustment = 0;

  if (signal.direction === 'YES_UP') {
    // Scale adjustment by confidence and relevance
    adjustment = signal.confidence * (analysis.relevanceScore / 100) * 0.15 * convergenceMultiplier;
  } else if (signal.direction === 'YES_DOWN') {
    adjustment = -signal.confidence * (analysis.relevanceScore / 100) * 0.12 * convergenceMultiplier;
  }

  // Cap adjustment to prevent extreme estimates
  adjustment = Math.max(-0.30, Math.min(0.30, adjustment));

  // Fair price = current + adjustment, clamped to [0.01, 0.99]
  return Math.max(0.01, Math.min(0.99, currentPrice + adjustment));
}

function computeKellyFraction(edge: number, confidence: number): number {
  // Kelly = (p * b - q) / b
  // where p = probability of winning, b = odds, q = 1 - p
  // Simplified for binary markets: Kelly ≈ edge * confidence
  const rawKelly = edge * confidence;

  // Apply Fifth-Kelly for safety (matches our bankroll profile)
  const fifthKelly = rawKelly * 0.2;

  // Clamp to 1-4% of bankroll (micro-100 profile)
  return Math.max(0.01, Math.min(0.04, fifthKelly));
}

// ── Main Signal Generator ──

/**
 * Scan all articles and markets for actionable war signals.
 * Supports both Iran and Ukraine theaters.
 */
export function generateWarSignals(
  articles: GeoArticle[],
  markets: GeoMarket[],
  escalationState: EscalationState,
  theater: Theater = 'iran',
): SignalSummary {
  const allSignals: WarSignal[] = [];
  const now = Date.now();

  // 1. Analyze each article for speed edges and mispricing
  for (const article of articles) {
    if (theater === 'ukraine') {
      // Ukraine theater: use Ukraine analyzer, wrap result as IranAnalysis for signal compatibility
      const uaAnalysis = analyzeUkraineArticle(article);
      if (!uaAnalysis.isUkraineRelated) continue;

      // Adapt Ukraine analysis to IranAnalysis shape for signal detection
      const adaptedAnalysis: IranAnalysis = {
        isIranRelated: true,
        relevanceScore: uaAnalysis.relevanceScore,
        escalationPhase: 'BASELINE', // not used for Ukraine signals
        escalationDelta: uaAnalysis.escalationDelta,
        iranTags: uaAnalysis.ukraineTags,
        nuclearRelevant: uaAnalysis.nuclearRelevant,
        proxyRelevant: false,
        oilImpact: uaAnalysis.energyImpact,
        sourceCredibility: null,
        marketSignals: uaAnalysis.marketSignals.map(s => ({
          market: s.market,
          direction: s.direction,
          confidence: s.confidence,
          reasoning: s.reasoning,
          timeframe: s.timeframe,
        })),
      };

      const speedSignal = detectSpeedEdge(article, adaptedAnalysis, markets);
      if (speedSignal) allSignals.push({ ...speedSignal, theater: 'ukraine' });

      const mispricingSignal = detectMispricing(article, adaptedAnalysis, markets);
      if (mispricingSignal) allSignals.push({ ...mispricingSignal, theater: 'ukraine' });
    } else {
      // Iran theater (default)
      const analysis = analyzeIranArticle(article);
      if (!analysis.isIranRelated) continue;

      const speedSignal = detectSpeedEdge(article, analysis, markets);
      if (speedSignal) allSignals.push({ ...speedSignal, theater: 'iran' });

      const mispricingSignal = detectMispricing(article, analysis, markets);
      if (mispricingSignal) allSignals.push({ ...mispricingSignal, theater: 'iran' });

      const escalationSignal = detectEscalationShift(article, analysis, escalationState, markets);
      if (escalationSignal) allSignals.push({ ...escalationSignal, theater: 'iran' });
    }
  }

  // 2. Source convergence (looks across multiple articles)
  const convergenceSignals = detectSourceConvergence(articles, markets);
  for (const s of convergenceSignals) allSignals.push({ ...s, theater });

  // 3. Filter expired signals and sort by strength
  const activeSignals = allSignals
    .filter(s => new Date(s.expiresAt).getTime() > now)
    .sort((a, b) => {
      // Sort by actionable first, then by strength * confidence
      if (a.actionable !== b.actionable) return a.actionable ? -1 : 1;
      return (b.strength * b.confidence) - (a.strength * a.confidence);
    });

  // 4. Deduplicate (keep strongest signal per market)
  const seenMarkets = new Set<string>();
  const deduped = activeSignals.filter(s => {
    if (!s.marketTarget) return true;
    if (seenMarkets.has(s.marketTarget.marketId)) return false;
    seenMarkets.add(s.marketTarget.marketId);
    return true;
  });

  // 5. Calculate summary
  const actionable = deduped.filter(s => s.actionable);
  const totalEV = actionable.reduce((sum, s) =>
    sum + (s.marketTarget?.expectedValue || 0), 0
  );

  let overallEdge: SignalSummary['overallEdge'] = 'NONE';
  if (actionable.length >= 3 && totalEV > 0.15) overallEdge = 'STRONG';
  else if (actionable.length >= 2 && totalEV > 0.08) overallEdge = 'MODERATE';
  else if (actionable.length >= 1) overallEdge = 'WEAK';

  // Generate recommendation
  const recommendation = generateRecommendation(actionable, escalationState, overallEdge);

  return {
    totalSignals: deduped.length,
    actionableSignals: actionable.length,
    topSignals: deduped.slice(0, 10),
    overallEdge,
    recommendation,
    totalEV,
  };
}

function generateRecommendation(
  signals: WarSignal[],
  escalation: EscalationState,
  edge: SignalSummary['overallEdge'],
): string {
  if (edge === 'NONE') {
    return 'Sem edge detectável. Aguardar desenvolvimento.';
  }

  if (edge === 'STRONG') {
    const topSignal = signals[0];
    if (topSignal.type === 'SPEED_EDGE') {
      return `AÇÃO IMEDIATA: Speed edge em "${topSignal.marketTarget?.question}". Janela fechando. EV: +${Math.round((topSignal.marketTarget?.expectedValue || 0) * 100)}%.`;
    }
    return `EDGE FORTE: ${signals.length} sinais convergindo. Considerar posição agressiva (dentro dos limites Kelly).`;
  }

  if (edge === 'MODERATE') {
    return `Edge moderado: ${signals.length} sinais. Posição conservadora recomendada. Escalação: ${escalation.phase}.`;
  }

  return `Edge fraco: monitorar. Escalação em ${escalation.phase}, velocidade: ${escalation.velocity > 0 ? '+' : ''}${escalation.velocity}/h.`;
}
