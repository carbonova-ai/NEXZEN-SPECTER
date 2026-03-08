'use client';

import { useBinanceStream } from '@/hooks/useBinanceStream';
import { usePolymarketData } from '@/hooks/usePolymarketData';
import { usePredictionEngine } from '@/hooks/usePredictionEngine';

import { StatusBar } from '@/components/dashboard/StatusBar';
import { PriceCard } from '@/components/dashboard/PriceCard';
import { PredictionCard } from '@/components/dashboard/PredictionCard';
import { CandlestickChart } from '@/components/dashboard/CandlestickChart';
import { SignalHistory } from '@/components/dashboard/SignalHistory';
import { PerformanceCard } from '@/components/dashboard/PerformanceCard';
import { PolymarketPanel } from '@/components/dashboard/PolymarketPanel';
import { FooterBar } from '@/components/dashboard/FooterBar';

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

  // 3. Prediction engine with spike detection (uses tick-by-tick trade price)
  const {
    currentPrediction,
    history,
    performance,
    nextPredictionIn,
  } = usePredictionEngine(
    candles,
    tradePrice ?? ticker?.price ?? null,
    sentimentScore
  );

  // Derive polymarket connection status
  const polyStatus = polyError ? 'error' as const : polyLoading ? 'connecting' as const : polyWsStatus;

  return (
    <div className="flex flex-col min-h-screen bg-nexzen-bg">
      {/* Header */}
      <StatusBar
        binanceStatus={binanceStatus}
        polymarketStatus={polyStatus}
        polymarketError={polyError}
      />

      {/* Main Content */}
      <main className="flex-1 p-3 md:p-4 space-y-3 md:space-y-4 max-w-[1600px] mx-auto w-full">
        {/* Top Row: Price + Prediction + Polymarket */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <PriceCard ticker={ticker} />
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

        {/* Bottom Row: History + Performance */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          <SignalHistory history={history} />
          <PerformanceCard performance={performance} />
        </div>
      </main>

      {/* Footer */}
      <FooterBar
        latency={latency}
        totalCycles={performance.totalPredictions}
        polymarketOnline={!polyError}
        priceIntegrity={priceIntegrity}
      />
    </div>
  );
}
