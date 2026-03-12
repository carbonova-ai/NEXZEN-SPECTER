'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { CandleData, Prediction, PredictionResult, PerformanceStats, EngineConfig, MicroPrediction } from '@/lib/types';
import { generatePrediction } from '@/lib/engine/prediction';
import { evaluatePrediction, calculatePerformance } from '@/lib/engine/backtest';
import {
  savePrediction,
  resolvePrediction,
  fetchRecentPredictions,
  savePerformanceSnapshot,
} from '@/lib/supabase/predictions';
import {
  TickBuffer,
  generateMicroPrediction,
  computeSignalAgreement,
} from '@/lib/engine/micro-prediction';

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

export interface Phase5Signals {
  orderBook: number | null;
  fundingRate: number | null;
  onChain: number | null;
  newsSentiment: number | null;
  mlEnsemble: number | null;
}

const DEFAULT_P5: Phase5Signals = {
  orderBook: null, fundingRate: null, onChain: null, newsSentiment: null, mlEnsemble: null,
};

export interface PolymarketOdds {
  up: number | null;
  down: number | null;
}

export function usePredictionEngine(
  candles: CandleData[],
  currentPrice: number | null,
  polymarketSentiment: number | null,
  chainlinkEdgeSignal: number | null = null,
  chainlinkPrice: number | null = null,
  adaptiveConfig: EngineConfig | null = null,
  phase5Signals: Phase5Signals = DEFAULT_P5,
  tickBuffer: TickBuffer | null = null,
  polymarketTarget: number | null = null,
  polymarketOdds: PolymarketOdds | null = null,
) {
  const [currentPrediction, setCurrentPrediction] = useState<Prediction | null>(null);
  const [microPrediction, setMicroPrediction] = useState<MicroPrediction | null>(null);
  const [history, setHistory] = useState<PredictionResult[]>(() => loadHistory());
  const [performance, setPerformance] = useState<PerformanceStats>(() => calculatePerformance(loadHistory()));
  const supabaseLoadedRef = useRef(false);
  const [nextPredictionIn, setNextPredictionIn] = useState<number>(CYCLE_MS / 1000);
  const [isCalculating, setIsCalculating] = useState(false);
  const [spikeDetected, setSpikeDetected] = useState(false);
  const tickBufferRef2 = useRef(tickBuffer);

  const currentPredictionRef = useRef<Prediction | null>(null);
  const cycleStartRef = useRef<number>(0);
  const lastSpikeRef = useRef<number>(0);
  const lastPriceRef = useRef<number | null>(null);

  // Stable refs for values that change frequently — avoids recreating runCycle
  const candlesRef = useRef(candles);
  const currentPriceRef = useRef(currentPrice);
  const sentimentRef = useRef(polymarketSentiment);
  const edgeSignalRef = useRef(chainlinkEdgeSignal);
  const adaptiveConfigRef = useRef(adaptiveConfig);
  const phase5Ref = useRef(phase5Signals);
  const polyTargetRef = useRef(polymarketTarget);
  const polyOddsRef = useRef(polymarketOdds);
  useEffect(() => {
    candlesRef.current = candles;
    currentPriceRef.current = currentPrice;
    sentimentRef.current = polymarketSentiment;
    phase5Ref.current = phase5Signals;
    edgeSignalRef.current = chainlinkEdgeSignal;
    adaptiveConfigRef.current = adaptiveConfig;
    tickBufferRef2.current = tickBuffer;
    polyTargetRef.current = polymarketTarget;
    polyOddsRef.current = polymarketOdds;
  });

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
  useEffect(() => { chainlinkPriceRef.current = chainlinkPrice; }, [chainlinkPrice]);

  const resolvePrevious = useCallback((price: number) => {
    const prevPrediction = currentPredictionRef.current;
    if (!prevPrediction) return;

    // Use Chainlink price for resolution — this is the Polymarket truth
    const result = evaluatePrediction(
      { ...prevPrediction, outcome: 'PENDING', exitPrice: null, pnlPercent: null },
      price,
      chainlinkPriceRef.current
    );

    // Fire-and-forget Supabase — don't block the cycle
    resolvePrediction(
      result.id,
      price,
      result.outcome as 'WIN' | 'LOSS',
      result.pnlPercent ?? 0
    ).catch(() => {});

    setHistory(prev => {
      const updated = [...prev, result];
      // Defer persistence to next microtask — don't block state update
      queueMicrotask(() => saveHistory(updated));
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

    // Generate new prediction with all signals + adaptive weights
    // When polymarketTarget is set, it overrides the algo target and recalibrates direction/probability
    const config = adaptiveConfigRef.current ?? undefined;
    const p5 = phase5Ref.current;
    const prediction = generatePrediction(
      cndls, price, sentimentRef.current,
      edgeSignalRef.current, chainlinkPriceRef.current,
      config,
      p5.orderBook, p5.fundingRate, p5.onChain, p5.newsSentiment, p5.mlEnsemble,
      polyTargetRef.current,
      polyOddsRef.current?.up ?? null,
      polyOddsRef.current?.down ?? null,
    );
    currentPredictionRef.current = prediction;
    setCurrentPrediction(prediction);
    cycleStartRef.current = Date.now();

    if (prediction) {
      savePrediction(prediction).catch(() => {});

      // Immediately generate first micro-prediction (don't wait 5s)
      const tb = tickBufferRef2.current;
      if (tb && tb.length >= 5) {
        const signalMap: Record<string, number> = {
          rsi: prediction.signals.rsiSignal,
          macd: prediction.signals.macdSignal,
          sma: prediction.signals.smaSignal,
          bollinger: prediction.signals.bollingerSignal,
          volume: prediction.signals.volumeSignal,
          vwap: prediction.signals.vwapSignal,
          polymarket: prediction.signals.polymarketSignal,
          chainlink: prediction.signals.chainlinkDeltaSignal,
          orderBook: prediction.signals.orderBookSignal,
          fundingRate: prediction.signals.fundingRateSignal,
          onChain: prediction.signals.onChainSignal,
          news: prediction.signals.newsSentimentSignal,
          ml: prediction.signals.mlEnsembleSignal,
        };
        const agreement = computeSignalAgreement(signalMap, prediction.direction);
        // Use live Polymarket target when available
        const liveTarget = polyTargetRef.current && polyTargetRef.current > 0
          ? polyTargetRef.current
          : prediction.targetPrice;
        const micro = generateMicroPrediction(
          tb, price, liveTarget, prediction.direction,
          prediction.signals.aggregateScore, prediction.indicators, agreement,
        );
        setMicroPrediction(micro);
      }
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
  // Uses both effect trigger AND polling fallback for robustness
  const initialRanRef = useRef(false);
  useEffect(() => {
    if (initialRanRef.current) return;
    if (candles.length >= 50 && currentPrice && !currentPredictionRef.current) {
      initialRanRef.current = true;
      runCycle();
    }
  }, [candles.length, currentPrice, runCycle]);

  // Fallback: if initial prediction hasn't fired after 3s, poll every 500ms
  // Handles edge case where React batching causes effect to miss the trigger
  useEffect(() => {
    if (initialRanRef.current) return;
    const fallback = setInterval(() => {
      if (initialRanRef.current) { clearInterval(fallback); return; }
      const price = currentPriceRef.current;
      const cndls = candlesRef.current;
      if (price && cndls.length >= 50 && !currentPredictionRef.current) {
        initialRanRef.current = true;
        clearInterval(fallback);
        runCycle();
      }
    }, 500);
    const timeout = setTimeout(() => clearInterval(fallback), 30_000); // Give up after 30s
    return () => { clearInterval(fallback); clearTimeout(timeout); };
  }, [runCycle]);

  // Regular 5-minute prediction cycle — stable interval that never resets
  useEffect(() => {
    const interval = setInterval(() => runCycle(), CYCLE_MS);
    return () => clearInterval(interval);
  }, [runCycle]);

  // ── Polymarket target change → instant recalculation ──
  // When the user overrides the target or a new 5-min window auto-captures a price,
  // regenerate the prediction immediately so direction/probability update in real-time.
  const lastPolyTargetRef = useRef<number | null>(null);
  useEffect(() => {
    if (polymarketTarget === null || polymarketTarget === lastPolyTargetRef.current) return;
    lastPolyTargetRef.current = polymarketTarget;
    // Only re-run if we already have an active prediction (don't trigger before initial)
    if (currentPredictionRef.current && initialRanRef.current) {
      runCycle();
    }
  }, [polymarketTarget, runCycle]);

  // Countdown timer
  useEffect(() => {
    if (cycleStartRef.current === 0) cycleStartRef.current = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - cycleStartRef.current;
      const remaining = Math.max(0, Math.ceil((CYCLE_MS - elapsed) / 1000));
      setNextPredictionIn(remaining);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // ── Micro-prediction real-time loop (every 5s) ──
  // Updates 1min/2min projections, target proximity, and safety scoring
  // Uses live polymarketTarget when available (reacts to user overrides in real-time)
  useEffect(() => {
    const microInterval = setInterval(() => {
      const pred = currentPredictionRef.current;
      const price = currentPriceRef.current;
      const tb = tickBufferRef2.current;

      if (!pred || !price || !tb || tb.length < 5) return;

      // Use live Polymarket target if available, otherwise fall back to prediction's target
      const liveTarget = polyTargetRef.current && polyTargetRef.current > 0
        ? polyTargetRef.current
        : pred.targetPrice;

      // Build signal map for agreement calculation
      const signalMap: Record<string, number> = {
        rsi: pred.signals.rsiSignal,
        macd: pred.signals.macdSignal,
        sma: pred.signals.smaSignal,
        bollinger: pred.signals.bollingerSignal,
        volume: pred.signals.volumeSignal,
        vwap: pred.signals.vwapSignal,
        polymarket: pred.signals.polymarketSignal,
        chainlink: pred.signals.chainlinkDeltaSignal,
        orderBook: pred.signals.orderBookSignal,
        fundingRate: pred.signals.fundingRateSignal,
        onChain: pred.signals.onChainSignal,
        news: pred.signals.newsSentimentSignal,
        ml: pred.signals.mlEnsembleSignal,
      };
      const agreement = computeSignalAgreement(signalMap, pred.direction);

      const micro = generateMicroPrediction(
        tb,
        price,
        liveTarget,
        pred.direction,
        pred.signals.aggregateScore,
        pred.indicators,
        agreement,
      );

      setMicroPrediction(micro);
    }, 5_000);

    return () => clearInterval(microInterval);
  }, []);

  return {
    currentPrediction,
    microPrediction,
    history,
    performance,
    nextPredictionIn,
    isCalculating,
    spikeDetected,
  };
}
