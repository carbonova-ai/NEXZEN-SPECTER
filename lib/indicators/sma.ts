import { CandleData } from '@/lib/types';

export function calculateSMA(candles: CandleData[], period: number): number | null {
  if (candles.length < period) return null;

  const closes = candles.slice(-period).map(c => c.close);
  return closes.reduce((sum, val) => sum + val, 0) / period;
}

export function interpretSMA(candles: CandleData[]): number {
  const sma20 = calculateSMA(candles, 20);
  const sma50 = calculateSMA(candles, 50);
  const currentPrice = candles[candles.length - 1]?.close;

  if (sma20 === null || currentPrice === undefined) return 0;

  let signal = 0;

  // Price vs SMA20
  if (currentPrice > sma20) signal += 0.4;
  else signal -= 0.4;

  // SMA20 vs SMA50 crossover
  if (sma50 !== null) {
    if (sma20 > sma50) signal += 0.6;    // Golden cross zone
    else signal -= 0.6;                    // Death cross zone
  } else {
    // Only SMA20 available, increase its weight
    signal *= 1.5;
  }

  return Math.max(-1, Math.min(1, signal));
}
