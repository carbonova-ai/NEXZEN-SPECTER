import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/app/api/polymarket/_lib/rate-limiter';

const GAMMA_BASE = 'https://gamma-api.polymarket.com';

// Tag IDs for categories we scan
const CATEGORY_TAGS: Record<string, string> = {
  crypto: '21',
  politics: '1',
  economics: '22',
  science: '11',
};

/**
 * GET /api/polymarket/gamma/scan?categories=crypto,politics,economics
 *
 * Fetches events from multiple Polymarket categories in parallel.
 * Returns all events grouped by category for client-side filtering/scoring.
 */
export async function GET(request: NextRequest) {
  const { allowed, remaining } = checkRateLimit();
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const { searchParams } = request.nextUrl;
  const categoriesParam = searchParams.get('categories') ?? 'crypto,politics,economics';
  const categories = categoriesParam.split(',').filter(c => c in CATEGORY_TAGS);

  if (categories.length === 0) {
    return NextResponse.json(
      { error: 'No valid categories specified' },
      { status: 400 }
    );
  }

  try {
    // Fetch all categories in parallel
    const results = await Promise.all(
      categories.map(async (category) => {
        const tagId = CATEGORY_TAGS[category];
        const params = new URLSearchParams({
          tag_id: tagId,
          closed: 'false',
          active: 'true',
          limit: '50',
        });

        const response = await fetch(
          `${GAMMA_BASE}/events?${params.toString()}`,
          { next: { revalidate: 30 }, signal: AbortSignal.timeout(8000) }
        );

        if (!response.ok) return { category, events: [], error: `HTTP ${response.status}` };

        const events = await response.json();
        return { category, events, error: null };
      })
    );

    return NextResponse.json(
      { categories: results, scannedAt: Date.now() },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=15',
          'X-RateLimit-Remaining': String(remaining),
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: 'Failed to scan markets' },
      { status: 502 }
    );
  }
}
