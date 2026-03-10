/**
 * Ruin Guard — Anti-ruin protection layer for micro bankroll ($100)
 *
 * Sits ABOVE the circuit breaker. Enforces:
 * 1. Absolute floor ($40) — permanent halt, not resettable
 * 2. Daily loss limit ($10)
 * 3. Hourly loss limit ($5)
 * 4. Cooldown after loss (10 minutes)
 * 5. Max trades per day (20)
 * 6. Profit lock (at $130, lock $20 as untouchable)
 */

export interface RuinGuardConfig {
  absoluteFloor: number;       // Bankroll below this = permanent halt
  dailyLossLimit: number;      // Max loss in rolling 24h
  hourlyLossLimit: number;     // Max loss in rolling 1h
  cooldownAfterLossMs: number; // Mandatory wait after any loss
  maxTradesPerDay: number;     // Prevents overtrading
  profitLockThreshold: number; // Bankroll level that triggers profit lock
  profitLockAmount: number;    // Amount locked when threshold reached
}

export const DEFAULT_RUIN_GUARD_CONFIG: RuinGuardConfig = {
  absoluteFloor: 40,
  dailyLossLimit: 10,
  hourlyLossLimit: 5,
  cooldownAfterLossMs: 600_000, // 10 minutes
  maxTradesPerDay: 20,
  profitLockThreshold: 130,
  profitLockAmount: 20,
};

export interface TradeRecord {
  timestamp: number;
  pnl: number;
}

export interface RuinGuardDecision {
  allowed: boolean;
  reason: string;
}

export class RuinGuard {
  private config: RuinGuardConfig;
  private trades: TradeRecord[] = [];
  private permanentHalt = false;
  private profitLocked = false;
  private lockedAmount = 0;

  constructor(config: RuinGuardConfig = DEFAULT_RUIN_GUARD_CONFIG) {
    this.config = config;
  }

  /**
   * Record a completed trade. Call this after every trade resolution.
   */
  recordTrade(pnl: number): void {
    this.trades.push({ timestamp: Date.now(), pnl });

    // Prune trades older than 25 hours (keep rolling window clean)
    const cutoff = Date.now() - 25 * 60 * 60 * 1000;
    this.trades = this.trades.filter(t => t.timestamp > cutoff);
  }

  /**
   * Check if trading is allowed. Returns { allowed, reason }.
   * This must be called BEFORE every trade attempt.
   */
  canTrade(currentBankroll: number): RuinGuardDecision {
    // 1. Permanent halt check (not resettable)
    if (this.permanentHalt) {
      return { allowed: false, reason: 'PERMANENT HALT — ruin threshold breached' };
    }

    // 2. Absolute floor check
    if (currentBankroll <= this.config.absoluteFloor) {
      this.permanentHalt = true;
      return { allowed: false, reason: `PERMANENT HALT — bankroll $${currentBankroll.toFixed(2)} at or below floor $${this.config.absoluteFloor}` };
    }

    // 3. Daily loss limit
    const dailyPnl = this.getPnlInWindow(24 * 60 * 60 * 1000);
    if (dailyPnl <= -this.config.dailyLossLimit) {
      return { allowed: false, reason: `Daily loss limit reached: $${Math.abs(dailyPnl).toFixed(2)} lost (max $${this.config.dailyLossLimit})` };
    }

    // 4. Hourly loss limit
    const hourlyPnl = this.getPnlInWindow(60 * 60 * 1000);
    if (hourlyPnl <= -this.config.hourlyLossLimit) {
      return { allowed: false, reason: `Hourly loss limit reached: $${Math.abs(hourlyPnl).toFixed(2)} lost (max $${this.config.hourlyLossLimit})` };
    }

    // 5. Cooldown after loss
    const lastTrade = this.trades[this.trades.length - 1];
    if (lastTrade && lastTrade.pnl < 0) {
      const elapsed = Date.now() - lastTrade.timestamp;
      if (elapsed < this.config.cooldownAfterLossMs) {
        const remaining = Math.ceil((this.config.cooldownAfterLossMs - elapsed) / 1000);
        return { allowed: false, reason: `Post-loss cooldown: ${remaining}s remaining` };
      }
    }

    // 6. Max trades per day
    const tradesLast24h = this.getTradesInWindow(24 * 60 * 60 * 1000);
    if (tradesLast24h >= this.config.maxTradesPerDay) {
      return { allowed: false, reason: `Max trades/day reached: ${tradesLast24h}/${this.config.maxTradesPerDay}` };
    }

    return { allowed: true, reason: 'OK' };
  }

  /**
   * Get the effective bankroll for position sizing.
   * When profit lock is active, reduces bankroll by locked amount
   * so that sizing is computed on a smaller base, protecting gains.
   */
  getEffectiveBankroll(currentBankroll: number): number {
    // Activate profit lock when threshold is first reached
    if (!this.profitLocked && currentBankroll >= this.config.profitLockThreshold) {
      this.profitLocked = true;
      this.lockedAmount = this.config.profitLockAmount;
    }

    if (this.profitLocked) {
      return Math.max(currentBankroll - this.lockedAmount, this.config.absoluteFloor);
    }

    return currentBankroll;
  }

  /**
   * Check if the system is in permanent halt.
   */
  isPermanentHalt(): boolean {
    return this.permanentHalt;
  }

  /**
   * Check if profit lock is active.
   */
  isProfitLocked(): boolean {
    return this.profitLocked;
  }

  /**
   * Get locked amount.
   */
  getLockedAmount(): number {
    return this.lockedAmount;
  }

  /**
   * Get daily stats for dashboard display.
   */
  getDailyStats(): {
    tradesLast24h: number;
    pnlLast24h: number;
    pnlLastHour: number;
    maxTradesPerDay: number;
    dailyLossLimit: number;
    hourlyLossLimit: number;
    permanentHalt: boolean;
    profitLocked: boolean;
    lockedAmount: number;
  } {
    return {
      tradesLast24h: this.getTradesInWindow(24 * 60 * 60 * 1000),
      pnlLast24h: this.getPnlInWindow(24 * 60 * 60 * 1000),
      pnlLastHour: this.getPnlInWindow(60 * 60 * 1000),
      maxTradesPerDay: this.config.maxTradesPerDay,
      dailyLossLimit: this.config.dailyLossLimit,
      hourlyLossLimit: this.config.hourlyLossLimit,
      permanentHalt: this.permanentHalt,
      profitLocked: this.profitLocked,
      lockedAmount: this.lockedAmount,
    };
  }

  // ── Private helpers ──

  private getPnlInWindow(windowMs: number): number {
    const cutoff = Date.now() - windowMs;
    return this.trades
      .filter(t => t.timestamp > cutoff)
      .reduce((sum, t) => sum + t.pnl, 0);
  }

  private getTradesInWindow(windowMs: number): number {
    const cutoff = Date.now() - windowMs;
    return this.trades.filter(t => t.timestamp > cutoff).length;
  }
}
