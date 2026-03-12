'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useIranMonitor } from '@/hooks/useIranMonitor';
import { useUkraineMonitor } from '@/hooks/useUkraineMonitor';
import { useWarMarkets } from '@/hooks/useWarMarkets';
import { usePolymarketGeo } from '@/hooks/usePolymarketGeo';
import { useGeoStrategy } from '@/hooks/useGeoStrategy';
import { ESCALATION_CONFIG, type EscalationPhase } from '@/lib/geopolitical/iran-intelligence';
import { UKRAINE_ESCALATION_CONFIG, type UkraineEscalationPhase } from '@/lib/geopolitical/ukraine-intelligence';
import type { GeoArticle, ThreatLevel } from '@/lib/geopolitical/types';
import type { WarSignal } from '@/lib/geopolitical/war-signal-engine';
import type { TradeDecision, GeoPortfolio } from '@/lib/geopolitical/geo-strategy';
import { IRAN_TRIBUNAL_INSTRUCTIONS, generateIranTribunalPrompt, parseIranTribunalResponse, type IranTribunalResult } from '@/lib/geopolitical/iran-prompt';
import { UKRAINE_TRIBUNAL_INSTRUCTIONS, generateUkraineTribunalPrompt, parseUkraineTribunalResponse, type UkraineTribunalResult } from '@/lib/geopolitical/ukraine-prompt';
import PredictionPanel from '@/components/warroom/PredictionPanel';

// ══════════════════════════════════════════════════════════════
// WAR ROOM v2.0 — Multi-Theater Intelligence & Trading Dashboard
//
// Dual-theater nerve center for geopolitical prediction market trading.
// Iran + Ukraine with real-time escalation tracking, SSE news push,
// dedicated Polymarket panels, and automated trade signals.
// ══════════════════════════════════════════════════════════════

type TabId = 'iran-intel' | 'iran-markets' | 'ukraine' | 'signals' | 'trades';

const IRAN_VERDICTS_KEY = 'specter-iran-verdicts';
const UKRAINE_VERDICTS_KEY = 'specter-ukraine-verdicts';

function loadVerdicts<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveVerdicts<T>(key: string, verdicts: T[]) {
  try { localStorage.setItem(key, JSON.stringify((verdicts as unknown[]).slice(0, 100))); } catch {}
}

