import { NextResponse } from 'next/server';
import type { GeoArticle, GeoNewsFeed, SourcePerformance } from '@/lib/geopolitical/types';
import { scoreUrgency, computeCompositeScore, cleanTitle, extractTags } from '@/lib/geopolitical/types';
import { computeThreatLevel } from '@/lib/geopolitical/threat-level';
import { semanticDedup } from '@/lib/geopolitical/dedup';

// ══════════════════════════════════════════════════════════════
// UKRAINE NEWS API — Dedicated Ukraine Intelligence Feed
//
// Specialized sources for Ukraine theater.
// Polls every 8s with SWR. Includes Ukrainian media,
// OSINT sources, and Russian state media (signal detection).
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

// ── Ukraine-specific search queries ──
const UKRAINE_QUERIES = {
  core: 'ukraine OR ukrainian OR kyiv OR zelensky OR donbas when:1h',
  frontline: 'ukraine frontline OR donbas battle OR ukraine offensive OR russia offensive when:1h',
  weapons: 'ukraine weapons OR HIMARS OR F-16 ukraine OR ATACMS OR "storm shadow" OR patriot ukraine when:1h',
  diplomacy: 'ukraine peace OR ceasefire ukraine OR "peace summit" OR ukraine negotiations when:1h',
  sanctions: 'russia sanctions OR "oil price cap" OR "russian assets" when:1h',
  nato: 'nato ukraine OR "article 5" OR nato troops OR nato expansion when:1h',
  energy: 'ukraine energy OR "nord stream" OR "grain deal" OR russia gas OR ukraine power when:1d',
};

// ── RSS Sources ──
interface RSSSource {
  id: string;
  name: string;
  url: string;
  country: string;
  tier: 1 | 2 | 3;
  bias: string;
}

