'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  PredictionResult,
  EngineConfig,
  DEFAULT_ENGINE_CONFIG,
  PerformanceStats,
} from '@/lib/types';
import {
  optimizeWeights,
  type OptimizationResult,
  type MarketRegime,
} from '@/lib/engine/weight-optimizer';
import { AlertEngine, type Alert } from '@/lib/engine/alerts';

// Re-optimize every 5 minutes (faster adaptation to regime shifts)
// and after every 3 new predictions (more responsive to market changes)
const OPTIMIZE_INTERVAL_MS = 300_000;
const OPTIMIZE_EVERY_N_PREDICTIONS = 3;

export function useAdaptiveEngine(
  history: PredictionResult[],
  performance: PerformanceStats
) {
  const [adaptiveConfig, setAdaptiveConfig] = useState<EngineConfig | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [regime, setRegime] = useState<MarketRegime>('UNKNOWN');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [adaptiveEnabled, setAdaptiveEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('nexzen_adaptive_enabled') === 'true';
  });

  const alertEngineRef = useRef(new AlertEngine());
  const lastOptimizeCountRef = useRef(0);
  const previousWeightsRef = useRef<EngineConfig['weights']>(DEFAULT_ENGINE_CONFIG.weights);

  // Run optimization when enough new data arrives
  const runOptimization = useCallback(() => {
    const resolved = history.filter(p => p.outcome !== 'PENDING');
    if (resolved.length < 5) return;

    const result = optimizeWeights(history, DEFAULT_ENGINE_CONFIG);
    setOptimization(result);
    setRegime(result.regime);

    // Check for alert conditions
    const alertEngine = alertEngineRef.current;
    alertEngine.checkRegimeChange(result.regime);
    alertEngine.checkWinRate(result.overallWinRate, result.samplesUsed);
    alertEngine.checkWeightShift(
      previousWeightsRef.current as Record<string, number>,
      result.optimizedWeights as unknown as Record<string, number>
    );

    previousWeightsRef.current = result.optimizedWeights;

    // Only apply adaptive config if enabled
    if (adaptiveEnabled) {
      setAdaptiveConfig({
        weights: result.optimizedWeights,
        predictionCycleMs: DEFAULT_ENGINE_CONFIG.predictionCycleMs,
        minConfidence: DEFAULT_ENGINE_CONFIG.minConfidence,
      });
    }

    setAlerts(alertEngine.getRecentAlerts(20));
  }, [history, adaptiveEnabled]);

  // Optimize on interval
  useEffect(() => {
    const interval = setInterval(runOptimization, OPTIMIZE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [runOptimization]);

  // Optimize when enough new predictions arrive
  useEffect(() => {
    const resolvedCount = history.filter(p => p.outcome !== 'PENDING').length;
    if (resolvedCount - lastOptimizeCountRef.current >= OPTIMIZE_EVERY_N_PREDICTIONS) {
      lastOptimizeCountRef.current = resolvedCount;
      // Defer to avoid synchronous setState cascade
      const timeout = setTimeout(runOptimization, 0);
      return () => clearTimeout(timeout);
    }
  }, [history, runOptimization]);

  // Monitor performance for alerts
  useEffect(() => {
    const alertEngine = alertEngineRef.current;

    if (performance.totalPredictions > 0) {
      alertEngine.checkWinRate(performance.winRate, performance.totalPredictions);

      const lastEquity = performance.equityCurve.length > 0
        ? performance.equityCurve[performance.equityCurve.length - 1].equity
        : 100;
      alertEngine.checkDrawdown(
        performance.maxDrawdown / 100,
        lastEquity,
        100 + performance.maxDrawdown
      );

      setAlerts(alertEngine.getRecentAlerts(20));
    }
  }, [performance]);

  // Toggle adaptive mode
  const toggleAdaptive = useCallback(() => {
    setAdaptiveEnabled(prev => {
      const next = !prev;
      localStorage.setItem('nexzen_adaptive_enabled', next.toString());

      if (!next) {
        setAdaptiveConfig(null); // Revert to static weights
      } else if (optimization) {
        setAdaptiveConfig({
          weights: optimization.optimizedWeights,
          predictionCycleMs: DEFAULT_ENGINE_CONFIG.predictionCycleMs,
          minConfidence: DEFAULT_ENGINE_CONFIG.minConfidence,
        });
      }

      return next;
    });
  }, [optimization]);

  // Force re-optimization
  const forceOptimize = useCallback(() => {
    runOptimization();
  }, [runOptimization]);

  return {
    adaptiveConfig: adaptiveEnabled ? adaptiveConfig : null,
    optimization,
    regime,
    alerts,
    adaptiveEnabled,
    toggleAdaptive,
    forceOptimize,
  };
}
