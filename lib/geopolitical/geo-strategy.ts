// ══════════════════════════════════════════════════════════════
// GEO STRATEGY ENGINE — $99.60 → Thousands
//
// Capital allocation and trade execution strategy for
// geopolitical prediction markets.
//
// Key principles:
// 1. NEVER risk more than we can afford to lose
// 2. Only trade when we have a REAL edge (EV > 0)
// 3. Kelly criterion for position sizing
// 4. Track everything for learning/optimization
// 5. Cut losses fast, let winners ride
// ══════════════════════════════════════════════════════════════

import type { WarSignal, MarketTarget, SignalSummary } from './war-signal-engine';
import type { EscalationState } from './iran-intelligence';

// ── Portfolio State ──

export interface GeoPortfolio {
  initialCapital: number;        // $99.60
  currentCapital: number;        // live balance
  totalPnL: number;              // realized P&L
  unrealizedPnL: number;         // open position P&L
  positions: GeoPosition[];      // active positions
  closedTrades: GeoTrade[];      // trade history
  stats: GeoStats;
  riskState: GeoRiskState;
}

export interface GeoPosition {
  id: string;
  marketId: string;
  question: string;
  direction: 'YES' | 'NO';
  entryPrice: number;            // price we bought at
  currentPrice: number;          // live price
  size: number;                  // shares/contracts
  stake: number;                 // $ invested
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  openedAt: string;
  signal: WarSignal;             // the signal that triggered this
  stopLoss: number;              // auto-exit price
  takeProfit: number;            // profit target price
  status: 'OPEN' | 'PENDING';
}

export interface GeoTrade {
  id: string;
  marketId: string;
  question: string;
  direction: 'YES' | 'NO';
  entryPrice: number;
  exitPrice: number;
  size: number;
  stake: number;
  pnl: number;
  pnlPct: number;
  openedAt: string;
  closedAt: string;
  signalType: string;
  outcome: 'WIN' | 'LOSS' | 'BREAK_EVEN';
  holdTimeMs: number;
}

export interface GeoStats {
  totalTrades: number;
  wins: number;
  losses: number;
  breakEvens: number;
  winRate: number;
  avgWin: number;                // avg $ won
  avgLoss: number;               // avg $ lost
  profitFactor: number;          // gross profit / gross loss
  maxDrawdown: number;           // max peak-to-trough
  maxDrawdownPct: number;
  currentStreak: number;         // positive = wins, negative = losses
  bestTrade: number;             // largest single win
  worstTrade: number;            // largest single loss
  sharpeRatio: number;
  expectancy: number;            // avg $ per trade
  totalReturn: number;           // % return on initial capital
  equityCurve: { timestamp: string; equity: number }[];
}

export interface GeoRiskState {
  dailyLossLimit: number;        // max $ loss per day
  dailyLossUsed: number;         // $ lost today
  maxPositions: number;          // max concurrent positions
  maxPositionSize: number;       // max $ per position
  isHalted: boolean;             // circuit breaker active
  haltReason: string | null;
  cooldownUntil: string | null;  // no trades until this time
  consecutiveLosses: number;
}

// ── Risk Configuration (micro-100 adapted for geo) ──

export const GEO_RISK_CONFIG = {
  initialCapital: 99.60,
  maxPositionPct: 0.06,          // 6% max per position ($5.97)
  maxPositions: 3,               // max 3 concurrent geo positions
  maxPortfolioExposure: 0.15,    // 15% total capital at risk
  dailyLossLimit: 8.00,          // $8 max daily loss (8% of capital)
  consecutiveLossHalt: 3,        // halt after 3 consecutive losses
  cooldownMinutes: 15,           // 15 min cooldown after loss
  kellyFraction: 0.20,          // Fifth-Kelly
  minEdge: 0.05,                 // 5% minimum edge to trade
  minConfidence: 0.45,           // 45% minimum signal confidence
  stopLossPct: 0.40,             // 40% stop loss on position
  takeProfitPct: 0.80,           // 80% take profit target
  trailingStopPct: 0.25,         // 25% trailing stop after 50% gain
};

// ── Position Sizing ──

