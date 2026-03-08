/**
 * Alert System
 *
 * Monitors trading performance and triggers alerts via webhook
 * when critical conditions are detected:
 *
 * - Circuit breaker activated
 * - Win rate drops below threshold
 * - Large drawdown detected
 * - Regime change detected
 * - Weight optimization significant shift
 */

import type { MarketRegime } from './weight-optimizer';

// ── Alert Types ──

export type AlertLevel = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertType =
  | 'CIRCUIT_BREAKER'
  | 'WIN_RATE_DROP'
  | 'DRAWDOWN'
  | 'REGIME_CHANGE'
  | 'WEIGHT_SHIFT'
  | 'TRADE_EXECUTED'
  | 'TRADE_RESULT';

export interface Alert {
  id: string;
  type: AlertType;
  level: AlertLevel;
  title: string;
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

// ── Alert Thresholds ──

const WIN_RATE_WARNING = 0.48;    // Below 48% → warning
const WIN_RATE_CRITICAL = 0.42;   // Below 42% → critical
const DRAWDOWN_WARNING = 0.10;    // 10% drawdown → warning
const DRAWDOWN_CRITICAL = 0.15;   // 15% drawdown → critical
const WEIGHT_SHIFT_THRESHOLD = 0.05; // 5% weight change → info

// Cooldowns to prevent alert spam (ms)
const ALERT_COOLDOWNS: Record<AlertType, number> = {
  CIRCUIT_BREAKER: 300_000,       // 5 min
  WIN_RATE_DROP: 600_000,         // 10 min
  DRAWDOWN: 300_000,              // 5 min
  REGIME_CHANGE: 600_000,         // 10 min
  WEIGHT_SHIFT: 900_000,          // 15 min
  TRADE_EXECUTED: 0,              // No cooldown
  TRADE_RESULT: 0,                // No cooldown
};

// ── Alert Engine ──

export class AlertEngine {
  private alerts: Alert[] = [];
  private lastAlertTime: Partial<Record<AlertType, number>> = {};
  private webhookUrl: string | null;
  private lastRegime: MarketRegime | null = null;
  private maxAlerts = 100;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl ?? process.env.NEXT_PUBLIC_ALERT_WEBHOOK_URL ?? null;
  }

  private generateId(): string {
    return `alert_${Date.now()}_${Math.random().toString(16).substring(2, 6)}`;
  }

  private canAlert(type: AlertType): boolean {
    const last = this.lastAlertTime[type] ?? 0;
    return Date.now() - last > ALERT_COOLDOWNS[type];
  }

