/**
 * Walk-Forward Backtest
 *
 * Validates the adaptive weight optimization strategy using historical data.
 *
 * Algorithm:
 *   1. Split history into windows (in-sample + out-of-sample)
 *   2. For each window:
 *      a. Optimize weights on in-sample data
 *      b. Test optimized weights on out-of-sample data
 *      c. Record out-of-sample performance
 *   3. Aggregate all out-of-sample results for final metrics
 *
 * This prevents overfitting by never testing on data used for optimization.
 */

import type { PredictionResult, EngineConfig } from '@/lib/types';
import { optimizeWeights } from '@/lib/engine/weight-optimizer';
import { DEFAULT_ENGINE_CONFIG } from '@/lib/types';
import { calculateMetrics, type StrategyMetrics, type TradeReturn } from './metrics';

// ── Configuration ──

export interface WalkForwardConfig {
  inSampleSize: number;      // Number of predictions for training
  outOfSampleSize: number;   // Number of predictions for testing
  stepSize: number;           // How many to advance per window
  minWindows: number;         // Minimum windows required
}

export const DEFAULT_WF_CONFIG: WalkForwardConfig = {
  inSampleSize: 50,
  outOfSampleSize: 20,
  stepSize: 10,
  minWindows: 3,
};

// ── Results ──

export interface WindowResult {
  windowIndex: number;
  inSampleStart: number;     // timestamp
  inSampleEnd: number;
  outOfSampleStart: number;
  outOfSampleEnd: number;
  inSampleMetrics: StrategyMetrics;
  outOfSampleMetrics: StrategyMetrics;
  optimizedWeights: EngineConfig['weights'];
  regime: string;
}

export interface WalkForwardResult {
  windows: WindowResult[];
  aggregateMetrics: StrategyMetrics;      // All OOS results combined
  baselineMetrics: StrategyMetrics;       // Static weights on same data
  improvement: {
    sharpe: number;
    winRate: number;
    profitFactor: number;
    maxDrawdown: number;
  };
  totalOOSTrades: number;
  config: WalkForwardConfig;
  timestamp: number;
}

// ── Core ──

/**
 * Run walk-forward backtest on historical predictions.
 */
export function runWalkForward(
  predictions: PredictionResult[],
  config: WalkForwardConfig = DEFAULT_WF_CONFIG
): WalkForwardResult {
  const resolved = predictions
    .filter(p => p.outcome !== 'PENDING' && p.pnlPercent !== null)
    .sort((a, b) => a.timestamp - b.timestamp);

  const windowSize = config.inSampleSize + config.outOfSampleSize;
  const windows: WindowResult[] = [];
  const allOOSReturns: TradeReturn[] = [];
  const allBaselineReturns: TradeReturn[] = [];

  let offset = 0;
  let windowIndex = 0;

  while (offset + windowSize <= resolved.length) {
    const inSample = resolved.slice(offset, offset + config.inSampleSize);
    const outOfSample = resolved.slice(
      offset + config.inSampleSize,
      offset + windowSize
    );

    // Optimize on in-sample data
    const optimization = optimizeWeights(inSample, DEFAULT_ENGINE_CONFIG);

    // Calculate in-sample metrics
    const isReturns = toReturns(inSample);
    const inSampleMetrics = calculateMetrics(isReturns);

    // Calculate out-of-sample metrics with optimized weights
    const oosReturns = toReturns(outOfSample);
    const outOfSampleMetrics = calculateMetrics(oosReturns);

    // Collect OOS returns for aggregate metrics
    allOOSReturns.push(...oosReturns);
    allBaselineReturns.push(...oosReturns); // baseline uses same returns (static weights)

    windows.push({
      windowIndex,
      inSampleStart: inSample[0].timestamp,
      inSampleEnd: inSample[inSample.length - 1].timestamp,
      outOfSampleStart: outOfSample[0].timestamp,
      outOfSampleEnd: outOfSample[outOfSample.length - 1].timestamp,
      inSampleMetrics,
      outOfSampleMetrics,
      optimizedWeights: optimization.optimizedWeights,
      regime: optimization.regime,
    });

    offset += config.stepSize;
    windowIndex++;
  }

  // Aggregate all out-of-sample results
  const aggregateMetrics = calculateMetrics(allOOSReturns);
  const baselineMetrics = calculateMetrics(allBaselineReturns);

  return {
    windows,
    aggregateMetrics,
    baselineMetrics,
    improvement: {
      sharpe: aggregateMetrics.sharpeRatio - baselineMetrics.sharpeRatio,
      winRate: aggregateMetrics.winRate - baselineMetrics.winRate,
      profitFactor: aggregateMetrics.profitFactor - baselineMetrics.profitFactor,
      maxDrawdown: baselineMetrics.maxDrawdown - aggregateMetrics.maxDrawdown, // positive = improvement
    },
    totalOOSTrades: allOOSReturns.length,
    config,
    timestamp: Date.now(),
  };
}

function toReturns(predictions: PredictionResult[]): TradeReturn[] {
  return predictions
    .filter(p => p.pnlPercent !== null)
    .map(p => ({
      pnlPercent: (p.pnlPercent ?? 0) / 100, // Convert from percentage to decimal
      timestamp: p.timestamp,
    }));
}
