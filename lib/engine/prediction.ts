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
  interpretVWAP,
} from '@/lib/indicators';

function generateId(): string {
  const hex = Math.random().toString(16).substring(2, 10);
  return `pred_${Date.now()}_${hex}`;
}

// All external signal values passed into the prediction engine
export interface ExternalSignals {
  polymarketSentiment: number | null;
  chainlinkEdgeSignal: number | null;
  orderBookSignal: number | null;
  fundingRateSignal: number | null;
  onChainSignal: number | null;
  newsSentimentSignal: number | null;
  mlEnsembleSignal: number | null;
}

function computeSignals(
  candles: CandleData[],
  indicators: IndicatorValues,
  ext: ExternalSignals
): SignalBreakdown {
  const currentPrice = candles[candles.length - 1].close;
  const prevPrice = candles.length >= 2 ? candles[candles.length - 2].close : currentPrice;
  const priceChange = currentPrice - prevPrice;

  return {
    rsiSignal: interpretRSI(indicators.rsi),
    macdSignal: interpretMACD(indicators.macd),
    smaSignal: interpretSMA(candles),
    bollingerSignal: interpretBollinger(indicators.bollingerBands, currentPrice),
    volumeSignal: interpretVolume(indicators.volumeProfile, priceChange),
    vwapSignal: interpretVWAP(indicators.vwap),
    polymarketSignal: ext.polymarketSentiment ?? 0,
    chainlinkDeltaSignal: ext.chainlinkEdgeSignal ?? 0,
    orderBookSignal: ext.orderBookSignal ?? 0,
    fundingRateSignal: ext.fundingRateSignal ?? 0,
    onChainSignal: ext.onChainSignal ?? 0,
    newsSentimentSignal: ext.newsSentimentSignal ?? 0,
    mlEnsembleSignal: ext.mlEnsembleSignal ?? 0,
    aggregateScore: 0,
  };
}

// Signal key → SignalBreakdown field mapping for weighted score
const SIGNAL_WEIGHT_MAP: { key: keyof EngineConfig['weights']; field: keyof SignalBreakdown }[] = [
  { key: 'rsi', field: 'rsiSignal' },
  { key: 'macd', field: 'macdSignal' },
  { key: 'sma', field: 'smaSignal' },
  { key: 'bollinger', field: 'bollingerSignal' },
  { key: 'volume', field: 'volumeSignal' },
  { key: 'vwap', field: 'vwapSignal' },
  { key: 'polymarket', field: 'polymarketSignal' },
  { key: 'chainlinkDelta', field: 'chainlinkDeltaSignal' },
  { key: 'orderBook', field: 'orderBookSignal' },
  { key: 'fundingRate', field: 'fundingRateSignal' },
  { key: 'onChain', field: 'onChainSignal' },
  { key: 'newsSentiment', field: 'newsSentimentSignal' },
  { key: 'mlEnsemble', field: 'mlEnsembleSignal' },
];

function computeWeightedScore(
  signals: SignalBreakdown,
  config: EngineConfig,
  unavailableSignals: Set<keyof EngineConfig['weights']>
): number {
  const w = { ...config.weights };

  // Redistribute unavailable weights proportionally
  if (unavailableSignals.size > 0) {
    let redistributeWeight = 0;
    for (const key of unavailableSignals) {
      redistributeWeight += w[key];
      w[key] = 0;
    }
    const availableKeys = (Object.keys(w) as (keyof typeof w)[]).filter(
      k => !unavailableSignals.has(k) && w[k] > 0
    );
    const totalAvailable = availableKeys.reduce((sum, k) => sum + w[k], 0);
    if (totalAvailable > 0) {
      for (const key of availableKeys) {
        w[key] += (w[key] / totalAvailable) * redistributeWeight;
      }
    }
  }

  let score = 0;
  for (const { key, field } of SIGNAL_WEIGHT_MAP) {
    score += (signals[field] as number) * w[key];
  }
  return score;
}

