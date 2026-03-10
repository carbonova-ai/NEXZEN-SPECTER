import {
  Prediction,
  PaperTrade,
  PaperTradingConfig,
  PaperTradingStats,
  DEFAULT_PAPER_TRADING_CONFIG,
} from '@/lib/types';
import { RuinGuard, DEFAULT_RUIN_GUARD_CONFIG } from '@/lib/engine/ruin-guard';
import type { RuinGuardConfig } from '@/lib/engine/ruin-guard';

// ── Dynamic Kelly Criterion Position Sizing ──

/**
 * Full Kelly: f* = (bp - q) / b
 * where b = net odds (payout/stake - 1), p = win probability, q = 1 - p
 *
 * DYNAMIC FRACTION:
 * - Base: quarter-Kelly (0.25)
 * - Boost on win streaks: up to half-Kelly (0.50) after 5+ consecutive wins
 * - Reduce on loss streaks: down to eighth-Kelly (0.125) after 3+ consecutive losses
 * - Uses actual market price for odds calculation (not hardcoded 0.50)
 */
function kellyStake(
  probability: number,
  bankroll: number,
  config: PaperTradingConfig,
  consecutiveLosses: number = 0,
  consecutiveWins: number = 0,
  marketPrice: number = 0.50
): number {
  const p = Math.min(0.95, Math.max(0.5, probability));
  const q = 1 - p;

  // Use actual market price for odds calculation
  const safePrice = Math.max(0.01, Math.min(0.99, marketPrice));
  const b = (1 / safePrice) - 1 - config.spreadCost;
  if (b <= 0) return 0;

  const fullKelly = (b * p - q) / b;
  if (fullKelly <= 0) return 0;

  // Dynamic Kelly fraction based on recent performance
  let dynamicFraction = config.kellyFraction; // Base: 0.25

  // Boost on win streaks (capped at 1.3× — small sample streaks are not statistically significant)
  if (consecutiveWins >= 3) dynamicFraction = Math.min(0.26, config.kellyFraction * 1.3);

  // Reduce on loss streaks (aggressive capital preservation for micro bankroll)
  if (consecutiveLosses >= 3) dynamicFraction = config.kellyFraction * 0.3;
  else if (consecutiveLosses >= 2) dynamicFraction = config.kellyFraction * 0.6;

  // Also scale by drawdown — more conservative when in drawdown
  // (This is handled externally by circuit breaker, but we add soft scaling too)

  const kellyFrac = fullKelly * dynamicFraction;
  const rawStake = bankroll * kellyFrac;

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
  private ruinGuard: RuinGuard;

  constructor(
    config: PaperTradingConfig = DEFAULT_PAPER_TRADING_CONFIG,
    existingTrades: PaperTrade[] = [],
    ruinGuardConfig: RuinGuardConfig = DEFAULT_RUIN_GUARD_CONFIG
  ) {
    this.config = config;
    this.ruinGuard = new RuinGuard(ruinGuardConfig);
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
    // Absolute floor — PERMANENT HALT at 60% loss (ruin threshold)
    if (this.bankroll <= this.config.initialBankroll * 0.4) return true;

    // Drawdown check from peak
    const drawdown = (this.peakBankroll - this.bankroll) / this.peakBankroll;
    if (drawdown >= this.config.circuitBreakerDrawdown) return true;

    // Consecutive losses check
    if (this.consecutiveLosses >= this.config.circuitBreakerLosses) return true;

    return false;
  }

  /**
   * Open a paper trade based on a prediction.
   * Returns the trade (may be SKIPPED if circuit breaker is active or confidence too low).
   * @param marketMidpoint - Actual CLOB midpoint price (0-1). Uses 0.50 if not provided.
   */
  openTrade(prediction: Prediction, marketMidpoint?: number): PaperTrade {
    const now = Date.now();

    // Check ruin guard (daily/hourly limits, cooldown, max trades/day, permanent halt)
    const ruinCheck = this.ruinGuard.canTrade(this.bankroll);
    if (!ruinCheck.allowed) {
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
        skipReason: `Ruin guard: ${ruinCheck.reason}`,
        bankrollBefore: this.bankroll,
        bankrollAfter: this.bankroll,
        timestamp: now,
        resolvedAt: now,
      };
    }

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

    // Use actual CLOB midpoint when available for realistic simulation
    const yesPrice = marketMidpoint && marketMidpoint > 0 && marketMidpoint < 1
      ? marketMidpoint
      : 0.50;

    // Use effective bankroll (reduced by profit lock if active)
    const effectiveBankroll = this.ruinGuard.getEffectiveBankroll(this.bankroll);

    // Calculate stake using dynamic Kelly criterion
    const stake = kellyStake(
      prediction.probability,
      effectiveBankroll,
      this.config,
      this.consecutiveLosses,
      this.getConsecutiveWins(),
      yesPrice
    );

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
        yesPrice,
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

    // Record trade in ruin guard (tracks daily/hourly PnL, cooldown timer)
    this.ruinGuard.recordTrade(trade.pnl ?? 0);

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

  private getConsecutiveWins(): number {
    let wins = 0;
    const resolved = this.trades.filter(t => t.status === 'WON' || t.status === 'LOST');
    for (let i = resolved.length - 1; i >= 0; i--) {
      if (resolved[i].status === 'WON') wins++;
      else break;
    }
    return wins;
  }

  isCircuitBreakerActive(): boolean {
    return this.circuitBreakerActive;
  }

  getRuinGuard(): RuinGuard {
    return this.ruinGuard;
  }
}
