/**
 * Binance Funding Rate API
 *
 * Proxies Binance Futures funding rate data.
 * GET /api/binance/funding-rate?symbol=BTCUSDT
 */

import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol') || 'BTCUSDT';

  try {
    // Fetch latest funding rate from Binance Futures
    const [fundingRes, markRes] = await Promise.all([
      fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`, {
        next: { revalidate: 30 }, signal: AbortSignal.timeout(5000),
      }),
      fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`, {
        next: { revalidate: 10 }, signal: AbortSignal.timeout(5000),
      }),
    ]);

    if (!fundingRes.ok) {
      return NextResponse.json({ error: 'Binance funding rate unavailable' }, { status: 502 });
    }

    const funding = await fundingRes.json();
    const mark = markRes.ok ? await markRes.json() : null;

    const latest = Array.isArray(funding) ? funding[0] : funding;

    return NextResponse.json({
      symbol,
      fundingRate: parseFloat(latest?.fundingRate ?? '0'),
      fundingTime: parseInt(latest?.fundingTime ?? '0'),
      markPrice: mark ? parseFloat(mark.markPrice ?? '0') : 0,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch funding rate' }, { status: 500 });
  }
}
