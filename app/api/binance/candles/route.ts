import { NextRequest, NextResponse } from 'next/server';

const BINANCE_API = 'https://api.binance.com/api/v3/klines';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const symbol = searchParams.get('symbol') || 'BTCUSDT';
  const interval = searchParams.get('interval') || '5m';
  const limit = searchParams.get('limit') || '100';

  try {
    const url = `${BINANCE_API}?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${encodeURIComponent(limit)}`;
    const response = await fetch(url, { next: { revalidate: 10 }, signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Binance API error' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Transform Binance kline format to our CandleData format
    // Binance returns: [openTime, open, high, low, close, volume, closeTime, quoteVolume, ...]
    const candles = data.map((k: (string | number)[]) => ({
      timestamp: k[0] as number,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }));

    return NextResponse.json(candles, {
      headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=5' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch candles' },
      { status: 502 }
    );
  }
}
