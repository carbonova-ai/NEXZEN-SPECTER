/**
 * Funding Rate Signal
 *
 * Binance perpetual futures funding rate as a contrarian sentiment indicator.
 *
 * Logic:
 * - High positive funding → too many longs → contrarian bearish
 * - High negative funding → too many shorts → contrarian bullish
 * - Near zero → no clear signal
 * - Extreme funding (>0.1%) → very strong contrarian signal
 *
 * Signal: -1 (bearish contrarian) to +1 (bullish contrarian)
 */

export interface FundingRateData {
  symbol: string;
  fundingRate: number;       // e.g. 0.0001 = 0.01%
  fundingTime: number;       // timestamp
  markPrice: number;
}

export interface FundingRateAnalysis {
  signal: number;            // -1 to +1
  currentRate: number;       // Raw funding rate
  ratePercent: number;       // As percentage
  sentiment: 'EXTREME_LONG' | 'LONG_HEAVY' | 'NEUTRAL' | 'SHORT_HEAVY' | 'EXTREME_SHORT';
  nextFundingTime: number;
}

// Thresholds (funding rate as decimal, e.g. 0.0001 = 0.01%)
const NEUTRAL_ZONE = 0.0001;      // ±0.01%
const MODERATE_ZONE = 0.0005;     // ±0.05%
const EXTREME_ZONE = 0.001;       // ±0.10%

/**
 * Analyze funding rate and generate contrarian signal.
 */
export function analyzeFundingRate(data: FundingRateData): FundingRateAnalysis {
  const rate = data.fundingRate;
  const absRate = Math.abs(rate);
  const ratePercent = rate * 100;

  let signal = 0;
  let sentiment: FundingRateAnalysis['sentiment'] = 'NEUTRAL';

  if (absRate < NEUTRAL_ZONE) {
    signal = 0;
    sentiment = 'NEUTRAL';
  } else if (rate > EXTREME_ZONE) {
    // Extreme longs → strong contrarian bearish
    signal = -0.8 - Math.min(0.2, (rate - EXTREME_ZONE) / EXTREME_ZONE * 0.2);
    sentiment = 'EXTREME_LONG';
  } else if (rate > MODERATE_ZONE) {
    // Moderate longs → mild contrarian bearish
    signal = -0.3 - (rate - MODERATE_ZONE) / (EXTREME_ZONE - MODERATE_ZONE) * 0.5;
    sentiment = 'LONG_HEAVY';
  } else if (rate > NEUTRAL_ZONE) {
    // Slight longs → weak bearish
    signal = -(rate - NEUTRAL_ZONE) / (MODERATE_ZONE - NEUTRAL_ZONE) * 0.3;
    sentiment = 'LONG_HEAVY';
  } else if (rate < -EXTREME_ZONE) {
    // Extreme shorts → strong contrarian bullish
    signal = 0.8 + Math.min(0.2, (-rate - EXTREME_ZONE) / EXTREME_ZONE * 0.2);
    sentiment = 'EXTREME_SHORT';
  } else if (rate < -MODERATE_ZONE) {
    // Moderate shorts → mild contrarian bullish
    signal = 0.3 + (-rate - MODERATE_ZONE) / (EXTREME_ZONE - MODERATE_ZONE) * 0.5;
    sentiment = 'SHORT_HEAVY';
  } else if (rate < -NEUTRAL_ZONE) {
    // Slight shorts → weak bullish
    signal = (-rate - NEUTRAL_ZONE) / (MODERATE_ZONE - NEUTRAL_ZONE) * 0.3;
    sentiment = 'SHORT_HEAVY';
  }

  // Clamp
  signal = Math.max(-1, Math.min(1, signal));

  // Next funding time (every 8 hours: 00:00, 08:00, 16:00 UTC)
  const now = Date.now();
  const msPerFunding = 8 * 60 * 60 * 1000;
  const nextFundingTime = Math.ceil(now / msPerFunding) * msPerFunding;

  return {
    signal,
    currentRate: rate,
    ratePercent,
    sentiment,
    nextFundingTime,
  };
}

/**
 * Fetch funding rate from our API route.
 */
export async function fetchFundingRateSignal(symbol = 'BTCUSDT'): Promise<FundingRateAnalysis | null> {
  try {
    const res = await fetch(`/api/binance/funding-rate?symbol=${symbol}`);
    if (!res.ok) return null;
    const data: FundingRateData = await res.json();
    return analyzeFundingRate(data);
  } catch {
    return null;
  }
}
