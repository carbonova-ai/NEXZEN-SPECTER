import { NextResponse } from 'next/server';
import { fetchLatestPrice, isChainlinkStale } from '@/lib/chainlink/price-feed';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const price = await fetchLatestPrice();

    const stale = isChainlinkStale(price.updatedAt);

    return NextResponse.json(
      { ...price, isStale: stale },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=2',
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 502 }
    );
  }
}
