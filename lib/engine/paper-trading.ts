import {
  Prediction,
  PredictionResult,
  PaperTrade,
  PaperTradeStatus,
  PaperTradingConfig,
  PaperTradingStats,
  DEFAULT_PAPER_TRADING_CONFIG,
} from '@/lib/types';

// ── Kelly Criterion Position Sizing ──

/**
 * Full Kelly: f* = (bp - q) / b
 * where b = net odds (payout/stake - 1), p = win probability, q = 1 - p
 * We use fractional Kelly (quarter-Kelly by default) for safety.
 */
function kellyStake(
  probability: number,
  bankroll: number,
  config: PaperTradingConfig
): number {
  // On Polymarket 5-min markets, YES/NO prices reflect odds
  // If we predict UP with 60% confidence, we buy YES at ~0.50 (market midpoint)
  // Payout is $1 if correct, so net odds b = (1 / yesPrice) - 1
  // For simplicity, use probability as our edge estimate
  const p = Math.min(0.95, Math.max(0.5, probability));
  const q = 1 - p;

  // Assume market offers ~50/50 odds (YES price ≈ 0.50), so b ≈ 1.0
  // Adjusted for spread cost
  const b = (1 / 0.50) - 1 - config.spreadCost; // ~0.98 after 2% spread
  if (b <= 0) return 0;

  const fullKelly = (b * p - q) / b;
  if (fullKelly <= 0) return 0; // No edge → don't bet

  const kellyFrac = fullKelly * config.kellyFraction;
  const rawStake = bankroll * kellyFrac;

  // Apply position limits
  const maxByPercent = bankroll * config.maxStakePercent;
  const clamped = Math.min(rawStake, maxByPercent, config.maxStake);
  return Math.max(clamped, config.minStake);
}

// ── Trade ID Generator ──

function generateTradeId(): string {
  const hex = Math.random().toString(16).substring(2, 10);
  return `pt_${Date.now()}_${hex}`;
}

// ── Paper Trading Engine ──

export class PaperTradingEngine {
  private config: PaperTradingConfig;
  private bankroll: number;
  private peakBankroll: number;
  private trades: PaperTrade[];
  private consecutiveLosses: number;
  private maxConsecutiveLosses: number;
  private circuitBreakerActive: boolean;

  constructor(
    config: PaperTradingConfig = DEFAULT_PAPER_TRADING_CONFIG,
    existingTrades: PaperTrade[] = []
  ) {
    this.config = config;
    this.trades = existingTrades;

    // Restore state from existing trades
    if (existingTrades.length > 0) {
      const lastResolved = [...existingTrades]
        .filter(t => t.status !== 'OPEN' && t.bankrollAfter !== null)
        .sort((a, b) => (a.resolvedAt ?? 0) - (b.resolvedAt ?? 0));

      this.bankroll = lastResolved.length > 0
        ? lastResolved[lastResolved.length - 1].bankrollAfter!
        : config.initialBankroll;

      this.peakBankroll = Math.max(
        config.initialBankroll,
        ...existingTrades.map(t => t.bankrollAfter ?? 0)
      );

      // Count consecutive losses from end
      let consLosses = 0;
      let maxConsLosses = 0;
      let streak = 0;
      for (const t of existingTrades) {
        if (t.status === 'LOST') {
          streak++;
          maxConsLosses = Math.max(maxConsLosses, streak);
        } else if (t.status === 'WON') {
          streak = 0;
        }
      }
      const resolvedFromEnd = [...existingTrades]
        .filter(t => t.status === 'WON' || t.status === 'LOST')
        .reverse();
      for (const t of resolvedFromEnd) {
        if (t.status === 'LOST') consLosses++;
        else break;
      }
      this.consecutiveLosses = consLosses;
      this.maxConsecutiveLosses = maxConsLosses;
    } else {
      this.bankroll = config.initialBankroll;
      this.peakBankroll = config.initialBankroll;
      this.consecutiveLosses = 0;
      this.maxConsecutiveLosses = 0;
    }

    this.circuitBreakerActive = this.checkCircuitBreaker();
  }

