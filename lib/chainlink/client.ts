// ── Chainlink viem Client ──

import { createPublicClient, http, type PublicClient, type Chain } from 'viem';
import { arbitrum } from 'viem/chains';
import { RPC_ENDPOINTS } from './config';

let clientCache: { client: PublicClient; rpcIndex: number } | null = null;

function buildClient(rpcIndex: number): PublicClient {
  const rpcUrl = RPC_ENDPOINTS[rpcIndex] ?? RPC_ENDPOINTS[0];

  return createPublicClient({
    chain: arbitrum as Chain,
    transport: http(rpcUrl, {
      timeout: 5_000,
      retryCount: 2,
      retryDelay: 500,
    }),
    batch: { multicall: true },
  });
}

export function getChainlinkClient(): PublicClient {
  if (!clientCache) {
    clientCache = { client: buildClient(0), rpcIndex: 0 };
  }
  return clientCache.client;
}

/**
 * Rotate to the next RPC endpoint on failure.
 * Returns true if there are more endpoints to try.
 */
export function rotateRpc(): boolean {
  const nextIndex = (clientCache?.rpcIndex ?? 0) + 1;
  if (nextIndex >= RPC_ENDPOINTS.length) {
    // Reset to first endpoint
    clientCache = { client: buildClient(0), rpcIndex: 0 };
    return false;
  }
  clientCache = { client: buildClient(nextIndex), rpcIndex: nextIndex };
  return true;
}
