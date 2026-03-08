// ── Chainlink Oracle Types ──

export interface ChainlinkRoundData {
  roundId: bigint;
  answer: bigint;
  startedAt: number;
  updatedAt: number;
  answeredInRound: bigint;
}

export interface ChainlinkPrice {
  price: number;
  roundId: string;
  updatedAt: number;       // ms timestamp of on-chain update
  staleness: number;       // ms since last on-chain update
  network: 'arbitrum' | 'ethereum';
  timestamp: number;       // ms timestamp when we fetched it
}

export interface DeltaSnapshot {
  binancePrice: number;
  chainlinkPrice: number;
  delta: number;
  deltaPercent: number;
  deltaDirection: 'binance_leading' | 'chainlink_leading' | 'aligned';
  chainlinkStaleness: number;
  timestamp: number;
}

export interface DeltaAnalysis {
  currentDelta: DeltaSnapshot | null;
  recentDeltas: DeltaSnapshot[];
  avgDeltaPercent: number;
  maxDeltaPercent: number;
  deltaDirection: 'binance_leading' | 'chainlink_leading' | 'aligned';
  chainlinkUpdateImminent: boolean;
  edgeSignal: number;        // -1 to +1
  edgeConfidence: number;    // 0 to 1
  timeSinceLastChainlinkUpdate: number;
}
