/**
 * Financial Performance Metrics
 *
 * Standard quantitative finance metrics for evaluating trading strategies:
 * - Sharpe Ratio (risk-adjusted return)
 * - Sortino Ratio (downside-adjusted return)
 * - Calmar Ratio (return / max drawdown)
 * - Profit Factor (gross profit / gross loss)
 * - Max Drawdown, Win Rate, Expected Value
 */

export interface TradeReturn {
  pnlPercent: number;   // e.g. 0.005 = 0.5%
  timestamp: number;
}

export interface StrategyMetrics {
  // Returns
  totalReturn: number;          // cumulative %
  avgReturn: number;            // mean per trade
  medianReturn: number;

  // Risk-adjusted
  sharpeRatio: number;          // (avg - rf) / stddev
  sortinoRatio: number;         // (avg - rf) / downside_dev
  calmarRatio: number;          // annualized_return / max_drawdown

  // Win/Loss
  winRate: number;
  profitFactor: number;         // gross_profit / gross_loss
  expectedValue: number;        // avg_win * WR - avg_loss * LR

  // Drawdown
  maxDrawdown: number;          // max peak-to-trough %
  avgDrawdown: number;
  longestDrawdown: number;      // in trade count

  // Distribution
  bestTrade: number;
  worstTrade: number;
  stdDev: number;
  skewness: number;
  tradeCount: number;
}

const RISK_FREE_RATE = 0;  // Crypto has no risk-free rate baseline
const TRADES_PER_YEAR = 365 * 24 * (60 / 5); // ~105,120 (5-min trades)

export function calculateMetrics(returns: TradeReturn[]): StrategyMetrics {
  const n = returns.length;
  if (n === 0) return emptyMetrics();

  const pnls = returns.map(r => r.pnlPercent);

  // Basic stats
  const totalReturn = pnls.reduce((s, p) => s + p, 0);
  const avgReturn = totalReturn / n;
  const sortedPnls = [...pnls].sort((a, b) => a - b);
  const medianReturn = n % 2 === 0
    ? (sortedPnls[n / 2 - 1] + sortedPnls[n / 2]) / 2
    : sortedPnls[Math.floor(n / 2)];

  // Standard deviation
  const variance = pnls.reduce((s, p) => s + (p - avgReturn) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  // Downside deviation (only negative returns)
  const downsideVariance = pnls
    .filter(p => p < 0)
    .reduce((s, p) => s + p ** 2, 0) / n;
  const downsideDev = Math.sqrt(downsideVariance);

  // Sharpe Ratio (annualized)
  const annualizedReturn = avgReturn * TRADES_PER_YEAR;
  const annualizedStdDev = stdDev * Math.sqrt(TRADES_PER_YEAR);
  const sharpeRatio = annualizedStdDev > 0
    ? (annualizedReturn - RISK_FREE_RATE) / annualizedStdDev
    : 0;

  // Sortino Ratio (annualized)
  const annualizedDownsideDev = downsideDev * Math.sqrt(TRADES_PER_YEAR);
  const sortinoRatio = annualizedDownsideDev > 0
    ? (annualizedReturn - RISK_FREE_RATE) / annualizedDownsideDev
    : 0;

  // Win/Loss analysis
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p < 0);
  const winRate = wins.length / n;
  const avgWin = wins.length > 0 ? wins.reduce((s, p) => s + p, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, p) => s + p, 0) / losses.length) : 0;

  // Profit Factor
  const grossProfit = wins.reduce((s, p) => s + p, 0);
  const grossLoss = Math.abs(losses.reduce((s, p) => s + p, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Expected Value
  const expectedValue = avgWin * winRate - avgLoss * (1 - winRate);

  // Drawdown analysis
  const { maxDrawdown, avgDrawdown, longestDrawdown } = calculateDrawdowns(pnls);

  // Calmar Ratio
  const calmarRatio = maxDrawdown > 0
    ? annualizedReturn / maxDrawdown
    : 0;

  // Skewness
  const skewness = n > 2 && stdDev > 0
    ? (pnls.reduce((s, p) => s + ((p - avgReturn) / stdDev) ** 3, 0) * n) / ((n - 1) * (n - 2))
    : 0;

  return {
    totalReturn,
    avgReturn,
    medianReturn,
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    winRate,
    profitFactor,
    expectedValue,
    maxDrawdown,
    avgDrawdown,
    longestDrawdown,
    bestTrade: Math.max(...pnls),
    worstTrade: Math.min(...pnls),
    stdDev,
    skewness,
    tradeCount: n,
  };
}

function calculateDrawdowns(pnls: number[]): {
  maxDrawdown: number;
  avgDrawdown: number;
  longestDrawdown: number;
} {
  let equity = 1;
  let peak = 1;
  let maxDD = 0;
  let currentDDLength = 0;
  let longestDD = 0;
  const drawdowns: number[] = [];

  for (const pnl of pnls) {
    equity *= (1 + pnl);
    if (equity > peak) {
      peak = equity;
      if (currentDDLength > 0) {
        longestDD = Math.max(longestDD, currentDDLength);
        currentDDLength = 0;
      }
    } else {
      const dd = (peak - equity) / peak;
      maxDD = Math.max(maxDD, dd);
      drawdowns.push(dd);
      currentDDLength++;
    }
  }

  longestDD = Math.max(longestDD, currentDDLength);

  return {
    maxDrawdown: maxDD,
    avgDrawdown: drawdowns.length > 0 ? drawdowns.reduce((s, d) => s + d, 0) / drawdowns.length : 0,
    longestDrawdown: longestDD,
  };
}

function emptyMetrics(): StrategyMetrics {
  return {
    totalReturn: 0, avgReturn: 0, medianReturn: 0,
    sharpeRatio: 0, sortinoRatio: 0, calmarRatio: 0,
    winRate: 0, profitFactor: 0, expectedValue: 0,
    maxDrawdown: 0, avgDrawdown: 0, longestDrawdown: 0,
    bestTrade: 0, worstTrade: 0, stdDev: 0, skewness: 0, tradeCount: 0,
  };
}

/**
 * Format metrics for display.
 */
export function formatMetric(value: number, type: 'ratio' | 'percent' | 'currency' | 'count'): string {
  switch (type) {
    case 'ratio': return value.toFixed(2);
    case 'percent': return `${(value * 100).toFixed(2)}%`;
    case 'currency': return `$${value.toFixed(2)}`;
    case 'count': return value.toString();
  }
}
