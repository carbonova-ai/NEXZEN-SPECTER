/**
 * Polymarket CLOB Order Execution
 *
 * High-level functions for placing, cancelling, and checking orders
 * on the Polymarket CLOB API.
 */

import { clobFetch, hasClobCredentials } from './auth';
import { signOrder, getWalletAddress, hasWalletKey } from './order-signer';
import type {
  ClobOrderRequest,
  ClobOrderResponse,
  ClobOrderStatusResponse,
  OrderSide,
  TradeResult,
} from './types';

// ── Order Placement ──

/**
 * Place a signed order on the Polymarket CLOB.
 */
export async function placeOrder(
  request: ClobOrderRequest,
  negRisk: boolean = false
): Promise<ClobOrderResponse> {
  if (!hasClobCredentials()) {
    throw new Error('CLOB credentials not configured');
  }
  if (!hasWalletKey()) {
    throw new Error('Wallet private key not configured');
  }

  // Sign the order with EIP-712
  const signedOrder = await signOrder(request, negRisk);
  const owner = getWalletAddress();

  const body = {
    order: signedOrder,
    owner,
    orderType: request.orderType,
  };

  const res = await clobFetch('POST', '/order', body);

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`CLOB order failed (${res.status}): ${errorText}`);
  }

  return res.json();
}

// ── Order Status ──

/**
 * Get the status of an existing order.
 */
export async function getOrderStatus(
  orderId: string
): Promise<ClobOrderStatusResponse> {
  const res = await clobFetch('GET', `/order/${orderId}`);

  if (!res.ok) {
    throw new Error(`Failed to get order status (${res.status})`);
  }

  return res.json();
}

// ── Order Cancellation ──

/**
 * Cancel an existing order.
 */
export async function cancelOrder(orderId: string): Promise<void> {
  const res = await clobFetch('DELETE', `/order/${orderId}`);

  if (!res.ok) {
    throw new Error(`Failed to cancel order (${res.status})`);
  }
}

// ── Open Orders ──

/**
 * Get all open orders for the authenticated wallet.
 */
export async function getOpenOrders(): Promise<ClobOrderStatusResponse[]> {
  const res = await clobFetch('GET', '/orders');

  if (!res.ok) {
    throw new Error(`Failed to fetch open orders (${res.status})`);
  }

  return res.json();
}

// ── High-Level Trade Execution ──

/**
 * Execute a trade on a specific market.
 *
 * @param tokenId - The CLOB token ID for YES or NO outcome
 * @param side - BUY or SELL
 * @param price - Price per outcome token (0-1)
 * @param stakeUsdc - Amount of USDC to risk
 * @param negRisk - Whether this is a neg-risk market
 */
export async function executeTrade(
  tokenId: string,
  side: OrderSide,
  price: number,
  stakeUsdc: number,
  negRisk: boolean = false
): Promise<TradeResult> {
  const timestamp = Date.now();

  try {
    // Calculate size: how many outcome tokens to buy
    // stake / price = number of tokens (each pays $1 if correct)
    const size = stakeUsdc / price;

    const request: ClobOrderRequest = {
      tokenId,
      side,
      price,
      size,
      orderType: 'GTC', // Good Till Cancel
    };

    const response = await placeOrder(request, negRisk);

    return {
      success: true,
      orderId: response.orderID,
      tokenId,
      side,
      price,
      size,
      stake: stakeUsdc,
      error: null,
      timestamp,
    };
  } catch (error) {
    return {
      success: false,
      orderId: null,
      tokenId,
      side,
      price,
      size: 0,
      stake: stakeUsdc,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp,
    };
  }
}

/**
 * Check if live trading is fully configured.
 */
export function isLiveTradingConfigured(): boolean {
  return hasClobCredentials() && hasWalletKey();
}
