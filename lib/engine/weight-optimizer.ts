/**
 * Weight Optimizer — Adaptive Signal Weighting
 *
 * Analyzes historical prediction outcomes to determine which signals
 * actually predicted correctly, then adjusts weights accordingly.
 *
 * Algorithm: Exponentially-weighted signal accuracy scoring
 *
 * For each resolved prediction:
 *   1. Check if each signal agreed with the actual outcome
 *   2. Score: +1 if signal direction matched outcome, -1 if not, 0 if neutral
 *   3. Apply exponential decay (recent predictions count more)
 *   4. Normalize scores to weights that sum to 1.0
 *
 * Constraints:
 *   - No weight drops below MIN_WEIGHT (prevents total signal abandonment)
 *   - No weight exceeds MAX_WEIGHT (prevents over-reliance)
 *   - Requires MIN_SAMPLES resolved predictions before optimizing
 *   - Blends with default weights using a learning rate
 */

import { PredictionResult, EngineConfig, DEFAULT_ENGINE_CONFIG } from '@/lib/types';

// ── Configuration ──

const MIN_SAMPLES = 30;         // Reduced from 50 — start adapting sooner
const MAX_SAMPLES = 300;        // Use last 300 predictions for optimization
const DECAY_FACTOR = 0.985;     // Slightly faster decay — react quicker to regime shifts
const LEARNING_RATE = 0.35;     // Slightly more aggressive adaptation
const MIN_WEIGHT = 0.03;        // Minimum 3% weight per signal
const MAX_WEIGHT = 0.35;        // Maximum 35% weight per signal

// Signal keys matching EngineConfig.weights
const SIGNAL_KEYS = [
  'rsi', 'macd', 'sma', 'bollinger', 'volume', 'vwap', 'polymarket', 'chainlinkDelta',
  'orderBook', 'fundingRate', 'onChain', 'newsSentiment', 'mlEnsemble',
] as const;
type SignalKey = typeof SIGNAL_KEYS[number];

// Map from signal key to SignalBreakdown field name
const SIGNAL_FIELD_MAP: Record<SignalKey, string> = {
  rsi: 'rsiSignal',
  macd: 'macdSignal',
  sma: 'smaSignal',
  bollinger: 'bollingerSignal',
  volume: 'volumeSignal',
  vwap: 'vwapSignal',
  polymarket: 'polymarketSignal',
  chainlinkDelta: 'chainlinkDeltaSignal',
  orderBook: 'orderBookSignal',
  fundingRate: 'fundingRateSignal',
  onChain: 'onChainSignal',
  newsSentiment: 'newsSentimentSignal',
  mlEnsemble: 'mlEnsembleSignal',
};

// ── Signal Accuracy Analysis ──

export interface SignalAccuracy {
  key: SignalKey;
  correctCount: number;
  incorrectCount: number;
  neutralCount: number;
  accuracy: number;             // correctCount / (correctCount + incorrectCount)
  weightedScore: number;        // Decay-weighted accuracy score
  currentWeight: number;        // Current weight in config
  optimizedWeight: number;      // Suggested new weight
}

export interface OptimizationResult {
  optimizedWeights: EngineConfig['weights'];
  signalAccuracies: SignalAccuracy[];
  samplesUsed: number;
  overallWinRate: number;
  improvement: number;           // Estimated WR improvement vs static weights
  regime: MarketRegime;
  timestamp: number;
}

// ── Market Regime Detection ──

export type MarketRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE' | 'UNKNOWN';

/**
 * Detect current market regime from recent prediction history.
 */
export function detectRegime(predictions: PredictionResult[]): MarketRegime {
  const resolved = predictions
    .filter(p => p.outcome !== 'PENDING' && p.exitPrice !== null)
    .slice(-50);

  if (resolved.length < 10) return 'UNKNOWN';

  // Calculate price changes
  const changes = resolved.map(p => {
    const pnl = (p.exitPrice! - p.entryPrice) / p.entryPrice;
    return pnl;
  });

  const avgChange = changes.reduce((s, c) => s + c, 0) / changes.length;
  const variance = changes.reduce((s, c) => s + (c - avgChange) ** 2, 0) / changes.length;
  const volatility = Math.sqrt(variance);

  // Count directional consistency
  const upCount = changes.filter(c => c > 0).length;
  const downCount = changes.filter(c => c < 0).length;
  const directionality = Math.abs(upCount - downCount) / changes.length;

  // Classify regime
  if (volatility > 0.003) return 'VOLATILE';              // > 0.3% avg move
  if (directionality > 0.4 && avgChange > 0.0005) return 'TRENDING_UP';
  if (directionality > 0.4 && avgChange < -0.0005) return 'TRENDING_DOWN';
  if (directionality < 0.2) return 'RANGING';

  return 'RANGING';
}

