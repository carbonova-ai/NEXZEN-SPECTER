'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { GeoArticle, GeoNewsFeed, ThreatLevel, SourcePerformance } from '@/lib/geopolitical/types';
import { clusterArticles } from '@/lib/geopolitical/clustering';
import type { ArticleCluster } from '@/lib/geopolitical/types';
import {
  analyzeIranArticle,
  computeIranEscalation,
  type IranAnalysis,
  type EscalationState,
} from '@/lib/geopolitical/iran-intelligence';
import { useNewsStream } from './useNewsStream';

// ══════════════════════════════════════════════════════════════
// useIranMonitor — Real-time Iran Intelligence Hook
//
// Specialized monitoring for Iran theater:
// - SSE real-time stream (sub-second CRITICAL delivery)
// - Falls back to REST polling if SSE fails
// - Computes Iran escalation state in real-time
// - Tracks escalation phase transitions
// - Browser notifications on critical Iran events
// ══════════════════════════════════════════════════════════════

interface UseIranMonitorReturn {
  // Articles
  articles: GeoArticle[];
  iranArticles: IranArticleWithAnalysis[];
  clusters: ArticleCluster[];
  isLoading: boolean;
  error: string | null;

  // Iran-specific intelligence
  escalation: EscalationState;
  threatLevel: ThreatLevel | null;
  sourcePerformance: SourcePerformance[];

  // Metrics
  totalResults: number;
  lastFetchedAt: string | null;
  secondsSinceUpdate: number;
  latencyMs: number;
  newArticleCount: number;
  criticalIds: Set<string>;

  // Phase transition alerts
  phaseTransition: PhaseTransition | null;

  // Stream status
  streamStatus: import('./useNewsStream').StreamStatus;

  // Actions
  refresh: () => void;
}

export interface IranArticleWithAnalysis {
  article: GeoArticle;
  analysis: IranAnalysis;
}

interface PhaseTransition {
  from: string;
  to: string;
  timestamp: string;
  triggerArticle: string;
}

export function useIranMonitor(refreshInterval = 8_000): UseIranMonitorReturn {
  // ── SSE Stream (primary data source) ──
  const stream = useNewsStream({
    theater: 'iran',
    fallbackEndpoint: '/api/news/iran',
    fallbackInterval: refreshInterval,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  const [threatLevel, setThreatLevel] = useState<ThreatLevel | null>(null);
  const [sourcePerformance, setSourcePerformance] = useState<SourcePerformance[]>([]);
  const [clusters, setClusters] = useState<ArticleCluster[]>([]);
  const [criticalIds, setCriticalIds] = useState<Set<string>>(new Set());
  const [phaseTransition, setPhaseTransition] = useState<PhaseTransition | null>(null);

  const escalationRef = useRef<EscalationState | null>(null);

  // Articles from SSE stream
  const articles = stream.articles;

  // Update loading/error from stream status
  useEffect(() => {
    if (stream.status === 'connected' || stream.status === 'fallback') {
      setIsLoading(false);
    }
    if (stream.status === 'error') {
      setError('Stream connection failed');
    } else {
      setError(null);
    }
  }, [stream.status]);

  // Update clusters when articles change
  useEffect(() => {
    if (articles.length > 0) {
      setClusters(clusterArticles(articles.slice(0, 120)));
    }
  }, [articles]);

  // Track critical article IDs
  useEffect(() => {
    const criticals = new Set(articles.filter(a => a.urgency === 'CRITICAL').map(a => a.id));
    if (criticals.size > 0) setCriticalIds(criticals);
  }, [articles]);

  // Also fetch source performance from REST endpoint periodically
  // (SSE doesn't carry source metrics)
  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const res = await fetch('/api/news/iran');
        if (!res.ok) return;
        const data: GeoNewsFeed = await res.json();
        if (data.threatLevel) setThreatLevel(data.threatLevel);
        if (data.sourcePerformance) setSourcePerformance(data.sourcePerformance);
      } catch { /* non-critical */ }
    };

    fetchMeta();
    const interval = setInterval(fetchMeta, 15_000); // every 15s for metadata
    return () => clearInterval(interval);
  }, []);

  // Seconds since update ticker
  // Seconds since last update ticker
  useEffect(() => {
    const interval = setInterval(() => {
      if (stream.lastEventAt) {
        setSecondsSinceUpdate(Math.floor((Date.now() - new Date(stream.lastEventAt).getTime()) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [stream.lastEventAt]);

  // Compute Iran-specific analyses and escalation
  const iranArticles = useMemo(() => {
    return articles
      .map(article => ({
        article,
        analysis: analyzeIranArticle(article),
      }))
      .filter(x => x.analysis.isIranRelated)
      .sort((a, b) => b.analysis.relevanceScore - a.analysis.relevanceScore);
  }, [articles]);

  const escalation = useMemo(() => {
    const newEscalation = computeIranEscalation(articles, escalationRef.current || undefined);
    return newEscalation;
  }, [articles]);

  // Detect phase transitions (separate effect — cannot setState in useMemo)
  useEffect(() => {
    if (escalationRef.current && escalation.phase !== escalationRef.current.phase) {
      setPhaseTransition({
        from: escalationRef.current.phase,
        to: escalation.phase,
        timestamp: new Date().toISOString(),
        triggerArticle: iranArticles[0]?.article.title || 'Unknown',
      });

      if (typeof window !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification('SPECTER WAR ROOM — ESCALATION SHIFT', {
            body: `Iran: ${escalationRef.current.phase} → ${escalation.phase}`,
            icon: '/favicon.ico',
            tag: 'iran-escalation',
          });
        } catch { /* SSR or permission denied */ }
      }
    }
    escalationRef.current = escalation;
  }, [escalation, iranArticles]);

  return {
    articles,
    iranArticles,
    clusters,
    isLoading,
    error,
    escalation,
    threatLevel,
    sourcePerformance,
    totalResults: articles.length,
    lastFetchedAt: stream.lastEventAt,
    secondsSinceUpdate,
    latencyMs: stream.latencyMs,
    newArticleCount: stream.newArticleCount,
    criticalIds,
    phaseTransition,
    streamStatus: stream.status,
    refresh: stream.reconnect,
  };
}
