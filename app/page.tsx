'use client';

import { useState, useEffect, useMemo } from 'react';
import type { EngineConfig } from '@/lib/types';
import { useBinanceStream } from '@/hooks/useBinanceStream';
import { usePolymarketData } from '@/hooks/usePolymarketData';
import { useChainlinkPrice } from '@/hooks/useChainlinkPrice';
import { useDeltaEngine } from '@/hooks/useDeltaEngine';
import { usePredictionEngine } from '@/hooks/usePredictionEngine';
import { usePaperTrading } from '@/hooks/usePaperTrading';
import { useLiveTrading } from '@/hooks/useLiveTrading';
import { useAdaptiveEngine } from '@/hooks/useAdaptiveEngine';
import { useNotifications } from '@/hooks/useNotifications';
import { useHealthMonitor } from '@/hooks/useHealthMonitor';
import { useMarketSelector } from '@/hooks/useMarketSelector';
// Phase 5 hooks
import { useOrderBook } from '@/hooks/useOrderBook';
import { useFundingRate } from '@/hooks/useFundingRate';
import { useOnChainSignal } from '@/hooks/useOnChainSignal';
import { useNewsSentiment } from '@/hooks/useNewsSentiment';

import { StatusBar } from '@/components/dashboard/StatusBar';
import { PriceCard } from '@/components/dashboard/PriceCard';
import { PredictionCard } from '@/components/dashboard/PredictionCard';
import { CandlestickChart } from '@/components/dashboard/CandlestickChart';
import { SignalHistory } from '@/components/dashboard/SignalHistory';
import { PerformanceCard } from '@/components/dashboard/PerformanceCard';
import { PolymarketPanel } from '@/components/dashboard/PolymarketPanel';
import { PaperTradingCard } from '@/components/dashboard/PaperTradingCard';
import { LiveTradingCard } from '@/components/dashboard/LiveTradingCard';
import { AdaptiveEngineCard } from '@/components/dashboard/AdaptiveEngineCard';
import { HealthPanel } from '@/components/dashboard/HealthPanel';
import { EquityCurveChart } from '@/components/dashboard/EquityCurveChart';
import { SignalHeatmap } from '@/components/dashboard/SignalHeatmap';
import { RegimeTimeline } from '@/components/dashboard/RegimeTimeline';
import { MarketSelector } from '@/components/dashboard/MarketSelector';
import { IntelligencePanel } from '@/components/dashboard/IntelligencePanel';
import { FooterBar } from '@/components/dashboard/FooterBar';

import { computeMLSignal } from '@/lib/signals/ml-ensemble';