/**
 * Get regime-adjusted base weights.
 * Different regimes benefit from different signal emphasis.
 */
function getRegimeWeights(regime: MarketRegime): EngineConfig['weights'] {
  switch (regime) {
    case 'TRENDING_UP':
    case 'TRENDING_DOWN':
      return {
        rsi: 0.05, macd: 0.13, sma: 0.10, bollinger: 0.04, volume: 0.05, vwap: 0.09,
        polymarket: 0.08, chainlinkDelta: 0.14,
        orderBook: 0.10, fundingRate: 0.05, onChain: 0.05, newsSentiment: 0.04, mlEnsemble: 0.08,
      };

    case 'VOLATILE':
      return {
        rsi: 0.09, macd: 0.05, sma: 0.04, bollinger: 0.10, volume: 0.05, vwap: 0.10,
        polymarket: 0.08, chainlinkDelta: 0.16,
        orderBook: 0.11, fundingRate: 0.06, onChain: 0.04, newsSentiment: 0.04, mlEnsemble: 0.08,
      };

    case 'RANGING':
      return {
        rsi: 0.10, macd: 0.05, sma: 0.05, bollinger: 0.10, volume: 0.04, vwap: 0.10,
        polymarket: 0.10, chainlinkDelta: 0.13,
        orderBook: 0.10, fundingRate: 0.05, onChain: 0.05, newsSentiment: 0.04, mlEnsemble: 0.09,
      };

    default:
      return { ...DEFAULT_ENGINE_CONFIG.weights };
  }
}

// ── Core Optimization ──

/**
 * Analyze signal accuracy from historical predictions.
 */
function analyzeSignalAccuracy(
  predictions: PredictionResult[],
  currentWeights: EngineConfig['weights']
): SignalAccuracy[] {
  const resolved = predictions
    .filter(p => p.outcome !== 'PENDING' && p.signals)
    .slice(-MAX_SAMPLES);

  return SIGNAL_KEYS.map(key => {
    let correctCount = 0;
    let incorrectCount = 0;
    let neutralCount = 0;
    let weightedScore = 0;

    for (let i = 0; i < resolved.length; i++) {
      const pred = resolved[i];
      const signals = pred.signals as unknown as Record<string, number>;
      const signalField = SIGNAL_FIELD_MAP[key];
      const signalValue = signals[signalField] ?? 0;

      // Decay: most recent prediction has weight 1.0, oldest has weight ~0.002
      const recency = Math.pow(DECAY_FACTOR, resolved.length - 1 - i);

      if (Math.abs(signalValue) < 0.05) {
        // Signal was neutral — don't count
        neutralCount++;
        continue;
      }

      const signalDirection = signalValue > 0 ? 'UP' : 'DOWN';
      const actualOutcome = pred.outcome;

      // Did this signal agree with the actual outcome?
      const isCorrect =
        (signalDirection === 'UP' && actualOutcome === 'WIN' && pred.direction === 'UP') ||
        (signalDirection === 'DOWN' && actualOutcome === 'WIN' && pred.direction === 'DOWN') ||
        (signalDirection === 'UP' && actualOutcome === 'LOSS' && pred.direction === 'DOWN') ||
        (signalDirection === 'DOWN' && actualOutcome === 'LOSS' && pred.direction === 'UP');

      if (isCorrect) {
        correctCount++;
        weightedScore += recency;
      } else {
        incorrectCount++;
        weightedScore -= recency * 0.5; // Penalize less than reward (asymmetric)
      }
    }

    const total = correctCount + incorrectCount;
    const accuracy = total > 0 ? correctCount / total : 0.5;

    return {
      key,
      correctCount,
      incorrectCount,
      neutralCount,
      accuracy,
      weightedScore,
      currentWeight: currentWeights[key],
      optimizedWeight: 0, // Computed in next step
    };
  });
}

/**
 * Convert signal accuracy scores to normalized weights.
 */
function scoresToWeights(
  accuracies: SignalAccuracy[],
  regimeWeights: EngineConfig['weights']
): EngineConfig['weights'] {
  // Shift scores to be positive (add offset so worst signal still has MIN_WEIGHT)
  const minScore = Math.min(...accuracies.map(a => a.weightedScore));
  const offset = minScore < 0 ? Math.abs(minScore) + 0.1 : 0;

  const rawWeights: Record<string, number> = {};
  let total = 0;

  for (const acc of accuracies) {
    // Blend accuracy-based weight with regime-based weight
    const accuracyWeight = acc.weightedScore + offset;
    const regimeWeight = regimeWeights[acc.key];

    // Mix: 60% data-driven, 40% regime heuristic
    const blended = accuracyWeight * 0.6 + regimeWeight * 10 * 0.4;
    rawWeights[acc.key] = Math.max(blended, 0.01);
    total += rawWeights[acc.key];
  }

  // Normalize to sum to 1.0, then clamp
  const weights = {} as EngineConfig['weights'];
  for (const key of SIGNAL_KEYS) {
    let w = rawWeights[key] / total;
    w = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, w));
    (weights as Record<string, number>)[key] = w;
  }

  // Re-normalize after clamping
  const clampedTotal = SIGNAL_KEYS.reduce((s, k) => s + (weights as Record<string, number>)[k], 0);
  for (const key of SIGNAL_KEYS) {
    (weights as Record<string, number>)[key] /= clampedTotal;
  }

  return weights;
}

