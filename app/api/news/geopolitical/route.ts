import { NextResponse } from 'next/server';
import type { GeoArticle, GeoNewsFeed } from '@/lib/geopolitical/types';
import { scoreUrgency, computeUrgencyScore, cleanTitle } from '@/lib/geopolitical/types';

// ══════════════════════════════════════════════════════════════
// SPECTER GEO NEWS — Maximum Speed Architecture
//
// Strategy:
//   1. Stale-while-revalidate: return cached instantly, refresh in background
//   2. Race pattern: return as soon as 2+ fast sources respond (don't wait for slow ones)
//   3. Google News when:1h for last-hour freshness
//   4. Tighter timeouts (3s fast / 5s slow) — kill slow connections early
//   5. Background pre-fetch: cache stays warm even between client requests
// ══════════════════════════════════════════════════════════════

// ── In-memory cache with SWR ──
interface CacheEntry {
  data: GeoNewsFeed;
  timestamp: number;
  isRefreshing: boolean; // prevent concurrent refreshes
}
const cache = new Map<string, CacheEntry>();
const CACHE_FRESH = 12_000;  // 12s — serve as fresh
const CACHE_STALE = 60_000;  // 60s — serve stale but trigger background refresh
// Beyond 60s the cache is dead and we block on fetch

// ── Background pre-fetcher ──
// Keeps cache warm for the default query so first load is instant
let bgInterval: ReturnType<typeof setInterval> | null = null;
const DEFAULT_QUERY = 'geopolitics OR war OR sanctions OR conflict OR military OR crisis';

function ensureBackgroundRefresh() {
  if (bgInterval) return;
  bgInterval = setInterval(() => {
    const entry = cache.get(DEFAULT_QUERY);
    if (!entry || Date.now() - entry.timestamp > CACHE_FRESH) {
      refreshCache(DEFAULT_QUERY).catch(() => {});
    }
  }, 15_000); // every 15s
}

// ── RSS Feed Sources ──

interface RSSSource {
  id: string;
  name: string;
  url: string;
  country: string;
  tier: 1 | 2 | 3; // 1=fastest, critical path. 2=important. 3=supplementary
}