  private checkCircuitBreaker(): boolean {
    // Drawdown check
    const drawdown = (this.peakBankroll - this.bankroll) / this.peakBankroll;
    if (drawdown >= this.config.circuitBreakerDrawdown) return true;

    // Consecutive losses check
    if (this.consecutiveLosses >= this.config.circuitBreakerLosses) return true;

    return false;
  }

  /**
   * Open a paper trade based on a prediction.
   * Returns the trade (may be SKIPPED if circuit breaker is active or confidence too low).
   */
  openTrade(prediction: Prediction): PaperTrade {
    const now = Date.now();

    // Check circuit breaker
    if (this.circuitBreakerActive) {
      return {
        id: generateTradeId(),
        predictionId: prediction.id,
        direction: prediction.direction,
        confidence: prediction.confidence,
        probability: prediction.probability,
        stake: 0,
        entryPrice: prediction.entryPrice,
        exitPrice: null,
        yesPrice: 0.50,
        payout: null,
        pnl: null,
        status: 'SKIPPED',
        skipReason: `Circuit breaker: ${this.consecutiveLosses} consecutive losses or ${((this.peakBankroll - this.bankroll) / this.peakBankroll * 100).toFixed(1)}% drawdown`,
        bankrollBefore: this.bankroll,
        bankrollAfter: this.bankroll,
        timestamp: now,
        resolvedAt: now,
      };
    }

    // Skip LOW confidence predictions
    if (prediction.confidence === 'LOW') {
      return {
        id: generateTradeId(),
        predictionId: prediction.id,
        direction: prediction.direction,
        confidence: prediction.confidence,
        probability: prediction.probability,
        stake: 0,
        entryPrice: prediction.entryPrice,
        exitPrice: null,
        yesPrice: 0.50,
        payout: null,
        pnl: null,
        status: 'SKIPPED',
        skipReason: 'Low confidence — no edge',
        bankrollBefore: this.bankroll,
        bankrollAfter: this.bankroll,
        timestamp: now,
        resolvedAt: now,
      };
    }

    // Calculate stake using Kelly criterion
    const stake = kellyStake(prediction.probability, this.bankroll, this.config);

    if (stake <= 0 || stake < this.config.minStake) {
      return {
        id: generateTradeId(),
        predictionId: prediction.id,
        direction: prediction.direction,
        confidence: prediction.confidence,
        probability: prediction.probability,
        stake: 0,
        entryPrice: prediction.entryPrice,
        exitPrice: null,
        yesPrice: 0.50,
        payout: null,
        pnl: null,
        status: 'SKIPPED',
        skipReason: 'Kelly criterion says no edge (stake ≤ 0)',
        bankrollBefore: this.bankroll,
        bankrollAfter: this.bankroll,
        timestamp: now,
        resolvedAt: now,
      };
    }

    // Simulate buying YES or NO on Polymarket
    // If direction = UP → buy YES at ~0.50 (market midpoint assumption)
    // If direction = DOWN → buy NO at ~0.50
    const yesPrice = 0.50; // Assume fair market; in real integration, use actual CLOB price

    const trade: PaperTrade = {
      id: generateTradeId(),
      predictionId: prediction.id,
      direction: prediction.direction,
      confidence: prediction.confidence,
      probability: prediction.probability,
      stake,
      entryPrice: prediction.entryPrice,
      exitPrice: null,
      yesPrice,
      payout: null,
      pnl: null,
      status: 'OPEN',
      skipReason: null,
      bankrollBefore: this.bankroll,
      bankrollAfter: null,
      timestamp: now,
      resolvedAt: null,
    };

    this.trades.push(trade);
    return trade;
  }

