/**
 * ML Ensemble — Online Logistic Regression Meta-Learner
 *
 * Learns from historical prediction outcomes to create a meta-signal
 * that combines all other signals optimally.
 *
 * Algorithm: Online Logistic Regression with SGD
 *   - Features: all signal values + cross-interactions
 *   - Target: 1 if prediction was correct (WIN), 0 if not (LOSS)
 *   - Updates weights after each resolved prediction
 *   - Outputs: probability of UP being correct
 *
 * Signal: -1 (model predicts DOWN) to +1 (model predicts UP)
 */

import type { PredictionResult, SignalBreakdown } from '@/lib/types';

const LEARNING_RATE = 0.002;           // Reduced — prevents weight oscillation with small batches
const L2_REGULARIZATION = 0.003;       // Stronger regularization to prevent overfitting
const MIN_TRAINING_SAMPLES = 50;       // Need 50+ samples for reliable signal (15 was noise)
const STORAGE_KEY = 'nexzen_ml_weights';

// Feature names (signals + cross-interactions)
const BASE_FEATURES = [
  'rsiSignal', 'macdSignal', 'smaSignal', 'bollingerSignal',
  'volumeSignal', 'vwapSignal', 'polymarketSignal', 'chainlinkDeltaSignal',
  'orderBookSignal', 'fundingRateSignal', 'onChainSignal', 'newsSentimentSignal',
] as const;

// Cross-interaction features (most informative pairs)
const CROSS_FEATURES = [
  ['rsiSignal', 'volumeSignal'],       // RSI + Volume = confirmation
  ['macdSignal', 'smaSignal'],         // MACD + SMA = trend strength
  ['polymarketSignal', 'chainlinkDeltaSignal'], // External signals
  ['bollingerSignal', 'rsiSignal'],    // Mean-reversion combo
  ['orderBookSignal', 'fundingRateSignal'],     // Exchange flow + derivatives sentiment
  ['onChainSignal', 'newsSentimentSignal'],      // On-chain moves + news catalyst
  ['chainlinkDeltaSignal', 'orderBookSignal'],   // Oracle edge + CLOB depth
  ['vwapSignal', 'volumeSignal'],       // VWAP + Volume = institutional flow strength
  ['vwapSignal', 'bollingerSignal'],    // VWAP + Bollinger = mean-reversion + institutional level
] as const;

const TOTAL_FEATURES = BASE_FEATURES.length + CROSS_FEATURES.length + 1; // +1 for bias

export interface MLEnsembleState {
  weights: number[];
  trainingSamples: number;
  accuracy: number;
  lastUpdate: number;
}

/**
 * Sigmoid activation function.
 */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, x))));
}

/**
 * Extract features from a signal breakdown.
 */
function extractFeatures(signals: SignalBreakdown): number[] {
  const features: number[] = [];
  const signalMap = signals as unknown as Record<string, number>;

  // Base features
  for (const f of BASE_FEATURES) {
    features.push(signalMap[f] ?? 0);
  }

  // Cross-interaction features
  for (const [f1, f2] of CROSS_FEATURES) {
    features.push((signalMap[f1] ?? 0) * (signalMap[f2] ?? 0));
  }

  // Bias term
  features.push(1);

  return features;
}

/**
 * Predict probability using current weights.
 */
function predict(weights: number[], features: number[]): number {
  let z = 0;
  for (let i = 0; i < features.length && i < weights.length; i++) {
    z += weights[i] * features[i];
  }
  return sigmoid(z);
}

/**
 * Online SGD update.
 */
function updateWeights(
  weights: number[],
  features: number[],
  target: number // 1 = correct, 0 = incorrect
): number[] {
  const prediction = predict(weights, features);
  const error = target - prediction;

  const updated = [...weights];
  for (let i = 0; i < features.length && i < updated.length; i++) {
    // SGD with L2 regularization
    const gradient = error * features[i] - L2_REGULARIZATION * updated[i];
    updated[i] += LEARNING_RATE * gradient;
  }

  return updated;
}

/**
 * Load model state from localStorage.
 */
function loadState(): MLEnsembleState {
  if (typeof window === 'undefined') {
    return {
      weights: new Array(TOTAL_FEATURES).fill(0),
      trainingSamples: 0,
      accuracy: 0.5,
      lastUpdate: 0,
    };
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.weights?.length === TOTAL_FEATURES) {
        return parsed;
      }
    }
  } catch { /* ignore */ }

  return {
    weights: new Array(TOTAL_FEATURES).fill(0),
    trainingSamples: 0,
    accuracy: 0.5,
    lastUpdate: 0,
  };
}

/**
 * Save model state to localStorage.
 */
function saveState(state: MLEnsembleState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

/**
 * Train the model on historical predictions and return current signal.
 */
export function computeMLSignal(
  currentSignals: SignalBreakdown,
  history: PredictionResult[]
): { signal: number; state: MLEnsembleState } {
  const state = loadState();

  // Train on any new resolved predictions
  const resolved = history.filter(p => p.outcome !== 'PENDING' && p.signals);

  if (resolved.length > state.trainingSamples) {
    // Train on new predictions since last update
    const newPredictions = resolved.slice(state.trainingSamples);

    let correct = 0;
    for (const pred of newPredictions) {
      const features = extractFeatures(pred.signals);
      // Target: was the prediction direction correct?
      const target = pred.outcome === 'WIN' ? 1 : 0;
      state.weights = updateWeights(state.weights, features, target);
      if (pred.outcome === 'WIN') correct++;
    }

    state.trainingSamples = resolved.length;
    // Running accuracy (blend old with new)
    const newAccuracy = newPredictions.length > 0 ? correct / newPredictions.length : 0.5;
    state.accuracy = state.accuracy * 0.7 + newAccuracy * 0.3;
    state.lastUpdate = Date.now();

    saveState(state);
  }

  // Not enough training data → neutral signal
  if (state.trainingSamples < MIN_TRAINING_SAMPLES) {
    return { signal: 0, state };
  }

  // Predict on current signals
  const features = extractFeatures(currentSignals);
  const probability = predict(state.weights, features);

  // Convert probability to signal: 0.5 → 0, 1.0 → +1, 0.0 → -1
  const signal = (probability - 0.5) * 2;

  return { signal: Math.max(-1, Math.min(1, signal)), state };
}
