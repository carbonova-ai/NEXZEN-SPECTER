import { CandleData, BollingerBandsResult } from '@/lib/types';

export function calculateBollingerBands(
  candles: CandleData[],
  period = 20,
  multiplier = 2
): BollingerBandsResult | null {
  if (candles.length < period) return null;

  const closes = candles.slice(-period).map(c => c.close);
  const middle = closes.reduce((sum, val) => sum + val, 0) / period;

  const variance = closes.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + multiplier * stdDev;
  const lower = middle - multiplier * stdDev;
  const width = ((upper - lower) / middle) * 100; // as percentage

  return { upper, middle, lower, width };
}

export function interpretBollinger(
  bands: BollingerBandsResult | null,
  currentPrice: number
): number {
  if (bands === null) return 0;

  const { upper, lower, width } = bands;
  const range = upper - lower;

  if (range === 0) return 0;

  // Position within bands: 0 = lower band, 1 = upper band
  const position = (currentPrice - lower) / range;

  let signal = 0;

  // Near lower band = oversold / bullish bounce
  if (position <= 0.05) signal = 0.9;
  else if (position <= 0.2) signal = 0.5;
  // Near upper band = overbought / bearish pullback
  else if (position >= 0.95) signal = -0.9;
  else if (position >= 0.8) signal = -0.5;

  // Bollinger squeeze detection (low width = breakout imminent)
  // Don't add directional signal, but boost confidence later
  if (width < 1.0) {
    signal *= 1.3; // amplify existing signal during squeeze
  }

  return Math.max(-1, Math.min(1, signal));
}
