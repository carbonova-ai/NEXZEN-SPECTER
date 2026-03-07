import { PredictionResult, PerformanceStats, EquityPoint } from '@/lib/types';

export function calculatePerformance(results: PredictionResult[]): PerformanceStats {
  const completed = results.filter(r => r.outcome !== 'PENDING');
  const wins = completed.filter(r => r.outcome === 'WIN');
  const losses = completed.filter(r => r.outcome === 'LOSS');

  const winRate = completed.length > 0 ? wins.length / completed.length : 0;

  // Equity curve: start at $100, $1 per trade
  const equityCurve: EquityPoint[] = [];
  let equity = 100;
  for (const result of completed) {
    const pnl = result.pnlPercent ?? 0;
    equity += pnl; // $1 * pnl%
    equityCurve.push({ timestamp: result.timestamp, equity });
  }

  // Streaks
  let streakCurrent = 0;
  let streakBest = 0;
  let currentStreak = 0;

  for (const result of completed) {
    if (result.outcome === 'WIN') {
      currentStreak++;
      streakBest = Math.max(streakBest, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  streakCurrent = currentStreak;

  // Max drawdown
  let peak = 100;
  let maxDrawdown = 0;
  let runningEquity = 100;
  for (const result of completed) {
    runningEquity += result.pnlPercent ?? 0;
    peak = Math.max(peak, runningEquity);
    const drawdown = ((peak - runningEquity) / peak) * 100;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }

  // Average confidence (from all predictions, not just completed)
  const avgConfidence = results.length > 0
    ? results.reduce((sum, r) => sum + r.probability, 0) / results.length
    : 0;

  return {
    totalPredictions: results.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    avgConfidence,
    equityCurve,
    streakCurrent,
    streakBest,
    maxDrawdown,
  };
}

export function evaluatePrediction(
  prediction: PredictionResult,
  exitPrice: number
): PredictionResult {
  const pnlPercent = ((exitPrice - prediction.entryPrice) / prediction.entryPrice) * 100;
  const isCorrectDirection =
    (prediction.direction === 'UP' && exitPrice > prediction.entryPrice) ||
    (prediction.direction === 'DOWN' && exitPrice < prediction.entryPrice);

  return {
    ...prediction,
    outcome: isCorrectDirection ? 'WIN' : 'LOSS',
    exitPrice,
    pnlPercent: prediction.direction === 'UP' ? pnlPercent : -pnlPercent,
  };
}