const UKRAINE_FEEDS: RSSSource[] = [
  // Tier 1: Wire services
  { id: 'bbc', name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml', country: 'UK', tier: 1, bias: 'western' },
  { id: 'guardian', name: 'The Guardian', url: 'https://www.theguardian.com/world/ukraine/rss', country: 'UK', tier: 1, bias: 'western' },
  { id: 'reuters', name: 'Reuters', url: 'https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best', country: 'UK', tier: 1, bias: 'neutral' },
  { id: 'aljazeera', name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', country: 'Qatar', tier: 1, bias: 'neutral' },

  // Tier 2: Ukrainian sources + wire services
  { id: 'ukrinform', name: 'Ukrinform', url: 'https://www.ukrinform.net/rss/block-lastnews', country: 'Ukraine', tier: 2, bias: 'ukrainian' },
  { id: 'kyivindependent', name: 'Kyiv Independent', url: 'https://kyivindependent.com/feed/', country: 'Ukraine', tier: 2, bias: 'ukrainian' },
  { id: 'pravda', name: 'Ukrayinska Pravda', url: 'https://www.pravda.com.ua/eng/rss/view_news/', country: 'Ukraine', tier: 2, bias: 'ukrainian' },
  { id: 'france24', name: 'France24', url: 'https://www.france24.com/en/europe/rss', country: 'France', tier: 2, bias: 'western' },
  { id: 'dw', name: 'DW', url: 'https://rss.dw.com/rdf/rss-en-world', country: 'Germany', tier: 2, bias: 'western' },
  { id: 'ap', name: 'AP News', url: 'https://rsshub.app/apnews/topics/world-news', country: 'US', tier: 1, bias: 'neutral' },
  { id: 'cnbc', name: 'CNBC World', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362', country: 'US', tier: 2, bias: 'western' },

  // Tier 3: Russian state media (propaganda signal detection)
  { id: 'tass', name: 'TASS', url: 'https://tass.com/rss/v2.xml', country: 'Russia', tier: 3, bias: 'russian_state' },
];

// ── RSS Parser ──

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, 'i');
  const match = xml.match(regex);
  if (!match) return '';
  return match[1]
    .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/').replace(/<[^>]+>/g, '').trim();
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

    // Ukraine relevance filter
    const fullText = `${title} ${description}`.toLowerCase();
    const ukraineRelevant = /\b(ukraine|ukrainian|kyiv|kiev|zelensky|donbas|donetsk|crimea|luhansk|zaporizhzhia|kherson|bakhmut|kursk|nato|russia.*war|putin.*ukraine)\b/i.test(fullText);
    if (!ukraineRelevant) continue;

    let seenAt: string;
    try {
      const d = new Date(pubDate);
      seenAt = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    } catch { seenAt = new Date().toISOString(); }

    const cleaned = cleanTitle(title);
    const snippet = description ? description.slice(0, 200).replace(/\s+/g, ' ').trim() : '';
    const tags = extractTags(cleaned, snippet);
    if (!tags.includes('ukraine')) tags.push('ukraine');

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
  const str = `ukraine-${title}${url}`;
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

async function fetchGoogleUkraine(query: string): Promise<GeoArticle[]> {
  try {
    const res = await fetch(getGoogleNewsURL(query), {
      signal: AbortSignal.timeout(2000), // was 3s
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SpecterBot/1.0)' },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSSItems(xml, 'Google News', 'US');
  } catch { return []; }
}

async function fetchRSS(source: RSSSource): Promise<{ articles: GeoArticle[]; perf: SourcePerformance }> {
  const t0 = Date.now();
  const timeouts = { 1: 1200, 2: 2000, 3: 2500 }; // Aggressive timeouts — don't wait for slow sources
  try {
    const res = await fetch(source.url, { signal: AbortSignal.timeout(timeouts[source.tier]) });
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

// GDELT Ukraine-specific
const GDELT_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';
let lastGdeltFetch = 0;

async function fetchGDELTUkraine(): Promise<GeoArticle[]> {
  const now = Date.now();
  if (now - lastGdeltFetch < 5000) return [];
  lastGdeltFetch = now;

  const query = 'sourcelang:english (ukraine OR kyiv OR zelensky OR donbas OR crimea OR "kursk incursion")';
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
        if (!tags.includes('ukraine')) tags.push('ukraine');
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
  } catch { return []; }
}

function parseGDELTDate(seendate: string): string {
  if (!seendate || seendate.length < 15) return new Date().toISOString();
  return `${seendate.slice(0, 4)}-${seendate.slice(4, 6)}-${seendate.slice(6, 8)}T${seendate.slice(9, 11)}:${seendate.slice(11, 13)}:${seendate.slice(13, 15)}Z`;
}

// ── Core fetch ──

async function fetchAllUkraineNews(): Promise<{ articles: GeoArticle[]; sourcePerformance: SourcePerformance[] }> {
  const allArticles: GeoArticle[] = [];
  const sourcePerformance: SourcePerformance[] = [];

  // ── EARLY-RETURN PATTERN ──
  // Tier 1 fast, Tier 2/3 + GDELT async with hard deadline
  const tier1Feeds = UKRAINE_FEEDS.filter(f => f.tier === 1);
  const otherFeeds = UKRAINE_FEEDS.filter(f => f.tier !== 1);

  const fastPromises = [
    ...Object.values(UKRAINE_QUERIES).slice(0, 3).map(q => fetchGoogleUkraine(q)),
    ...tier1Feeds.map(f => fetchRSS(f).then(r => { sourcePerformance.push(r.perf); return r.articles; })),
  ];

  const slowPromises = [
    ...Object.values(UKRAINE_QUERIES).slice(3).map(q => fetchGoogleUkraine(q)),
    ...otherFeeds.map(f => fetchRSS(f).then(r => { sourcePerformance.push(r.perf); return r.articles; })),
    fetchGDELTUkraine(),
  ];

  const fastDeadline = new Promise<GeoArticle[][]>(resolve => {
    setTimeout(() => resolve([]), 1500);
  });

  const [fastResults, slowResults] = await Promise.all([
    Promise.race([
      Promise.allSettled(fastPromises).then(results =>
        results
          .filter((r): r is PromiseFulfilledResult<GeoArticle[]> => r.status === 'fulfilled')
          .map(r => r.value)
      ),
      fastDeadline,
    ]),
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
  const deduped = semanticDedup(allArticles);
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

async function refreshUkraineCache(): Promise<GeoNewsFeed> {
  const entry = cache.get('ukraine');
  if (entry?.isRefreshing) return entry.data;
  if (entry) entry.isRefreshing = true;

  const startTime = Date.now();
  try {
    const { articles, sourcePerformance } = await fetchAllUkraineNews();
    const final = deduplicateAndSort(articles);
    const prevScore = cache.get('ukraine')?.data.threatLevel?.score;
    const threatLevel = computeThreatLevel(final, prevScore);

    const response: GeoNewsFeed = {
      articles: final,
      fetchedAt: new Date().toISOString(),
      query: 'ukraine',
      totalResults: final.length,
      sourcesHit: sourcePerformance.filter(s => s.wasHit).map(s => s.id),
      latencyMs: Date.now() - startTime,
      threatLevel,
      sourcePerformance,
    };

    cache.set('ukraine', { data: response, timestamp: Date.now(), isRefreshing: false });
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
    const entry = cache.get('ukraine');
    if (!entry || Date.now() - entry.timestamp > CACHE_FRESH) {
      refreshUkraineCache().catch(() => {});
    }
  }, 6_000); // every 6s (was 12s)
}

// ── Handler ──

export async function GET() {
  ensureBackgroundRefresh();

  const now = Date.now();
  const entry = cache.get('ukraine');

  if (entry && now - entry.timestamp < CACHE_FRESH) {
    return NextResponse.json(entry.data);
  }

  if (entry && now - entry.timestamp < CACHE_STALE) {
    refreshUkraineCache().catch(() => {});
    return NextResponse.json(entry.data);
  }

  try {
    const response = await refreshUkraineCache();
    return NextResponse.json(response);
  } catch {
    if (entry) return NextResponse.json(entry.data);
    return NextResponse.json({
      articles: [],
      fetchedAt: new Date().toISOString(),
      query: 'ukraine',
      totalResults: 0,
      sourcesHit: [],
      latencyMs: 0,
      threatLevel: { severity: 'STABLE', score: 0, dominantCategory: 'none', activeHotspots: [], trend: 'stable', summary: 'Sem dados Ukraine' },
      sourcePerformance: [],
    } satisfies GeoNewsFeed);
  }
}
