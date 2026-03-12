'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import type { GeoArticle, GeoNewsFeed, ThreatLevel, SourcePerformance } from '@/lib/geopolitical/types';
import { clusterArticles } from '@/lib/geopolitical/clustering';
import type { ArticleCluster } from '@/lib/geopolitical/types';
import {
  analyzeUkraineArticle,
  computeUkraineEscalation,
  type UkraineAnalysis,
  type UkraineEscalationState,
} from '@/lib/geopolitical/ukraine-intelligence';
import { useNewsStream, type StreamStatus } from './useNewsStream';

// ══════════════════════════════════════════════════════════════
// useUkraineMonitor — Real-time Ukraine Intelligence Hook
//
// SSE-powered monitoring for Ukraine theater:
// - Real-time stream with sub-second CRITICAL delivery
// - Computes Ukraine escalation state
// - Tracks frontline dynamics and nuclear risk
// - Browser notifications on critical events
// ══════════════════════════════════════════════════════════════

export interface UkraineArticleWithAnalysis {
  article: GeoArticle;
  analysis: UkraineAnalysis;
}

interface PhaseTransition {
  from: string;
  to: string;
  timestamp: string;
  triggerArticle: string;
}

interface UseUkraineMonitorReturn {
  articles: GeoArticle[];
  ukraineArticles: UkraineArticleWithAnalysis[];
  clusters: ArticleCluster[];
  isLoading: boolean;
  error: string | null;
  escalation: UkraineEscalationState;
  threatLevel: ThreatLevel | null;
  sourcePerformance: SourcePerformance[];
  totalResults: number;
  lastFetchedAt: string | null;
  secondsSinceUpdate: number;
  latencyMs: number;
  newArticleCount: number;
  phaseTransition: PhaseTransition | null;
  streamStatus: StreamStatus;
  refresh: () => void;
}

export function useUkraineMonitor(refreshInterval = 8_000): UseUkraineMonitorReturn {
  const stream = useNewsStream({
    theater: 'ukraine',
    fallbackEndpoint: '/api/news/ukraine',
    fallbackInterval: refreshInterval,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  const [threatLevel, setThreatLevel] = useState<ThreatLevel | null>(null);
  const [sourcePerformance, setSourcePerformance] = useState<SourcePerformance[]>([]);
  const [clusters, setClusters] = useState<ArticleCluster[]>([]);
  const [phaseTransition, setPhaseTransition] = useState<PhaseTransition | null>(null);

  const escalationRef = useRef<UkraineEscalationState | null>(null);
  const articles = stream.articles;

  useEffect(() => {
    if (stream.status === 'connected' || stream.status === 'fallback') setIsLoading(false);
    if (stream.status === 'error') setError('Stream connection failed');
    else setError(null);
  }, [stream.status]);

  useEffect(() => {
    if (articles.length > 0) setClusters(clusterArticles(articles.slice(0, 120)));
  }, [articles]);

  // Fetch source performance periodically from REST
  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const res = await fetch('/api/news/ukraine');
        if (!res.ok) return;
        const data: GeoNewsFeed = await res.json();
        if (data.threatLevel) setThreatLevel(data.threatLevel);
        if (data.sourcePerformance) setSourcePerformance(data.sourcePerformance);
      } catch { /* non-critical */ }
    };
    fetchMeta();
    const interval = setInterval(fetchMeta, 15_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (stream.lastEventAt) {
        setSecondsSinceUpdate(Math.floor((Date.now() - new Date(stream.lastEventAt).getTime()) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [stream.lastEventAt]);

  const ukraineArticles = useMemo(() => {
    return articles
      .map(article => ({ article, analysis: analyzeUkraineArticle(article) }))
      .filter(x => x.analysis.isUkraineRelated)
      .sort((a, b) => b.analysis.relevanceScore - a.analysis.relevanceScore);
  }, [articles]);

  const escalation = useMemo(() => {
    return computeUkraineEscalation(articles, escalationRef.current || undefined);
  }, [articles]);

  // Detect phase transitions (separate effect — cannot setState in useMemo)
  useEffect(() => {
    if (escalationRef.current && escalation.phase !== escalationRef.current.phase) {
      setPhaseTransition({
        from: escalationRef.current.phase,
        to: escalation.phase,
        timestamp: new Date().toISOString(),
        triggerArticle: ukraineArticles[0]?.article.title || 'Unknown',
      });

      if (typeof window !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification('SPECTER WAR ROOM — UKRAINE ESCALATION', {
            body: `${escalationRef.current.phase} → ${escalation.phase}`,
            icon: '/favicon.ico',
            tag: 'ukraine-escalation',
          });
        } catch { /* SSR or permission denied */ }
      }
    }
    escalationRef.current = escalation;
  }, [escalation, ukraineArticles]);

  return {
    articles,
    ukraineArticles,
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
    phaseTransition,
    streamStatus: stream.status,
    refresh: stream.reconnect,
  };
}