export default function WarRoom() {
  // ── Iran Intelligence ──
  const iran = useIranMonitor(5_000);

  // ── Ukraine Intelligence ──
  const ukraine = useUkraineMonitor(5_000);

  // ── War Prediction Markets (REST 5s + CLOB WebSocket real-time) ──
  const warMarkets = useWarMarkets(5_000);

  // ── Polymarket (general — for strategy engine compatibility) ──
  const { markets: geoMarkets } = usePolymarketGeo();

  // ── Strategy Engine (multi-theater) ──
  const {
    signals,
    activeSignals,
    decisions,
    pendingTrades,
    portfolio,
    executeTrade,
    closePositionById,
    resetPortfolio,
  } = useGeoStrategy({
    articles: iran.articles,
    markets: geoMarkets,
    escalation: iran.escalation,
    ukraineArticles: ukraine.articles,
    ukraineMarkets: warMarkets.ukraineMarkets.map(m => ({
      ...m,
      prevYesPrice: m.prevYesPrice,
      priceDirection: m.priceDirection,
      priceChangePct: m.priceChangePct,
      category: 'geopolitics' as const,
      lastUpdated: new Date().toISOString(),
    })),
  });

  // ── UI State ──
  const [selectedIranArticle, setSelectedIranArticle] = useState<GeoArticle | null>(null);
  const [selectedUkraineArticle, setSelectedUkraineArticle] = useState<GeoArticle | null>(null);
  const [iranVerdicts, setIranVerdicts] = useState<IranTribunalResult[]>([]);
  const [ukraineVerdicts, setUkraineVerdicts] = useState<UkraineTribunalResult[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('iran-intel');

  useEffect(() => {
    setIranVerdicts(loadVerdicts<IranTribunalResult>(IRAN_VERDICTS_KEY));
    setUkraineVerdicts(loadVerdicts<UkraineTribunalResult>(UKRAINE_VERDICTS_KEY));
  }, []);

  const handleNewIranVerdict = useCallback((verdict: IranTribunalResult) => {
    setIranVerdicts(prev => {
      const next = [verdict, ...prev];
      saveVerdicts(IRAN_VERDICTS_KEY, next);
      return next;
    });
  }, []);

  const handleNewUkraineVerdict = useCallback((verdict: UkraineTribunalResult) => {
    setUkraineVerdicts(prev => {
      const next = [verdict, ...prev];
      saveVerdicts(UKRAINE_VERDICTS_KEY, next);
      return next;
    });
  }, []);

  // ── Derived ──
  const iranCriticalCount = iran.articles.filter(a => a.urgency === 'CRITICAL').length;
  const iranEscConf = ESCALATION_CONFIG[iran.escalation.phase];
  const ukraineEscConf = UKRAINE_ESCALATION_CONFIG[ukraine.escalation.phase];
  const pnlColor = portfolio.totalPnL >= 0 ? 'text-green-400' : 'text-red-400';
  const returnColor = portfolio.stats.totalReturn >= 0 ? 'text-green-400' : 'text-red-400';

  // Iran-related general markets (for tribunal panel)
  const iranGeoMarkets = useMemo(() => geoMarkets.filter(m => {
    const q = m.question.toLowerCase();
    return q.includes('iran') || q.includes('nuclear') || q.includes('hormuz')
      || q.includes('hezbollah') || q.includes('houthi') || q.includes('middle east')
      || q.includes('oil') || q.includes('crude');
  }), [geoMarkets]);

  return (
    <div className="flex flex-col min-h-screen bg-nexzen-bg">
      {/* ── WAR ROOM HEADER ── */}
      <header className="flex items-center justify-between px-4 py-2 bg-nexzen-surface/80 border-b border-red-500/20">
        <div className="flex items-center gap-3">
          <a href="/" className="text-base font-bold tracking-wider text-nexzen-primary hover:opacity-80 transition-opacity" style={{ textShadow: '0 0 10px rgba(0,255,136,0.4)' }}>
            N&Xi;X&Zeta;&Xi;N
          </a>
          <span className="text-nexzen-border/30">|</span>

          {/* Iran Escalation Badge */}
          <div className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${iranEscConf.bg} border ${
              iran.escalation.score > 50 ? 'border-red-500' : 'border-amber-500/40'
            }`} />
            <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${iranEscConf.bg} ${iranEscConf.color} border border-current/20`}>
              {iranEscConf.icon} IRAN
            </span>
          </div>

          <span className="text-nexzen-border/20">·</span>

          {/* Ukraine Escalation Badge */}
          <div className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${ukraineEscConf.bg} border ${
              ukraine.escalation.score > 50 ? 'border-blue-500' : 'border-blue-500/40'
            }`} />
            <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${ukraineEscConf.bg} ${ukraineEscConf.color} border border-current/20`}>
              {ukraineEscConf.icon} UKR
            </span>
          </div>

          <span className="text-[9px] font-bold tracking-wider text-red-400 ml-1">WAR ROOM</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Portfolio Summary */}
          <div className="flex items-center gap-3 text-[9px]">
            <span className="text-nexzen-muted">Capital:</span>
            <span className="text-nexzen-text font-bold tabular-nums">${portfolio.currentCapital.toFixed(2)}</span>
            <span className="text-nexzen-muted">P&L:</span>
            <span className={`font-bold tabular-nums ${pnlColor}`}>
              {portfolio.totalPnL >= 0 ? '+' : ''}{portfolio.totalPnL.toFixed(2)}
            </span>
            <span className="text-nexzen-muted">Return:</span>
            <span className={`font-bold tabular-nums ${returnColor}`}>
              {portfolio.stats.totalReturn >= 0 ? '+' : ''}{portfolio.stats.totalReturn.toFixed(1)}%
            </span>
          </div>

          {/* Signal Indicator */}
          <div className="flex items-center gap-1.5">
            <span className={`text-[8px] px-2 py-0.5 rounded-full border ${
              signals.overallEdge === 'STRONG' ? 'border-green-500/40 bg-green-500/10 text-green-400' :
              signals.overallEdge === 'MODERATE' ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' :
              signals.overallEdge === 'WEAK' ? 'border-yellow-500/30 bg-yellow-500/5 text-yellow-400' :
              'border-nexzen-border/20 text-nexzen-muted'
            }`}>
              EDGE: {signals.overallEdge}
            </span>
            {signals.actionableSignals > 0 && (
              <span className="text-[8px] text-green-400 animate-pulse">
                {signals.actionableSignals} SIGNALS
              </span>
            )}
          </div>

          {/* Timing */}
          <div className="flex items-center gap-2 text-[8px] text-nexzen-muted">
            <span className="tabular-nums">{iran.secondsSinceUpdate}s</span>
            <span className="tabular-nums">{iran.latencyMs}ms</span>
            <button
              onClick={iran.refresh}
              className="px-2 py-0.5 rounded border border-nexzen-border/20 hover:border-red-500/30 hover:text-red-400 transition-colors"
            >
              REFRESH
            </button>
          </div>
        </div>
      </header>

      {/* Phase Transition Alerts */}
      {iran.phaseTransition && (
        <div className="px-4 py-1.5 bg-red-500/10 border-b border-red-500/30 animate-pulse">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-red-400">IRAN ESCALATION</span>
            <span className="text-[8px] text-nexzen-text">
              {iran.phaseTransition.from} → {iran.phaseTransition.to}
            </span>
            <span className="text-[7px] text-nexzen-muted truncate max-w-[300px]">
              {iran.phaseTransition.triggerArticle}
            </span>
          </div>
        </div>
      )}
      {ukraine.phaseTransition && (
        <div className="px-4 py-1.5 bg-blue-500/10 border-b border-blue-500/30 animate-pulse">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-blue-400">UKRAINE ESCALATION</span>
            <span className="text-[8px] text-nexzen-text">
              {ukraine.phaseTransition.from} → {ukraine.phaseTransition.to}
            </span>
            <span className="text-[7px] text-nexzen-muted truncate max-w-[300px]">
              {ukraine.phaseTransition.triggerArticle}
            </span>
          </div>
        </div>
      )}

      {/* ── TAB BAR ── */}
      <div className="flex items-center gap-1 px-4 py-1.5 bg-nexzen-surface/40 border-b border-nexzen-border/10">
        {([
          { id: 'iran-intel' as TabId, label: 'IRAN INTEL', count: iran.iranArticles.length, color: 'red' },
          { id: 'iran-markets' as TabId, label: 'IRAN MARKETS', count: warMarkets.iranMarkets.length, color: 'red' },
          { id: 'ukraine' as TabId, label: 'UKRAINE', count: ukraine.ukraineArticles.length, color: 'blue' },
          { id: 'signals' as TabId, label: 'WAR SIGNALS', count: signals.actionableSignals, color: 'green' },
          { id: 'trades' as TabId, label: 'PORTFOLIO', count: portfolio.positions.length, color: 'amber' },
        ]).map(tab => {
          const activeColor = tab.color === 'red' ? 'border-red-500/40 bg-red-500/10 text-red-400' :
            tab.color === 'blue' ? 'border-blue-500/40 bg-blue-500/10 text-blue-400' :
            tab.color === 'green' ? 'border-green-500/40 bg-green-500/10 text-green-400' :
            'border-amber-500/40 bg-amber-500/10 text-amber-400';

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1 text-[9px] uppercase tracking-wider rounded-full border transition-all ${
                activeTab === tab.id ? activeColor : 'border-nexzen-border/20 text-nexzen-muted hover:text-nexzen-text'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1 text-[8px] tabular-nums">({tab.count})</span>
              )}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2 text-[8px] text-nexzen-muted">
          <span className={`w-1.5 h-1.5 rounded-full ${
            iran.streamStatus === 'connected' ? 'bg-green-500' :
            iran.streamStatus === 'fallback' ? 'bg-amber-500' : 'bg-red-500'
          }`} />
          <span>{iran.streamStatus === 'connected' ? 'SSE' : iran.streamStatus === 'fallback' ? 'POLL' : 'ERR'}</span>
          <span className="text-nexzen-border/30">|</span>
          <span className={`${
            warMarkets.wsStatus === 'connected' ? 'text-green-400' :
            warMarkets.wsStatus === 'reconnecting' ? 'text-amber-400' : 'text-nexzen-muted'
          }`}>WS {warMarkets.wsStatus === 'connected' ? 'LIVE' : warMarkets.wsStatus?.toUpperCase()}</span>
          {warMarkets.wsLatencyMs > 0 && <span className="text-nexzen-muted tabular-nums">{warMarkets.wsLatencyMs}ms</span>}
          <span className="text-nexzen-border/30">|</span>
          <span>{iran.iranArticles.length} IR + {ukraine.ukraineArticles.length} UA</span>
          <span className="text-nexzen-border/30">|</span>
          <span>{warMarkets.iranMarkets.length + warMarkets.ukraineMarkets.length} markets</span>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 flex gap-3 p-3 md:p-4 max-w-[1920px] mx-auto w-full min-h-0">

        {/* ═══ TAB 1: IRAN INTEL ═══ */}
        {activeTab === 'iran-intel' && (
          <>
            {/* Left: Iran Escalation + News (40%) */}
            <div className="w-full md:w-[40%] flex flex-col gap-3 min-h-0">
              <IranEscalationMeter escalation={iran.escalation} />

              <div className="glass-card flex-1 flex flex-col min-h-0" style={{ borderColor: 'rgba(239,68,68,0.1)' }}>
                <div className="flex items-center justify-between p-3 border-b border-nexzen-border/20">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] uppercase tracking-wider text-nexzen-muted">IRAN INTELLIGENCE FEED</span>
                    <span className="text-[9px] text-nexzen-muted tabular-nums">{iran.iranArticles.length} articles</span>
                  </div>
                  {iranCriticalCount > 0 && (
                    <span className="text-[9px] text-red-400 font-bold animate-pulse">{iranCriticalCount} CRITICAL</span>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1" style={{ maxHeight: 'calc(100vh - 380px)' }}>
                  {iran.iranArticles.slice(0, 50).map(({ article, analysis }) => (
                    <IranArticleRow
                      key={article.id}
                      article={article}
                      analysis={analysis}
                      isSelected={selectedIranArticle?.id === article.id}
                      onSelect={setSelectedIranArticle}
                    />
                  ))}
                  {iran.iranArticles.length === 0 && !iran.isLoading && (
                    <div className="text-center text-[10px] text-nexzen-muted py-8">
                      No Iran-related articles detected. Monitoring...
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Center: Analysis (30%) */}
            <div className="hidden md:flex md:w-[30%] flex-col min-h-0">
              <IranTribunalPanel
                selectedArticle={selectedIranArticle}
                escalation={iran.escalation}
                verdicts={iranVerdicts}
                onNewVerdict={handleNewIranVerdict}
                iranMarkets={iranGeoMarkets}
              />
            </div>

            {/* Right: Nuclear + Proxy + Sources (30%) */}
            <div className="hidden lg:flex lg:w-[30%] flex-col gap-3 min-h-0 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
              <NuclearStatusPanel escalation={iran.escalation} />
              <ProxyNetworkPanel escalation={iran.escalation} />
              <SourcePerformancePanel sources={iran.sourcePerformance} />
            </div>
          </>
        )}

        {/* ═══ TAB 2: IRAN MARKETS ═══ */}
        {activeTab === 'iran-markets' && (
          <div className="w-full flex gap-3 min-h-0">
            {/* Left: Full Prediction Panel (60%) */}
            <div className="w-full md:w-[60%] flex flex-col min-h-0">
              <PredictionPanel
                markets={warMarkets.iranMarkets}
                theater="iran"
                title="IRAN WAR PREDICTIONS — POLYMARKET"
                maxItems={30}
              />
            </div>

            {/* Right: Escalation Context + Quick Stats (40%) */}
            <div className="hidden md:flex md:w-[40%] flex-col gap-3 min-h-0 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
              <IranEscalationMeter escalation={iran.escalation} />
              <NuclearStatusPanel escalation={iran.escalation} />
              <ProxyNetworkPanel escalation={iran.escalation} />

              {/* Market Summary */}
              <div className="glass-card p-3" style={{ borderColor: 'rgba(59,130,246,0.1)' }}>
                <div className="text-[10px] uppercase tracking-wider text-blue-400 mb-2">MARKET OVERVIEW</div>
                <div className="grid grid-cols-2 gap-2 text-[9px]">
                  <div>
                    <span className="text-nexzen-muted">Total Markets:</span>
                    <span className="ml-1 text-nexzen-text font-bold">{warMarkets.iranMarkets.length}</span>
                  </div>
                  <div>
                    <span className="text-nexzen-muted">Status:</span>
                    <span className={`ml-1 ${warMarkets.isLoading ? 'text-amber-400' : 'text-green-400'}`}>
                      {warMarkets.isLoading ? 'Loading...' : warMarkets.wsStatus === 'connected' ? 'WS Live' : 'REST'}
                    </span>
                  </div>
                  {warMarkets.lastRefreshed && (
                    <div className="col-span-2">
                      <span className="text-nexzen-muted">Last Refresh:</span>
                      <span className="ml-1 text-nexzen-text tabular-nums">
                        {new Date(warMarkets.lastRefreshed).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ TAB 3: UKRAINE ═══ */}
        {activeTab === 'ukraine' && (
          <div className="w-full flex gap-3 min-h-0">
            {/* Left: Ukraine Intel Feed (40%) */}
            <div className="w-full md:w-[40%] flex flex-col gap-3 min-h-0">
              <UkraineEscalationMeter escalation={ukraine.escalation} />

              <div className="glass-card flex-1 flex flex-col min-h-0" style={{ borderColor: 'rgba(59,130,246,0.1)' }}>
                <div className="flex items-center justify-between p-3 border-b border-nexzen-border/20">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-[10px] uppercase tracking-wider text-nexzen-muted">UKRAINE INTELLIGENCE FEED</span>
                    <span className="text-[9px] text-nexzen-muted tabular-nums">{ukraine.ukraineArticles.length} articles</span>
                  </div>
                  <div className="flex items-center gap-2 text-[8px] text-nexzen-muted">
                    <span className="tabular-nums">{ukraine.secondsSinceUpdate}s ago</span>
                    <button
                      onClick={ukraine.refresh}
                      className="px-2 py-0.5 rounded border border-nexzen-border/20 hover:border-blue-500/30 hover:text-blue-400 transition-colors"
                    >
                      REFRESH
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1" style={{ maxHeight: 'calc(100vh - 380px)' }}>
                  {ukraine.ukraineArticles.slice(0, 50).map(({ article, analysis }) => (
                    <UkraineArticleRow
                      key={article.id}
                      article={article}
                      analysis={analysis}
                      isSelected={selectedUkraineArticle?.id === article.id}
                      onSelect={setSelectedUkraineArticle}
                    />
                  ))}
                  {ukraine.ukraineArticles.length === 0 && !ukraine.isLoading && (
                    <div className="text-center text-[10px] text-nexzen-muted py-8">
                      No Ukraine-related articles detected. Monitoring...
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Center: Ukraine Tribunal (30%) */}
            <div className="hidden md:flex md:w-[30%] flex-col min-h-0">
              <UkraineTribunalPanel
                selectedArticle={selectedUkraineArticle}
                escalation={ukraine.escalation}
                verdicts={ukraineVerdicts}
                onNewVerdict={handleNewUkraineVerdict}
                ukraineMarkets={warMarkets.ukraineMarkets}
              />
            </div>

            {/* Right: Ukraine Predictions (30%) */}
            <div className="hidden lg:flex lg:w-[30%] flex-col min-h-0">
              <PredictionPanel
                markets={warMarkets.ukraineMarkets}
                theater="ukraine"
                title="UKRAINE PREDICTIONS"
                maxItems={20}
              />
            </div>
          </div>
        )}

        {/* ═══ TAB 4: WAR SIGNALS (both theaters) ═══ */}
        {activeTab === 'signals' && (
          <div className="w-full flex flex-col gap-3">
            <div className="glass-card p-4" style={{ borderColor: 'rgba(34,197,94,0.1)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] uppercase tracking-wider text-green-400 font-bold">MULTI-THEATER WAR SIGNAL SCANNER</div>
                <div className="flex items-center gap-3 text-[9px]">
                  <span className="text-nexzen-muted">Total: {signals.totalSignals}</span>
                  <span className="text-green-400">Actionable: {signals.actionableSignals}</span>
                  <span className="text-amber-400">EV: {(signals.totalEV * 100).toFixed(1)}%</span>
                </div>
              </div>
              <div className="text-[10px] text-nexzen-text mb-3 p-2 rounded bg-nexzen-card/30 border border-nexzen-border/10">
                {signals.recommendation}
              </div>

              <div className="space-y-2">
                {activeSignals.map(signal => (
                  <SignalCard key={signal.id} signal={signal} />
                ))}
                {activeSignals.length === 0 && (
                  <div className="text-center text-[10px] text-nexzen-muted py-6">
                    No active signals. Monitoring both theaters...
                  </div>
                )}
              </div>
            </div>

            {decisions.length > 0 && (
              <div className="glass-card p-4" style={{ borderColor: 'rgba(59,130,246,0.1)' }}>
                <div className="text-[11px] uppercase tracking-wider text-blue-400 font-bold mb-3">TRADE DECISIONS</div>
                <div className="space-y-2">
                  {decisions.map((d, i) => (
                    <TradeDecisionCard key={i} decision={d} onExecute={executeTrade} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB 5: PORTFOLIO ═══ */}
        {activeTab === 'trades' && (
          <div className="w-full flex flex-col gap-3">
            <div className="glass-card p-4" style={{ borderColor: 'rgba(245,158,11,0.1)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] uppercase tracking-wider text-amber-400 font-bold">GEO PORTFOLIO — MULTI-THEATER</div>
                <button
                  onClick={resetPortfolio}
                  className="text-[8px] px-2 py-0.5 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 transition"
                >
                  RESET
                </button>
              </div>
              <PortfolioStats portfolio={portfolio} />
            </div>

            {portfolio.positions.length > 0 && (
              <div className="glass-card p-4" style={{ borderColor: 'rgba(34,197,94,0.1)' }}>
                <div className="text-[11px] uppercase tracking-wider text-green-400 font-bold mb-3">
                  OPEN POSITIONS ({portfolio.positions.length})
                </div>
                <div className="space-y-2">
                  {portfolio.positions.map(pos => (
                    <div key={pos.id} className="p-2 rounded border border-nexzen-border/10 bg-nexzen-card/20">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="text-[9px] text-nexzen-text line-clamp-1">{pos.question}</div>
                          <div className="flex items-center gap-2 mt-1 text-[8px]">
                            <span className={pos.direction === 'YES' ? 'text-green-400' : 'text-red-400'}>{pos.direction}</span>
                            <span className="text-nexzen-muted">@ {(pos.entryPrice * 100).toFixed(0)}%</span>
                            <span className="text-nexzen-muted">→ {(pos.currentPrice * 100).toFixed(0)}%</span>
                            <span className={pos.unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}>
                              {pos.unrealizedPnL >= 0 ? '+' : ''}{pos.unrealizedPnL.toFixed(2)} ({pos.unrealizedPnLPct.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => closePositionById(pos.id, pos.currentPrice)}
                          className="text-[8px] px-2 py-0.5 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 ml-2"
                        >
                          CLOSE
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {portfolio.closedTrades.length > 0 && (
              <div className="glass-card p-4" style={{ borderColor: 'rgba(168,85,247,0.1)' }}>
                <div className="text-[11px] uppercase tracking-wider text-purple-400 font-bold mb-3">
                  TRADE HISTORY ({portfolio.closedTrades.length})
                </div>
                <div className="space-y-1">
                  {portfolio.closedTrades.slice().reverse().map(trade => (
                    <div key={trade.id} className="flex items-center justify-between p-1.5 rounded bg-nexzen-card/20 text-[8px]">
                      <div className="flex items-center gap-2">
                        <span className={trade.outcome === 'WIN' ? 'text-green-400' : trade.outcome === 'LOSS' ? 'text-red-400' : 'text-nexzen-muted'}>
                          {trade.outcome}
                        </span>
                        <span className="text-nexzen-text line-clamp-1 max-w-[300px]">{trade.question}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-nexzen-muted">${trade.stake.toFixed(2)}</span>
                        <span className={trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── FOOTER ── */}
      <footer className="flex items-center justify-between px-4 py-1.5 bg-nexzen-surface/60 border-t border-red-500/10 text-[8px] text-nexzen-muted">
        <div className="flex items-center gap-3">
          <span>SSE 1.5s + 1s Cache | Markets: WS Real-time + 5s REST</span>
          <span className="text-nexzen-border">|</span>
          <span>{iran.sourcePerformance.filter(s => s.wasHit).length} IR + {ukraine.sourcePerformance.filter(s => s.wasHit).length} UA sources</span>
          <span className="text-nexzen-border">|</span>
          <span>Signals: {signals.totalSignals} ({signals.actionableSignals} actionable)</span>
          <span className="text-nexzen-border">|</span>
          <span>Iran: {iran.escalation.phase} ({iran.escalation.score}/100) | Ukraine: {ukraine.escalation.phase} ({ukraine.escalation.score}/100)</span>
        </div>
        <div className="flex items-center gap-2">
          <a href="/" className="text-nexzen-primary/40 hover:text-nexzen-primary/70 transition-colors">BTC 5MIN</a>
          <span className="text-nexzen-border/20">|</span>
          <span className="text-red-500/40">NEXZEN SPECTER — WAR ROOM v2.0</span>
        </div>
      </footer>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function timeAgo(isoDate: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 10) return 'agora';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// ══════════════════════════════════════════════════════════════
// Sub-components
// ══════════════════════════════════════════════════════════════

function IranArticleRow({ article, analysis, isSelected, onSelect }: {
  article: GeoArticle;
  analysis: import('@/lib/geopolitical/iran-intelligence').IranAnalysis;
  isSelected: boolean;
  onSelect: (a: GeoArticle) => void;
}) {
  return (
    <button
      onClick={() => onSelect(article)}
      className={`w-full text-left p-2 rounded border transition-all ${
        isSelected ? 'border-red-500/40 bg-red-500/10' : 'border-nexzen-border/10 hover:border-nexzen-border/30 hover:bg-nexzen-surface/30'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-center gap-0.5 shrink-0 mt-0.5">
          <span className={`text-[7px] px-1 rounded ${
            article.urgency === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
            article.urgency === 'HIGH' ? 'bg-orange-500/15 text-orange-400' :
            article.urgency === 'MEDIUM' ? 'bg-yellow-500/10 text-yellow-400' :
            'bg-nexzen-card/40 text-nexzen-muted'
          }`}>{article.urgency}</span>
          <span className="text-[7px] text-nexzen-muted tabular-nums">{analysis.relevanceScore}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <div className="text-[10px] text-nexzen-text leading-tight line-clamp-2 flex-1">{article.title}</div>
            <span className="text-[7px] text-nexzen-muted tabular-nums shrink-0">{timeAgo(article.seenAt)}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[7px] text-nexzen-muted">{article.source}</span>
            <span className={`text-[6px] px-1 rounded ${ESCALATION_CONFIG[analysis.escalationPhase].bg} ${ESCALATION_CONFIG[analysis.escalationPhase].color}`}>
              {ESCALATION_CONFIG[analysis.escalationPhase].label}
            </span>
            {analysis.nuclearRelevant && <span className="text-[6px] px-1 rounded bg-purple-500/10 text-purple-400">NUCLEAR</span>}
            {analysis.oilImpact && <span className="text-[6px] px-1 rounded bg-yellow-500/10 text-yellow-400">OIL</span>}
            {analysis.proxyRelevant && <span className="text-[6px] px-1 rounded bg-orange-500/10 text-orange-400">PROXY</span>}
            {analysis.marketSignals.length > 0 && (
              <span className="text-[6px] px-1 rounded bg-green-500/10 text-green-400">{analysis.marketSignals.length} SIG</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function UkraineArticleRow({ article, analysis, isSelected, onSelect }: {
  article: GeoArticle;
  analysis: import('@/lib/geopolitical/ukraine-intelligence').UkraineAnalysis;
  isSelected: boolean;
  onSelect: (a: GeoArticle) => void;
}) {
  return (
    <button
      onClick={() => onSelect(article)}
      className={`w-full text-left p-2 rounded border transition-all ${
        isSelected ? 'border-blue-500/40 bg-blue-500/10' : 'border-nexzen-border/10 hover:border-nexzen-border/30 hover:bg-nexzen-surface/30'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-center gap-0.5 shrink-0 mt-0.5">
          <span className={`text-[7px] px-1 rounded ${
            article.urgency === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
            article.urgency === 'HIGH' ? 'bg-orange-500/15 text-orange-400' :
            article.urgency === 'MEDIUM' ? 'bg-yellow-500/10 text-yellow-400' :
            'bg-nexzen-card/40 text-nexzen-muted'
          }`}>{article.urgency}</span>
          <span className="text-[7px] text-nexzen-muted tabular-nums">{analysis.relevanceScore}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <div className="text-[10px] text-nexzen-text leading-tight line-clamp-2 flex-1">{article.title}</div>
            <span className="text-[7px] text-nexzen-muted tabular-nums shrink-0">{timeAgo(article.seenAt)}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[7px] text-nexzen-muted">{article.source}</span>
            <span className={`text-[6px] px-1 rounded ${UKRAINE_ESCALATION_CONFIG[analysis.escalationPhase].bg} ${UKRAINE_ESCALATION_CONFIG[analysis.escalationPhase].color}`}>
              {UKRAINE_ESCALATION_CONFIG[analysis.escalationPhase].label}
            </span>
            {analysis.nuclearRelevant && <span className="text-[6px] px-1 rounded bg-purple-500/10 text-purple-400">NUCLEAR</span>}
            {analysis.weaponsRelevant && <span className="text-[6px] px-1 rounded bg-cyan-500/10 text-cyan-400">WEAPONS</span>}
            {analysis.frontlineRelevant && <span className="text-[6px] px-1 rounded bg-orange-500/10 text-orange-400">FRONTLINE</span>}
            {analysis.marketSignals.length > 0 && (
              <span className="text-[6px] px-1 rounded bg-green-500/10 text-green-400">{analysis.marketSignals.length} SIG</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function IranEscalationMeter({ escalation }: { escalation: import('@/lib/geopolitical/iran-intelligence').EscalationState }) {
  const config = ESCALATION_CONFIG[escalation.phase];
  const phases: EscalationPhase[] = [
    'BASELINE', 'DIPLOMATIC_TENSION', 'SANCTIONS_WAVE', 'PROXY_ACTIVATION',
    'MILITARY_POSTURE', 'NUCLEAR_ESCALATION', 'DIRECT_CONFRONTATION', 'WAR_FOOTING',
  ];
  const currentIdx = phases.indexOf(escalation.phase);

  return (
    <div className="glass-card p-3" style={{ borderColor: 'rgba(239,68,68,0.15)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-red-400 font-bold">IRAN ESCALATION LADDER</span>
          <span className={`text-[9px] px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
            {config.icon} {config.label} ({escalation.score}/100)
          </span>
        </div>
        {escalation.velocity !== 0 && (
          <span className={`text-[9px] tabular-nums ${escalation.velocity > 0 ? 'text-red-400' : 'text-green-400'}`}>
            {escalation.velocity > 0 ? '↑' : '↓'} {Math.abs(escalation.velocity)}/h
          </span>
        )}
      </div>
      <div className="flex gap-0.5 mb-2">
        {phases.map((phase, i) => {
          const pc = ESCALATION_CONFIG[phase];
          const isActive = i <= currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div
              key={phase}
              className={`flex-1 h-2 rounded-sm transition-all ${
                isCurrent ? `${pc.bg} border border-current animate-pulse` : isActive ? pc.bg : 'bg-nexzen-card/20'
              }`}
              title={`${pc.label}: ${pc.description}`}
            />
          );
        })}
      </div>
      <div className="text-[8px] text-nexzen-muted">{config.description}</div>
    </div>
  );
}

function UkraineEscalationMeter({ escalation }: { escalation: import('@/lib/geopolitical/ukraine-intelligence').UkraineEscalationState }) {
  const config = UKRAINE_ESCALATION_CONFIG[escalation.phase];
  const phases: UkraineEscalationPhase[] = [
    'FROZEN_CONFLICT', 'DIPLOMATIC_PRESSURE', 'SANCTIONS_ESCALATION', 'FRONTLINE_INTENSIFICATION',
    'TERRITORIAL_SHIFT', 'WEAPONS_ESCALATION', 'NUCLEAR_RHETORIC', 'NATO_INVOLVEMENT',
  ];
  const currentIdx = phases.indexOf(escalation.phase);

  return (
    <div className="glass-card p-3" style={{ borderColor: 'rgba(59,130,246,0.15)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-blue-400 font-bold">UKRAINE ESCALATION LADDER</span>
          <span className={`text-[9px] px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
            {config.icon} {config.label} ({escalation.score}/100)
          </span>
        </div>
        {escalation.velocity !== 0 && (
          <span className={`text-[9px] tabular-nums ${escalation.velocity > 0 ? 'text-red-400' : 'text-green-400'}`}>
            {escalation.velocity > 0 ? '↑' : '↓'} {Math.abs(escalation.velocity)}/h
          </span>
        )}
      </div>
      <div className="flex gap-0.5 mb-2">
        {phases.map((phase, i) => {
          const pc = UKRAINE_ESCALATION_CONFIG[phase];
          const isActive = i <= currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div
              key={phase}
              className={`flex-1 h-2 rounded-sm transition-all ${
                isCurrent ? `${pc.bg} border border-current animate-pulse` : isActive ? pc.bg : 'bg-nexzen-card/20'
              }`}
              title={`${pc.label}: ${pc.description}`}
            />
          );
        })}
      </div>
      <div className="text-[8px] text-nexzen-muted">{config.description}</div>
    </div>
  );
}

function NuclearStatusPanel({ escalation }: { escalation: import('@/lib/geopolitical/iran-intelligence').EscalationState }) {
  return (
    <div className="glass-card p-3" style={{ borderColor: 'rgba(168,85,247,0.1)' }}>
      <div className="text-[10px] uppercase tracking-wider text-purple-400 mb-2">NUCLEAR STATUS</div>
      <div className="grid grid-cols-2 gap-2 text-[9px]">
        <div>
          <span className="text-nexzen-muted">Enrichment:</span>
          <span className={`ml-1 ${
            escalation.nuclearStatus.enrichmentLevel === 'WEAPONS_GRADE' ? 'text-red-400' :
            escalation.nuclearStatus.enrichmentLevel === 'HIGH' ? 'text-orange-400' : 'text-nexzen-text'
          }`}>{escalation.nuclearStatus.enrichmentLevel}</span>
        </div>
        <div>
          <span className="text-nexzen-muted">IAEA Access:</span>
          <span className={`ml-1 ${
            escalation.nuclearStatus.iaeaAccess === 'DENIED' ? 'text-red-400' :
            escalation.nuclearStatus.iaeaAccess === 'PARTIAL' ? 'text-amber-400' : 'text-nexzen-text'
          }`}>{escalation.nuclearStatus.iaeaAccess}</span>
        </div>
        <div className="col-span-2">
          <span className="text-nexzen-muted">Breakout Est:</span>
          <span className="ml-1 text-nexzen-text">{escalation.nuclearStatus.breakoutEstimate}</span>
        </div>
      </div>
    </div>
  );
}

function ProxyNetworkPanel({ escalation }: { escalation: import('@/lib/geopolitical/iran-intelligence').EscalationState }) {
  return (
    <div className="glass-card p-3" style={{ borderColor: 'rgba(249,115,22,0.1)' }}>
      <div className="text-[10px] uppercase tracking-wider text-orange-400 mb-2">PROXY NETWORK</div>
      <div className="space-y-1.5">
        {[
          { name: 'Hezbollah', level: escalation.proxyActivity.hezbollah },
          { name: 'Houthis', level: escalation.proxyActivity.houthis },
          { name: 'Iraq PMU', level: escalation.proxyActivity.iraqMilitias },
          { name: 'Syria', level: escalation.proxyActivity.syriaPresence },
        ].map(proxy => (
          <div key={proxy.name} className="flex items-center justify-between">
            <span className="text-[9px] text-nexzen-muted">{proxy.name}</span>
            <span className={`text-[8px] px-1.5 py-0.5 rounded ${
              proxy.level === 'COMBAT' ? 'bg-red-500/15 text-red-400' :
              proxy.level === 'ACTIVE' ? 'bg-orange-500/10 text-orange-400' :
              proxy.level === 'ELEVATED' ? 'bg-yellow-500/10 text-yellow-400' :
              proxy.level === 'LOW' ? 'bg-nexzen-card/40 text-nexzen-muted' :
              'bg-nexzen-card/20 text-nexzen-muted/50'
            }`}>{proxy.level}</span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-1 border-t border-nexzen-border/10">
          <span className="text-[9px] text-nexzen-muted font-bold">Overall</span>
          <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${
            escalation.proxyActivity.overallThreat === 'COMBAT' ? 'bg-red-500/15 text-red-400' :
            escalation.proxyActivity.overallThreat === 'ACTIVE' ? 'bg-orange-500/10 text-orange-400' :
            'bg-nexzen-card/40 text-nexzen-muted'
          }`}>{escalation.proxyActivity.overallThreat}</span>
        </div>
      </div>
    </div>
  );
}

function SourcePerformancePanel({ sources }: { sources: import('@/lib/geopolitical/types').SourcePerformance[] }) {
  return (
    <div className="glass-card p-3" style={{ borderColor: 'rgba(245,158,11,0.08)' }}>
      <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-2">SOURCES</div>
      <div className="space-y-1">
        {sources.sort((a, b) => a.tier - b.tier).map(src => (
          <div key={src.id} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${src.wasHit ? 'bg-green-500' : 'bg-nexzen-muted/20'}`} />
              <span className="text-[8px] text-nexzen-muted">{src.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {src.articlesDelivered > 0 && <span className="text-[7px] text-nexzen-muted tabular-nums">{src.articlesDelivered}</span>}
              {src.responseTimeMs > 0 && (
                <span className={`text-[7px] tabular-nums ${src.responseTimeMs < 1500 ? 'text-green-400/60' : 'text-amber-400/60'}`}>
                  {src.responseTimeMs}ms
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignalCard({ signal }: { signal: WarSignal }) {
  const typeColors: Record<string, string> = {
    'SPEED_EDGE': 'text-green-400 bg-green-500/10 border-green-500/30',
    'MISPRICING': 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    'ESCALATION_SHIFT': 'text-red-400 bg-red-500/10 border-red-500/30',
    'SOURCE_CONVERGENCE': 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    'CONTRARIAN': 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    'PROXY_CASCADE': 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    'NUCLEAR_MILESTONE': 'text-pink-400 bg-pink-500/10 border-pink-500/30',
    'OIL_DISRUPTION': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  };
  const colors = typeColors[signal.type] || 'text-nexzen-muted bg-nexzen-card/20 border-nexzen-border/20';
  const theaterBadge = signal.theater === 'ukraine'
    ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
    : 'bg-red-500/10 text-red-400 border-red-500/30';

  return (
    <div className={`p-3 rounded border ${colors.split(' ').slice(1).join(' ')}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`text-[7px] px-1 py-0.5 rounded border ${theaterBadge} font-bold`}>
            {signal.theater === 'ukraine' ? 'UKR' : 'IRAN'}
          </span>
          <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${colors}`}>{signal.type}</span>
          <span className="text-[8px] text-nexzen-muted tabular-nums">Str: {signal.strength}</span>
          <span className="text-[8px] text-nexzen-muted tabular-nums">Conf: {Math.round(signal.confidence * 100)}%</span>
        </div>
        {signal.actionable && (
          <span className="text-[7px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-bold">ACTIONABLE</span>
        )}
      </div>
      <div className="text-[9px] text-nexzen-text">{signal.description}</div>
      {signal.marketTarget && (
        <div className="flex items-center gap-2 mt-1.5 text-[8px]">
          <span className="text-nexzen-muted">Market:</span>
          <span className="text-nexzen-text">{signal.marketTarget.question.slice(0, 60)}</span>
          <span className={signal.marketTarget.edge > 0 ? 'text-green-400' : 'text-red-400'}>
            Edge: {signal.marketTarget.edge > 0 ? '+' : ''}{Math.round(signal.marketTarget.edge * 100)}%
          </span>
          <span className="text-amber-400">EV: {(signal.marketTarget.expectedValue * 100).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}

function TradeDecisionCard({ decision, onExecute }: { decision: TradeDecision; onExecute: (d: TradeDecision) => void }) {
  return (
    <div className={`p-3 rounded border ${
      decision.action === 'TRADE' ? 'border-green-500/30 bg-green-500/5' :
      decision.action === 'WAIT' ? 'border-amber-500/20 bg-amber-500/5' :
      'border-nexzen-border/10 bg-nexzen-card/10'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-bold ${
            decision.action === 'TRADE' ? 'text-green-400' :
            decision.action === 'WAIT' ? 'text-amber-400' : 'text-nexzen-muted'
          }`}>{decision.action}</span>
          <span className={`text-[8px] ${decision.direction === 'YES' ? 'text-green-400' : 'text-red-400'}`}>
            {decision.direction}
          </span>
          <span className="text-[8px] text-nexzen-muted">@ {(decision.entryPrice * 100).toFixed(0)}%</span>
        </div>
        {decision.action === 'TRADE' && (
          <button
            onClick={() => onExecute(decision)}
            className="text-[8px] px-3 py-1 rounded bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition font-bold"
          >
            EXECUTE ${decision.stake.toFixed(2)}
          </button>
        )}
      </div>
      <div className="text-[8px] text-nexzen-muted">{decision.reasoning}</div>
      <div className="flex items-center gap-3 mt-1 text-[8px]">
        <span className="text-nexzen-muted">R:R {decision.riskReward.toFixed(1)}:1</span>
        <span className="text-nexzen-muted">EV: ${decision.expectedPnL.toFixed(2)}</span>
        <span className="text-nexzen-muted">SL: {(decision.stopLoss * 100).toFixed(0)}%</span>
        <span className="text-nexzen-muted">TP: {(decision.takeProfit * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

function PortfolioStats({ portfolio }: { portfolio: GeoPortfolio }) {
  const s = portfolio.stats;
  return (
    <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
      {[
        { label: 'Capital', value: `$${portfolio.currentCapital.toFixed(2)}`, color: 'text-nexzen-text' },
        { label: 'P&L', value: `${portfolio.totalPnL >= 0 ? '+' : ''}$${portfolio.totalPnL.toFixed(2)}`, color: portfolio.totalPnL >= 0 ? 'text-green-400' : 'text-red-400' },
        { label: 'Return', value: `${s.totalReturn >= 0 ? '+' : ''}${s.totalReturn.toFixed(1)}%`, color: s.totalReturn >= 0 ? 'text-green-400' : 'text-red-400' },
        { label: 'Win Rate', value: s.totalTrades > 0 ? `${(s.winRate * 100).toFixed(0)}%` : '—', color: s.winRate >= 0.55 ? 'text-green-400' : s.winRate > 0 ? 'text-amber-400' : 'text-nexzen-muted' },
        { label: 'Trades', value: `${s.totalTrades}`, color: 'text-nexzen-text' },
        { label: 'W/L', value: `${s.wins}/${s.losses}`, color: 'text-nexzen-text' },
        { label: 'Max DD', value: s.maxDrawdown > 0 ? `-$${s.maxDrawdown.toFixed(2)}` : '—', color: s.maxDrawdownPct > 10 ? 'text-red-400' : 'text-nexzen-muted' },
        { label: 'Sharpe', value: s.totalTrades > 0 ? s.sharpeRatio.toFixed(2) : '—', color: s.sharpeRatio > 1 ? 'text-green-400' : 'text-nexzen-muted' },
        { label: 'Expect', value: s.totalTrades > 0 ? `$${s.expectancy.toFixed(2)}` : '—', color: s.expectancy > 0 ? 'text-green-400' : s.expectancy < 0 ? 'text-red-400' : 'text-nexzen-muted' },
        { label: 'Best', value: s.bestTrade > 0 ? `+$${s.bestTrade.toFixed(2)}` : '—', color: 'text-green-400' },
        { label: 'Worst', value: s.worstTrade < 0 ? `$${s.worstTrade.toFixed(2)}` : '—', color: 'text-red-400' },
        { label: 'Streak', value: s.currentStreak !== 0 ? `${s.currentStreak > 0 ? '+' : ''}${s.currentStreak}` : '—', color: s.currentStreak > 0 ? 'text-green-400' : s.currentStreak < 0 ? 'text-red-400' : 'text-nexzen-muted' },
      ].map(stat => (
        <div key={stat.label} className="text-center">
          <div className={`text-sm font-bold tabular-nums ${stat.color}`}>{stat.value}</div>
          <div className="text-[7px] text-nexzen-muted uppercase">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

function IranTribunalPanel({
  selectedArticle,
  escalation,
  verdicts,
  onNewVerdict,
  iranMarkets,
}: {
  selectedArticle: GeoArticle | null;
  escalation: import('@/lib/geopolitical/iran-intelligence').EscalationState;
  verdicts: IranTribunalResult[];
  onNewVerdict: (v: IranTribunalResult) => void;
  iranMarkets: import('@/hooks/usePolymarketGeo').GeoMarket[];
}) {
  const [isJudging, setIsJudging] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');

  const handleJudge = useCallback(async () => {
    if (!selectedArticle || isJudging) return;
    setIsJudging(true);
    setCurrentResponse('');

    const prompt = generateIranTribunalPrompt(selectedArticle, escalation, iranMarkets);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: IRAN_TRIBUNAL_INSTRUCTIONS },
            { role: 'user', content: prompt },
          ],
          stream: true,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      let fullResponse = '';
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullResponse += chunk;
        setCurrentResponse(fullResponse);
      }

      const verdict = parseIranTribunalResponse(fullResponse, selectedArticle);
      if (verdict) onNewVerdict(verdict);
    } catch (err) {
      setCurrentResponse(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsJudging(false);
    }
  }, [selectedArticle, isJudging, escalation, iranMarkets, onNewVerdict]);

  return (
    <div className="glass-card flex flex-col h-full" style={{ borderColor: 'rgba(239,68,68,0.1)' }}>
      <div className="flex items-center justify-between p-3 border-b border-nexzen-border/20">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-[10px] uppercase tracking-wider text-red-400 font-bold">IRAN ANALYSIS</span>
        </div>
        {selectedArticle && (
          <button
            onClick={handleJudge}
            disabled={isJudging}
            className={`px-3 py-1 text-[9px] rounded border transition-all ${
              isJudging ? 'border-nexzen-border/20 text-nexzen-muted cursor-wait' : 'border-red-500/40 text-red-400 hover:bg-red-500/10'
            }`}
          >
            {isJudging ? 'ANALYZING...' : 'JULGAR'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3" style={{ maxHeight: 'calc(100vh - 300px)' }}>
        {selectedArticle ? (
          <div className="mb-3 p-2 rounded border border-red-500/20 bg-red-500/5">
            <div className="text-[10px] text-nexzen-text font-medium">{selectedArticle.title}</div>
            <div className="text-[8px] text-nexzen-muted mt-1">{selectedArticle.source} | {selectedArticle.urgency}</div>
            {selectedArticle.snippet && (
              <div className="text-[8px] text-nexzen-muted mt-1 line-clamp-3">{selectedArticle.snippet}</div>
            )}
          </div>
        ) : (
          <div className="text-center text-[10px] text-nexzen-muted py-8">Select an article to analyze</div>
        )}

        {currentResponse && (
          <div className="mb-3 p-2 rounded border border-nexzen-border/10 bg-nexzen-card/20">
            <div className="text-[9px] text-nexzen-text whitespace-pre-wrap font-mono leading-relaxed">{currentResponse}</div>
          </div>
        )}

        {verdicts.length > 0 && (
          <div className="space-y-2">
            <div className="text-[9px] text-nexzen-muted uppercase tracking-wider">Recent Verdicts</div>
            {verdicts.slice(0, 10).map((v, i) => (
              <div key={i} className={`p-2 rounded border text-[8px] ${
                v.verdict === 'APORTAR' ? 'border-green-500/20 bg-green-500/5' :
                v.verdict === 'NAO_APORTAR' ? 'border-red-500/20 bg-red-500/5' :
                'border-amber-500/20 bg-amber-500/5'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-bold ${
                    v.verdict === 'APORTAR' ? 'text-green-400' :
                    v.verdict === 'NAO_APORTAR' ? 'text-red-400' : 'text-amber-400'
                  }`}>{v.verdict}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-nexzen-muted">C:{v.confidence}/10</span>
                    <span className="text-nexzen-muted">I:{v.impactScore}/10</span>
                    {v.direction !== 'HOLD' && (
                      <span className={v.direction === 'BUY_YES' ? 'text-green-400' : 'text-red-400'}>{v.direction}</span>
                    )}
                  </div>
                </div>
                <div className="text-nexzen-text line-clamp-1">{v.headline}</div>
                {v.estimatedEdge && v.estimatedEdge !== 'N/A' && (
                  <div className="text-amber-400 mt-0.5">Edge: {v.estimatedEdge}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UkraineTribunalPanel({
  selectedArticle,
  escalation,
  verdicts,
  onNewVerdict,
  ukraineMarkets,
}: {
  selectedArticle: GeoArticle | null;
  escalation: import('@/lib/geopolitical/ukraine-intelligence').UkraineEscalationState;
  verdicts: UkraineTribunalResult[];
  onNewVerdict: (v: UkraineTribunalResult) => void;
  ukraineMarkets: import('@/hooks/useWarMarkets').WarMarket[];
}) {
  const [isJudging, setIsJudging] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');

  // Adapt WarMarket[] to GeoMarket[] shape for the prompt generator
  const marketsForPrompt = useMemo(() => ukraineMarkets.map(m => ({
    ...m,
    prevYesPrice: m.prevYesPrice,
    priceDirection: m.priceDirection,
    priceChangePct: m.priceChangePct,
    category: 'geopolitics' as const,
    lastUpdated: new Date().toISOString(),
  })), [ukraineMarkets]);

  const handleJudge = useCallback(async () => {
    if (!selectedArticle || isJudging) return;
    setIsJudging(true);
    setCurrentResponse('');

    const prompt = generateUkraineTribunalPrompt(selectedArticle, escalation, marketsForPrompt);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: UKRAINE_TRIBUNAL_INSTRUCTIONS },
            { role: 'user', content: prompt },
          ],
          stream: true,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      let fullResponse = '';
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullResponse += chunk;
        setCurrentResponse(fullResponse);
      }

      const verdict = parseUkraineTribunalResponse(fullResponse, selectedArticle);
      if (verdict) onNewVerdict(verdict);
    } catch (err) {
      setCurrentResponse(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsJudging(false);
    }
  }, [selectedArticle, isJudging, escalation, marketsForPrompt, onNewVerdict]);

  return (
    <div className="glass-card flex flex-col h-full" style={{ borderColor: 'rgba(59,130,246,0.1)' }}>
      <div className="flex items-center justify-between p-3 border-b border-nexzen-border/20">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-[10px] uppercase tracking-wider text-blue-400 font-bold">UKRAINE ANALYSIS</span>
        </div>
        {selectedArticle && (
          <button
            onClick={handleJudge}
            disabled={isJudging}
            className={`px-3 py-1 text-[9px] rounded border transition-all ${
              isJudging ? 'border-nexzen-border/20 text-nexzen-muted cursor-wait' : 'border-blue-500/40 text-blue-400 hover:bg-blue-500/10'
            }`}
          >
            {isJudging ? 'ANALYZING...' : 'JULGAR'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3" style={{ maxHeight: 'calc(100vh - 300px)' }}>
        {selectedArticle ? (
          <div className="mb-3 p-2 rounded border border-blue-500/20 bg-blue-500/5">
            <div className="text-[10px] text-nexzen-text font-medium">{selectedArticle.title}</div>
            <div className="text-[8px] text-nexzen-muted mt-1">{selectedArticle.source} | {selectedArticle.urgency}</div>
            {selectedArticle.snippet && (
              <div className="text-[8px] text-nexzen-muted mt-1 line-clamp-3">{selectedArticle.snippet}</div>
            )}
          </div>
        ) : (
          <div className="text-center text-[10px] text-nexzen-muted py-8">Select a Ukraine article to analyze</div>
        )}

        {currentResponse && (
          <div className="mb-3 p-2 rounded border border-nexzen-border/10 bg-nexzen-card/20">
            <div className="text-[9px] text-nexzen-text whitespace-pre-wrap font-mono leading-relaxed">{currentResponse}</div>
          </div>
        )}

        {verdicts.length > 0 && (
          <div className="space-y-2">
            <div className="text-[9px] text-nexzen-muted uppercase tracking-wider">Recent Verdicts</div>
            {verdicts.slice(0, 10).map((v, i) => (
              <div key={i} className={`p-2 rounded border text-[8px] ${
                v.verdict === 'APORTAR' ? 'border-green-500/20 bg-green-500/5' :
                v.verdict === 'NAO_APORTAR' ? 'border-red-500/20 bg-red-500/5' :
                'border-amber-500/20 bg-amber-500/5'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-bold ${
                    v.verdict === 'APORTAR' ? 'text-green-400' :
                    v.verdict === 'NAO_APORTAR' ? 'text-red-400' : 'text-amber-400'
                  }`}>{v.verdict}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-nexzen-muted">C:{v.confidence}/10</span>
                    <span className="text-nexzen-muted">I:{v.impactScore}/10</span>
                    {v.militaryMomentum && (
                      <span className="text-cyan-400">{v.militaryMomentum}</span>
                    )}
                    {v.nuclearRisk && (
                      <span className="text-purple-400">Nuc: {v.nuclearRisk}</span>
                    )}
                  </div>
                </div>
                <div className="text-nexzen-text line-clamp-1">{v.headline}</div>
                {v.estimatedEdge && v.estimatedEdge !== 'N/A' && (
                  <div className="text-amber-400 mt-0.5">Edge: {v.estimatedEdge}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
