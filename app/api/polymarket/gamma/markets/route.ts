import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/app/api/polymarket/_lib/rate-limiter';

const GAMMA_BASE = 'https://gamma-api.polymarket.com';

export async function GET(request: NextRequest) {
  const { allowed, remaining } = checkRateLimit();
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const { searchParams } = request.nextUrl;
  const params = new URLSearchParams();

  for (const key of ['slug', 'tag_id', 'closed', 'active', 'order', 'ascending', 'limit', 'offset']) {
    const val = searchParams.get(key);
    if (val !== null) params.set(key, val);
  }

  try {
    const url = `${GAMMA_BASE}/markets?${params.toString()}`;
    const response = await fetch(url, { next: { revalidate: 30 }, signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Gamma API error' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=15',
        'X-RateLimit-Remaining': String(remaining),
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch markets' },
      { status: 502 }
    );
  }
}
