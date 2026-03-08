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
const SPIKE_THRESHOLD = 0.003; // 0.3% price move triggers micro-update
const SPIKE_COOLDOWN_MS = 30_000; // Min 30s between spike-triggered updates
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
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function usePredictionEngine(
  candles: CandleData[],
  currentPrice: number | null,
  polymarketSentiment: number | null,
  chainlinkEdgeSignal: number | null = null,
  chainlinkPrice: number | null = null
) {
  const [currentPrediction, setCurrentPrediction] = useState<Prediction | null>(null);
  const [history, setHistory] = useState<PredictionResult[]>(() => loadHistory());
  const [performance, setPerformance] = useState<PerformanceStats>(() => calculatePerformance(loadHistory()));
  const supabaseLoadedRef = useRef(false);
  const [nextPredictionIn, setNextPredictionIn] = useState<number>(CYCLE_MS / 1000);
  const [isCalculating, setIsCalculating] = useState(false);
  const [spikeDetected, setSpikeDetected] = useState(false);

  const currentPredictionRef = useRef<Prediction | null>(null);
  const cycleStartRef = useRef<number>(Date.now());
  const lastSpikeRef = useRef<number>(0);
  const lastPriceRef = useRef<number | null>(null);

  // Stable refs for values that change frequently — avoids recreating runCycle
  const candlesRef = useRef(candles);
  const currentPriceRef = useRef(currentPrice);
  const sentimentRef = useRef(polymarketSentiment);
  const edgeSignalRef = useRef(chainlinkEdgeSignal);
  candlesRef.current = candles;
  currentPriceRef.current = currentPrice;
  sentimentRef.current = polymarketSentiment;
  edgeSignalRef.current = chainlinkEdgeSignal;

  // Load history from Supabase on mount
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
    }).catch(() => {});
  }, []);

  const chainlinkPriceRef = useRef<number | null>(null);
  chainlinkPriceRef.current = chainlinkPrice;

  const resolvePrevious = useCallback((price: number) => {
    const prevPrediction = currentPredictionRef.current;
    if (!prevPrediction) return;

    // Use Chainlink price for resolution — this is the Polymarket truth
    const result = evaluatePrediction(
      { ...prevPrediction, outcome: 'PENDING', exitPrice: null, pnlPercent: null },
      price,
      chainlinkPriceRef.current
    );

    resolvePrediction(
      result.id,
      price,
      result.outcome as 'WIN' | 'LOSS',
      result.pnlPercent ?? 0
    ).catch(() => {});

    setHistory(prev => {
      const updated = [...prev, result];
      saveHistory(updated);
      const newPerformance = calculatePerformance(updated);
      setPerformance(newPerformance);

      if (updated.length % 10 === 0) {
        savePerformanceSnapshot(newPerformance).catch(() => {});
      }

      return updated;
    });
  }, []);

  const runCycle = useCallback((isSpike = false) => {
    const price = currentPriceRef.current;
    const cndls = candlesRef.current;
    if (!price || cndls.length < 50) return;

    setIsCalculating(true);

    // Evaluate previous prediction
    resolvePrevious(price);

    // Generate new prediction with Chainlink oracle edge
    const prediction = generatePrediction(
      cndls, price, sentimentRef.current,
      edgeSignalRef.current, chainlinkPriceRef.current
    );
    currentPredictionRef.current = prediction;
    setCurrentPrediction(prediction);
    cycleStartRef.current = Date.now();

    if (prediction) {
      savePrediction(prediction).catch(() => {});
    }

    if (isSpike) {
      setSpikeDetected(true);
      setTimeout(() => setSpikeDetected(false), 3000);
    }

    setIsCalculating(false);
  }, [resolvePrevious]);

  // Detect price spikes for micro-cycle triggers
  useEffect(() => {
    if (!currentPrice) return;

    const prev = lastPriceRef.current;
    lastPriceRef.current = currentPrice;

    if (prev === null) return;

    const change = Math.abs(currentPrice - prev) / prev;
    const now = Date.now();

    if (
      change >= SPIKE_THRESHOLD &&
      now - lastSpikeRef.current > SPIKE_COOLDOWN_MS &&
      currentPredictionRef.current // Only if we have an active prediction
    ) {
      lastSpikeRef.current = now;
      runCycle(true);
    }
  }, [currentPrice, runCycle]);

  // Initial prediction — run once when we have enough data
  const initialRanRef = useRef(false);
  useEffect(() => {
    if (initialRanRef.current) return;
    if (candles.length >= 50 && currentPrice && !currentPredictionRef.current) {
      initialRanRef.current = true;
      runCycle();
    }
  }, [candles.length, currentPrice, runCycle]);

  // Regular 5-minute prediction cycle — stable interval that never resets
  useEffect(() => {
    const interval = setInterval(() => runCycle(), CYCLE_MS);
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
    spikeDetected,
  };
}
