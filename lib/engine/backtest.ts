import { PredictionResult, PerformanceStats, EquityPoint } from '@/lib/types';

export function calculatePerformance(results: PredictionResult[]): PerformanceStats {
  // Single-pass: equity curve, streaks, drawdown, win/loss counts — all in one loop
  const equityCurve: EquityPoint[] = [];
  let equity = 100;
  let peak = 100;
  let maxDrawdown = 0;
  let winCount = 0;
  let lossCount = 0;
  let currentStreak = 0;
  let streakBest = 0;
  let confidenceSum = 0;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    confidenceSum += r.probability;

    if (r.outcome === 'PENDING') continue;

    if (r.outcome === 'WIN') {
      winCount++;
      currentStreak++;
      if (currentStreak > streakBest) streakBest = currentStreak;
    } else {
      lossCount++;
      currentStreak = 0;
    }

    const pnl = r.pnlPercent ?? 0;
    equity += pnl;
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;

    equityCurve.push({ timestamp: r.timestamp, equity });
  }

  const completed = winCount + lossCount;

  return {
    totalPredictions: results.length,
    wins: winCount,
    losses: lossCount,
    winRate: completed > 0 ? winCount / completed : 0,
    avgConfidence: results.length > 0 ? confidenceSum / results.length : 0,
    equityCurve,
    streakCurrent: currentStreak,
    streakBest,
    maxDrawdown,
  };
}

export function evaluatePrediction(
  prediction: PredictionResult,
  exitPrice: number,
  chainlinkExitPrice?: number | null
): PredictionResult {
  // Use Chainlink price for resolution when available — this is the Polymarket truth
  const resolutionPrice = chainlinkExitPrice ?? exitPrice;

  const pnlPercent = ((resolutionPrice - prediction.entryPrice) / prediction.entryPrice) * 100;
  const isCorrectDirection =
    (prediction.direction === 'UP' && resolutionPrice > prediction.entryPrice) ||
    (prediction.direction === 'DOWN' && resolutionPrice < prediction.entryPrice);

  return {
    ...prediction,
    outcome: isCorrectDirection ? 'WIN' : 'LOSS',
    exitPrice: resolutionPrice,
    pnlPercent: prediction.direction === 'UP' ? pnlPercent : -pnlPercent,
  };
}
