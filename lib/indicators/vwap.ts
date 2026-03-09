/**
 * VWAP — Volume Weighted Average Price
 *
 * Key institutional benchmark. Price above VWAP = buyers in control.
 * Price below VWAP = sellers in control. Deviation from VWAP
 * indicates how far price has moved from "fair value".
 *
 * For 5-minute BTC prediction:
 * - VWAP deviation > +0.1% → bullish institutional flow
 * - VWAP deviation < -0.1% → bearish institutional flow
 * - Mean reversion opportunity when deviation > 0.3%
 */

import { CandleData } from '@/lib/types';

export interface VWAPResult {
  vwap: number;
  deviation: number;        // (price - vwap) / vwap as decimal
  upperBand: number;        // VWAP + 1 std dev
  lowerBand: number;        // VWAP - 1 std dev
  isMeanReversion: boolean; // Price outside bands → reversion signal
}

export function calculateVWAP(candles: CandleData[], period = 12): VWAPResult | null {
  if (candles.length < period) return null;

  const recent = candles.slice(-period);
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  const tpValues: number[] = [];

  for (const c of recent) {
    const tp = (c.high + c.low + c.close) / 3;
    tpValues.push(tp);
    cumulativeTPV += tp * c.volume;
    cumulativeVolume += c.volume;
  }

  if (cumulativeVolume === 0) return null;

  const vwap = cumulativeTPV / cumulativeVolume;

  // Standard deviation of typical prices from VWAP
  const variance = tpValues.reduce((sum, tp) => sum + (tp - vwap) ** 2, 0) / tpValues.length;
  const stdDev = Math.sqrt(variance);

  const currentPrice = recent[recent.length - 1].close;
  const deviation = (currentPrice - vwap) / vwap;

  return {
    vwap,
    deviation,
    upperBand: vwap + stdDev,
    lowerBand: vwap - stdDev,
    isMeanReversion: currentPrice > vwap + stdDev * 1.5 || currentPrice < vwap - stdDev * 1.5,
  };
}

/**
 * Interpret VWAP into a signal from -1 to +1.
 *
 * Positive deviation (price above VWAP) → bullish (+)
 * Negative deviation (price below VWAP) → bearish (-)
 * Mean reversion detected → contrarian signal (reduce strength)
 */
export function interpretVWAP(vwapResult: VWAPResult | null): number {
  if (!vwapResult) return 0;

  const { deviation, isMeanReversion } = vwapResult;

  // Base signal: normalized deviation (0.2% = full signal)
  let signal = Math.max(-1, Math.min(1, deviation * 500));

  // If mean reversion detected, dampen the trend-following signal
  // (extreme deviation suggests snap-back is likely)
  if (isMeanReversion) {
    signal *= 0.5; // Reduce conviction in extended moves
  }

  return signal;
}
