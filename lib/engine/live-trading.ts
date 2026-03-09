/**
 * Live Trading Engine
 *
 * Orchestrates prediction → order execution on Polymarket CLOB.
 * Uses the same risk management as paper trading (Kelly, circuit breaker)
 * but places real orders via /api/trade.
 */

import {
  Prediction,
  PaperTradingConfig,
  DEFAULT_PAPER_TRADING_CONFIG,
} from '@/lib/types';
import type { PolymarketMarket, TradeResult } from '@/lib/polymarket/types';

// ── Live Trade Record ──

export interface LiveTrade {
  id: string;
  predictionId: string;
  orderId: string | null;
  tokenId: string;
  marketQuestion: string;
  direction: 'UP' | 'DOWN';
  side: 'BUY';
  price: number;
  size: number;
  stake: number;
  status: 'PENDING' | 'FILLED' | 'FAILED' | 'SKIPPED';
  pnl: number | null;
  error: string | null;
  skipReason: string | null;
  bankrollBefore: number;
  bankrollAfter: number | null;
  timestamp: number;
  resolvedAt: number | null;
}

export interface LiveTradingStats {
  enabled: boolean;
  configured: boolean;
  bankroll: number;
  totalTrades: number;
  wins: number;
  losses: number;
  skipped: number;
  winRate: number;
  totalPnl: number;
  roi: number;
  consecutiveLosses: number;
  circuitBreakerActive: boolean;
  maxDrawdown: number;
  peakBankroll: number;
}

// ── Dynamic Kelly Criterion (matches paper trading) ──

function kellyStake(
  probability: number,
  bankroll: number,
  config: PaperTradingConfig,
  consecutiveLosses: number = 0,
  marketPrice: number = 0.50
): number {
  const p = Math.min(0.95, Math.max(0.5, probability));
  const q = 1 - p;

  // Use actual market price for odds
  const safePrice = Math.max(0.01, Math.min(0.99, marketPrice));
  const b = (1 / safePrice) - 1 - config.spreadCost;
  if (b <= 0) return 0;

  const fullKelly = (b * p - q) / b;
  if (fullKelly <= 0) return 0;

  // Dynamic fraction: reduce on loss streaks for live trading (extra conservative)
  let dynamicFraction = config.kellyFraction;
  if (consecutiveLosses >= 3) dynamicFraction = config.kellyFraction * 0.4;
  else if (consecutiveLosses >= 2) dynamicFraction = config.kellyFraction * 0.65;

  const kellyFrac = fullKelly * dynamicFraction;
  const rawStake = bankroll * kellyFrac;

  const maxByPercent = bankroll * config.maxStakePercent;
  const clamped = Math.min(rawStake, maxByPercent, config.maxStake);
  return Math.max(clamped, config.minStake);
}

// ── 5-Minute BTC Market Finder ──

/**
 * Find the best 5-minute BTC market to trade on.
 * Looks for markets with "5 minutes", "5 min", "5m" in the question.
 */
export function findFiveMinBTCMarket(
  markets: PolymarketMarket[]
): PolymarketMarket | null {
  const fiveMinKeywords = ['5 minute', '5 min', '5m', 'five minute'];
  const btcKeywords = ['bitcoin', 'btc'];

  for (const market of markets) {
    const q = market.question.toLowerCase();
    const isBtc = btcKeywords.some(kw => q.includes(kw));
    const isFiveMin = fiveMinKeywords.some(kw => q.includes(kw));

    if (isBtc && isFiveMin && market.active && !market.closed) {
      return market;
    }
  }

  return null;
}

/**
 * Determine which token to buy based on prediction direction.
 *
 * For "Bitcoin Up or Down" markets:
 * - outcomes: ["Up", "Down"] or ["Yes", "No"]
 * - clobTokenIds: [yesTokenId, noTokenId]
 *
 * If prediction = UP → buy YES (index 0)
 * If prediction = DOWN → buy NO (index 1)
 */
export function selectToken(
  market: PolymarketMarket,
  direction: 'UP' | 'DOWN'
): { tokenId: string; price: number } | null {
  if (!market.clobTokenIds || market.clobTokenIds.length < 2) return null;
  if (!market.outcomePrices || market.outcomePrices.length < 2) return null;

  const index = direction === 'UP' ? 0 : 1;
  const tokenId = market.clobTokenIds[index];
  const rawPrice = market.outcomePrices[index];
  const price = typeof rawPrice === 'string' ? parseFloat(rawPrice) : rawPrice;

  if (!tokenId || !Number.isFinite(price) || price <= 0 || price >= 1) return null;

  return { tokenId, price };
}

