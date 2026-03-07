'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { CandleData, Prediction, PredictionResult, PerformanceStats } from '@/lib/types';
import { generatePrediction } from '@/lib/engine/prediction';
import { evaluatePrediction, calculatePerformance } from '@/lib/engine/backtest';
import {
  savePrediction,
  resolvePrediction,
  fetchRecentPredictions,
  savePerformanceSnapshot,
} from '@/lib/supabase/predictions';

const CYCLE_MS = 300_000; // 5 minutes
const STORAGE_KEY = 'nexzen_prediction_history';
const MAX_HISTORY = 200;

function loadHistory(): PredictionResult[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: PredictionResult[]) {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = history.slice(-MAX_HISTORY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full, clear old data
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function usePredictionEngine(
  candles: CandleData[],
  currentPrice: number | null,
  polymarketSentiment: number | null
) {
  const [currentPrediction, setCurrentPrediction] = useState<Prediction | null>(null);
  const [history, setHistory] = useState<PredictionResult[]>(() => loadHistory());
  const [performance, setPerformance] = useState<PerformanceStats>(() => calculatePerformance(loadHistory()));
  const supabaseLoadedRef = useRef(false);
  const [nextPredictionIn, setNextPredictionIn] = useState<number>(CYCLE_MS / 1000);
  const [isCalculating, setIsCalculating] = useState(false);

  const currentPredictionRef = useRef<Prediction | null>(null);
  const cycleStartRef = useRef<number>(Date.now());

  // Load history from Supabase on mount (merge with localStorage)
  useEffect(() => {
    if (supabaseLoadedRef.current) return;
    supabaseLoadedRef.current = true;

    fetchRecentPredictions(200).then(remote => {
      if (remote.length === 0) return;
      setHistory(prev => {
        const ids = new Set(prev.map(p => p.id));
        const merged = [...prev, ...remote.filter(r => !ids.has(r.id))];
        merged.sort((a, b) => a.timestamp - b.timestamp);
        const trimmed = merged.slice(-MAX_HISTORY);
        saveHistory(trimmed);
        setPerformance(calculatePerformance(trimmed));
        return trimmed;
      });
    }).catch(() => { /* Supabase offline, use localStorage */ });
  }, []);

  const runCycle = useCallback(() => {
    if (!currentPrice || candles.length < 50) return;

    setIsCalculating(true);

    // Evaluate previous prediction if exists
    const prevPrediction = currentPredictionRef.current;
    if (prevPrediction) {
      const result = evaluatePrediction(
        { ...prevPrediction, outcome: 'PENDING', exitPrice: null, pnlPercent: null },
        currentPrice
      );

      // Persist resolution to Supabase
      resolvePrediction(
        result.id,
        currentPrice,
        result.outcome as 'WIN' | 'LOSS',
        result.pnlPercent ?? 0
      ).catch(() => {});

      setHistory(prev => {
        const updated = [...prev, result];
        saveHistory(updated);
        const newPerformance = calculatePerformance(updated);
        setPerformance(newPerformance);

        // Snapshot performance to Supabase every 10 cycles
        if (updated.length % 10 === 0) {
          savePerformanceSnapshot(newPerformance).catch(() => {});
        }

        return updated;
      });
    }

    // Generate new prediction
    const prediction = generatePrediction(candles, currentPrice, polymarketSentiment);
    currentPredictionRef.current = prediction;
    setCurrentPrediction(prediction);
    cycleStartRef.current = Date.now();

    // Persist new prediction to Supabase
    if (prediction) {
      savePrediction(prediction).catch(() => {});
    }

    setIsCalculating(false);
  }, [candles, currentPrice, polymarketSentiment]);

  // Run prediction cycle
  useEffect(() => {
    // Initial prediction after data is ready
    if (candles.length >= 50 && currentPrice && !currentPredictionRef.current) {
      runCycle();
    }

    const interval = setInterval(runCycle, CYCLE_MS);
    return () => clearInterval(interval);
  }, [runCycle]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Date.now() - cycleStartRef.current;
      const remaining = Math.max(0, Math.ceil((CYCLE_MS - elapsed) / 1000));
      setNextPredictionIn(remaining);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return {
    currentPrediction,
    history,
    performance,
    nextPredictionIn,
    isCalculating,
  };
}
