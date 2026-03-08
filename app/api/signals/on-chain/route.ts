/**
 * On-Chain Analytics API
 *
 * Fetches large BTC transactions from public blockchain APIs.
 * Uses Blockchain.com API (no key required).
 *
 * GET /api/signals/on-chain
 */

import { NextResponse } from 'next/server';
import { analyzeOnChainData, type WhaleTransaction } from '@/lib/signals/on-chain';

const BTC_LARGE_TX_THRESHOLD = 10; // BTC
const BLOCKCHAIN_API = 'https://blockchain.info';

// Known exchange addresses (partial list for demo)
const KNOWN_EXCHANGE_ADDRESSES = new Set([
  // Binance hot wallets
  '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo',
  'bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3',
  // Coinbase
  '3Kzh9qAqVWQhEsfQz7zEQL1EuSx5tyNLNS',
  // Bitfinex
  'bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97',
]);

async function fetchLargeTransactions(): Promise<WhaleTransaction[]> {
  try {
    // Fetch unconfirmed transactions (mempool)
    const res = await fetch(`${BLOCKCHAIN_API}/unconfirmed-transactions?format=json&limit=50`, {
      next: { revalidate: 60 }, // Cache 1 minute
    });

    if (!res.ok) return [];

    const data = await res.json();
    const txs: WhaleTransaction[] = [];

    for (const tx of data.txs ?? []) {
      // Calculate total BTC value
      const totalOut = (tx.out ?? []).reduce(
        (s: number, o: { value?: number }) => s + (o.value ?? 0), 0
      ) / 1e8; // satoshis → BTC

      if (totalOut < BTC_LARGE_TX_THRESHOLD) continue;

      // Check if any input/output is a known exchange
      const inputAddresses = (tx.inputs ?? [])
        .map((i: { prev_out?: { addr?: string } }) => i.prev_out?.addr)
        .filter(Boolean);
      const outputAddresses = (tx.out ?? [])
        .map((o: { addr?: string }) => o.addr)
        .filter(Boolean);

      const fromExchange = inputAddresses.some((a: string) => KNOWN_EXCHANGE_ADDRESSES.has(a));
      const toExchange = outputAddresses.some((a: string) => KNOWN_EXCHANGE_ADDRESSES.has(a));

      txs.push({
        hash: tx.hash ?? '',
        value: totalOut,
        fromExchange,
        toExchange,
        timestamp: (tx.time ?? Math.floor(Date.now() / 1000)) * 1000,
      });
    }

    return txs;
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const transactions = await fetchLargeTransactions();
    const analysis = analyzeOnChainData(transactions);
    return NextResponse.json(analysis);
  } catch {
    return NextResponse.json({
      signal: 0,
      netFlow: 0,
      largeTransactions: 0,
      exchangeInflows: 0,
      exchangeOutflows: 0,
      whaleActivity: 'LOW',
      lastUpdate: Date.now(),
    });
  }
}
