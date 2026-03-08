// ── Core Price Data ──

export interface TickerData {
  symbol: string;
  price: number;
  volume24h: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

// ── Technical Indicators ──

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

export interface BollingerBandsResult {
  upper: number;
  middle: number;
  lower: number;
  width: number;
}

export interface VolumeProfile {
  average: number;
  current: number;
  ratio: number;
  isAnomaly: boolean;
}

export interface IndicatorValues {
  rsi: number | null;
  sma20: number | null;
  sma50: number | null;
  macd: MACDResult | null;
  bollingerBands: BollingerBandsResult | null;
  volumeProfile: VolumeProfile | null;
}

// ── Prediction Engine ──

export type PredictionDirection = 'UP' | 'DOWN';
export type ConfidenceLevel = 'LOW' | 'MED' | 'HIGH';

export interface SignalBreakdown {
  rsiSignal: number;
  macdSignal: number;
  smaSignal: number;
  bollingerSignal: number;
  volumeSignal: number;
  polymarketSignal: number;
  chainlinkDeltaSignal: number;
  // Phase 5 signals
  orderBookSignal: number;
  fundingRateSignal: number;
  onChainSignal: number;
  newsSentimentSignal: number;
  mlEnsembleSignal: number;
  aggregateScore: number;
}

export interface Prediction {
  id: string;
  direction: PredictionDirection;
  probability: number;
  confidence: ConfidenceLevel;
  entryPrice: number;
  targetPrice: number;
  timestamp: number;
  expiresAt: number;
  indicators: IndicatorValues;
  polymarketSentiment: number | null;
  chainlinkPrice: number | null;
  chainlinkDelta: number | null;
  resolutionSource: 'chainlink' | 'binance';
  signals: SignalBreakdown;
  reasoning: string[];
}

export type PredictionOutcome = 'WIN' | 'LOSS' | 'PENDING';

export interface PredictionResult extends Prediction {
  outcome: PredictionOutcome;
  exitPrice: number | null;
  pnlPercent: number | null;
}

// ── Performance ──

export interface EquityPoint {
  timestamp: number;
  equity: number;
}

export interface PerformanceStats {
  totalPredictions: number;
  wins: number;
  losses: number;
  winRate: number;
  avgConfidence: number;
  equityCurve: EquityPoint[];
  streakCurrent: number;
  streakBest: number;
  maxDrawdown: number;
}

// ── Paper Trading ──

export interface PaperTradingConfig {
  initialBankroll: number;        // Starting USDC balance
  maxStakePercent: number;        // Max % of bankroll per trade (e.g. 0.05 = 5%)
  kellyFraction: number;          // Kelly criterion fraction (0.25 = quarter-Kelly)
  minStake: number;               // Minimum USDC per trade
  maxStake: number;               // Maximum USDC per trade
  circuitBreakerDrawdown: number; // Stop trading if drawdown exceeds this % (e.g. 0.15 = 15%)
  circuitBreakerLosses: number;   // Stop after N consecutive losses
  spreadCost: number;             // Simulated spread/fee per trade (e.g. 0.02 = 2%)
}

export const DEFAULT_PAPER_TRADING_CONFIG: PaperTradingConfig = {
  initialBankroll: 1000,          // $1000 USDC starting
  maxStakePercent: 0.05,          // 5% max per trade
  kellyFraction: 0.25,            // Quarter-Kelly (conservative)
  minStake: 1,                    // $1 minimum
  maxStake: 50,                   // $50 maximum
  circuitBreakerDrawdown: 0.15,   // Stop at 15% drawdown
  circuitBreakerLosses: 5,        // Stop after 5 consecutive losses
  spreadCost: 0.02,               // 2% spread cost
};

export type PaperTradeStatus = 'OPEN' | 'WON' | 'LOST' | 'SKIPPED';

export interface PaperTrade {
  id: string;
  predictionId: string;
  direction: PredictionDirection;
  confidence: ConfidenceLevel;
  probability: number;
  stake: number;                  // USDC risked
  entryPrice: number;
  exitPrice: number | null;
  yesPrice: number;               // Simulated Polymarket YES price at entry
  payout: number | null;          // USDC received if won
  pnl: number | null;             // Net profit/loss in USDC
  status: PaperTradeStatus;
  skipReason: string | null;      // Why trade was skipped (circuit breaker, low confidence, etc.)
  bankrollBefore: number;
  bankrollAfter: number | null;
  timestamp: number;
  resolvedAt: number | null;
}

export interface PaperTradingStats {
  bankroll: number;
  initialBankroll: number;
  totalTrades: number;
  wins: number;
  losses: number;
  skipped: number;
  winRate: number;
  totalStaked: number;
  totalPnl: number;
  roi: number;                    // totalPnl / totalStaked
  avgStake: number;
  avgPnl: number;
  bestTrade: number;
  worstTrade: number;
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  maxDrawdown: number;
  peakBankroll: number;
  circuitBreakerActive: boolean;
  bankrollHistory: { timestamp: number; bankroll: number }[];
}

// ── Connection ──

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// ── Engine Config ──

export interface EngineConfig {
  weights: {
    rsi: number;
    macd: number;
    sma: number;
    bollinger: number;
    volume: number;
    polymarket: number;
    chainlinkDelta: number;
    orderBook: number;
    fundingRate: number;
    onChain: number;
    newsSentiment: number;
    mlEnsemble: number;
  };
  predictionCycleMs: number;
  minConfidence: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  weights: {
    rsi: 0.08,
    macd: 0.09,
    sma: 0.07,
    bollinger: 0.07,
    volume: 0.06,
    polymarket: 0.07,        // Reduced — circular (predicting market with market price)
    chainlinkDelta: 0.13,    // Core edge — oracle lag detection
    orderBook: 0.12,         // Boosted — high-quality real-time CLOB depth
    fundingRate: 0.07,       // Contrarian indicator
    onChain: 0.07,           // Whale flow detection
    newsSentiment: 0.07,     // Breaking news moves crypto fast
    mlEnsemble: 0.10,        // Meta-learner — grows with data
  },
  predictionCycleMs: 300_000,
  minConfidence: 0.55,
};
