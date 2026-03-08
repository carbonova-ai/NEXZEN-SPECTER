/**
 * On-Chain Analytics Signal
 *
 * Tracks large BTC transactions and exchange flows to detect whale activity.
 *
 * Logic:
 * - Large inflows to exchanges → selling pressure → bearish
 * - Large outflows from exchanges → accumulation → bullish
 * - Whale transfers between wallets → neutral (could go either way)
 *
 * Signal: -1 (net exchange inflows / bearish) to +1 (net outflows / bullish)
 */

export interface WhaleTransaction {
  hash: string;
  value: number;           // BTC amount
  fromExchange: boolean;
  toExchange: boolean;
  timestamp: number;
}

export interface OnChainAnalysis {
  signal: number;           // -1 to +1
  netFlow: number;          // Positive = inflow to exchanges, negative = outflow
  largeTransactions: number;
  exchangeInflows: number;  // BTC flowing into exchanges
  exchangeOutflows: number; // BTC flowing out of exchanges
  whaleActivity: 'HIGH' | 'MODERATE' | 'LOW';
  lastUpdate: number;
}

// Known exchange addresses (simplified — in production, use a full database)
const EXCHANGE_KEYWORDS = [
  'binance', 'coinbase', 'kraken', 'bitfinex', 'okx',
  'bybit', 'huobi', 'kucoin', 'gemini', 'bitstamp',
];

const WHALE_THRESHOLD_BTC = 100;   // > 100 BTC = whale transaction
const LARGE_TX_THRESHOLD = 10;     // > 10 BTC = large transaction

/**
 * Analyze on-chain data and generate a signal.
 */
export function analyzeOnChainData(transactions: WhaleTransaction[]): OnChainAnalysis {
  if (transactions.length === 0) {
    return {
      signal: 0,
      netFlow: 0,
      largeTransactions: 0,
      exchangeInflows: 0,
      exchangeOutflows: 0,
      whaleActivity: 'LOW',
      lastUpdate: Date.now(),
    };
  }

  let exchangeInflows = 0;
  let exchangeOutflows = 0;
  let largeTransactions = 0;

  for (const tx of transactions) {
    if (tx.value >= LARGE_TX_THRESHOLD) largeTransactions++;

    if (tx.toExchange && !tx.fromExchange) {
      // Inflow to exchange (potential selling)
      exchangeInflows += tx.value;
    } else if (tx.fromExchange && !tx.toExchange) {
      // Outflow from exchange (potential accumulation)
      exchangeOutflows += tx.value;
    }
  }

  const netFlow = exchangeInflows - exchangeOutflows;
  const totalFlow = exchangeInflows + exchangeOutflows;

  // Signal from net flow direction
  let signal = 0;
  if (totalFlow > 0) {
    // Normalize: net inflows = bearish, net outflows = bullish
    signal = -netFlow / totalFlow; // Flip sign: inflow → negative signal
  }

  // Scale by whale activity
  const whaleTxCount = transactions.filter(tx => tx.value >= WHALE_THRESHOLD_BTC).length;
  const whaleActivity: OnChainAnalysis['whaleActivity'] =
    whaleTxCount >= 5 ? 'HIGH' : whaleTxCount >= 2 ? 'MODERATE' : 'LOW';

  // Amplify signal if whale activity is high
  if (whaleActivity === 'HIGH') signal *= 1.3;
  else if (whaleActivity === 'MODERATE') signal *= 1.1;

  // Clamp
  signal = Math.max(-1, Math.min(1, signal));

  return {
    signal,
    netFlow,
    largeTransactions,
    exchangeInflows,
    exchangeOutflows,
    whaleActivity,
    lastUpdate: Date.now(),
  };
}

/**
 * Fetch on-chain data from our API.
 */
export async function fetchOnChainSignal(): Promise<OnChainAnalysis | null> {
  try {
    const res = await fetch('/api/signals/on-chain');
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

export { EXCHANGE_KEYWORDS };
