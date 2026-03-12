'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GeoArticle } from '@/lib/geopolitical/types';

// ══════════════════════════════════════════════════════════════
// useNewsStream — SSE Client for Real-time News Push
//
// Connects to /api/news/stream via Server-Sent Events.
// Falls back to REST polling if SSE fails or disconnects.
//
// Events consumed:
//   - "initial"   → cache dump on connect
//   - "critical"  → immediate article push
//   - "batch"     → batched routine articles
//   - "heartbeat" → connection keep-alive
// ══════════════════════════════════════════════════════════════

export type StreamStatus = 'connecting' | 'connected' | 'fallback' | 'error';

interface UseNewsStreamReturn {
  articles: GeoArticle[];
  status: StreamStatus;
  latencyMs: number;
  newArticleCount: number;
  criticalCount: number;
  lastEventAt: string | null;
  reconnect: () => void;
}

interface UseNewsStreamOptions {
  theater: 'iran' | 'ukraine' | 'all';
  fallbackEndpoint?: string;
  fallbackInterval?: number;  // default reduced to 3s (was 5s)
  enabled?: boolean;
}

export function useNewsStream({
  theater,
  fallbackEndpoint,
  fallbackInterval = 3000,
  enabled = true,
}: UseNewsStreamOptions): UseNewsStreamReturn {
  const [articles, setArticles] = useState<GeoArticle[]>([]);
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [latencyMs, setLatencyMs] = useState(0);
  const [newArticleCount, setNewArticleCount] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const articlesRef = useRef<Map<string, GeoArticle>>(new Map());
  const reconnectAttemptsRef = useRef(0);
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const lastNotificationRef = useRef(0);

  // Merge articles into state, sorted by urgency then recency
  const mergeArticles = useCallback((newArticles: GeoArticle[], isCritical = false) => {
    const map = articlesRef.current;
    let addedCount = 0;
    let critCount = 0;

    for (const article of newArticles) {
      if (!map.has(article.id)) {
        addedCount++;
        if (article.urgency === 'CRITICAL' || isCritical) critCount++;
      }
      map.set(article.id, article);
    }

    // Keep last 150 articles
    if (map.size > 150) {
      const sorted = [...map.entries()]
        .sort((a, b) => new Date(b[1].seenAt).getTime() - new Date(a[1].seenAt).getTime());
      articlesRef.current = new Map(sorted.slice(0, 150));
    }

    const urgencyOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
    const sortedArticles = [...articlesRef.current.values()]
      .sort((a, b) => {
        const urgDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        if (urgDiff !== 0) return urgDiff;
        return b.urgencyScore - a.urgencyScore || new Date(b.seenAt).getTime() - new Date(a.seenAt).getTime();
      });

    setArticles(sortedArticles);
    if (addedCount > 0) setNewArticleCount(addedCount);
    if (critCount > 0) setCriticalCount(prev => prev + critCount);
    setLastEventAt(new Date().toISOString());
  }, []);

  // Send browser notification for critical articles (throttled + deduped)
  const notifyCritical = useCallback((article: GeoArticle) => {
    if (typeof window === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    // Skip if already notified for this article
    if (notifiedIdsRef.current.has(article.id)) return;

    // Throttle: max 1 notification per 30 seconds
    const now = Date.now();
    if (now - lastNotificationRef.current < 30_000) return;

    notifiedIdsRef.current.add(article.id);
    lastNotificationRef.current = now;

    // Prune old notification IDs (keep last 50)
    if (notifiedIdsRef.current.size > 50) {
      const ids = [...notifiedIdsRef.current];
      notifiedIdsRef.current = new Set(ids.slice(-50));
    }

    try {
      new Notification(`SPECTER WAR ROOM — ${theater.toUpperCase()}`, {
        body: article.title,
        icon: '/favicon.ico',
        tag: `critical-${theater}`,
      });
    } catch { /* SSR or permission denied */ }
  }, [theater]);

  // ── SSE Connection ──
  const connectSSE = useCallback(() => {
    if (!enabled) return;

    // Cleanup existing
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setStatus('connecting');

    const es = new EventSource(`/api/news/stream?theater=${theater}`);
    eventSourceRef.current = es;

    es.addEventListener('initial', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.articles) {
          mergeArticles(data.articles);
        }
        setStatus('connected');
        reconnectAttemptsRef.current = 0;
      } catch { /* parse error */ }
    });

    es.addEventListener('critical', (e) => {
      const t0 = Date.now();
      try {
        const data = JSON.parse(e.data);
        if (data.article) {
          mergeArticles([data.article], true);
          notifyCritical(data.article);
          setLatencyMs(Date.now() - (data.ts || t0));
        }
      } catch { /* parse error */ }
    });

    es.addEventListener('batch', (e) => {
      const t0 = Date.now();
      try {
        const data = JSON.parse(e.data);
        if (data.articles) {
          mergeArticles(data.articles);
          setLatencyMs(Date.now() - (data.ts || t0));
        }
      } catch { /* parse error */ }
    });

    es.addEventListener('heartbeat', (e) => {
      setLastEventAt(new Date().toISOString());
      setStatus('connected');
    });

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      reconnectAttemptsRef.current++;

      // After 3 failed attempts, fall back to polling
      if (reconnectAttemptsRef.current >= 3) {
        setStatus('fallback');
        startFallbackPolling();
      } else {
        // Exponential backoff reconnect
        const delay = Math.min(5000, 1000 * Math.pow(2, reconnectAttemptsRef.current));
        setTimeout(connectSSE, delay);
      }
    };
  }, [enabled, theater, mergeArticles, notifyCritical]);

  // ── Fallback Polling ──
  const startFallbackPolling = useCallback(() => {
    if (fallbackTimerRef.current) return;

    const endpoint = fallbackEndpoint || `/api/news/${theater === 'all' ? 'iran' : theater}`;

    const poll = async () => {
      try {
        const res = await fetch(endpoint);
        if (!res.ok) return;
        const data = await res.json();
        if (data.articles) {
          mergeArticles(data.articles);
          setLatencyMs(data.latencyMs || 0);
        }
      } catch { /* fetch error */ }
    };

    poll(); // Immediate first poll
    fallbackTimerRef.current = setInterval(poll, fallbackInterval);
  }, [fallbackEndpoint, fallbackInterval, theater, mergeArticles]);

  const stopFallbackPolling = useCallback(() => {
    if (fallbackTimerRef.current) {
      clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  // ── Reconnect (manual) ──
  const reconnect = useCallback(() => {
    stopFallbackPolling();
    reconnectAttemptsRef.current = 0;
    connectSSE();
  }, [connectSSE, stopFallbackPolling]);

  // ── Lifecycle ──
  useEffect(() => {
    if (!enabled) return;

    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      stopFallbackPolling();
    };
  }, [enabled, connectSSE, stopFallbackPolling]);

  return {
    articles,
    status,
    latencyMs,
    newArticleCount,
    criticalCount,
    lastEventAt,
    reconnect,
  };
}