/**
 * Main optimization function.
 * Takes historical predictions and returns optimized weights.
 */
export function optimizeWeights(
  predictions: PredictionResult[],
  currentConfig: EngineConfig = DEFAULT_ENGINE_CONFIG
): OptimizationResult {
  const resolved = predictions.filter(p => p.outcome !== 'PENDING');
  const regime = detectRegime(predictions);
  const regimeWeights = getRegimeWeights(regime);

  // Not enough data — return regime-adjusted defaults
  if (resolved.length < MIN_SAMPLES) {
    const blendedWeights = {} as EngineConfig['weights'];
    for (const key of SIGNAL_KEYS) {
      const defaultW = currentConfig.weights[key];
      const regimeW = regimeWeights[key];
      (blendedWeights as Record<string, number>)[key] =
        defaultW * (1 - LEARNING_RATE * 0.5) + regimeW * (LEARNING_RATE * 0.5);
    }

    return {
      optimizedWeights: blendedWeights,
      signalAccuracies: SIGNAL_KEYS.map(key => ({
        key,
        correctCount: 0,
        incorrectCount: 0,
        neutralCount: 0,
        accuracy: 0.5,
        weightedScore: 0,
        currentWeight: currentConfig.weights[key],
        optimizedWeight: (blendedWeights as Record<string, number>)[key],
      })),
      samplesUsed: resolved.length,
      overallWinRate: 0,
      improvement: 0,
      regime,
      timestamp: Date.now(),
    };
  }

  // Analyze signal accuracy
  const accuracies = analyzeSignalAccuracy(predictions, currentConfig.weights);

  // Convert to optimized weights
  const dataWeights = scoresToWeights(accuracies, regimeWeights);

  // Blend with current weights using learning rate
  const optimizedWeights = {} as EngineConfig['weights'];
  for (const key of SIGNAL_KEYS) {
    const current = currentConfig.weights[key];
    const optimized = (dataWeights as Record<string, number>)[key];
    (optimizedWeights as Record<string, number>)[key] =
      current * (1 - LEARNING_RATE) + optimized * LEARNING_RATE;
  }

  // Re-normalize
  const total = SIGNAL_KEYS.reduce((s, k) => s + (optimizedWeights as Record<string, number>)[k], 0);
  for (const key of SIGNAL_KEYS) {
    (optimizedWeights as Record<string, number>)[key] /= total;
  }

  // Update accuracy objects with final weights
  for (const acc of accuracies) {
    acc.optimizedWeight = (optimizedWeights as Record<string, number>)[acc.key];
  }

  // Calculate overall win rate
  const wins = resolved.filter(p => p.outcome === 'WIN').length;
  const overallWinRate = resolved.length > 0 ? wins / resolved.length : 0;

  // Estimate improvement: compare weighted-correct-rate of new vs old weights
  const oldCorrectRate = accuracies.reduce((s, a) => s + a.accuracy * a.currentWeight, 0);
  const newCorrectRate = accuracies.reduce((s, a) => s + a.accuracy * a.optimizedWeight, 0);
  const improvement = newCorrectRate - oldCorrectRate;

  return {
    optimizedWeights,
    signalAccuracies: accuracies,
    samplesUsed: resolved.length,
    overallWinRate,
    improvement,
    regime,
    timestamp: Date.now(),
  };
}

/**
 * Quick regime label for UI display.
 */
export function regimeLabel(regime: MarketRegime): string {
  switch (regime) {
    case 'TRENDING_UP': return 'TREND UP';
    case 'TRENDING_DOWN': return 'TREND DOWN';
    case 'RANGING': return 'RANGE';
    case 'VOLATILE': return 'VOLATILE';
    default: return 'UNKNOWN';
  }
}

/**
 * Regime color for UI.
 */
export function regimeColor(regime: MarketRegime): string {
  switch (regime) {
    case 'TRENDING_UP': return 'text-nexzen-primary';
    case 'TRENDING_DOWN': return 'text-nexzen-danger';
    case 'RANGING': return 'text-yellow-500';
    case 'VOLATILE': return 'text-orange-500';
    default: return 'text-nexzen-muted';
  }
}
