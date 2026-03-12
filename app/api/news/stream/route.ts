import { NextRequest } from 'next/server';
import type { GeoArticle, GeoNewsFeed } from '@/lib/geopolitical/types';
import { classifyPriority, type ArticlePriority } from '@/lib/geopolitical/dedup';

// ══════════════════════════════════════════════════════════════
// SSE NEWS STREAM — Real-time Push for War Room
//
// Server-Sent Events endpoint that pushes news to the client
// with sub-second delivery for CRITICAL events.
//
// Events:
//   - "critical"  → pushed immediately (nuclear, strike, war)
//   - "batch"     → routine articles every 500ms (was 3s)
//   - "heartbeat" → keep-alive every 5s
//
// Usage: /api/news/stream?theater=iran|ukraine|all
// ══════════════════════════════════════════════════════════════

// ── Shared state across SSE connections ──
// We maintain a global article cache that gets updated by polling the theater APIs.
// New articles are detected by diffing against the last known set.

interface TheaterCache {
  articles: Map<string, GeoArticle & { priority: ArticlePriority }>;
  lastFetchAt: number;
}

const theaterCaches = new Map<string, TheaterCache>();

function getOrCreateCache(theater: string): TheaterCache {
  if (!theaterCaches.has(theater)) {
    theaterCaches.set(theater, { articles: new Map(), lastFetchAt: 0 });
  }
  return theaterCaches.get(theater)!;
}

// ── Fetch articles from theater API ──

async function fetchTheaterArticles(theater: string): Promise<GeoArticle[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const endpoint = theater === 'ukraine' ? '/api/news/ukraine' : '/api/news/iran';

  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      signal: AbortSignal.timeout(4000), // was 8s — faster failure, faster retry
    });
    if (!res.ok) return [];
    const data: GeoNewsFeed = await res.json();
    return data.articles || [];
  } catch {
    return [];
  }
}

// ── Detect new articles and classify priority ──

interface NewArticles {
  critical: GeoArticle[];
  batch: GeoArticle[];
}

function detectNewArticles(theater: string, freshArticles: GeoArticle[]): NewArticles {
  const cache = getOrCreateCache(theater);
  const critical: GeoArticle[] = [];
  const batch: GeoArticle[] = [];

  for (const article of freshArticles) {
    if (cache.articles.has(article.id)) continue; // already seen

    const priority = classifyPriority(article.title, article.snippet);
    cache.articles.set(article.id, { ...article, priority });

    if (priority === 'CRITICAL') {
      critical.push(article);
    } else {
      batch.push(article);
    }
  }

  // Prune old articles (keep last 200)
  if (cache.articles.size > 200) {
    const sorted = [...cache.articles.entries()]
      .sort((a, b) => new Date(b[1].seenAt).getTime() - new Date(a[1].seenAt).getTime());
    cache.articles = new Map(sorted.slice(0, 200));
  }

  cache.lastFetchAt = Date.now();
  return { critical, batch };
}

// ── SSE Encoder ──

function encodeSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ── Route Handler ──

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const theater = request.nextUrl.searchParams.get('theater') || 'iran';
  const theaters = theater === 'all' ? ['iran', 'ukraine'] : [theater];

  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function send(event: string, data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeSSE(event, data)));
        } catch {
          closed = true;
        }
      }

      // Send initial payload from cache
      for (const t of theaters) {
        const cache = getOrCreateCache(t);
        if (cache.articles.size > 0) {
          const articles = [...cache.articles.values()]
            .sort((a, b) => new Date(b.seenAt).getTime() - new Date(a.seenAt).getTime())
            .slice(0, 50);
          send('initial', { theater: t, articles });
        }
      }

      send('heartbeat', { ts: Date.now(), theaters });

      // ── Polling loops per theater ──
      // ULTRA-LOW LATENCY: 1.5s primary, 2s secondary

      const intervals: ReturnType<typeof setInterval>[] = [];
      let batchBuffer: GeoArticle[] = [];
      let lastBatchFlush = Date.now();

      for (const t of theaters) {
        const pollInterval = t === theaters[0] ? 1500 : 2000;

        const poll = async () => {
          if (closed) return;

          try {
            const articles = await fetchTheaterArticles(t);
            if (articles.length === 0) return;

            const { critical, batch } = detectNewArticles(t, articles);

            // Critical articles → push immediately
            for (const article of critical) {
              send('critical', { theater: t, article, ts: Date.now() });
            }

            // Batch articles → buffer for periodic flush
            batchBuffer.push(...batch);
          } catch {
            // Silently continue on fetch errors
          }
        };

        // First poll immediately
        poll();

        // Then on interval
        intervals.push(setInterval(poll, pollInterval));
      }

      // Batch flush every 500ms (was 3s — 6x faster routine delivery)
      const batchFlushInterval = setInterval(() => {
        if (closed) {
          cleanup();
          return;
        }

        if (batchBuffer.length > 0) {
          send('batch', { articles: batchBuffer, ts: Date.now() });
          batchBuffer = [];
        }
        lastBatchFlush = Date.now();
      }, 500);

      // Heartbeat every 5s (was 10s — faster disconnect detection)
      const heartbeatInterval = setInterval(() => {
        if (closed) {
          cleanup();
          return;
        }
        send('heartbeat', { ts: Date.now(), theaters });
      }, 5000);

      // Cleanup function
      function cleanup() {
        for (const i of intervals) clearInterval(i);
        clearInterval(batchFlushInterval);
        clearInterval(heartbeatInterval);
        if (!closed) {
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
        }
      }

      // Handle client disconnect via abort signal
      request.signal.addEventListener('abort', () => {
        cleanup();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