function getGoogleNewsURL(query: string): string {
  const q = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

// Category → optimized search terms (when:1h for maximum freshness)
const CATEGORY_SEARCH: Record<string, string> = {
  'geopolitics OR war OR sanctions OR conflict OR military OR crisis':
    'geopolitics OR war OR sanctions OR conflict OR "breaking news" when:1h',
  'war OR military OR invasion OR bombing OR troops OR missile':
    'war OR military OR invasion OR "missile strike" OR bombing when:1h',
  'sanctions OR embargo OR trade war OR tariff OR ban':
    'sanctions OR tariff OR "trade war" OR embargo when:1h',
  'election OR vote OR president OR parliament OR democracy':
    'election OR president OR "prime minister" OR parliament when:1h',
  'central bank OR interest rate OR inflation OR recession OR GDP OR fed':
    '"central bank" OR "interest rate" OR inflation OR recession OR "fed rate" when:1h',
  'oil OR gas OR OPEC OR pipeline OR energy crisis OR nuclear energy':
    'oil OR OPEC OR "energy crisis" OR "natural gas" OR nuclear when:1h',
  'bitcoin OR crypto OR regulation OR SEC OR stablecoin OR CBDC':
    'bitcoin OR "crypto regulation" OR "SEC crypto" OR CBDC when:1h',
  'summit OR treaty OR UN OR NATO OR G7 OR G20 OR diplomacy OR alliance':
    'NATO OR "UN security" OR G7 OR G20 OR summit OR treaty when:1h',
};

// Also fetch 1d for broader coverage (merged with 1h results)
const CATEGORY_SEARCH_BROAD: Record<string, string> = {
  'geopolitics OR war OR sanctions OR conflict OR military OR crisis':
    'geopolitics OR war OR sanctions OR conflict when:1d',
  'war OR military OR invasion OR bombing OR troops OR missile':
    'war OR military OR invasion when:1d',
  'sanctions OR embargo OR trade war OR tariff OR ban':
    'sanctions OR tariff OR "trade war" when:1d',
  'election OR vote OR president OR parliament OR democracy':
    'election OR president OR parliament when:1d',
  'central bank OR interest rate OR inflation OR recession OR GDP OR fed':
    '"central bank" OR inflation OR recession when:1d',
  'oil OR gas OR OPEC OR pipeline OR energy crisis OR nuclear energy':
    'oil OR OPEC OR "energy crisis" when:1d',
  'bitcoin OR crypto OR regulation OR SEC OR stablecoin OR CBDC':
    'bitcoin OR crypto OR "crypto regulation" when:1d',
  'summit OR treaty OR UN OR NATO OR G7 OR G20 OR diplomacy OR alliance':
    'NATO OR G7 OR G20 OR summit when:1d',
};

// Wire service RSS feeds — ordered by speed/reliability
const WIRE_FEEDS: RSSSource[] = [
  // Tier 1: Critical path — fastest, most reliable RSS feeds
  { id: 'bbc', name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', country: 'United Kingdom', tier: 1 },
  { id: 'guardian', name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', country: 'United Kingdom', tier: 1 },
  { id: 'aljazeera', name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', country: 'Qatar', tier: 1 },
  { id: 'reuters', name: 'Reuters', url: 'https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best', country: 'United Kingdom', tier: 1 },
  // Tier 2: Important — add diversity
  { id: 'france24', name: 'France24', url: 'https://www.france24.com/en/rss', country: 'France', tier: 2 },
  { id: 'dw', name: 'Deutsche Welle', url: 'https://rss.dw.com/rdf/rss-en-world', country: 'Germany', tier: 2 },
  { id: 'nhk', name: 'NHK World', url: 'https://www3.nhk.or.jp/rss/news/cat0.xml', country: 'Japan', tier: 2 },
  { id: 'sky', name: 'Sky News', url: 'https://feeds.skynews.com/feeds/rss/world.xml', country: 'United Kingdom', tier: 2 },
  // Tier 3: Supplementary — nice to have
  { id: 'cnbc', name: 'CNBC World', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362', country: 'US', tier: 3 },
  { id: 'abc', name: 'ABC News', url: 'https://abcnews.go.com/abcnews/internationalheadlines', country: 'US', tier: 3 },
];

// ── RSS Parser ──

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, 'i');
  const match = xml.match(regex);
  if (!match) return '';
  return match[1]
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function parseRSSItems(xml: string, sourceName: string, sourceCountry: string): GeoArticle[] {
  const articles: GeoArticle[] = [];
  const items = xml.split(/<item[ >]/i).slice(1);

  for (const item of items) {
    const title = extractTag(item, 'title');
    const link = extractTag(item, 'link') || extractLinkFromItem(item);
    const pubDate = extractTag(item, 'pubDate');
    const source = extractTag(item, 'source') || sourceName;
    const description = extractTag(item, 'description');

    if (!title || !link) continue;

    let seenAt: string;
    try {
      const d = new Date(pubDate);
      seenAt = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    } catch {
      seenAt = new Date().toISOString();
    }

    const cleaned = cleanTitle(title);
    const lower = cleaned.toLowerCase();
    const urgencyScore = computeUrgencyScore(lower);

    const snippet = description
      ? description.slice(0, 200).replace(/\s+/g, ' ').trim()
      : '';

    const imageMatch = item.match(/<media:content[^>]*url="([^"]+)"/i)
      || item.match(/<enclosure[^>]*url="([^"]+)"/i)
      || item.match(/src="(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/i);

    articles.push({
      id: hashId(cleaned, link),
      title: cleaned,
      snippet,
      url: link,
      source: source.replace(/^www\./, ''),
      sourceCountry,
      language: 'English',
      seenAt,
      imageUrl: imageMatch?.[1] || null,
      domain: extractDomain(link),
      urgency: scoreUrgency(cleaned),
      urgencyScore,
    });
  }

  return articles;
}

function extractLinkFromItem(item: string): string {
  const match = item.match(/<link[^>]*>(https?:\/\/[^\s<]+)/i);
  if (match) return match[1];
  const hrefMatch = item.match(/<link[^>]*href="([^"]+)"/i);
  return hrefMatch?.[1] || '';
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function hashId(title: string, url: string): string {
  let hash = 0;
  const str = title + url;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ── Fetchers with tiered timeouts ──

type FetchResult = { articles: GeoArticle[]; source: string };

async function fetchGoogleNews(query: string, timeWindow: '1h' | '1d'): Promise<FetchResult> {
  const searchTerms = timeWindow === '1h'
    ? (CATEGORY_SEARCH[query] || `${query} when:1h`)
    : (CATEGORY_SEARCH_BROAD[query] || `${query} when:1d`);
  const url = getGoogleNewsURL(searchTerms);

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3500), // 3.5s — Google is fast
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/2.0)' },
    });
    if (!res.ok) return { articles: [], source: '' };
    const xml = await res.text();
    return { articles: parseRSSItems(xml, 'Google News', 'US'), source: `google_${timeWindow}` };
  } catch {
    return { articles: [], source: '' };
  }
}

