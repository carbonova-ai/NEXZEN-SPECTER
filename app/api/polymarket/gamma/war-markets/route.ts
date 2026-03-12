import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/app/api/polymarket/_lib/rate-limiter';

// ══════════════════════════════════════════════════════════════
// WAR MARKETS API — Dedicated Polymarket Search for War Room
//
// Fetches top events from Gamma API and filters by theater-specific
// keywords. Returns categorized markets for Iran and Ukraine.
// Cache: 15s (faster than general 30s).
// ══════════════════════════════════════════════════════════════

const GAMMA_BASE = 'https://gamma-api.polymarket.com';

const IRAN_KEYWORDS = [
  'iran', 'nuclear', 'hormuz', 'hezbollah', 'irgc', 'houthi',
  'tehran', 'persian gulf', 'middle east war', 'oil crisis',
  'strait of hormuz', 'iran sanction', 'iran strike',
  'proxy war', 'red sea',
];

const UKRAINE_KEYWORDS = [
  'ukraine', 'crimea', 'nato', 'zelensky', 'putin', 'russia war',
  'donbas', 'kursk', 'kherson', 'zaporizhzhia', 'nuclear weapon',
  'world war', 'russia sanction', 'grain', 'nord stream',
  'f-16', 'himars', 'ceasefire', 'peace deal',
];

interface WarMarket {
  id: string;
  question: string;
  slug: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  volume: number;
  liquidity: number;
  outcomes: string[];
  outcomePrices: number[];
  theater: 'iran' | 'ukraine' | 'both';
}

// ── Cache ──
interface CacheEntry {
  data: { iran: WarMarket[]; ukraine: WarMarket[] };
  timestamp: number;
}
let marketCache: CacheEntry | null = null;
const CACHE_TTL = 5_000; // 5s (was 15s — 3x faster market discovery)

function classifyMarket(question: string): 'iran' | 'ukraine' | 'both' | null {
  const q = question.toLowerCase();
  const isIran = IRAN_KEYWORDS.some(kw => q.includes(kw));
  const isUkraine = UKRAINE_KEYWORDS.some(kw => q.includes(kw));

  if (isIran && isUkraine) return 'both';
  if (isIran) return 'iran';
  if (isUkraine) return 'ukraine';
  return null;
}

async function fetchAndClassifyMarkets(): Promise<{ iran: WarMarket[]; ukraine: WarMarket[] }> {
  const iranMarkets: WarMarket[] = [];
  const ukraineMarkets: WarMarket[] = [];

  // Fetch 200 events for broader coverage
  const url = `${GAMMA_BASE}/events?closed=false&active=true&limit=200&order=volume&ascending=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Gamma API ${res.status}`);

  const events = await res.json();

  for (const event of (Array.isArray(events) ? events : [])) {
    const eventMarkets = event.markets || [];
    for (const m of eventMarkets) {
      const question = m.question || m.groupItemTitle || '';
      const theater = classifyMarket(question);
      if (!theater) continue;

      let outcomePrices: number[] = [];
      try {
        const raw = m.outcomePrices;
        if (typeof raw === 'string') outcomePrices = JSON.parse(raw).map(Number);
        else if (Array.isArray(raw)) outcomePrices = raw.map(Number);
      } catch { /* ignore */ }

      let outcomes: string[] = [];
      try {
        outcomes = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : m.outcomes || [];
      } catch { /* ignore */ }

      const market: WarMarket = {
        id: m.id || m.conditionId || '',
        question,
        slug: m.slug || event.slug || '',
        endDate: m.endDate || event.endDate || '',
        active: m.active !== false,
        closed: m.closed === true,
        volume: parseFloat(m.volume || m.volumeNum || '0'),
        liquidity: parseFloat(m.liquidity || m.liquidityNum || '0'),
        outcomes,
        outcomePrices,
        theater,
      };

      if (theater === 'iran' || theater === 'both') iranMarkets.push(market);
      if (theater === 'ukraine' || theater === 'both') ukraineMarkets.push(market);
    }
  }

  // Sort by volume
  iranMarkets.sort((a, b) => b.volume - a.volume);
  ukraineMarkets.sort((a, b) => b.volume - a.volume);

  return {
    iran: iranMarkets.slice(0, 30),
    ukraine: ukraineMarkets.slice(0, 30),
  };
}

export async function GET() {
  const { allowed, remaining } = checkRateLimit();
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  // Return cached if fresh
  if (marketCache && Date.now() - marketCache.timestamp < CACHE_TTL) {
    return NextResponse.json(marketCache.data, {
      headers: {
        'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=5',
        'X-RateLimit-Remaining': String(remaining),
      },
    });
  }

  try {
    const data = await fetchAndClassifyMarkets();
    marketCache = { data, timestamp: Date.now() };

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=5',
        'X-RateLimit-Remaining': String(remaining),
      },
    });
  } catch {
    if (marketCache) return NextResponse.json(marketCache.data);
    return NextResponse.json({ iran: [], ukraine: [] }, { status: 502 });
  }
}
