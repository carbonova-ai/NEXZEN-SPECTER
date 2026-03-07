import { CandleData } from '@/lib/types';

export function calculateRSI(candles: CandleData[], period = 14): number | null {
  if (candles.length < period + 1) return null;

  const closes = candles.map(c => c.close);
  const changes: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // Initial average gain/loss
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] >= 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }

  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing for remaining periods
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    avgGain = (avgGain * (period - 1) + (change >= 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
  }

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export function interpretRSI(rsi: number | null): number {
  if (rsi === null) return 0;

  if (rsi <= 20) return 1;        // Extremely oversold = strong bullish
  if (rsi <= 30) return 0.7;      // Oversold = bullish
  if (rsi <= 40) return 0.3;      // Mildly oversold
  if (rsi >= 80) return -1;       // Extremely overbought = strong bearish
  if (rsi >= 70) return -0.7;     // Overbought = bearish
  if (rsi >= 60) return -0.3;     // Mildly overbought
  return 0;                        // Neutral zone
}
