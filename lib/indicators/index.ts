import { CandleData, IndicatorValues } from '@/lib/types';
import { calculateRSI } from './rsi';
import { calculateSMA } from './sma';
import { calculateMACD } from './macd';
import { calculateBollingerBands } from './bollinger';
import { analyzeVolume } from './volume';
import { calculateVWAP } from './vwap';

export { calculateRSI, interpretRSI } from './rsi';
export { calculateSMA, interpretSMA } from './sma';
export { calculateMACD, interpretMACD } from './macd';
export { calculateBollingerBands, interpretBollinger } from './bollinger';
export { analyzeVolume, interpretVolume } from './volume';
export { calculateVWAP, interpretVWAP } from './vwap';

export function computeAllIndicators(candles: CandleData[]): IndicatorValues {
  return {
    rsi: calculateRSI(candles),
    sma20: calculateSMA(candles, 20),
    sma50: calculateSMA(candles, 50),
    macd: calculateMACD(candles),
    bollingerBands: calculateBollingerBands(candles),
    volumeProfile: analyzeVolume(candles),
    vwap: calculateVWAP(candles),
  };
}
