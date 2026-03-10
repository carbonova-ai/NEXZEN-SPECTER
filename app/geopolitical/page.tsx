'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useGeoNews } from '@/hooks/useGeoNews';
import { usePolymarketGeo } from '@/hooks/usePolymarketGeo';
import { GeoStatusBar } from '@/components/geopolitical/GeoStatusBar';
import { NewsFeed } from '@/components/geopolitical/NewsFeed';
import { TribunalPanel } from '@/components/geopolitical/TribunalPanel';
import { PolymarketGeoPanel } from '@/components/geopolitical/PolymarketGeoPanel';
import { ThreatMeter } from '@/components/geopolitical/ThreatMeter';
import { CorrelationPanel } from '@/components/geopolitical/CorrelationPanel';
import { ClusterView } from '@/components/geopolitical/ClusterView';
import { GEO_CATEGORIES } from '@/lib/geopolitical/types';
import { findCorrelations } from '@/lib/geopolitical/correlation';
import type { GeoArticle, TribunalResult, ThreatLevel } from '@/lib/geopolitical/types';
import type { CorrelationSummary } from '@/lib/geopolitical/correlation';

const VERDICTS_STORAGE_KEY = 'specter-geo-verdicts';
const NOTIF_PERMISSION_KEY = 'specter-geo-notif';

