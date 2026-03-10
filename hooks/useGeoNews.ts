'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GeoArticle, GeoNewsFeed } from '@/lib/geopolitical/types';

interface UseGeoNewsOptions {
  query: string;
  refreshInterval?: number; // ms, default 10s
}

interface UseGeoNewsReturn {
  articles: GeoArticle[];
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: string | null;
  totalResults: number;
  refresh: () => void;
  secondsSinceUpdate: number;
  sources: string[];
  sourcesHit: string[];
  latencyMs: number;
  newArticleCount: number; // articles added in last fetch
}

export function useGeoNews({
  query,
  refreshInterval = 10_000, // 10s — ultra-aggressive, SWR cache handles server load
}: UseGeoNewsOptions): UseGeoNewsReturn {
  const [articles, setArticles] = useState<GeoArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [totalResults, setTotalResults] = useState(0);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  const [sources, setSources] = useState<string[]>([]);
  const [sourcesHit, setSourcesHit] = useState<string[]>([]);
  const [latencyMs, setLatencyMs] = useState(0);
  const [newArticleCount, setNewArticleCount] = useState(0);

  const queryRef = useRef(query);
  queryRef.current = query;

  const fetchNews = useCallback(async () => {
    try {
      const params = new URLSearchParams({ query: queryRef.current });
      const res = await fetch(`/api/news/geopolitical?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: GeoNewsFeed = await res.json();

      // Merge new articles with existing (keep old ones that disappeared from feed)
      setArticles(prev => {
        const existing = new Map(prev.map(a => [a.id, a]));
        let newCount = 0;

        for (const a of data.articles) {
          if (!existing.has(a.id)) newCount++;
          existing.set(a.id, a);
        }

        setNewArticleCount(newCount);

        // Sort by urgency level first, then urgencyScore, then recency. Cap at 150
        const urgencyOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return [...existing.values()]
          .sort((a, b) => {
            const urgDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
            if (urgDiff !== 0) return urgDiff;
            const scoreDiff = b.urgencyScore - a.urgencyScore;
            if (Math.abs(scoreDiff) > 2) return scoreDiff;
            return new Date(b.seenAt).getTime() - new Date(a.seenAt).getTime();
          })
          .slice(0, 150);
      });

      setTotalResults(data.totalResults);
      setLastFetchedAt(data.fetchedAt);
      setSourcesHit(data.sourcesHit || []);
      setLatencyMs(data.latencyMs || 0);
      setError(null);

      // Extract unique sources
      const uniqueSources = [...new Set(data.articles.map(a => a.source))];
      setSources(uniqueSources.slice(0, 15));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch news');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch + interval
  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchNews, refreshInterval]);

  // Re-fetch when query changes
  useEffect(() => {
    setIsLoading(true);
    setArticles([]); // clear on category change
    fetchNews();
  }, [query, fetchNews]);

  // Seconds since last update ticker
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastFetchedAt) {
        const diff = Math.floor((Date.now() - new Date(lastFetchedAt).getTime()) / 1000);
        setSecondsSinceUpdate(diff);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lastFetchedAt]);

  return {
    articles,
    isLoading,
    error,
    lastFetchedAt,
    totalResults,
    refresh: fetchNews,
    secondsSinceUpdate,
    sources,
    sourcesHit,
    latencyMs,
    newArticleCount,
  };
}
