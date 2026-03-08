/**
 * Multi-Market Configuration
 *
 * Defines supported trading markets with their data source mappings.
 * Each market specifies:
 *   - Binance symbol for price feed
 *   - Polymarket search keywords for market discovery
 *   - Chainlink price feed details
 *   - Default engine parameters
 */

export interface MarketConfig {
  id: string;                     // Unique market identifier
  name: string;                   // Display name
  symbol: string;                 // Trading pair (e.g. 'BTCUSDT')
  baseAsset: string;              // Base asset (e.g. 'BTC')
  binance: {
    symbol: string;               // Binance trading pair
    klineInterval: string;        // Candlestick interval
  };
  polymarket: {
    searchTerms: string[];        // Keywords for market discovery
    timeframe: string;            // Expected timeframe (e.g. '5 Minutes')
  };
  chainlink: {
    priceFeedLabel: string;       // Chainlink feed name
    decimals: number;             // Price decimals
  };
  engine: {
    predictionCycleMs: number;
    spikeThreshold: number;       // Price move % to trigger micro-update
  };
}

export const MARKETS: MarketConfig[] = [
  {
    id: 'btc-5m',
    name: 'Bitcoin 5min',
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    binance: {
      symbol: 'BTCUSDT',
      klineInterval: '5m',
    },
    polymarket: {
      searchTerms: ['bitcoin', 'btc', 'up or down'],
      timeframe: '5 Minutes',
    },
    chainlink: {
      priceFeedLabel: 'BTC / USD',
      decimals: 8,
    },
    engine: {
      predictionCycleMs: 300_000,
      spikeThreshold: 0.003,
    },
  },
  {
    id: 'eth-5m',
    name: 'Ethereum 5min',
    symbol: 'ETHUSDT',
    baseAsset: 'ETH',
    binance: {
      symbol: 'ETHUSDT',
      klineInterval: '5m',
    },
    polymarket: {
      searchTerms: ['ethereum', 'eth', 'up or down'],
      timeframe: '5 Minutes',
    },
    chainlink: {
      priceFeedLabel: 'ETH / USD',
      decimals: 8,
    },
    engine: {
      predictionCycleMs: 300_000,
      spikeThreshold: 0.004,
    },
  },
  {
    id: 'sol-5m',
    name: 'Solana 5min',
    symbol: 'SOLUSDT',
    baseAsset: 'SOL',
    binance: {
      symbol: 'SOLUSDT',
      klineInterval: '5m',
    },
    polymarket: {
      searchTerms: ['solana', 'sol', 'up or down'],
      timeframe: '5 Minutes',
    },
    chainlink: {
      priceFeedLabel: 'SOL / USD',
      decimals: 8,
    },
    engine: {
      predictionCycleMs: 300_000,
      spikeThreshold: 0.005,
    },
  },
];

export const DEFAULT_MARKET = MARKETS[0]; // BTC 5min

export function getMarketById(id: string): MarketConfig | undefined {
  return MARKETS.find(m => m.id === id);
}

export function getMarketBySymbol(symbol: string): MarketConfig | undefined {
  return MARKETS.find(m => m.symbol === symbol);
}
