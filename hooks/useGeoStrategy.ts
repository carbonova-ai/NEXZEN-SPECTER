'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { GeoArticle } from '@/lib/geopolitical/types';
import type { GeoMarket } from '@/hooks/usePolymarketGeo';
import type { EscalationState } from '@/lib/geopolitical/iran-intelligence';
import { generateWarSignals, type WarSignal, type SignalSummary } from '@/lib/geopolitical/war-signal-engine';
import {
  createGeoPortfolio,
  evaluateSignals,
  openPosition,
  closePosition,
  updatePositionPrices,
  saveGeoPortfolio,
  loadGeoPortfolio,
  type GeoPortfolio,
  type TradeDecision,
} from '@/lib/geopolitical/geo-strategy';

// ══════════════════════════════════════════════════════════════
// useGeoStrategy — War Trading Strategy Hook
//
// Connects the intelligence pipeline to trading decisions:
// 1. Takes Iran articles + Polymarket data + escalation state
// 2. Generates war signals (speed edge, mispricing, etc.)
// 3. Evaluates trade decisions with Kelly sizing
// 4. Manages portfolio state (positions, P&L, risk)
// 5. Persists everything to localStorage
// ══════════════════════════════════════════════════════════════

interface UseGeoStrategyOptions {
  articles: GeoArticle[];
  markets: GeoMarket[];
  escalation: EscalationState;
  // Ukraine theater (optional — for multi-theater signal generation)
  ukraineArticles?: GeoArticle[];
  ukraineMarkets?: GeoMarket[];
  autoTrade?: boolean;           // auto-execute TRADE decisions (default: false)
}

interface UseGeoStrategyReturn {
  // Signals
  signals: SignalSummary;
  activeSignals: WarSignal[];

  // Decisions
  decisions: TradeDecision[];
  pendingTrades: TradeDecision[];

  // Portfolio
  portfolio: GeoPortfolio;

  // Actions
  executeTrade: (decision: TradeDecision) => void;
  closePositionById: (positionId: string, exitPrice: number) => void;
  resetPortfolio: () => void;

  // Status
  isAnalyzing: boolean;
  lastAnalyzedAt: string | null;
}