/**
 * Calculate optimal position size for a war signal.
 * Uses Kelly criterion with risk constraints.
 */
export function calculatePositionSize(
  signal: WarSignal,
  portfolio: GeoPortfolio,
): { stake: number; shares: number; canTrade: boolean; reason: string } {
  const config = GEO_RISK_CONFIG;
  const target = signal.marketTarget;

  if (!target) {
    return { stake: 0, shares: 0, canTrade: false, reason: 'No market target' };
  }

  // Risk checks
  if (portfolio.riskState.isHalted) {
    return { stake: 0, shares: 0, canTrade: false, reason: `HALTED: ${portfolio.riskState.haltReason}` };
  }

  if (portfolio.riskState.cooldownUntil) {
    const cooldownEnd = new Date(portfolio.riskState.cooldownUntil).getTime();
    if (Date.now() < cooldownEnd) {
      const remaining = Math.ceil((cooldownEnd - Date.now()) / 60000);
      return { stake: 0, shares: 0, canTrade: false, reason: `Cooldown: ${remaining}min remaining` };
    }
  }

  if (portfolio.positions.length >= config.maxPositions) {
    return { stake: 0, shares: 0, canTrade: false, reason: `Max positions (${config.maxPositions}) reached` };
  }

  if (portfolio.riskState.dailyLossUsed >= config.dailyLossLimit) {
    return { stake: 0, shares: 0, canTrade: false, reason: `Daily loss limit ($${config.dailyLossLimit}) reached` };
  }

  // Edge check
  if (Math.abs(target.edge) < config.minEdge) {
    return { stake: 0, shares: 0, canTrade: false, reason: `Edge too small (${Math.round(Math.abs(target.edge) * 100)}% < ${config.minEdge * 100}%)` };
  }

  if (signal.confidence < config.minConfidence) {
    return { stake: 0, shares: 0, canTrade: false, reason: `Confidence too low (${Math.round(signal.confidence * 100)}% < ${config.minConfidence * 100}%)` };
  }

  // Kelly sizing
  const kellyRaw = target.kelly;
  const kellyAdjusted = kellyRaw * config.kellyFraction;

  // Max position size
  const maxSize = portfolio.currentCapital * config.maxPositionPct;
  const kellySize = portfolio.currentCapital * kellyAdjusted;
  const remainingExposure = portfolio.currentCapital * config.maxPortfolioExposure -
    portfolio.positions.reduce((sum, p) => sum + p.stake, 0);

  let stake = Math.min(kellySize, maxSize, remainingExposure);

  // Floor and ceiling
  stake = Math.max(1.00, Math.min(stake, 6.00)); // $1-$6 per trade

  // Streak adjustment
  if (portfolio.riskState.consecutiveLosses >= 2) {
    stake *= 0.5; // halve size after 2 losses
    stake = Math.max(1.00, stake);
  }
  if (portfolio.stats.currentStreak >= 3) {
    stake *= 1.25; // slight boost on win streak
    stake = Math.min(stake, maxSize);
  }

  // Calculate shares
  const price = target.direction === 'BUY_YES'
    ? target.currentYesPrice
    : 1 - target.currentYesPrice;
  const shares = Math.floor(stake / Math.max(0.01, price));

  stake = Math.round(stake * 100) / 100;

  return {
    stake,
    shares,
    canTrade: stake >= 1.00 && shares > 0,
    reason: `Kelly: ${Math.round(kellyAdjusted * 10000) / 100}%, Stake: $${stake.toFixed(2)}, Edge: ${Math.round(Math.abs(target.edge) * 100)}%`,
  };
}

// ── Trade Decision Engine ──

export interface TradeDecision {
  action: 'TRADE' | 'WAIT' | 'SKIP';
  signal: WarSignal;
  stake: number;
  shares: number;
  direction: 'YES' | 'NO';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  reasoning: string;
  expectedPnL: number;
  riskReward: number;
}

/**
 * Evaluate all signals and generate trade decisions.
 * Ranks by EV and applies portfolio constraints.
 */