export default function Dashboard() {
  // 1. Binance combined stream (ticker + kline + aggTrade in single WS)
  const { ticker, candles, status: binanceStatus, latency, tradePrice, priceIntegrity } = useBinanceStream();

  // 2. Polymarket data with embedded WebSocket (real-time sentiment)
  const {
    markets,
    sentimentScore,
    midpoints,
    isLoading: polyLoading,
    error: polyError,
    wsStatus: polyWsStatus,
  } = usePolymarketData();

  // 3. Chainlink oracle price feed (Arbitrum L2, polls every 3s)
  const { price: chainlinkPrice, status: chainlinkStatus } = useChainlinkPrice();

  // 4. Delta engine: Binance vs Chainlink divergence analysis
  const { delta, edgeSignal } = useDeltaEngine(
    tradePrice ?? ticker?.price ?? null,
    chainlinkPrice
  );

  // ── Phase 5: Intelligence Signals ──

  // 5a. Order Book Intelligence — CLOB depth + whale detection
  const firstTokenId = markets?.[0]?.clobTokenIds?.[0] ?? null;
  const { analysis: orderBookAnalysis, signal: orderBookSignal } = useOrderBook(firstTokenId);

  // 5b. Funding Rate — Binance perpetual contrarian signal
  const { analysis: fundingRateAnalysis, signal: fundingRateSignal } = useFundingRate();

  // 5c. On-Chain Analytics — whale exchange flows
  const { analysis: onChainAnalysis, signal: onChainSignal } = useOnChainSignal();

  // 5d. News Sentiment — crypto headline scoring
  const { analysis: newsSentimentAnalysis, signal: newsSentimentSignal } = useNewsSentiment();

  // Adaptive config state bridge
  const [adaptiveConfigState, setAdaptiveConfigState] = useState<EngineConfig | null>(null);

  // 5. Prediction engine with all signals
  const {
    currentPrediction,
    history,
    performance,
    nextPredictionIn,
  } = usePredictionEngine(
    candles,
    tradePrice ?? ticker?.price ?? null,
    sentimentScore,
    edgeSignal,
    chainlinkPrice?.price ?? null,
    adaptiveConfigState,
    {
      orderBook: orderBookSignal,
      fundingRate: fundingRateSignal,
      onChain: onChainSignal,
      newsSentiment: newsSentimentSignal,
      mlEnsemble: null, // Computed below after prediction engine runs
    }
  );

  // 5e. ML Ensemble — meta-learner (runs after prediction engine has signals)
  const mlResult = useMemo(() => {
    if (!currentPrediction?.signals) return null;
    return computeMLSignal(currentPrediction.signals, history);
  }, [currentPrediction?.signals, history]);

  // 6. Adaptive engine
  const {
    adaptiveConfig,
    optimization,
    regime,
    alerts,
    adaptiveEnabled,
    toggleAdaptive,
    forceOptimize,
  } = useAdaptiveEngine(history, performance);

  // Sync adaptive config → prediction engine
  useEffect(() => {
    setAdaptiveConfigState(adaptiveConfig);
  }, [adaptiveConfig]);

  // 7. Paper trading engine
  const { stats: paperStats, lastTrade, resetCircuitBreaker } = usePaperTrading(
    currentPrediction,
    history
  );

  // 8. Live trading engine
  const {
    stats: liveStats,
    lastTrade: liveLastTrade,
    configured: liveConfigured,
    toggleEnabled: liveToggle,
    resetCircuitBreaker: liveResetCB,
  } = useLiveTrading(
    currentPrediction,
    history,
    markets,
    midpoints
  );

  // Derive polymarket connection status
  const polyStatus = polyError ? 'error' as const : polyLoading ? 'connecting' as const : polyWsStatus;

  // 9. Notifications
  useNotifications(
    alerts,
    regime,
    history,
    lastTrade,
    paperStats?.circuitBreakerActive ?? false
  );

  // 10. Health monitor
  const { health } = useHealthMonitor(
    binanceStatus,
    polyStatus,
    chainlinkStatus,
    latency,
    performance.totalPredictions
  );

  // 11. Market selector
  const { activeMarket, selectMarket, availableMarkets } = useMarketSelector();

  return (
    <div className="flex flex-col min-h-screen bg-nexzen-bg">
      {/* Header */}
      <StatusBar
        binanceStatus={binanceStatus}
        polymarketStatus={polyStatus}
        chainlinkStatus={chainlinkStatus}
        polymarketError={polyError}
      >
        <MarketSelector
          activeMarket={activeMarket}
          availableMarkets={availableMarkets}
          onSelect={selectMarket}
        />
      </StatusBar>

      {/* Main Content */}
      <main className="flex-1 p-3 md:p-4 space-y-3 md:space-y-4 max-w-[1600px] mx-auto w-full">
        {/* Top Row: Price + Prediction + Polymarket */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <PriceCard
            ticker={ticker}
            chainlinkPrice={chainlinkPrice?.price ?? null}
            chainlinkDelta={delta?.currentDelta?.deltaPercent ?? null}
          />
          <PredictionCard
            prediction={currentPrediction}
            nextPredictionIn={nextPredictionIn}
          />
          <PolymarketPanel
            markets={markets}
            midpoints={midpoints}
            sentimentScore={sentimentScore}
            isLoading={polyLoading}
            error={polyError}
          />
        </div>

        {/* Chart */}
        <CandlestickChart candles={candles} predictions={history} />

        {/* Middle Row: Paper Trading + Live Trading */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          <PaperTradingCard
            stats={paperStats}
            lastTrade={lastTrade}
            onResetCircuitBreaker={resetCircuitBreaker}
          />
          <LiveTradingCard
            stats={liveStats}
            lastTrade={liveLastTrade}
            configured={liveConfigured}
            onToggleEnabled={liveToggle}
            onResetCircuitBreaker={liveResetCB}
          />
        </div>

        {/* Analytics Row: Equity Curve + Signal Heatmap */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <div className="md:col-span-2">
            <EquityCurveChart history={history} />
          </div>
          <SignalHeatmap history={history} />
        </div>

        {/* Bottom Row: History + Performance + Adaptive Engine */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <SignalHistory history={history} />
          <PerformanceCard performance={performance} />
          <AdaptiveEngineCard
            optimization={optimization}
            regime={regime}
            alerts={alerts}
            adaptiveEnabled={adaptiveEnabled}
            onToggleAdaptive={toggleAdaptive}
            onForceOptimize={forceOptimize}
          />
        </div>

        {/* Intelligence Row: Intelligence Panel + Health + Regime */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <IntelligencePanel
            orderBook={orderBookAnalysis}
            fundingRate={fundingRateAnalysis}
            onChain={onChainAnalysis}
            newsSentiment={newsSentimentAnalysis}
            mlAccuracy={mlResult?.state.accuracy ?? null}
          />
          <HealthPanel health={health} />
          <RegimeTimeline history={history} />
        </div>
      </main>

      {/* Footer */}
      <FooterBar
        latency={latency}
        totalCycles={performance.totalPredictions}
        polymarketOnline={!polyError}
        priceIntegrity={priceIntegrity}
        chainlinkDelta={delta?.currentDelta?.deltaPercent ?? null}
        chainlinkOnline={chainlinkStatus === 'connected'}
      />
    </div>
  );
}