  private async sendWebhook(alert: Alert): Promise<void> {
    if (!this.webhookUrl) return;

    const levelEmoji = { INFO: 'ℹ️', WARNING: '⚠️', CRITICAL: '🚨' }[alert.level];

    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Discord/Slack compatible format
          content: `${levelEmoji} **SPECTER ${alert.level}** — ${alert.title}\n${alert.message}`,
          // Telegram format
          text: `${levelEmoji} SPECTER ${alert.level}\n${alert.title}\n${alert.message}`,
        }),
      });
    } catch {
      // Silently fail — don't let webhook errors affect trading
    }
  }

  private pushAlert(alert: Alert): void {
    this.alerts.push(alert);
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts);
    }
    this.lastAlertTime[alert.type] = Date.now();
    this.sendWebhook(alert);
  }

  // ── Check Functions ──

  checkCircuitBreaker(active: boolean, reason: string): void {
    if (!active || !this.canAlert('CIRCUIT_BREAKER')) return;

    this.pushAlert({
      id: this.generateId(),
      type: 'CIRCUIT_BREAKER',
      level: 'CRITICAL',
      title: 'Circuit Breaker Activated',
      message: `Trading halted: ${reason}`,
      timestamp: Date.now(),
    });
  }

  checkWinRate(winRate: number, totalTrades: number): void {
    if (totalTrades < 10 || !this.canAlert('WIN_RATE_DROP')) return;

    if (winRate < WIN_RATE_CRITICAL) {
      this.pushAlert({
        id: this.generateId(),
        type: 'WIN_RATE_DROP',
        level: 'CRITICAL',
        title: 'Win Rate Critical',
        message: `Win rate dropped to ${(winRate * 100).toFixed(1)}% over ${totalTrades} trades`,
        timestamp: Date.now(),
        data: { winRate, totalTrades },
      });
    } else if (winRate < WIN_RATE_WARNING) {
      this.pushAlert({
        id: this.generateId(),
        type: 'WIN_RATE_DROP',
        level: 'WARNING',
        title: 'Win Rate Declining',
        message: `Win rate at ${(winRate * 100).toFixed(1)}% over ${totalTrades} trades`,
        timestamp: Date.now(),
        data: { winRate, totalTrades },
      });
    }
  }

  checkDrawdown(drawdown: number, bankroll: number, peak: number): void {
    if (!this.canAlert('DRAWDOWN')) return;

    if (drawdown >= DRAWDOWN_CRITICAL) {
      this.pushAlert({
        id: this.generateId(),
        type: 'DRAWDOWN',
        level: 'CRITICAL',
        title: 'Severe Drawdown',
        message: `Drawdown ${(drawdown * 100).toFixed(1)}% — Bankroll: $${bankroll.toFixed(2)} (peak: $${peak.toFixed(2)})`,
        timestamp: Date.now(),
        data: { drawdown, bankroll, peak },
      });
    } else if (drawdown >= DRAWDOWN_WARNING) {
      this.pushAlert({
        id: this.generateId(),
        type: 'DRAWDOWN',
        level: 'WARNING',
        title: 'Drawdown Warning',
        message: `Drawdown ${(drawdown * 100).toFixed(1)}% — Bankroll: $${bankroll.toFixed(2)}`,
        timestamp: Date.now(),
        data: { drawdown, bankroll, peak },
      });
    }
  }

  checkRegimeChange(newRegime: MarketRegime): void {
    if (this.lastRegime === null) {
      this.lastRegime = newRegime;
      return;
    }

    if (newRegime !== this.lastRegime && this.canAlert('REGIME_CHANGE')) {
      this.pushAlert({
        id: this.generateId(),
        type: 'REGIME_CHANGE',
        level: 'INFO',
        title: 'Market Regime Change',
        message: `Regime shifted: ${this.lastRegime} → ${newRegime}`,
        timestamp: Date.now(),
        data: { from: this.lastRegime, to: newRegime },
      });
      this.lastRegime = newRegime;
    }
  }

  checkWeightShift(
    oldWeights: Record<string, number>,
    newWeights: Record<string, number>
  ): void {
    if (!this.canAlert('WEIGHT_SHIFT')) return;

    const shifts: string[] = [];
    for (const key of Object.keys(oldWeights)) {
      const delta = Math.abs((newWeights[key] ?? 0) - (oldWeights[key] ?? 0));
      if (delta > WEIGHT_SHIFT_THRESHOLD) {
        const direction = (newWeights[key] ?? 0) > (oldWeights[key] ?? 0) ? '↑' : '↓';
        shifts.push(`${key} ${direction}${(delta * 100).toFixed(1)}%`);
      }
    }

    if (shifts.length > 0) {
      this.pushAlert({
        id: this.generateId(),
        type: 'WEIGHT_SHIFT',
        level: 'INFO',
        title: 'Signal Weights Adjusted',
        message: shifts.join(', '),
        timestamp: Date.now(),
        data: { oldWeights, newWeights },
      });
    }
  }

  notifyTradeExecuted(direction: string, stake: number, price: number): void {
    this.pushAlert({
      id: this.generateId(),
      type: 'TRADE_EXECUTED',
      level: 'INFO',
      title: 'Trade Placed',
      message: `${direction} $${stake.toFixed(2)} at ${price.toFixed(4)}`,
      timestamp: Date.now(),
    });
  }

  notifyTradeResult(won: boolean, pnl: number, bankroll: number): void {
    this.pushAlert({
      id: this.generateId(),
      type: 'TRADE_RESULT',
      level: won ? 'INFO' : 'WARNING',
      title: won ? 'Trade Won' : 'Trade Lost',
      message: `P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} — Bankroll: $${bankroll.toFixed(2)}`,
      timestamp: Date.now(),
    });
  }

  // ── Getters ──

  getAlerts(): Alert[] {
    return [...this.alerts];
  }

  getRecentAlerts(limit = 10): Alert[] {
    return this.alerts.slice(-limit);
  }

  clearAlerts(): void {
    this.alerts = [];
  }
}