function loadVerdicts(): TribunalResult[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(VERDICTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveVerdicts(verdicts: TribunalResult[]) {
  try {
    localStorage.setItem(VERDICTS_STORAGE_KEY, JSON.stringify(verdicts.slice(0, 100)));
  } catch { /* quota exceeded, ignore */ }
}

// ── Browser Notification for CRITICAL events ──
function sendCriticalNotification(article: GeoArticle) {
  if (typeof window === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification('SPECTER GEO — CRITICAL', {
      body: article.title,
      icon: '/favicon.ico',
      tag: `geo-critical-${article.id}`,
      requireInteraction: true,
    });
  } catch { /* ignore */ }
}

export default function GeopoliticalDashboard() {
  // Category filter
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const activeCategory = GEO_CATEGORIES.find(c => c.id === activeCategoryId) || GEO_CATEGORIES[0];

  // View mode: feed or clusters
  const [viewMode, setViewMode] = useState<'feed' | 'clusters'>('feed');

  // News feed — 10s polling, SWR server cache
  const {
    articles,
    isLoading,
    error,
    totalResults,
    refresh,
    secondsSinceUpdate,
    sources,
    sourcesHit,
    latencyMs,
    newArticleCount,
    threatLevel,
    sourcePerformance,
    clusters,
    criticalIds,
  } = useGeoNews({
    query: activeCategory.query,
    refreshInterval: 10_000,
  });

  // Polymarket geopolitical markets — 30s polling
  const {
    markets: geoMarkets,
    isLoading: polyLoading,
    error: polyError,
    lastRefreshed: polyLastRefreshed,
  } = usePolymarketGeo();

  // Selected article for tribunal
  const [selectedArticle, setSelectedArticle] = useState<GeoArticle | null>(null);

  // Verdicts history — persisted to localStorage
  const [verdicts, setVerdicts] = useState<TribunalResult[]>([]);

  // Notification permission state
  const [notifEnabled, setNotifEnabled] = useState(false);

  // Load verdicts from localStorage on mount + check notification permission
  useEffect(() => {
    setVerdicts(loadVerdicts());
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifEnabled(Notification.permission === 'granted');
    }
  }, []);

  // v3.0: Browser notifications for new CRITICAL events
  const prevCriticalIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!notifEnabled) return;
    for (const id of criticalIds) {
      if (!prevCriticalIdsRef.current.has(id)) {
        const article = articles.find(a => a.id === id);
        if (article) sendCriticalNotification(article);
      }
    }
    prevCriticalIdsRef.current = criticalIds;
  }, [criticalIds, articles, notifEnabled]);

  // v3.0: News-Polymarket correlations (recomputed when articles or markets change)
  const [correlations, setCorrelations] = useState<CorrelationSummary>({
    totalCorrelations: 0,
    confirmingCount: 0,
    contradictingCount: 0,
    topCorrelations: [],
    marketMomentum: 'MIXED',
  });

  useEffect(() => {
    if (articles.length > 0 && geoMarkets.length > 0) {
      setCorrelations(findCorrelations(articles, geoMarkets));
    }
  }, [articles, geoMarkets]);

  const handleNewVerdict = useCallback((verdict: TribunalResult) => {
    setVerdicts(prev => {
      const next = [verdict, ...prev];
      saveVerdicts(next);
      return next;
    });
  }, []);

  const handleSelectArticle = useCallback((article: GeoArticle) => {
    setSelectedArticle(prev => prev?.id === article.id ? null : article);
  }, []);

  const handleEnableNotifications = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setNotifEnabled(permission === 'granted');
    if (permission === 'granted') {
      localStorage.setItem(NOTIF_PERMISSION_KEY, 'true');
    }
  }, []);

  // Count critical articles for status bar
  const criticalCount = articles.filter(a => a.urgency === 'CRITICAL').length;

  // Default threat level
  const currentThreat: ThreatLevel = threatLevel || {
    severity: 'STABLE',
    score: 0,
    dominantCategory: 'none',
    activeHotspots: [],
    trend: 'stable',
    summary: 'Carregando...',
  };

  return (
    <div className="flex flex-col min-h-screen bg-nexzen-bg">
      {/* Header */}
      <GeoStatusBar
        totalArticles={totalResults}
        secondsSinceUpdate={secondsSinceUpdate}
        isLoading={isLoading}
        error={error}
        onRefresh={refresh}
        activeCategory={activeCategory.label}
        sources={sources}
        sourcesHit={sourcesHit}
        latencyMs={latencyMs}
        newArticleCount={newArticleCount}
        polymarketCount={geoMarkets.length}
        threatSeverity={currentThreat.severity}
        threatScore={currentThreat.score}
        correlationMomentum={correlations.marketMomentum}
      />

      {/* Category Filter Bar */}
      <div className="flex items-center gap-1 px-4 py-2 bg-nexzen-surface/40 border-b border-nexzen-border/10 overflow-x-auto">
        {GEO_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategoryId(cat.id)}
            className={`px-3 py-1 text-[9px] uppercase tracking-wider rounded-full border transition-all whitespace-nowrap ${
              activeCategoryId === cat.id
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                : 'border-nexzen-border/20 text-nexzen-muted hover:text-nexzen-text hover:border-nexzen-border/40'
            }`}
          >
            <span className="mr-1">{cat.icon}</span>
            {cat.label}
          </button>
        ))}

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            onClick={() => setViewMode('feed')}
            className={`px-2 py-1 text-[8px] uppercase tracking-wider rounded-full border transition-all ${
              viewMode === 'feed'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                : 'border-nexzen-border/20 text-nexzen-muted hover:text-nexzen-text'
            }`}
          >
            FEED
          </button>
          <button
            onClick={() => setViewMode('clusters')}
            className={`px-2 py-1 text-[8px] uppercase tracking-wider rounded-full border transition-all ${
              viewMode === 'clusters'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                : 'border-nexzen-border/20 text-nexzen-muted hover:text-nexzen-text'
            }`}
          >
            CLUSTERS
          </button>

          {/* Notification toggle */}
          {typeof window !== 'undefined' && 'Notification' in window && !notifEnabled && (
            <button
              onClick={handleEnableNotifications}
              className="px-2 py-1 text-[8px] uppercase tracking-wider rounded-full border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all ml-2"
              title="Ativar alertas CRITICAL no navegador"
            >
              ALERTAS
            </button>
          )}
          {notifEnabled && (
            <span className="text-[7px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full ml-2">
              ALERTAS ON
            </span>
          )}
        </div>

        {criticalCount > 0 && (
          <span className="text-[9px] text-red-400 font-bold animate-pulse shrink-0">
            {criticalCount} CRITICAL
          </span>
        )}
      </div>

      {/* Main Content */}
      <main className="flex-1 flex gap-3 p-3 md:p-4 max-w-[1920px] mx-auto w-full min-h-0">
        {/* Left: News Feed / Clusters (45%) */}
        <div className="w-full md:w-[45%] flex flex-col min-h-0">
          {viewMode === 'feed' ? (
            <NewsFeed
              articles={articles}
              isLoading={isLoading}
              selectedId={selectedArticle?.id ?? null}
              onSelect={handleSelectArticle}
              newArticleCount={newArticleCount}
            />
          ) : (
            <div className="glass-card flex flex-col h-full" style={{ borderColor: 'rgba(245,158,11,0.08)' }}>
              <div className="flex items-center justify-between p-3 border-b border-nexzen-border/20">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-[10px] uppercase tracking-wider text-nexzen-muted">
                    STORY CLUSTERS
                  </span>
                  <span className="text-[9px] text-nexzen-muted tabular-nums">
                    {clusters.length} threads
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                <ClusterView
                  clusters={clusters}
                  onSelectArticle={handleSelectArticle}
                  selectedId={selectedArticle?.id ?? null}
                />
              </div>
            </div>
          )}
        </div>

        {/* Center: Tribunal (30%) */}
        <div className="hidden md:flex md:w-[30%] flex-col min-h-0">
          <TribunalPanel
            selectedArticle={selectedArticle}
            allArticles={articles}
            verdicts={verdicts}
            onNewVerdict={handleNewVerdict}
            geoMarkets={geoMarkets}
          />
        </div>

        {/* Right: Threat Meter + Polymarket + Correlations + Stats (25%) */}
        <div className="hidden lg:flex lg:w-[25%] flex-col gap-3 min-h-0 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
          {/* Threat Meter — DEFCON */}
          <ThreatMeter threatLevel={currentThreat} />

          {/* News × Markets Correlation */}
          <CorrelationPanel correlations={correlations} />

          {/* Polymarket */}
          <PolymarketGeoPanel
            markets={geoMarkets}
            isLoading={polyLoading}
            error={polyError}
            lastRefreshed={polyLastRefreshed}
          />

          {/* Session stats */}
          <div className="glass-card p-3" style={{ borderColor: 'rgba(245,158,11,0.08)' }}>
            <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-2">
              STATS DA SESSAO
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center">
                <div className="text-lg font-bold text-nexzen-text tabular-nums">{verdicts.length}</div>
                <div className="text-[8px] text-nexzen-muted uppercase">Julgamentos</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-green-400 tabular-nums">
                  {verdicts.filter(v => v.verdict === 'APORTAR').length}
                </div>
                <div className="text-[8px] text-nexzen-muted uppercase">Aportar</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-red-400 tabular-nums">
                  {verdicts.filter(v => v.verdict === 'NAO_APORTAR').length}
                </div>
                <div className="text-[8px] text-nexzen-muted uppercase">Recusados</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-amber-400 tabular-nums">
                  {verdicts.length > 0
                    ? (verdicts.reduce((s, v) => s + v.confidence, 0) / verdicts.length).toFixed(1)
                    : '—'}
                </div>
                <div className="text-[8px] text-nexzen-muted uppercase">Conf. Media</div>
              </div>
            </div>
          </div>

          {/* Source Performance */}
          <div className="glass-card p-3" style={{ borderColor: 'rgba(245,158,11,0.08)' }}>
            <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-2">
              FONTES — PERFORMANCE
            </div>
            <div className="space-y-1">
              {(sourcePerformance.length > 0 ? sourcePerformance : [
                { id: 'google', name: 'Google News', tier: 1, responseTimeMs: 0, articlesDelivered: 0, wasHit: false },
                { id: 'bbc', name: 'BBC World', tier: 1, responseTimeMs: 0, articlesDelivered: 0, wasHit: false },
                { id: 'guardian', name: 'The Guardian', tier: 1, responseTimeMs: 0, articlesDelivered: 0, wasHit: false },
                { id: 'aljazeera', name: 'Al Jazeera', tier: 1, responseTimeMs: 0, articlesDelivered: 0, wasHit: false },
                { id: 'france24', name: 'France24', tier: 2, responseTimeMs: 0, articlesDelivered: 0, wasHit: false },
                { id: 'dw', name: 'Deutsche Welle', tier: 2, responseTimeMs: 0, articlesDelivered: 0, wasHit: false },
                { id: 'nhk', name: 'NHK World', tier: 2, responseTimeMs: 0, articlesDelivered: 0, wasHit: false },
                { id: 'sky', name: 'Sky News', tier: 2, responseTimeMs: 0, articlesDelivered: 0, wasHit: false },
                { id: 'cnbc', name: 'CNBC World', tier: 3, responseTimeMs: 0, articlesDelivered: 0, wasHit: false },
                { id: 'gdelt', name: 'GDELT', tier: 3, responseTimeMs: 0, articlesDelivered: 0, wasHit: false },
              ]).sort((a, b) => a.tier - b.tier || b.articlesDelivered - a.articlesDelivered).map(src => (
                <div key={src.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      src.wasHit ? 'bg-green-500' : 'bg-nexzen-muted/20'
                    }`} />
                    <span className="text-[9px] text-nexzen-muted">{src.name}</span>
                    <span className={`text-[6px] px-1 rounded ${
                      src.tier === 1 ? 'text-green-400/60 bg-green-500/5' :
                      src.tier === 2 ? 'text-amber-400/60 bg-amber-500/5' :
                      'text-nexzen-muted/40'
                    }`}>
                      T{src.tier}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {src.articlesDelivered > 0 && (
                      <span className="text-[8px] text-nexzen-muted tabular-nums">
                        {src.articlesDelivered} art
                      </span>
                    )}
                    {src.responseTimeMs > 0 && (
                      <span className={`text-[8px] tabular-nums ${
                        src.responseTimeMs < 1500 ? 'text-green-400/60' :
                        src.responseTimeMs < 3000 ? 'text-amber-400/60' :
                        'text-red-400/60'
                      }`}>
                        {src.responseTimeMs < 1000
                          ? `${src.responseTimeMs}ms`
                          : `${(src.responseTimeMs / 1000).toFixed(1)}s`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 bg-nexzen-surface/60 border-t border-nexzen-border/10 text-[9px] text-nexzen-muted">
        <div className="flex items-center gap-3">
          <span>10 fontes RSS + GDELT + Polymarket</span>
          <span className="text-nexzen-border">|</span>
          <span>News: 10s SWR | Polymarket: 30s</span>
          <span className="text-nexzen-border">|</span>
          <span>Polymarket: {geoMarkets.length} mercados geo</span>
          <span className="text-nexzen-border">|</span>
          <span>Clusters: {clusters.filter(c => c.articleCount >= 2).length} threads</span>
          <span className="text-nexzen-border">|</span>
          <span>Correlacoes: {correlations.totalCorrelations} links</span>
          <span className="text-nexzen-border">|</span>
          <span>Tribunal: Framework Institucional v3.0</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-amber-500/40">SPECTER GEOPOLITICAL v3.0</span>
        </div>
      </div>
    </div>
  );
}