async function fetchWireFeed(source: RSSSource): Promise<FetchResult> {
  const timeouts = { 1: 3000, 2: 4000, 3: 4500 }; // tier → timeout ms
  try {
    const res = await fetch(source.url, {
      signal: AbortSignal.timeout(timeouts[source.tier]),
    });
    if (!res.ok) return { articles: [], source: '' };
    const xml = await res.text();
    return { articles: parseRSSItems(xml, source.name, source.country), source: source.id };
  } catch {
    return { articles: [], source: '' };
  }
}

// GDELT — supplementary, non-blocking
let lastGdeltFetch = 0;
const GDELT_COOLDOWN = 5000;
const GDELT_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';

async function fetchGDELT(query: string): Promise<FetchResult> {
  const now = Date.now();
  if (now - lastGdeltFetch < GDELT_COOLDOWN) return { articles: [], source: '' };

  const gdeltQuery = `sourcelang:english (${query.split(' OR ').slice(0, 4).join(' OR ')})`;
  const url = `${GDELT_BASE}?query=${encodeURIComponent(gdeltQuery)}&mode=ArtList&maxrecords=30&format=json&sort=DateDesc&timespan=30min`;

  try {
    lastGdeltFetch = now;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) }); // 5s max
    const text = await res.text();
    if (!text.startsWith('{')) return { articles: [], source: '' };

    const data = JSON.parse(text);
    const articles: GeoArticle[] = [];

    for (const a of data.articles || []) {
      if (!a.title || !a.url) continue;
      const cleaned = cleanTitle(a.title);
      const lower = cleaned.toLowerCase();
      articles.push({
        id: hashId(cleaned, a.url),
        title: cleaned,
        snippet: '',
        url: a.url,
        source: (a.domain || '').replace(/^www\./, ''),
        sourceCountry: a.sourcecountry || '',
        language: a.language || 'English',
        seenAt: parseGDELTDate(a.seendate || ''),
        imageUrl: a.socialimage || null,
        domain: a.domain || '',
        urgency: scoreUrgency(cleaned),
        urgencyScore: computeUrgencyScore(lower),
      });
    }
    return { articles, source: 'gdelt' };
  } catch {
    return { articles: [], source: '' };
  }
}

function parseGDELTDate(seendate: string): string {
  if (!seendate || seendate.length < 15) return new Date().toISOString();
  const y = seendate.slice(0, 4);
  const m = seendate.slice(4, 6);
  const d = seendate.slice(6, 8);
  const h = seendate.slice(9, 11);
  const min = seendate.slice(11, 13);
  const s = seendate.slice(13, 15);
  return `${y}-${m}-${d}T${h}:${min}:${s}Z`;
}

// ── Race Pattern: return as soon as fast sources respond ──

async function fetchAllWithRace(query: string): Promise<{ articles: GeoArticle[]; sourcesHit: string[] }> {
  // Split sources into fast (critical path) and slow (supplementary)
  const tier1Feeds = WIRE_FEEDS.filter(f => f.tier === 1);
  const tier2Feeds = WIRE_FEEDS.filter(f => f.tier === 2);
  const tier3Feeds = WIRE_FEEDS.filter(f => f.tier === 3);

  // FAST PATH: Google News (1h) + all Tier 1 wires — these are the critical sources
  const fastPromises: Promise<FetchResult>[] = [
    fetchGoogleNews(query, '1h'),
    ...tier1Feeds.map(fetchWireFeed),
  ];

  // SLOW PATH: Google News (1d for broader coverage) + Tier 2/3 + GDELT
  const slowPromises: Promise<FetchResult>[] = [
    fetchGoogleNews(query, '1d'),
    ...tier2Feeds.map(fetchWireFeed),
    ...tier3Feeds.map(fetchWireFeed),
    fetchGDELT(query),
  ];

  // Race: wait for fast path to complete, but don't block on slow path
  // Use Promise.allSettled for both — fast path blocks, slow path races with timeout

  const fastResults = await Promise.allSettled(fastPromises);

  // Give slow sources 2s extra after fast path completes
  const slowRace = Promise.race([
    Promise.allSettled(slowPromises),
    new Promise<PromiseSettledResult<FetchResult>[]>(resolve =>
      setTimeout(() => resolve([]), 2000)
    ),
  ]);

  const slowResults = await slowRace;

  // Collect all results
  const allArticles: GeoArticle[] = [];
  const sourcesHit: string[] = [];

  for (const result of [...fastResults, ...slowResults]) {
    if (result.status === 'fulfilled' && result.value.articles.length > 0) {
      allArticles.push(...result.value.articles);
      if (result.value.source) {
        const srcKey = result.value.source.replace(/_1[hd]$/, '');
        if (!sourcesHit.includes(srcKey)) sourcesHit.push(srcKey);
      }
    }
  }

  return { articles: allArticles, sourcesHit };
}