  /**
   * Resolve an open trade using the prediction outcome.
   * Returns the resolved trade.
   */
  resolveTrade(
    tradeId: string,
    exitPrice: number,
    outcome: 'WIN' | 'LOSS'
  ): PaperTrade | null {
    const trade = this.trades.find(t => t.id === tradeId);
    if (!trade || trade.status !== 'OPEN') return null;

    const now = Date.now();

    if (outcome === 'WIN') {
      // Bought at yesPrice (0.50), payout is $1 per share
      // Shares = stake / yesPrice
      // Payout = shares * 1.0
      // PnL = payout - stake
      const shares = trade.stake / trade.yesPrice;
      const payout = shares * 1.0;
      const pnl = payout - trade.stake - (trade.stake * this.config.spreadCost);

      trade.payout = payout;
      trade.pnl = pnl;
      trade.status = 'WON';
      this.bankroll += pnl;
      this.consecutiveLosses = 0;
    } else {
      // Lost everything staked (minus what the NO side would return)
      const pnl = -trade.stake;
      trade.payout = 0;
      trade.pnl = pnl;
      trade.status = 'LOST';
      this.bankroll += pnl;
      this.consecutiveLosses++;
      this.maxConsecutiveLosses = Math.max(this.maxConsecutiveLosses, this.consecutiveLosses);
    }

    trade.exitPrice = exitPrice;
    trade.bankrollAfter = this.bankroll;
    trade.resolvedAt = now;

    // Update peak and check circuit breaker
    this.peakBankroll = Math.max(this.peakBankroll, this.bankroll);
    this.circuitBreakerActive = this.checkCircuitBreaker();

    return trade;
  }

  /**
   * Reset the circuit breaker (manual override).
   */
  resetCircuitBreaker(): void {
    this.circuitBreakerActive = false;
    this.consecutiveLosses = 0;
  }

  /**
   * Get current stats snapshot.
   */
  getStats(): PaperTradingStats {
    const resolved = this.trades.filter(t => t.status === 'WON' || t.status === 'LOST');
    const wins = resolved.filter(t => t.status === 'WON');
    const losses = resolved.filter(t => t.status === 'LOST');
    const skipped = this.trades.filter(t => t.status === 'SKIPPED');

    const totalStaked = resolved.reduce((sum, t) => sum + t.stake, 0);
    const totalPnl = resolved.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const pnls = resolved.map(t => t.pnl ?? 0);

    // Max drawdown from bankroll history
    let peak = this.config.initialBankroll;
    let maxDrawdown = 0;
    const bankrollHistory: { timestamp: number; bankroll: number }[] = [
      { timestamp: this.trades[0]?.timestamp ?? Date.now(), bankroll: this.config.initialBankroll },
    ];

    for (const t of resolved.sort((a, b) => (a.resolvedAt ?? 0) - (b.resolvedAt ?? 0))) {
      if (t.bankrollAfter !== null) {
        bankrollHistory.push({ timestamp: t.resolvedAt ?? t.timestamp, bankroll: t.bankrollAfter });
        peak = Math.max(peak, t.bankrollAfter);
        const dd = (peak - t.bankrollAfter) / peak;
        maxDrawdown = Math.max(maxDrawdown, dd);
      }
    }

    return {
      bankroll: this.bankroll,
      initialBankroll: this.config.initialBankroll,
      totalTrades: resolved.length,
      wins: wins.length,
      losses: losses.length,
      skipped: skipped.length,
      winRate: resolved.length > 0 ? wins.length / resolved.length : 0,
      totalStaked,
      totalPnl,
      roi: totalStaked > 0 ? totalPnl / totalStaked : 0,
      avgStake: resolved.length > 0 ? totalStaked / resolved.length : 0,
      avgPnl: resolved.length > 0 ? totalPnl / resolved.length : 0,
      bestTrade: pnls.length > 0 ? Math.max(...pnls) : 0,
      worstTrade: pnls.length > 0 ? Math.min(...pnls) : 0,
      consecutiveLosses: this.consecutiveLosses,
      maxConsecutiveLosses: this.maxConsecutiveLosses,
      maxDrawdown,
      peakBankroll: this.peakBankroll,
      circuitBreakerActive: this.circuitBreakerActive,
      bankrollHistory,
    };
  }

  getTrades(): PaperTrade[] {
    return [...this.trades];
  }

  getOpenTrade(): PaperTrade | null {
    return this.trades.find(t => t.status === 'OPEN') ?? null;
  }

  getBankroll(): number {
    return this.bankroll;
  }

  isCircuitBreakerActive(): boolean {
    return this.circuitBreakerActive;
  }
}
