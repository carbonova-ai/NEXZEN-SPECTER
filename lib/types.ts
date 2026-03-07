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
  };
  predictionCycleMs: number;
  minConfidence: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  weights: {
    rsi: 0.20,
    macd: 0.20,
    sma: 0.15,
    bollinger: 0.15,
    volume: 0.10,
    polymarket: 0.20,
  },
  predictionCycleMs: 300_000,
  minConfidence: 0.55,
};
