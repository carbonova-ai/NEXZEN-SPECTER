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

  const tokenId = request.nextUrl.searchParams.get('token_id');
  if (!tokenId) {
    return NextResponse.json({ error: 'token_id required' }, { status: 400 });
  }

  try {
    const url = `${CLOB_BASE}/book?token_id=${encodeURIComponent(tokenId)}`;
    const response = await fetch(url);

    if (!response.ok) {
      return NextResponse.json(
        { error: 'CLOB API error' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, {
      headers: { 'X-RateLimit-Remaining': String(remaining) },
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch order book' },
      { status: 502 }
    );
  }
}
