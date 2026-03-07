'use client';

import { useMemo } from 'react';
import { PredictionResult, PerformanceStats } from '@/lib/types';
import { calculatePerformance } from '@/lib/engine/backtest';

export function usePerformanceTracker(history: PredictionResult[]): PerformanceStats {
  return useMemo(() => calculatePerformance(history), [history]);
}
