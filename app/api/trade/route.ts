import { NextRequest, NextResponse } from 'next/server';
import { executeTrade, isLiveTradingConfigured, getOrderStatus, cancelOrder } from '@/lib/polymarket/order-execution';
import type { TradeRequest } from '@/lib/polymarket/types';

/**
 * POST /api/trade — Execute a trade on Polymarket CLOB
 *
 * Body: {
 *   tokenId: string,       // CLOB token ID (YES or NO)
 *   side: "BUY" | "SELL",
 *   price: number,          // 0-1
 *   stakeUsdc: number,      // USDC amount
 *   negRisk?: boolean
 * }
 */
export async function POST(request: NextRequest) {
  if (!isLiveTradingConfigured()) {
    return NextResponse.json(
      { error: 'Live trading not configured. Set POLYMARKET_API_KEY, POLYMARKET_API_SECRET, POLYMARKET_API_PASSPHRASE, and POLYGON_PRIVATE_KEY in .env.local' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();

    const { tokenId, side, price, stakeUsdc, negRisk } = body;

    // Validate inputs
    if (!tokenId || typeof tokenId !== 'string') {
      return NextResponse.json({ error: 'tokenId required' }, { status: 400 });
    }
    if (side !== 'BUY' && side !== 'SELL') {
      return NextResponse.json({ error: 'side must be BUY or SELL' }, { status: 400 });
    }
    if (typeof price !== 'number' || price <= 0 || price >= 1) {
      return NextResponse.json({ error: 'price must be between 0 and 1' }, { status: 400 });
    }
    if (typeof stakeUsdc !== 'number' || stakeUsdc <= 0) {
      return NextResponse.json({ error: 'stakeUsdc must be positive' }, { status: 400 });
    }

    // Safety: max $100 per trade in Phase 2
    if (stakeUsdc > 100) {
      return NextResponse.json(
        { error: 'Max trade size is $100 USDC (Phase 2 safety limit)' },
        { status: 400 }
      );
    }

    const result = await executeTrade(tokenId, side, price, stakeUsdc, negRisk ?? false);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, result },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Trade API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/trade?orderId=xxx — Check order status
 */
export async function GET(request: NextRequest) {
  if (!isLiveTradingConfigured()) {
    return NextResponse.json({ configured: false }, { status: 200 });
  }

  const orderId = request.nextUrl.searchParams.get('orderId');

  if (!orderId) {
    // Return config status
    return NextResponse.json({ configured: true });
  }

  try {
    const status = await getOrderStatus(orderId);
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get status' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/trade?orderId=xxx — Cancel an order
 */
export async function DELETE(request: NextRequest) {
  if (!isLiveTradingConfigured()) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const orderId = request.nextUrl.searchParams.get('orderId');
  if (!orderId) {
    return NextResponse.json({ error: 'orderId required' }, { status: 400 });
  }

  try {
    await cancelOrder(orderId);
    return NextResponse.json({ success: true, orderId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel' },
      { status: 500 }
    );
  }
}
