import {
  CandleData,
  IndicatorValues,
  Prediction,
  SignalBreakdown,
  ConfidenceLevel,
  EngineConfig,
  DEFAULT_ENGINE_CONFIG,
} from '@/lib/types';
import {
  computeAllIndicators,
  interpretRSI,
  interpretMACD,
  interpretSMA,
  interpretBollinger,
  interpretVolume,
} from '@/lib/indicators';

function generateId(): string {
  const hex = Math.random().toString(16).substring(2, 10);
  return `pred_${Date.now()}_${hex}`;
}

function computeSignals(
  candles: CandleData[],
  indicators: IndicatorValues,
  polymarketSentiment: number | null
): SignalBreakdown {
  const currentPrice = candles[candles.length - 1].close;
  const prevPrice = candles.length >= 2 ? candles[candles.length - 2].close : currentPrice;
  const priceChange = currentPrice - prevPrice;

  const rsiSignal = interpretRSI(indicators.rsi);
  const macdSignal = interpretMACD(indicators.macd);
  const smaSignal = interpretSMA(candles);
  const bollingerSignal = interpretBollinger(indicators.bollingerBands, currentPrice);
  const volumeSignal = interpretVolume(indicators.volumeProfile, priceChange);
  const polymarketSignal = polymarketSentiment ?? 0;

  return {
    rsiSignal,
    macdSignal,
    smaSignal,
    bollingerSignal,
    volumeSignal,
    polymarketSignal,
    aggregateScore: 0, // computed separately with weights
  };
}

function computeWeightedScore(
  signals: SignalBreakdown,
  config: EngineConfig,
  hasPolymarket: boolean
): number {
  const w = { ...config.weights };

  // If Polymarket is unavailable, redistribute its weight
  if (!hasPolymarket) {
    const polyWeight = w.polymarket;
    w.polymarket = 0;
    const otherKeys: (keyof typeof w)[] = ['rsi', 'macd', 'sma', 'bollinger', 'volume'];
    const totalOther = otherKeys.reduce((sum, k) => sum + w[k], 0);
    for (const key of otherKeys) {
      w[key] += (w[key] / totalOther) * polyWeight;
    }
  }

  return (
    signals.rsiSignal * w.rsi +
    signals.macdSignal * w.macd +
    signals.smaSignal * w.sma +
    signals.bollingerSignal * w.bollinger +
    signals.volumeSignal * w.volume +
    signals.polymarketSignal * w.polymarket
  );
}

function computeConfidence(signals: SignalBreakdown, hasPolymarket: boolean): ConfidenceLevel {
  const allSignals = [
    signals.rsiSignal,
    signals.macdSignal,
    signals.smaSignal,
    signals.bollingerSignal,
    signals.volumeSignal,
    ...(hasPolymarket ? [signals.polymarketSignal] : []),
  ];

  const nonZero = allSignals.filter(s => Math.abs(s) > 0.1);
  if (nonZero.length === 0) return 'LOW';

  const direction = nonZero.reduce((sum, s) => sum + Math.sign(s), 0);
  const agreement = Math.abs(direction) / nonZero.length;

  if (agreement >= 0.7 && nonZero.length >= 3) return 'HIGH';
  if (agreement >= 0.5 && nonZero.length >= 2) return 'MED';
  return 'LOW';
}

function buildReasoning(signals: SignalBreakdown, indicators: IndicatorValues): string[] {
  const reasons: string[] = [];

  if (indicators.rsi !== null) {
    if (indicators.rsi < 30) reasons.push(`RSI oversold at ${indicators.rsi.toFixed(1)}`);
    else if (indicators.rsi > 70) reasons.push(`RSI overbought at ${indicators.rsi.toFixed(1)}`);
    else reasons.push(`RSI neutral at ${indicators.rsi.toFixed(1)}`);
  }

  if (signals.macdSignal > 0.3) reasons.push('MACD bullish crossover');
  else if (signals.macdSignal < -0.3) reasons.push('MACD bearish crossover');

  if (signals.smaSignal > 0.3) reasons.push('Price above SMA20/50 (bullish trend)');
  else if (signals.smaSignal < -0.3) reasons.push('Price below SMA20/50 (bearish trend)');

  if (indicators.bollingerBands) {
    if (indicators.bollingerBands.width < 1.0) reasons.push('Bollinger squeeze detected');
    if (signals.bollingerSignal > 0.5) reasons.push('Price near lower Bollinger Band');
    else if (signals.bollingerSignal < -0.5) reasons.push('Price near upper Bollinger Band');
  }

  if (indicators.volumeProfile?.isAnomaly) reasons.push('Volume anomaly detected');

  if (signals.polymarketSignal > 0.3) reasons.push('Polymarket sentiment bullish');
  else if (signals.polymarketSignal < -0.3) reasons.push('Polymarket sentiment bearish');

  return reasons;
}

export function generatePrediction(
  candles: CandleData[],
  currentPrice: number,
  polymarketSentiment: number | null,
  config: EngineConfig = DEFAULT_ENGINE_CONFIG
): Prediction | null {
  // Need at least 50 candles for meaningful indicators
  if (candles.length < 50) return null;

  const indicators = computeAllIndicators(candles);
  const hasPolymarket = polymarketSentiment !== null;

  const signals = computeSignals(candles, indicators, polymarketSentiment);
  const aggregateScore = computeWeightedScore(signals, config, hasPolymarket);
  signals.aggregateScore = aggregateScore;

  const direction = aggregateScore >= 0 ? 'UP' : 'DOWN';
  const probability = Math.min(0.95, 0.5 + Math.abs(aggregateScore) * 0.45);
  const confidence = computeConfidence(signals, hasPolymarket);
  const reasoning = buildReasoning(signals, indicators);

  // Target: conservative 0.1-0.2% move in 5 min window
  const movePercent = aggregateScore * 0.002;
  const targetPrice = currentPrice * (1 + movePercent);

  return {
    id: generateId(),
    direction,
    probability,
    confidence,
    entryPrice: currentPrice,
    targetPrice,
    timestamp: Date.now(),
    expiresAt: Date.now() + config.predictionCycleMs,
    indicators,
    polymarketSentiment,
    signals,
    reasoning,
  };
}
