import { CandleData, VolumeProfile } from '@/lib/types';

export function analyzeVolume(candles: CandleData[], lookback = 20): VolumeProfile | null {
  if (candles.length < lookback + 1) return null;

  const recentCandles = candles.slice(-(lookback + 1));
  const historicalVolumes = recentCandles.slice(0, lookback).map(c => c.volume);
  const currentVolume = recentCandles[recentCandles.length - 1].volume;

  const average = historicalVolumes.reduce((sum, v) => sum + v, 0) / lookback;
  const ratio = average > 0 ? currentVolume / average : 1;

  return {
    average,
    current: currentVolume,
    ratio,
    isAnomaly: ratio >= 2.0,
  };
}

export function interpretVolume(
  volumeProfile: VolumeProfile | null,
  priceChange: number
): number {
  if (volumeProfile === null) return 0;

  const { ratio, isAnomaly } = volumeProfile;

  // No significant volume divergence
  if (ratio < 1.2) return 0;

  // High volume confirms price direction
  let signal = 0;

  if (isAnomaly) {
    // Volume spike: strong confirmation of current direction
    signal = priceChange > 0 ? 0.8 : -0.8;
  } else if (ratio >= 1.5) {
    // Elevated volume: moderate confirmation
    signal = priceChange > 0 ? 0.5 : -0.5;
  } else {
    // Slightly elevated
    signal = priceChange > 0 ? 0.2 : -0.2;
  }

  return Math.max(-1, Math.min(1, signal));
}