export function evaluateSignals(
  signalSummary: SignalSummary,
  portfolio: GeoPortfolio,
): TradeDecision[] {
  const decisions: TradeDecision[] = [];
  const config = GEO_RISK_CONFIG;

  for (const signal of signalSummary.topSignals) {
    if (!signal.actionable || !signal.marketTarget) continue;

    // Check if we already have a position in this market
    const existingPosition = portfolio.positions.find(p =>
      p.marketId === signal.marketTarget!.marketId
    );
    if (existingPosition) continue;

    const sizing = calculatePositionSize(signal, portfolio);
    if (!sizing.canTrade) {
      decisions.push({
        action: 'SKIP',
        signal,
        stake: 0,
        shares: 0,
        direction: signal.marketTarget.direction === 'BUY_YES' ? 'YES' : 'NO',
        entryPrice: signal.marketTarget.currentYesPrice,
        stopLoss: 0,
        takeProfit: 0,
        reasoning: sizing.reason,
        expectedPnL: 0,
        riskReward: 0,
      });
      continue;
    }

    const target = signal.marketTarget;
    const direction = target.direction === 'BUY_YES' ? 'YES' : 'NO' as const;
    const entryPrice = direction === 'YES' ? target.currentYesPrice : 1 - target.currentYesPrice;

    // Stop loss and take profit
    const stopLoss = direction === 'YES'
      ? Math.max(0.01, entryPrice * (1 - config.stopLossPct))
      : Math.min(0.99, entryPrice * (1 + config.stopLossPct));
    const takeProfit = direction === 'YES'
      ? Math.min(0.99, entryPrice * (1 + config.takeProfitPct))
      : Math.max(0.01, entryPrice * (1 - config.takeProfitPct));

    // Expected P&L
    const expectedWin = (target.estimatedFairPrice - entryPrice) * sizing.shares;
    const expectedLoss = (entryPrice - stopLoss) * sizing.shares;
    const riskReward = expectedLoss > 0 ? expectedWin / expectedLoss : 0;

    decisions.push({
      action: riskReward >= 2.0 ? 'TRADE' : 'WAIT',
      signal,
      stake: sizing.stake,
      shares: sizing.shares,
      direction,
      entryPrice,
      stopLoss,
      takeProfit,
      reasoning: `${sizing.reason} | R:R ${riskReward.toFixed(1)}:1`,
      expectedPnL: expectedWin * signal.confidence,
      riskReward,
    });
  }

  // Sort by expected P&L descending
  decisions.sort((a, b) => b.expectedPnL - a.expectedPnL);

  return decisions;
}

// ── Portfolio Management ──

/**
 * Create a fresh portfolio with initial capital.
 */
export function createGeoPortfolio(initialCapital = 99.60): GeoPortfolio {
  return {
    initialCapital,
    currentCapital: initialCapital,
    totalPnL: 0,
    unrealizedPnL: 0,
    positions: [],
    closedTrades: [],
    stats: {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakEvens: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      maxDrawdownPct: 0,
      currentStreak: 0,
      bestTrade: 0,
      worstTrade: 0,
      sharpeRatio: 0,
      expectancy: 0,
      totalReturn: 0,
      equityCurve: [{ timestamp: new Date().toISOString(), equity: initialCapital }],
    },
    riskState: {
      dailyLossLimit: GEO_RISK_CONFIG.dailyLossLimit,
      dailyLossUsed: 0,
      maxPositions: GEO_RISK_CONFIG.maxPositions,
      maxPositionSize: initialCapital * GEO_RISK_CONFIG.maxPositionPct,
      isHalted: false,
      haltReason: null,
      cooldownUntil: null,
      consecutiveLosses: 0,
    },
  };
}

/**
 * Open a new position based on a trade decision.
 */