export function useGeoStrategy({
  articles,
  markets,
  escalation,
  ukraineArticles,
  ukraineMarkets,
  autoTrade = false,
}: UseGeoStrategyOptions): UseGeoStrategyReturn {
  const [portfolio, setPortfolio] = useState<GeoPortfolio>(() => {
    if (typeof window === 'undefined') return createGeoPortfolio();
    return loadGeoPortfolio() || createGeoPortfolio();
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<string | null>(null);

  const portfolioRef = useRef(portfolio);
  portfolioRef.current = portfolio;

  // Generate war signals from articles + markets + escalation
  const signals = useMemo((): SignalSummary => {
    if (articles.length === 0 || markets.length === 0) {
      return {
        totalSignals: 0,
        actionableSignals: 0,
        topSignals: [],
        overallEdge: 'NONE',
        recommendation: 'Aguardando dados...',
        totalEV: 0,
      };
    }

    // Iran signals
    const iranResult = generateWarSignals(articles, markets, escalation, 'iran');

    // Ukraine signals (if data available)
    let mergedResult = iranResult;
    if (ukraineArticles && ukraineArticles.length > 0 && ukraineMarkets && ukraineMarkets.length > 0) {
      const uaMarkets: import('@/hooks/usePolymarketGeo').GeoMarket[] = ukraineMarkets.map(m => ({
        ...m, prevYesPrice: null, priceDirection: 'stable' as const, priceChangePct: 0,
        category: 'geopolitics', lastUpdated: new Date().toISOString(),
      }));
      const ukraineResult = generateWarSignals(ukraineArticles, uaMarkets, escalation, 'ukraine');

      // Merge both signal sets
      const allSignals = [...iranResult.topSignals, ...ukraineResult.topSignals]
        .sort((a, b) => {
          if (a.actionable !== b.actionable) return a.actionable ? -1 : 1;
          return (b.strength * b.confidence) - (a.strength * a.confidence);
        });

      mergedResult = {
        totalSignals: iranResult.totalSignals + ukraineResult.totalSignals,
        actionableSignals: iranResult.actionableSignals + ukraineResult.actionableSignals,
        topSignals: allSignals.slice(0, 15),
        overallEdge: iranResult.overallEdge === 'STRONG' || ukraineResult.overallEdge === 'STRONG' ? 'STRONG'
          : iranResult.overallEdge === 'MODERATE' || ukraineResult.overallEdge === 'MODERATE' ? 'MODERATE'
          : iranResult.overallEdge === 'WEAK' || ukraineResult.overallEdge === 'WEAK' ? 'WEAK' : 'NONE',
        recommendation: iranResult.recommendation,
        totalEV: iranResult.totalEV + ukraineResult.totalEV,
      };
    }

    return mergedResult;
  }, [articles, markets, escalation, ukraineArticles, ukraineMarkets]);

  // Track analysis state via useEffect (cannot setState inside useMemo)
  useEffect(() => {
    if (articles.length > 0 && markets.length > 0) {
      setLastAnalyzedAt(new Date().toISOString());
    }
  }, [signals, articles.length, markets.length]);

  // Evaluate trade decisions based on signals
  const decisions = useMemo((): TradeDecision[] => {
    if (signals.actionableSignals === 0) return [];
    return evaluateSignals(signals, portfolioRef.current);
  }, [signals]);

  // Filter pending trades (TRADE action, not yet executed)
  const pendingTrades = useMemo(() => {
    return decisions.filter(d => d.action === 'TRADE');
  }, [decisions]);

  // Active (non-expired) signals
  const activeSignals = useMemo(() => {
    const now = Date.now();
    return signals.topSignals.filter(s =>
      new Date(s.expiresAt).getTime() > now
    );
  }, [signals]);

  // Update position prices when market data changes
  useEffect(() => {
    if (portfolio.positions.length === 0 || markets.length === 0) return;

    const priceMap = new Map<string, number>();
    for (const m of markets) {
      priceMap.set(m.id, m.outcomePrices[0] ?? 0.5);
    }

    const { portfolio: updated, triggeredExits } = updatePositionPrices(portfolio, priceMap);

    // Auto-close positions that hit stop loss or take profit
    let finalPortfolio = updated;
    for (const posId of triggeredExits) {
      const pos = finalPortfolio.positions.find(p => p.id === posId);
      if (pos) {
        const exitPrice = pos.currentPrice;
        finalPortfolio = closePosition(finalPortfolio, posId, exitPrice);
      }
    }

    if (triggeredExits.length > 0 || JSON.stringify(updated.positions) !== JSON.stringify(portfolio.positions)) {
      setPortfolio(finalPortfolio);
      saveGeoPortfolio(finalPortfolio);
    }
  }, [markets, portfolio]);

  // Auto-trade (if enabled — PAPER MODE by default)
  useEffect(() => {
    if (!autoTrade || pendingTrades.length === 0) return;

    // Only auto-execute the top decision
    const topDecision = pendingTrades[0];
    if (topDecision.riskReward >= 2.0) {
      const newPortfolio = openPosition(portfolioRef.current, topDecision);
      setPortfolio(newPortfolio);
      saveGeoPortfolio(newPortfolio);
    }
  }, [autoTrade, pendingTrades]);

  // Manual trade execution
  const executeTrade = useCallback((decision: TradeDecision) => {
    if (decision.action !== 'TRADE') return;
    const newPortfolio = openPosition(portfolioRef.current, decision);
    setPortfolio(newPortfolio);
    saveGeoPortfolio(newPortfolio);
  }, []);

  // Manual position close
  const closePositionById = useCallback((positionId: string, exitPrice: number) => {
    const newPortfolio = closePosition(portfolioRef.current, positionId, exitPrice);
    setPortfolio(newPortfolio);
    saveGeoPortfolio(newPortfolio);
  }, []);

  // Reset portfolio
  const resetPortfolio = useCallback(() => {
    const fresh = createGeoPortfolio();
    setPortfolio(fresh);
    saveGeoPortfolio(fresh);
  }, []);

  return {
    signals,
    activeSignals,
    decisions,
    pendingTrades,
    portfolio,
    executeTrade,
    closePositionById,
    resetPortfolio,
    isAnalyzing,
    lastAnalyzedAt,
  };
}