// ── Trade Execution (Client-Side → Server API) ──

/**
 * Execute a trade via the /api/trade server endpoint.
 * This keeps the private key server-side only.
 */
export async function executeTradeViaApi(
  tokenId: string,
  price: number,
  stakeUsdc: number
): Promise<TradeResult> {
  try {
    const res = await fetch('/api/trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenId,
        side: 'BUY',
        price,
        stakeUsdc,
      }),
      signal: AbortSignal.timeout(15_000), // Prevent indefinite hang on slow/dead server
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Request failed' }));
      return {
        success: false,
        orderId: null,
        tokenId,
        side: 'BUY',
        price,
        size: 0,
        stake: stakeUsdc,
        error: error.error ?? `HTTP ${res.status}`,
        timestamp: Date.now(),
      };
    }

    return res.json();
  } catch (error) {
    return {
      success: false,
      orderId: null,
      tokenId,
      side: 'BUY',
      price,
      size: 0,
      stake: stakeUsdc,
      error: error instanceof Error ? error.message : 'Network error',
      timestamp: Date.now(),
    };
  }
}

// ── Live Trading Engine Class ──

export class LiveTradingEngine {
  private config: PaperTradingConfig;
  private bankroll: number;
  private peakBankroll: number;
  private trades: LiveTrade[];
  private consecutiveLosses: number;
  private circuitBreakerActive: boolean;
  private enabled: boolean;

  constructor(
    config: PaperTradingConfig = DEFAULT_PAPER_TRADING_CONFIG,
    existingTrades: LiveTrade[] = [],
    enabled: boolean = false
  ) {
    this.config = config;
    this.trades = existingTrades;
    this.enabled = enabled;

    if (existingTrades.length > 0) {
      const resolved = existingTrades
        .filter(t => t.status === 'FILLED' && t.bankrollAfter !== null)
        .sort((a, b) => (a.resolvedAt ?? 0) - (b.resolvedAt ?? 0));

      this.bankroll = resolved.length > 0
        ? resolved[resolved.length - 1].bankrollAfter!
        : config.initialBankroll;

      this.peakBankroll = Math.max(
        config.initialBankroll,
        ...existingTrades.map(t => t.bankrollAfter ?? 0)
      );

      let consLosses = 0;
      const resolvedFromEnd = [...existingTrades]
        .filter(t => t.pnl !== null)
        .reverse();
      for (const t of resolvedFromEnd) {
        if ((t.pnl ?? 0) < 0) consLosses++;
        else break;
      }
      this.consecutiveLosses = consLosses;
    } else {
      this.bankroll = config.initialBankroll;
      this.peakBankroll = config.initialBankroll;
      this.consecutiveLosses = 0;
    }

    this.circuitBreakerActive = this.checkCircuitBreaker();
  }

  private checkCircuitBreaker(): boolean {
    const drawdown = (this.peakBankroll - this.bankroll) / this.peakBankroll;
    if (drawdown >= this.config.circuitBreakerDrawdown) return true;
    if (this.consecutiveLosses >= this.config.circuitBreakerLosses) return true;
    return false;
  }

  private generateId(): string {
    const hex = Math.random().toString(16).substring(2, 10);
    return `lt_${Date.now()}_${hex}`;
  }

  /**
   * Evaluate a prediction and execute a trade if appropriate.
   * Returns the trade record (may be SKIPPED).
   */
  async executePrediction(
    prediction: Prediction,
    markets: PolymarketMarket[],
    midpoints: Map<string, number>
  ): Promise<LiveTrade> {
    const now = Date.now();

    // Check if enabled
    if (!this.enabled) {
      return this.createSkippedTrade(prediction, 'Live trading disabled', now);
    }

    // Check circuit breaker
    if (this.circuitBreakerActive) {
      return this.createSkippedTrade(
        prediction,
        `Circuit breaker active (${this.consecutiveLosses} losses, ${((this.peakBankroll - this.bankroll) / this.peakBankroll * 100).toFixed(1)}% DD)`,
        now
      );
    }

    // Skip LOW confidence
    if (prediction.confidence === 'LOW') {
      return this.createSkippedTrade(prediction, 'Low confidence', now);
    }

    // Find 5-min BTC market
    const market = findFiveMinBTCMarket(markets);
    if (!market) {
      return this.createSkippedTrade(prediction, 'No 5-min BTC market found', now);
    }

    // Select token based on direction
    const tokenInfo = selectToken(market, prediction.direction);
    if (!tokenInfo) {
      return this.createSkippedTrade(prediction, 'Could not resolve market token', now);
    }

    // Use real-time midpoint if available
    const livePrice = midpoints.get(tokenInfo.tokenId);
    const price = livePrice ?? tokenInfo.price;

    // Calculate stake with dynamic Kelly
    const stake = kellyStake(prediction.probability, this.bankroll, this.config, this.consecutiveLosses, price);
    if (stake <= 0 || stake < this.config.minStake) {
      return this.createSkippedTrade(prediction, 'Kelly says no edge', now);
    }

    // Execute via API
    const result = await executeTradeViaApi(tokenInfo.tokenId, price, stake);

    const trade: LiveTrade = {
      id: this.generateId(),
      predictionId: prediction.id,
      orderId: result.orderId,
      tokenId: tokenInfo.tokenId,
      marketQuestion: market.question,
      direction: prediction.direction,
      side: 'BUY',
      price,
      size: result.size,
      stake,
      status: result.success ? 'FILLED' : 'FAILED',
      pnl: null,
      error: result.error,
      skipReason: null,
      bankrollBefore: this.bankroll,
      bankrollAfter: null,
      timestamp: now,
      resolvedAt: null,
    };

    if (!result.success) {
      trade.bankrollAfter = this.bankroll;
    }

    this.trades.push(trade);
    return trade;
  }