export function openPosition(
  portfolio: GeoPortfolio,
  decision: TradeDecision,
): GeoPortfolio {
  if (decision.action !== 'TRADE') return portfolio;

  const position: GeoPosition = {
    id: `geo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    marketId: decision.signal.marketTarget!.marketId,
    question: decision.signal.marketTarget!.question,
    direction: decision.direction,
    entryPrice: decision.entryPrice,
    currentPrice: decision.entryPrice,
    size: decision.shares,
    stake: decision.stake,
    unrealizedPnL: 0,
    unrealizedPnLPct: 0,
    openedAt: new Date().toISOString(),
    signal: decision.signal,
    stopLoss: decision.stopLoss,
    takeProfit: decision.takeProfit,
    status: 'OPEN',
  };

  return {
    ...portfolio,
    currentCapital: portfolio.currentCapital - decision.stake,
    positions: [...portfolio.positions, position],
  };
}

/**
 * Close a position and record the trade.
 */
export function closePosition(
  portfolio: GeoPortfolio,
  positionId: string,
  exitPrice: number,
): GeoPortfolio {
  const position = portfolio.positions.find(p => p.id === positionId);
  if (!position) return portfolio;

  const priceDiff = position.direction === 'YES'
    ? exitPrice - position.entryPrice
    : position.entryPrice - exitPrice;
  const pnl = priceDiff * position.size;
  const pnlPct = (pnl / position.stake) * 100;

  const trade: GeoTrade = {
    id: position.id,
    marketId: position.marketId,
    question: position.question,
    direction: position.direction,
    entryPrice: position.entryPrice,
    exitPrice,
    size: position.size,
    stake: position.stake,
    pnl: Math.round(pnl * 100) / 100,
    pnlPct: Math.round(pnlPct * 100) / 100,
    openedAt: position.openedAt,
    closedAt: new Date().toISOString(),
    signalType: position.signal.type,
    outcome: pnl > 0.01 ? 'WIN' : pnl < -0.01 ? 'LOSS' : 'BREAK_EVEN',
    holdTimeMs: Date.now() - new Date(position.openedAt).getTime(),
  };

  const newPositions = portfolio.positions.filter(p => p.id !== positionId);
  const newClosedTrades = [...portfolio.closedTrades, trade];
  const newCapital = portfolio.currentCapital + position.stake + pnl;
  const newTotalPnL = portfolio.totalPnL + pnl;

  // Update stats
  const newStats = recalculateStats(newClosedTrades, portfolio.initialCapital, newCapital);

  // Update risk state
  const riskState = { ...portfolio.riskState };
  if (trade.outcome === 'LOSS') {
    riskState.dailyLossUsed += Math.abs(pnl);
    riskState.consecutiveLosses++;
    riskState.cooldownUntil = new Date(Date.now() + GEO_RISK_CONFIG.cooldownMinutes * 60000).toISOString();

    if (riskState.consecutiveLosses >= GEO_RISK_CONFIG.consecutiveLossHalt) {
      riskState.isHalted = true;
      riskState.haltReason = `${riskState.consecutiveLosses} consecutive losses`;
    }
    if (riskState.dailyLossUsed >= GEO_RISK_CONFIG.dailyLossLimit) {
      riskState.isHalted = true;
      riskState.haltReason = `Daily loss limit ($${GEO_RISK_CONFIG.dailyLossLimit}) reached`;
    }
  } else if (trade.outcome === 'WIN') {
    riskState.consecutiveLosses = 0;
  }

  return {
    ...portfolio,
    currentCapital: Math.round(newCapital * 100) / 100,
    totalPnL: Math.round(newTotalPnL * 100) / 100,
    unrealizedPnL: newPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0),
    positions: newPositions,
    closedTrades: newClosedTrades,
    stats: newStats,
    riskState,
  };
}

/**
 * Update all position prices and check for stop loss / take profit.
 */
export function updatePositionPrices(
  portfolio: GeoPortfolio,
  marketPrices: Map<string, number>, // marketId → current YES price
): { portfolio: GeoPortfolio; triggeredExits: string[] } {
  const triggeredExits: string[] = [];
  const updatedPositions = portfolio.positions.map(pos => {
    const currentYesPrice = marketPrices.get(pos.marketId);
    if (currentYesPrice === undefined) return pos;

    const currentPrice = pos.direction === 'YES' ? currentYesPrice : 1 - currentYesPrice;
    const priceDiff = pos.direction === 'YES'
      ? currentYesPrice - pos.entryPrice
      : pos.entryPrice - currentYesPrice;
    const unrealizedPnL = priceDiff * pos.size;
    const unrealizedPnLPct = (unrealizedPnL / pos.stake) * 100;

    // Check stop loss
    if (pos.direction === 'YES' && currentYesPrice <= pos.stopLoss) {
      triggeredExits.push(pos.id);
    } else if (pos.direction === 'NO' && currentYesPrice >= 1 - pos.stopLoss) {
      triggeredExits.push(pos.id);
    }

    // Check take profit
    if (pos.direction === 'YES' && currentYesPrice >= pos.takeProfit) {
      triggeredExits.push(pos.id);
    } else if (pos.direction === 'NO' && currentYesPrice <= 1 - pos.takeProfit) {
      triggeredExits.push(pos.id);
    }

    return {
      ...pos,
      currentPrice,
      unrealizedPnL: Math.round(unrealizedPnL * 100) / 100,
      unrealizedPnLPct: Math.round(unrealizedPnLPct * 100) / 100,
    };
  });

  return {
    portfolio: {
      ...portfolio,
      positions: updatedPositions,
      unrealizedPnL: updatedPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0),
    },
    triggeredExits: [...new Set(triggeredExits)],
  };
}

// ── Stats Calculation ──

function recalculateStats(
  trades: GeoTrade[],
  initialCapital: number,
  currentCapital: number,
): GeoStats {
  if (trades.length === 0) {
    return {
      totalTrades: 0, wins: 0, losses: 0, breakEvens: 0,
      winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0,
      maxDrawdown: 0, maxDrawdownPct: 0, currentStreak: 0,
      bestTrade: 0, worstTrade: 0, sharpeRatio: 0,
      expectancy: 0, totalReturn: 0,
      equityCurve: [{ timestamp: new Date().toISOString(), equity: currentCapital }],
    };
  }

  const wins = trades.filter(t => t.outcome === 'WIN');
  const losses = trades.filter(t => t.outcome === 'LOSS');
  const breakEvens = trades.filter(t => t.outcome === 'BREAK_EVEN');

  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

  // Equity curve
  let equity = initialCapital;
  let peak = equity;
  let maxDD = 0;
  const equityCurve: { timestamp: string; equity: number }[] = [];

  for (const trade of trades) {
    equity += trade.pnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
    equityCurve.push({ timestamp: trade.closedAt, equity: Math.round(equity * 100) / 100 });
  }

  // Current streak
  let currentStreak = 0;
  for (let i = trades.length - 1; i >= 0; i--) {
    if (trades[i].outcome === 'WIN') {
      if (currentStreak >= 0) currentStreak++;
      else break;
    } else if (trades[i].outcome === 'LOSS') {
      if (currentStreak <= 0) currentStreak--;
      else break;
    }
  }

  // Sharpe (simplified)
  const returns = trades.map(t => t.pnlPct / 100);
  const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const sharpe = stdDev > 0 ? avgReturn / stdDev : 0;

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakEvens: breakEvens.length,
    winRate: trades.length > 0 ? wins.length / trades.length : 0,
    avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
    avgLoss: losses.length > 0 ? grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    maxDrawdown: Math.round(maxDD * 100) / 100,
    maxDrawdownPct: peak > 0 ? Math.round((maxDD / peak) * 10000) / 100 : 0,
    currentStreak,
    bestTrade: wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0,
    worstTrade: losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0,
    sharpeRatio: Math.round(sharpe * 100) / 100,
    expectancy: trades.length > 0 ? Math.round((grossProfit - grossLoss) / trades.length * 100) / 100 : 0,
    totalReturn: Math.round(((currentCapital - initialCapital) / initialCapital) * 10000) / 100,
    equityCurve,
  };
}

// ── Serialization (localStorage persistence) ──

const PORTFOLIO_STORAGE_KEY = 'specter-geo-portfolio';

export function saveGeoPortfolio(portfolio: GeoPortfolio): void {
  try {
    localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(portfolio));
  } catch { /* quota exceeded or SSR */ }
}

export function loadGeoPortfolio(): GeoPortfolio | null {
  try {
    const raw = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GeoPortfolio;
  } catch {
    return null;
  }
}
