import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/app/api/polymarket/_lib/rate-limiter';

const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const CLOB_BASE = 'https://clob.polymarket.com';

interface GammaMarket {
  id: string;
  question: string;
  slug: string;
  conditionId: string;
  outcomes: string[];
  outcomePrices: string | string[];
  clobTokenIds: string | string[];
  volume: number;
  liquidity: number;
  endDate: string;
  closed: boolean;
  active: boolean;
}

interface GammaEvent {
  id: string;
  title: string;
  slug: string;
  markets: GammaMarket[];
}

function parseJsonField<T>(value: T | string): T {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value as T; }
  }
  return value;
}

function isBtc5mMarket(question: string, title?: string): boolean {
  const text = `${question} ${title ?? ''}`.toLowerCase();
  const isBtc = text.includes('bitcoin') || text.includes('btc');
  const isUpDown = text.includes('up') && text.includes('down');
  const is5m = text.includes('5 min') || text.includes('5-min') || text.includes('5m');
  return isBtc && isUpDown && is5m;
}

/**
 * GET /api/polymarket/gamma/btc-5m
 *
 * Finds the currently active "Bitcoin Up or Down - 5 Minutes" market
 * and returns its data + live CLOB midpoints.
 */
export async function GET() {
  const { allowed, remaining } = checkRateLimit();
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    // Fetch events (BTC 5m markets are nested inside events)
    const url = `${GAMMA_BASE}/events?tag_id=21&closed=false&active=true&limit=20`;
    const res = await fetch(url, {
      next: { revalidate: 3 },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Gamma ${res.status}` }, { status: res.status });
    }

    const events: GammaEvent[] = await res.json();

    // Find BTC Up/Down 5-min markets
    const btc5mMarkets: GammaMarket[] = [];
    for (const event of events) {
      for (const market of event.markets) {
        if (!market.active || market.closed) continue;
        if (!isBtc5mMarket(market.question, event.title)) continue;
        market.clobTokenIds = parseJsonField<string[]>(market.clobTokenIds);
        market.outcomePrices = parseJsonField<string[]>(market.outcomePrices);
        btc5mMarkets.push(market);
      }
    }

    if (btc5mMarkets.length === 0) {
      return NextResponse.json({
        market: null, tokens: { up: null, down: null },
        odds: { up: null, down: null }, window: { start: 0, end: 0 },
        allMarkets: [], timestamp: Date.now(),
      });
    }

    // Pick market expiring soonest (= current active window)
    btc5mMarkets.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
    const active = btc5mMarkets[0];

    // Identify UP/DOWN token IDs
    const outcomes = (active.outcomes || []).map((o: string) => o.toLowerCase());
    const upIdx = outcomes.findIndex((o: string) => o === 'up' || o === 'yes');
    const downIdx = outcomes.findIndex((o: string) => o === 'down' || o === 'no');
    const tokenIds = Array.isArray(active.clobTokenIds) ? active.clobTokenIds.filter(Boolean) : [];
    const upTokenId = tokenIds[upIdx >= 0 ? upIdx : 0] ?? null;
    const downTokenId = tokenIds[downIdx >= 0 ? downIdx : 1] ?? null;

    // Fetch CLOB midpoints in parallel (fast — only 2 requests)
    const fetchMid = async (tokenId: string | null) => {
      if (!tokenId) return null;
      try {
        const r = await fetch(`${CLOB_BASE}/midpoint?token_id=${encodeURIComponent(tokenId)}`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!r.ok) return null;
        const d = await r.json();
        return d.mid !== undefined ? parseFloat(d.mid) : null;
      } catch { return null; }
    };

    const [upMid, downMid] = await Promise.all([fetchMid(upTokenId), fetchMid(downTokenId)]);

    // Fallback to outcomePrices if CLOB is unavailable
    const prices = Array.isArray(active.outcomePrices) ? active.outcomePrices : [];
    const upFallback = prices[upIdx >= 0 ? upIdx : 0] ? parseFloat(String(prices[upIdx >= 0 ? upIdx : 0])) : null;
    const downFallback = prices[downIdx >= 0 ? downIdx : 1] ? parseFloat(String(prices[downIdx >= 0 ? downIdx : 1])) : null;

    const endTime = new Date(active.endDate).getTime();

    return NextResponse.json({
      market: {
        id: active.id,
        question: active.question,
        slug: active.slug,
        conditionId: active.conditionId,
        outcomes: active.outcomes,
        outcomePrices: active.outcomePrices,
        volume: active.volume,
        liquidity: active.liquidity,
        endDate: active.endDate,
      },
      tokens: { up: upTokenId, down: downTokenId },
      odds: {
        up: upMid ?? upFallback,
        down: downMid ?? downFallback,
      },
      window: {
        start: endTime - 5 * 60 * 1000,
        end: endTime,
      },
      allMarkets: btc5mMarkets.slice(0, 5).map(m => ({
        id: m.id, question: m.question, endDate: m.endDate,
      })),
      timestamp: Date.now(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=2',
        'X-RateLimit-Remaining': String(remaining),
      },
    });
  } catch (err) {
    console.error('[BTC 5m API]', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'Failed to fetch BTC 5m market', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 502 }
    );
  }
}
