'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Prediction,
  PredictionResult,
  PaperTrade,
  PaperTradingStats,
  PaperTradingConfig,
  DEFAULT_PAPER_TRADING_CONFIG,
} from '@/lib/types';
import { PaperTradingEngine } from '@/lib/engine/paper-trading';
import {
  savePaperTrade,
  resolvePaperTrade,
  fetchRecentPaperTrades,
} from '@/lib/supabase/paper-trades';

const STORAGE_KEY = 'nexzen_paper_trades';

function loadLocalTrades(): PaperTrade[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveLocalTrades(trades: PaperTrade[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades.slice(-500)));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function usePaperTrading(
  currentPrediction: Prediction | null,
  history: PredictionResult[],
  config: PaperTradingConfig = DEFAULT_PAPER_TRADING_CONFIG
) {
  const [stats, setStats] = useState<PaperTradingStats | null>(null);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [lastTrade, setLastTrade] = useState<PaperTrade | null>(null);

  const engineRef = useRef<PaperTradingEngine | null>(null);
  const supabaseLoadedRef = useRef(false);
  const lastPredictionIdRef = useRef<string | null>(null);

  // Initialize engine from persisted trades
  useEffect(() => {
    if (supabaseLoadedRef.current) return;
    supabaseLoadedRef.current = true;

    fetchRecentPaperTrades(500).then(remote => {
      const local = loadLocalTrades();
      const ids = new Set(local.map(t => t.id));
      const merged = [...local, ...remote.filter(r => !ids.has(r.id))];
      merged.sort((a, b) => a.timestamp - b.timestamp);

      const engine = new PaperTradingEngine(config, merged);
      engineRef.current = engine;
      setTrades(engine.getTrades());
      setStats(engine.getStats());
    }).catch(() => {
      const local = loadLocalTrades();
      const engine = new PaperTradingEngine(config, local);
      engineRef.current = engine;
      setTrades(engine.getTrades());
      setStats(engine.getStats());
    });
  }, [config]);

  // React to new predictions — open trades
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !currentPrediction) return;
    if (currentPrediction.id === lastPredictionIdRef.current) return;
    lastPredictionIdRef.current = currentPrediction.id;

    const trade = engine.openTrade(currentPrediction);
    setLastTrade(trade);
    setTrades(engine.getTrades());
    setStats(engine.getStats());
    saveLocalTrades(engine.getTrades());

    savePaperTrade(trade).catch(() => {});
  }, [currentPrediction]);

  // React to resolved predictions — resolve open trades
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || history.length === 0) return;

    const openTrade = engine.getOpenTrade();
    if (!openTrade) return;

    // Find the resolved prediction that matches our open trade
    const resolved = history.find(
      h => h.id === openTrade.predictionId && h.outcome !== 'PENDING'
    );
    if (!resolved || !resolved.exitPrice) return;

    const result = engine.resolveTrade(
      openTrade.id,
      resolved.exitPrice,
      resolved.outcome as 'WIN' | 'LOSS'
    );

    if (result) {
      setLastTrade(result);
      setTrades(engine.getTrades());
      setStats(engine.getStats());
      saveLocalTrades(engine.getTrades());

      resolvePaperTrade(
        result.id,
        result.exitPrice!,
        result.status as 'WON' | 'LOST',
        result.payout ?? 0,
        result.pnl ?? 0,
        result.bankrollAfter ?? engine.getBankroll()
      ).catch(() => {});
    }
  }, [history]);

  const resetCircuitBreaker = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.resetCircuitBreaker();
    setStats(engine.getStats());
  }, []);

  return {
    stats,
    trades,
    lastTrade,
    resetCircuitBreaker,
  };
}
