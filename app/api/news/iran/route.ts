import { NextResponse } from 'next/server';
import type { GeoArticle, GeoNewsFeed, SourcePerformance } from '@/lib/geopolitical/types';
import { scoreUrgency, computeCompositeScore, cleanTitle, extractTags } from '@/lib/geopolitical/types';
import { computeThreatLevel } from '@/lib/geopolitical/threat-level';
import { semanticDedup } from '@/lib/geopolitical/dedup';

// ══════════════════════════════════════════════════════════════
// IRAN NEWS API — Dedicated Iran Intelligence Feed
//
// Faster than the general geo feed. Specialized sources.
// Polls every 8s with SWR. Includes Iranian state media
// (treated as signals, not facts), Israeli sources (fast on
// Iran-Israel), and wire services.
// ══════════════════════════════════════════════════════════════

// ── Cache ──
interface CacheEntry {
  data: GeoNewsFeed;
  timestamp: number;
  isRefreshing: boolean;
}
const cache = new Map<string, CacheEntry>();
const CACHE_FRESH = 1_000;   // 1s — ultra-tight for speed edge (was 4s)
const CACHE_STALE = 15_000;  // 15s stale window (was 30s)

// ── Iran-specific search queries ──
const IRAN_QUERIES = {
  core: 'iran OR iranian OR tehran OR IRGC OR "strait of hormuz" when:1h',
  nuclear: 'iran nuclear OR enrichment OR IAEA OR centrifuge OR Natanz OR Fordow when:1h',
  military: 'iran military OR "revolutionary guard" OR "quds force" OR iran missile when:1h',
  proxy: 'hezbollah iran OR houthi iran OR "axis of resistance" when:1h',
  sanctions: '"iran sanctions" OR "iran oil" OR "maximum pressure" when:1h',
  israel: 'israel iran OR "iran strike" OR "iran attack" when:1h',
  broad: 'iran conflict OR iran war OR iran crisis when:1d',
};

// ── Iran-focused RSS Sources ──
interface RSSSource {
  id: string;
  name: string;
  url: string;
  country: string;
  tier: 1 | 2 | 3;
  bias: string;
}

