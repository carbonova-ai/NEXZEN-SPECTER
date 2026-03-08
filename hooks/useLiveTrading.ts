'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Prediction,
  PredictionResult,
  PaperTradingConfig,
  DEFAULT_PAPER_TRADING_CONFIG,
} from '@/lib/types';
import type { PolymarketMarket } from '@/lib/polymarket/types';
import {
  LiveTradingEngine,
  LiveTrade,
  LiveTradingStats,
} from '@/lib/engine/live-trading';

const STORAGE_KEY = 'nexzen_live_trades';
const ENABLED_KEY = 'nexzen_live_trading_enabled';

function loadLocalTrades(): LiveTrade[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveLocalTrades(trades: LiveTrade[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades.slice(-500)));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function loadEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(ENABLED_KEY) === 'true';
}

export function useLiveTrading(
  currentPrediction: Prediction | null,
  history: PredictionResult[],
  markets: PolymarketMarket[],
  midpoints: Map<string, number>,
  config: PaperTradingConfig = DEFAULT_PAPER_TRADING_CONFIG
) {
  const [stats, setStats] = useState<LiveTradingStats | null>(null);
  const [trades, setTrades] = useState<LiveTrade[]>([]);
  const [lastTrade, setLastTrade] = useState<LiveTrade | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

  const engineRef = useRef<LiveTradingEngine | null>(null);
  const lastPredictionIdRef = useRef<string | null>(null);
  const marketsRef = useRef(markets);
  const midpointsRef = useRef(midpoints);
  marketsRef.current = markets;
  midpointsRef.current = midpoints;

  // Check if server is configured for live trading
  useEffect(() => {
    fetch('/api/trade')
      .then(res => res.json())
      .then(data => setConfigured(data.configured ?? false))
      .catch(() => setConfigured(false));
  }, []);

  // Initialize engine
  useEffect(() => {
    const savedTrades = loadLocalTrades();
    const enabled = loadEnabled();
    const engine = new LiveTradingEngine(config, savedTrades, enabled);
    engineRef.current = engine;
    setTrades(engine.getTrades());
    setStats(engine.getStats());
  }, [config]);

  // React to new predictions — execute trades
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !currentPrediction) return;
    if (currentPrediction.id === lastPredictionIdRef.current) return;
    lastPredictionIdRef.current = currentPrediction.id;

    engine.executePrediction(
      currentPrediction,
      marketsRef.current,
      midpointsRef.current
    ).then(trade => {
      setLastTrade(trade);
      setTrades(engine.getTrades());
      setStats(engine.getStats());
      saveLocalTrades(engine.getTrades());
    });
  }, [currentPrediction]);

  // React to resolved predictions — resolve open live trades
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || history.length === 0) return;

    const openTrade = engine.getOpenTrade();
    if (!openTrade) return;

    const resolved = history.find(
      h => h.id === openTrade.predictionId && h.outcome !== 'PENDING'
    );
    if (!resolved) return;

    const result = engine.resolveTrade(
      openTrade.id,
      resolved.outcome === 'WIN'
    );

    if (result) {
      setLastTrade(result);
      setTrades(engine.getTrades());
      setStats(engine.getStats());
      saveLocalTrades(engine.getTrades());
    }
  }, [history]);

  const toggleEnabled = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const newState = !engine.isEnabled();
    engine.setEnabled(newState);
    localStorage.setItem(ENABLED_KEY, newState.toString());
    setStats(engine.getStats());
  }, []);

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
    configured,
    toggleEnabled,
    resetCircuitBreaker,
  };
}
