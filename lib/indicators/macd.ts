import { CandleData, MACDResult } from '@/lib/types';

function calculateEMA(values: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  // First EMA value is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  ema.push(sum / period);

  for (let i = period; i < values.length; i++) {
    ema.push((values[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
  }

  return ema;
}

export function calculateMACD(candles: CandleData[]): MACDResult | null {
  // Need at least 26 + 9 = 35 candles for a meaningful MACD
  if (candles.length < 35) return null;

  const closes = candles.map(c => c.close);

  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  // Align EMA12 and EMA26 (EMA26 starts later)
  const offset = 26 - 12; // 14
  const macdLine: number[] = [];

  for (let i = 0; i < ema26.length; i++) {
    macdLine.push(ema12[i + offset] - ema26[i]);
  }

  if (macdLine.length < 9) return null;

  const signalLine = calculateEMA(macdLine, 9);
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];

  return {
    macd: lastMacd,
    signal: lastSignal,
    histogram: lastMacd - lastSignal,
  };
}

export function interpretMACD(macd: MACDResult | null): number {
  if (macd === null) return 0;

  let signal = 0;

  // Histogram direction (momentum)
  if (macd.histogram > 0) signal += 0.5;
  else signal -= 0.5;

  // MACD vs Signal line crossover strength
  const crossoverStrength = Math.abs(macd.histogram) / (Math.abs(macd.macd) + 0.0001);
  const crossoverSignal = Math.min(crossoverStrength, 1) * 0.5;

  if (macd.histogram > 0) signal += crossoverSignal;
  else signal -= crossoverSignal;

  return Math.max(-1, Math.min(1, signal));
}