const IRAN_FEEDS: RSSSource[] = [
  // Tier 1: Wire services (most reliable, fast)
  { id: 'bbc', name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml', country: 'UK', tier: 1, bias: 'western' },
  { id: 'aljazeera', name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', country: 'Qatar', tier: 1, bias: 'gulf' },
  { id: 'guardian', name: 'The Guardian', url: 'https://www.theguardian.com/world/iran/rss', country: 'UK', tier: 1, bias: 'western' },
  { id: 'reuters', name: 'Reuters', url: 'https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best', country: 'UK', tier: 1, bias: 'neutral' },

  // Tier 2: Regional specialists + fast wire services
  { id: 'france24', name: 'France24', url: 'https://www.france24.com/en/middle-east/rss', country: 'France', tier: 2, bias: 'western' },
  { id: 'dw', name: 'DW', url: 'https://rss.dw.com/rdf/rss-en-world', country: 'Germany', tier: 2, bias: 'western' },
  { id: 'ap', name: 'AP News', url: 'https://rsshub.app/apnews/topics/world-news', country: 'US', tier: 1, bias: 'neutral' },
  { id: 'cnbc', name: 'CNBC World', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362', country: 'US', tier: 2, bias: 'western' },
  { id: 'middleeasteye', name: 'Middle East Eye', url: 'https://www.middleeasteye.net/rss', country: 'UK', tier: 2, bias: 'independent' },

  // Tier 3: Israeli sources (fastest on Israel-Iran, use with bias awareness)
  { id: 'timesofisrael', name: 'Times of Israel', url: 'https://www.timesofisrael.com/feed/', country: 'Israel', tier: 3, bias: 'israeli' },
  { id: 'jpost', name: 'Jerusalem Post', url: 'https://www.jpost.com/rss/rssfeedsmiddleeast.aspx', country: 'Israel', tier: 3, bias: 'israeli' },

  // Tier 3: Additional Iran-specific (IRGC-linked signal sources)
  { id: 'fars', name: 'FARS News', url: 'https://www.farsnews.ir/en/rss', country: 'Iran', tier: 3, bias: 'iranian_state' },
  { id: 'tasnim', name: 'Tasnim News', url: 'https://www.tasnimnews.com/en/rss', country: 'Iran', tier: 3, bias: 'iranian_state' },
  { id: 'isna', name: 'ISNA', url: 'https://en.isna.ir/rss', country: 'Iran', tier: 3, bias: 'iranian_state' },
];

// ── Iranian State Media (PROPAGANDA — used for SIGNAL detection) ──
const IRAN_STATE_FEEDS: RSSSource[] = [
  { id: 'presstv', name: 'Press TV', url: 'https://www.presstv.ir/RSS', country: 'Iran', tier: 3, bias: 'iranian_state' },
  { id: 'irna', name: 'IRNA', url: 'https://en.irna.ir/rss', country: 'Iran', tier: 3, bias: 'iranian_state' },
  { id: 'mehr', name: 'Mehr News', url: 'https://en.mehrnews.com/rss', country: 'Iran', tier: 3, bias: 'iranian_state' },
];

// ── RSS Parser (same as general feed) ──

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

    // Iran relevance filter — skip non-Iran articles
    const fullText = `${title} ${description}`.toLowerCase();
    const iranRelevant = /\b(iran|iranian|tehran|irgc|quds|khamenei|raisi|pezeshkian|natanz|fordow|hormuz|hezbollah|houthi|persian gulf)\b/i.test(fullText);
    if (!iranRelevant) continue;

    let seenAt: string;
    try {
      const d = new Date(pubDate);
      seenAt = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    } catch {
      seenAt = new Date().toISOString();
    }

    const cleaned = cleanTitle(title);
    const snippet = description ? description.slice(0, 200).replace(/\s+/g, ' ').trim() : '';
    const tags = extractTags(cleaned, snippet);

    // Add Iran-specific tags
    if (!tags.includes('iran')) tags.push('iran');

    const imageMatch = item.match(/<media:content[^>]*url="([^"]+)"/i)
      || item.match(/<enclosure[^>]*url="([^"]+)"/i);

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
      urgency: scoreUrgency(cleaned, snippet),
      urgencyScore: computeCompositeScore(cleaned, snippet),
      tags,
      clusterId: null,
      snippetScore: snippet ? computeCompositeScore(snippet) : 0,
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
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function hashId(title: string, url: string): string {
  let hash = 0;
  const str = `iran-${title}${url}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ── Fetchers ──

function getGoogleNewsURL(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

async function fetchGoogleIran(query: string): Promise<GeoArticle[]> {
  try {
    const res = await fetch(getGoogleNewsURL(query), {
      signal: AbortSignal.timeout(2000), // was 3s
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SpecterBot/1.0)' },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSSItems(xml, 'Google News', 'US');
  } catch {
    return [];
  }
}

async function fetchRSS(source: RSSSource): Promise<{ articles: GeoArticle[]; perf: SourcePerformance }> {
  const t0 = Date.now();
  const timeouts = { 1: 1200, 2: 2000, 3: 2500 }; // Aggressive timeouts — don't wait for slow sources
  try {
    const res = await fetch(source.url, {
      signal: AbortSignal.timeout(timeouts[source.tier]),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const articles = parseRSSItems(xml, source.name, source.country);
    return {
      articles,
      perf: { id: source.id, name: source.name, responseTimeMs: Date.now() - t0, articlesDelivered: articles.length, wasHit: articles.length > 0, tier: source.tier },
    };
  } catch {
    return {
      articles: [],
      perf: { id: source.id, name: source.name, responseTimeMs: Date.now() - t0, articlesDelivered: 0, wasHit: false, tier: source.tier },
    };
  }
}

// GDELT Iran-specific
const GDELT_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';
let lastGdeltFetch = 0;

async function fetchGDELTIran(): Promise<GeoArticle[]> {
  const now = Date.now();
  if (now - lastGdeltFetch < 5000) return [];
  lastGdeltFetch = now;

  const query = 'sourcelang:english (iran OR IRGC OR tehran OR "strait of hormuz" OR "nuclear iran")';
  const url = `${GDELT_BASE}?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=30&format=json&sort=DateDesc&timespan=30min`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) }); // was 5s
    const text = await res.text();
    if (!text.startsWith('{')) return [];
    const data = JSON.parse(text);

    return (data.articles || [])
      .filter((a: { title?: string; url?: string }) => a.title && a.url)
      .map((a: { title: string; url: string; domain?: string; sourcecountry?: string; language?: string; seendate?: string; socialimage?: string }) => {
        const cleaned = cleanTitle(a.title);
        const tags = extractTags(cleaned);
        if (!tags.includes('iran')) tags.push('iran');
        return {
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
          urgencyScore: computeCompositeScore(cleaned),
          tags,
          clusterId: null,
          snippetScore: 0,
        } as GeoArticle;
      });
  } catch {
    return [];
  }
}

function parseGDELTDate(seendate: string): string {
  if (!seendate || seendate.length < 15) return new Date().toISOString();
  return `${seendate.slice(0, 4)}-${seendate.slice(4, 6)}-${seendate.slice(6, 8)}T${seendate.slice(9, 11)}:${seendate.slice(11, 13)}:${seendate.slice(13, 15)}Z`;
}

// ── Core fetch ──

async function fetchAllIranNews(): Promise<{ articles: GeoArticle[]; sourcePerformance: SourcePerformance[] }> {
  const allArticles: GeoArticle[] = [];
  const sourcePerformance: SourcePerformance[] = [];

  // ── EARLY-RETURN PATTERN ──
  // Tier 1 sources are fastest and most valuable. Don't block on slow Tier 2/3.
  // Fire all in parallel but race Tier 1 against a fast deadline.

  const tier1Feeds = IRAN_FEEDS.filter(f => f.tier === 1);
  const tier2Feeds = IRAN_FEEDS.filter(f => f.tier === 2);
  const tier3Feeds = [...IRAN_FEEDS.filter(f => f.tier === 3), ...IRAN_STATE_FEEDS];

  // Tier 1 + Google: race against 1.5s deadline
  const fastPromises = [
    ...Object.values(IRAN_QUERIES).slice(0, 3).map(q => fetchGoogleIran(q)), // top 3 queries only
    ...tier1Feeds.map(f => fetchRSS(f).then(r => { sourcePerformance.push(r.perf); return r.articles; })),
  ];

  // Tier 2/3 + remaining Google + GDELT: fire-and-forget (merge when ready)
  const slowPromises = [
    ...Object.values(IRAN_QUERIES).slice(3).map(q => fetchGoogleIran(q)),
    ...tier2Feeds.map(f => fetchRSS(f).then(r => { sourcePerformance.push(r.perf); return r.articles; })),
    ...tier3Feeds.map(f => fetchRSS(f).then(r => { sourcePerformance.push(r.perf); return r.articles; })),
    fetchGDELTIran(),
  ];

  // Race: fast sources resolve quickly, slow sources have a 2.5s hard deadline
  const fastDeadline = new Promise<GeoArticle[][]>(resolve => {
    setTimeout(() => resolve([]), 1500);
  });

  const [fastResults, slowResults] = await Promise.all([
    // Fast path: Tier 1 + top Google queries
    Promise.race([
      Promise.allSettled(fastPromises).then(results =>
        results
          .filter((r): r is PromiseFulfilledResult<GeoArticle[]> => r.status === 'fulfilled')
          .map(r => r.value)
      ),
      fastDeadline,
    ]),
    // Slow path: everything else with hard deadline
    Promise.allSettled(slowPromises).then(results =>
      results
        .filter((r): r is PromiseFulfilledResult<GeoArticle[]> => r.status === 'fulfilled')
        .map(r => r.value)
    ),
  ]);

  for (const batch of [...fastResults, ...slowResults]) {
    allArticles.push(...batch);
  }

  return { articles: allArticles, sourcePerformance };
}

// ── Dedup + Sort ──

function deduplicateAndSort(allArticles: GeoArticle[]): GeoArticle[] {
  // Phase 1: Semantic dedup (trigram + URL + temporal clustering)
  const deduped = semanticDedup(allArticles);

  // Phase 2: Sort by urgency then score then recency
  const urgencyOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  deduped.sort((a, b) => {
    const urgDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (urgDiff !== 0) return urgDiff;
    const scoreDiff = b.urgencyScore - a.urgencyScore;
    if (Math.abs(scoreDiff) > 2) return scoreDiff;
    return new Date(b.seenAt).getTime() - new Date(a.seenAt).getTime();
  });

  return deduped.slice(0, 80);
}

// ── Cache refresh ──

async function refreshIranCache(): Promise<GeoNewsFeed> {
  const entry = cache.get('iran');
  if (entry?.isRefreshing) return entry.data;
  if (entry) entry.isRefreshing = true;

  const startTime = Date.now();
  try {
    const { articles, sourcePerformance } = await fetchAllIranNews();
    const final = deduplicateAndSort(articles);
    const prevScore = cache.get('iran')?.data.threatLevel?.score;
    const threatLevel = computeThreatLevel(final, prevScore);

    const response: GeoNewsFeed = {
      articles: final,
      fetchedAt: new Date().toISOString(),
      query: 'iran',
      totalResults: final.length,
      sourcesHit: sourcePerformance.filter(s => s.wasHit).map(s => s.id),
      latencyMs: Date.now() - startTime,
      threatLevel,
      sourcePerformance,
    };

    cache.set('iran', { data: response, timestamp: Date.now(), isRefreshing: false });
    return response;
  } catch (err) {
    if (entry) entry.isRefreshing = false;
    throw err;
  }
}

// ── Background pre-fetcher ──
let bgInterval: ReturnType<typeof setInterval> | null = null;

function ensureBackgroundRefresh() {
  if (bgInterval) return;
  bgInterval = setInterval(() => {
    const entry = cache.get('iran');
    if (!entry || Date.now() - entry.timestamp > CACHE_FRESH) {
      refreshIranCache().catch(() => {});
    }
  }, 6_000); // every 6s (was 12s — 2x faster background refresh)
}

// ── Handler ──

export async function GET() {
  ensureBackgroundRefresh();

  const now = Date.now();
  const entry = cache.get('iran');

  if (entry && now - entry.timestamp < CACHE_FRESH) {
    return NextResponse.json(entry.data);
  }

  if (entry && now - entry.timestamp < CACHE_STALE) {
    refreshIranCache().catch(() => {});
    return NextResponse.json(entry.data);
  }

  try {
    const response = await refreshIranCache();
    return NextResponse.json(response);
  } catch {
    if (entry) return NextResponse.json(entry.data);
    return NextResponse.json({
      articles: [],
      fetchedAt: new Date().toISOString(),
      query: 'iran',
      totalResults: 0,
      sourcesHit: [],
      latencyMs: 0,
      threatLevel: { severity: 'STABLE', score: 0, dominantCategory: 'none', activeHotspots: [], trend: 'stable', summary: 'Sem dados Iran' },
      sourcePerformance: [],
    } satisfies GeoNewsFeed);
  }
}