function computeConfidence(
  signals: SignalBreakdown,
  unavailableSignals: Set<string>,
  indicators: IndicatorValues
): ConfidenceLevel {
  const allSignals: number[] = [];
  for (const { key, field } of SIGNAL_WEIGHT_MAP) {
    if (!unavailableSignals.has(key)) {
      allSignals.push(signals[field] as number);
    }
  }

  const nonZero = allSignals.filter(s => Math.abs(s) > 0.1);
  if (nonZero.length === 0) return 'LOW';

  // Magnitude-weighted agreement: strong signals count more than weak ones
  const totalMagnitude = nonZero.reduce((sum, s) => sum + Math.abs(s), 0);
  const weightedDirection = nonZero.reduce((sum, s) => sum + s, 0);
  const agreement = totalMagnitude > 0 ? Math.abs(weightedDirection) / totalMagnitude : 0;

  // Signal conflict penalty: when signals strongly disagree, reduce confidence
  const mean = weightedDirection / nonZero.length;
  const variance = nonZero.reduce((sum, s) => sum + (s - mean) ** 2, 0) / nonZero.length;
  const conflictPenalty = Math.min(0.3, variance * 0.5);

  let effectiveAgreement = Math.max(0, agreement - conflictPenalty);

  // ── VOLATILITY ADJUSTMENT ──
  // In volatile markets, require stronger agreement for HIGH confidence
  // Bollinger Band width is a good volatility proxy
  if (indicators.bollingerBands) {
    const bbWidth = indicators.bollingerBands.width;
    if (bbWidth > 2.0) {
      // Very volatile: tighten thresholds (harder to get HIGH)
      effectiveAgreement *= 0.85;
    } else if (bbWidth < 0.8) {
      // Low volatility squeeze: signals are more reliable
      effectiveAgreement *= 1.1;
    }
  }

  // ── VWAP MEAN-REVERSION PENALTY ──
  // If VWAP shows extreme extension, reduce confidence (snap-back likely)
  if (indicators.vwap?.isMeanReversion) {
    effectiveAgreement *= 0.9;
  }

  // ── SIGNAL COUNT BONUS ──
  // More agreeing signals = higher conviction
  const activeSignalBonus = nonZero.length >= 8 ? 0.05 : nonZero.length >= 6 ? 0.02 : 0;
  effectiveAgreement += activeSignalBonus;

  if (effectiveAgreement >= 0.65 && nonZero.length >= 4) return 'HIGH';
  if (effectiveAgreement >= 0.45 && nonZero.length >= 3) return 'MED';
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

  if (indicators.vwap) {
    if (signals.vwapSignal > 0.3) reasons.push(`Price above VWAP (institutional buying, dev ${(indicators.vwap.deviation * 100).toFixed(2)}%)`);
    else if (signals.vwapSignal < -0.3) reasons.push(`Price below VWAP (institutional selling, dev ${(indicators.vwap.deviation * 100).toFixed(2)}%)`);
    if (indicators.vwap.isMeanReversion) reasons.push('VWAP mean-reversion zone — extended move');
  }

  if (signals.polymarketSignal > 0.3) reasons.push('Polymarket sentiment bullish');
  else if (signals.polymarketSignal < -0.3) reasons.push('Polymarket sentiment bearish');

  if (signals.chainlinkDeltaSignal > 0.3) reasons.push('Chainlink oracle lagging — bullish edge detected');
  else if (signals.chainlinkDeltaSignal < -0.3) reasons.push('Chainlink oracle lagging — bearish edge detected');
  else if (Math.abs(signals.chainlinkDeltaSignal) > 0.1) reasons.push('Chainlink-Binance delta detected');

  // Phase 5 reasoning
  if (Math.abs(signals.orderBookSignal) > 0.3) {
    reasons.push(`Order book ${signals.orderBookSignal > 0 ? 'bid' : 'ask'} imbalance detected`);
  }
  if (Math.abs(signals.fundingRateSignal) > 0.3) {
    reasons.push(`Funding rate contrarian ${signals.fundingRateSignal > 0 ? 'bullish' : 'bearish'}`);
  }
  if (Math.abs(signals.onChainSignal) > 0.3) {
    reasons.push(`On-chain whale ${signals.onChainSignal > 0 ? 'accumulation' : 'distribution'}`);
  }
  if (Math.abs(signals.newsSentimentSignal) > 0.3) {
    reasons.push(`News sentiment ${signals.newsSentimentSignal > 0 ? 'bullish' : 'bearish'}`);
  }
  if (Math.abs(signals.mlEnsembleSignal) > 0.3) {
    reasons.push(`ML ensemble predicts ${signals.mlEnsembleSignal > 0 ? 'UP' : 'DOWN'}`);
  }

  return reasons;
}

export function generatePrediction(
  candles: CandleData[],
  currentPrice: number,
  polymarketSentiment: number | null,
  chainlinkEdgeSignal: number | null = null,
  chainlinkPrice: number | null = null,
  config: EngineConfig = DEFAULT_ENGINE_CONFIG,
  // Phase 5 external signals
  orderBookSignal: number | null = null,
  fundingRateSignal: number | null = null,
  onChainSignal: number | null = null,
  newsSentimentSignal: number | null = null,
  mlEnsembleSignal: number | null = null,
): Prediction | null {
  if (candles.length < 10) return null;

  const indicators = computeAllIndicators(candles);

  const safeNum = (v: number | null) =>
    v !== null && Number.isFinite(v) ? v : null;

  const ext: ExternalSignals = {
    polymarketSentiment: safeNum(polymarketSentiment),
    chainlinkEdgeSignal: safeNum(chainlinkEdgeSignal),
    orderBookSignal: safeNum(orderBookSignal),
    fundingRateSignal: safeNum(fundingRateSignal),
    onChainSignal: safeNum(onChainSignal),
    newsSentimentSignal: safeNum(newsSentimentSignal),
    mlEnsembleSignal: safeNum(mlEnsembleSignal),
  };

  // Track which signals are unavailable for weight redistribution
  const unavailable = new Set<keyof EngineConfig['weights']>();
  if (ext.polymarketSentiment === null) unavailable.add('polymarket');
  if (ext.chainlinkEdgeSignal === null) unavailable.add('chainlinkDelta');
  if (ext.orderBookSignal === null) unavailable.add('orderBook');
  if (ext.fundingRateSignal === null) unavailable.add('fundingRate');
  if (ext.onChainSignal === null) unavailable.add('onChain');
  if (ext.newsSentimentSignal === null) unavailable.add('newsSentiment');
  if (ext.mlEnsembleSignal === null) unavailable.add('mlEnsemble');

  const signals = computeSignals(candles, indicators, ext);
  const rawScore = computeWeightedScore(signals, config, unavailable);
  const aggregateScore = Number.isFinite(rawScore) ? rawScore : 0;
  signals.aggregateScore = aggregateScore;

  const direction = aggregateScore >= 0 ? 'UP' : 'DOWN';
  const probability = Math.min(0.95, 0.5 + Math.abs(aggregateScore) * 0.45);
  const confidence = computeConfidence(signals, unavailable, indicators);
  const reasoning = buildReasoning(signals, indicators);

  const movePercent = aggregateScore * 0.005; // 0.5% base move — crypto needs to overcome spread costs
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
    chainlinkPrice,
    chainlinkDelta: chainlinkEdgeSignal,
    resolutionSource: chainlinkPrice !== null ? 'chainlink' : 'binance',
    signals,
    reasoning,
  };
}
