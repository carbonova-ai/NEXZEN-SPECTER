// ── Chainlink Price Feed Reader ──

import { getChainlinkClient, rotateRpc } from './client';
import {
  CHAINLINK_BTC_USD_ARBITRUM,
  AGGREGATOR_V3_ABI,
  PRICE_DECIMALS,
  BTC_PRICE_MIN,
  BTC_PRICE_MAX,
  CHAINLINK_HEARTBEAT_S,
  STALE_BUFFER_S,
  CHAINLINK_DEVIATION_THRESHOLD,
} from './config';
import type { ChainlinkPrice } from './types';

const DECIMALS_DIVISOR = 10 ** PRICE_DECIMALS; // 1e8

/**
 * Fetch the latest BTC/USD price from Chainlink on Arbitrum.
 * Retries across RPC endpoints on failure.
 */
export async function fetchLatestPrice(): Promise<ChainlinkPrice> {
  let lastError: unknown;

  // Try up to 3 RPC endpoints
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const client = getChainlinkClient();

      const result = await client.readContract({
        address: CHAINLINK_BTC_USD_ARBITRUM,
        abi: AGGREGATOR_V3_ABI,
        functionName: 'latestRoundData',
      });

      const [roundId, answer, , updatedAt] = result as [bigint, bigint, bigint, bigint, bigint];

      const price = Number(answer) / DECIMALS_DIVISOR;
      const updatedAtMs = Number(updatedAt) * 1000;
      const now = Date.now();

      // Validate price bounds
      if (price < BTC_PRICE_MIN || price > BTC_PRICE_MAX) {
        throw new Error(`Chainlink price out of bounds: $${price}`);
      }

      return {
        price,
        roundId: roundId.toString(),
        updatedAt: updatedAtMs,
        staleness: now - updatedAtMs,
        network: 'arbitrum',
        timestamp: now,
      };
    } catch (err) {
      lastError = err;
      const hasMore = rotateRpc();
      if (!hasMore && attempt >= 2) break;
    }
  }

  throw lastError ?? new Error('Failed to fetch Chainlink price');
}

/**
 * Check if the Chainlink price feed is stale (beyond heartbeat + buffer).
 */
export function isChainlinkStale(updatedAtMs: number): boolean {
  const maxAge = (CHAINLINK_HEARTBEAT_S + STALE_BUFFER_S) * 1000;
  return Date.now() - updatedAtMs > maxAge;
}

/**
 * Estimate milliseconds until next Chainlink update based on:
 * 1. Deviation threshold (0.5%) — if current exchange price diverges enough
 * 2. Heartbeat (3600s) — guaranteed periodic update
 */
export function estimateNextUpdate(
  currentBinancePrice: number,
  lastChainlinkPrice: number,
  lastUpdateTimeMs: number
): { estimatedMs: number; reason: 'deviation' | 'heartbeat' | 'unknown' } {
  const deviation = Math.abs(currentBinancePrice - lastChainlinkPrice) / lastChainlinkPrice;
  const timeSinceUpdate = Date.now() - lastUpdateTimeMs;
  const heartbeatMs = CHAINLINK_HEARTBEAT_S * 1000;

  // If deviation exceeds threshold, update could happen any moment
  if (deviation >= CHAINLINK_DEVIATION_THRESHOLD) {
    return { estimatedMs: 0, reason: 'deviation' };
  }

  // If approaching deviation threshold (>80% of the way), update likely soon
  if (deviation >= CHAINLINK_DEVIATION_THRESHOLD * 0.8) {
    return { estimatedMs: 5_000, reason: 'deviation' };
  }

  // Otherwise, estimate based on heartbeat
  const remainingHeartbeat = Math.max(0, heartbeatMs - timeSinceUpdate);
  if (remainingHeartbeat < 60_000) {
    return { estimatedMs: remainingHeartbeat, reason: 'heartbeat' };
  }

  return { estimatedMs: remainingHeartbeat, reason: 'heartbeat' };
}
