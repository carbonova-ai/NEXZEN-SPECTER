import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/app/api/polymarket/_lib/rate-limiter';

const CLOB_BASE = 'https://clob.polymarket.com';

export async function GET(request: NextRequest) {
  const { allowed, remaining } = checkRateLimit();
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const { searchParams } = request.nextUrl;
  const tokenId = searchParams.get('token_id');
  const granularity = searchParams.get('granularity') || '1h';

  if (!tokenId) {
    return NextResponse.json({ error: 'token_id required' }, { status: 400 });
  }

  // Cache duration based on granularity
  const cacheMap: Record<string, number> = {
    '1m': 10, '5m': 30, '15m': 60, '1h': 300, '6h': 600, '1d': 3600, '1w': 3600,
  };
  const maxAge = cacheMap[granularity] ?? 60;

  try {
    const params = new URLSearchParams({
      token_id: tokenId,
      granularity,
    });

    const startTime = searchParams.get('start_time');
    const endTime = searchParams.get('end_time');
    if (startTime) params.set('start_time', startTime);
    if (endTime) params.set('end_time', endTime);

    const url = `${CLOB_BASE}/prices-history?${params.toString()}`;
    const response = await fetch(url, { next: { revalidate: maxAge } });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'CLOB API error' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${Math.floor(maxAge / 2)}`,
        'X-RateLimit-Remaining': String(remaining),
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch price history' },
      { status: 502 }
    );
  }
}
