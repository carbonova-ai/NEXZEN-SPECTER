// ── Chainlink Configuration ──

export const CHAINLINK_BTC_USD_ARBITRUM = '0x6ce185860a4963106506C203335A2910413708e9' as const;
export const CHAINLINK_BTC_USD_ETHEREUM = '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c' as const;

export const PRICE_DECIMALS = 8;

// Polling & timing
export const POLL_INTERVAL_MS = 3_000;
export const CHAINLINK_HEARTBEAT_S = 3_600;
export const STALE_BUFFER_S = 60;

// Delta thresholds
export const CHAINLINK_DEVIATION_THRESHOLD = 0.005;   // 0.5% triggers on-chain update
export const DELTA_SIGNIFICANT_THRESHOLD = 0.001;      // 0.1% = meaningful delta
export const DELTA_EDGE_THRESHOLD = 0.002;              // 0.2% = strong edge signal
export const DELTA_IMMINENT_THRESHOLD = 0.004;          // 0.4% = update imminent

// Price validation (same bounds as Binance)
export const BTC_PRICE_MIN = 1_000;
export const BTC_PRICE_MAX = 1_000_000;

// RPC endpoints (Arbitrum One)
export const RPC_ENDPOINTS: string[] = [
  process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL,
  'https://arb1.arbitrum.io/rpc',
  'https://arbitrum.llamarpc.com',
].filter(Boolean) as string[];

// Minimal AggregatorV3Interface ABI
export const AGGREGATOR_V3_ABI = [
  {
    inputs: [],
    name: 'latestRoundData',
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