  private createSkippedTrade(
    prediction: Prediction,
    reason: string,
    timestamp: number
  ): LiveTrade {
    const trade: LiveTrade = {
      id: this.generateId(),
      predictionId: prediction.id,
      orderId: null,
      tokenId: '',
      marketQuestion: '',
      direction: prediction.direction,
      side: 'BUY',
      price: 0,
      size: 0,
      stake: 0,
      status: 'SKIPPED',
      pnl: null,
      error: null,
      skipReason: reason,
      bankrollBefore: this.bankroll,
      bankrollAfter: this.bankroll,
      timestamp,
      resolvedAt: timestamp,
    };
    this.trades.push(trade);
    return trade;
  }

  /**
   * Resolve a filled trade based on market outcome.
   */
  resolveTrade(tradeId: string, won: boolean): LiveTrade | null {
    const trade = this.trades.find(t => t.id === tradeId);
    if (!trade || trade.status !== 'FILLED') return null;

    if (won) {
      const payout = (trade.stake / trade.price) * 1.0;
      trade.pnl = payout - trade.stake - (trade.stake * this.config.spreadCost);
      this.bankroll += trade.pnl;
      this.consecutiveLosses = 0;
    } else {
      trade.pnl = -trade.stake;
      this.bankroll += trade.pnl;
      this.consecutiveLosses++;
    }

    trade.bankrollAfter = this.bankroll;
    trade.resolvedAt = Date.now();
    this.peakBankroll = Math.max(this.peakBankroll, this.bankroll);
    this.circuitBreakerActive = this.checkCircuitBreaker();

    return trade;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  resetCircuitBreaker(): void {
    this.circuitBreakerActive = false;
    this.consecutiveLosses = 0;
  }

  getStats(): LiveTradingStats {
    const filled = this.trades.filter(t => t.status === 'FILLED');
    const resolved = filled.filter(t => t.pnl !== null);
    const wins = resolved.filter(t => (t.pnl ?? 0) > 0);
    const losses = resolved.filter(t => (t.pnl ?? 0) <= 0);
    const skipped = this.trades.filter(t => t.status === 'SKIPPED');

    const totalPnl = resolved.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const totalStaked = resolved.reduce((sum, t) => sum + t.stake, 0);

    let peak = this.config.initialBankroll;
    let maxDD = 0;
    for (const t of resolved) {
      if (t.bankrollAfter !== null) {
        peak = Math.max(peak, t.bankrollAfter);
        const dd = (peak - t.bankrollAfter) / peak;
        maxDD = Math.max(maxDD, dd);
      }
    }

    return {
      enabled: this.enabled,
      configured: true,
      bankroll: this.bankroll,
      totalTrades: filled.length,
      wins: wins.length,
      losses: losses.length,
      skipped: skipped.length,
      winRate: resolved.length > 0 ? wins.length / resolved.length : 0,
      totalPnl,
      roi: totalStaked > 0 ? totalPnl / totalStaked : 0,
      consecutiveLosses: this.consecutiveLosses,
      circuitBreakerActive: this.circuitBreakerActive,
      maxDrawdown: maxDD,
      peakBankroll: this.peakBankroll,
    };
  }

  getTrades(): LiveTrade[] {
    return [...this.trades];
  }

  getOpenTrade(): LiveTrade | null {
    return this.trades.find(t => t.status === 'FILLED' && t.pnl === null) ?? null;
  }
}