// ── Deduplication & Sorting ──

function deduplicateAndSort(allArticles: GeoArticle[]): GeoArticle[] {
  const seen = new Map<string, GeoArticle>();

  for (const a of allArticles) {
    const key = a.title.toLowerCase().slice(0, 60).replace(/[^a-z0-9]/g, '');
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, a);
    } else {
      if (a.urgencyScore > existing.urgencyScore ||
          (a.urgencyScore === existing.urgencyScore && a.seenAt > existing.seenAt)) {
        seen.set(key, {
          ...a,
          snippet: a.snippet || existing.snippet,
          imageUrl: a.imageUrl || existing.imageUrl,
        });
      } else if (!existing.snippet && a.snippet) {
        existing.snippet = a.snippet;
      }
    }
  }

  const deduped = [...seen.values()];

  const urgencyOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  deduped.sort((a, b) => {
    const urgDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (urgDiff !== 0) return urgDiff;
    const scoreDiff = b.urgencyScore - a.urgencyScore;
    if (Math.abs(scoreDiff) > 2) return scoreDiff;
    return new Date(b.seenAt).getTime() - new Date(a.seenAt).getTime();
  });

  return deduped.slice(0, 100);
}

// ── Core refresh function (used by both handler and background) ──

async function refreshCache(query: string): Promise<GeoNewsFeed> {
  const entry = cache.get(query);
  if (entry?.isRefreshing) {
    // Another refresh is in progress, return current cache
    return entry.data;
  }

  // Mark as refreshing
  if (entry) entry.isRefreshing = true;

  const startTime = Date.now();

  try {
    const { articles: allArticles, sourcesHit } = await fetchAllWithRace(query);
    const final = deduplicateAndSort(allArticles);
    const latencyMs = Date.now() - startTime;

    const response: GeoNewsFeed = {
      articles: final,
      fetchedAt: new Date().toISOString(),
      query,
      totalResults: final.length,
      sourcesHit,
      latencyMs,
    };

    cache.set(query, { data: response, timestamp: Date.now(), isRefreshing: false });
    return response;
  } catch (err) {
    if (entry) entry.isRefreshing = false;
    throw err;
  }
}

// ── Main Handler ──

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query') || DEFAULT_QUERY;

  // Start background pre-fetcher for default query
  ensureBackgroundRefresh();

  const now = Date.now();
  const entry = cache.get(query);

  // FRESH cache: return immediately
  if (entry && now - entry.timestamp < CACHE_FRESH) {
    return NextResponse.json(entry.data);
  }

  // STALE cache: return immediately + trigger background refresh
  if (entry && now - entry.timestamp < CACHE_STALE) {
    // Background refresh — don't await
    refreshCache(query).catch(() => {});
    return NextResponse.json(entry.data);
  }

  // DEAD cache or no cache: must fetch
  try {
    const response = await refreshCache(query);
    return NextResponse.json(response);
  } catch (err) {
    console.error('[GeoNews] Fetch failed:', err);

    // Return stale data if available (any age)
    if (entry) {
      return NextResponse.json(entry.data);
    }

    const startTime = now;
    return NextResponse.json({
      articles: [],
      fetchedAt: new Date().toISOString(),
      query,
      totalResults: 0,
      sourcesHit: [],
      latencyMs: Date.now() - startTime,
    } satisfies GeoNewsFeed);
  }
}
