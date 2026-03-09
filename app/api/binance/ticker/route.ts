import { NextRequest, NextResponse } from 'next/server';

// Use lightweight /ticker/price for fast polling, full /ticker/24hr for initial load
const BINANCE_PRICE_API = 'https://api.binance.com/api/v3/ticker/price';
const BINANCE_TICKER_API = 'https://api.binance.com/api/v3/ticker/24hr';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol') || 'BTCUSDT';
  const fast = request.nextUrl.searchParams.get('fast') === '1';

  try {
    if (fast) {
      // Lightweight price-only endpoint (~50ms vs ~200ms for full ticker)
      const res = await fetch(
        `${BINANCE_PRICE_API}?symbol=${encodeURIComponent(symbol)}`,
        { cache: 'no-store', signal: AbortSignal.timeout(3000) }
      );
      if (!res.ok) {
        return NextResponse.json({ error: 'Binance API error' }, { status: res.status });
      }
      const data = await res.json();
      return NextResponse.json({
        price: parseFloat(data.price),
        timestamp: Date.now(),
      }, {
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
    }

    // Full ticker with 24h stats
    const res = await fetch(
      `${BINANCE_TICKER_API}?symbol=${encodeURIComponent(symbol)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) {
      return NextResponse.json({ error: 'Binance API error' }, { status: res.status });
    }

    const data = await res.json();

    return NextResponse.json({
      symbol: data.symbol,
      price: parseFloat(data.lastPrice),
      volume24h: parseFloat(data.quoteVolume),
      priceChange24h: parseFloat(data.priceChange),
      priceChangePercent24h: parseFloat(data.priceChangePercent),
      high24h: parseFloat(data.highPrice),
      low24h: parseFloat(data.lowPrice),
      timestamp: data.closeTime,
    }, {
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
  } catch (err) {
    console.error('[Binance Ticker]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to fetch ticker' }, { status: 502 });
  }
}
