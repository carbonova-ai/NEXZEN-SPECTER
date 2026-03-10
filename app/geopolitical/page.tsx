'use client';

import { useState, useCallback, useEffect } from 'react';
import { useGeoNews } from '@/hooks/useGeoNews';
import { usePolymarketGeo } from '@/hooks/usePolymarketGeo';
import { GeoStatusBar } from '@/components/geopolitical/GeoStatusBar';
import { NewsFeed } from '@/components/geopolitical/NewsFeed';
import { TribunalPanel } from '@/components/geopolitical/TribunalPanel';
import { PolymarketGeoPanel } from '@/components/geopolitical/PolymarketGeoPanel';
import { GEO_CATEGORIES } from '@/lib/geopolitical/types';
import type { GeoArticle, TribunalResult } from '@/lib/geopolitical/types';

const VERDICTS_STORAGE_KEY = 'specter-geo-verdicts';

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
    // Keep max 100 verdicts (increased from 50)
    localStorage.setItem(VERDICTS_STORAGE_KEY, JSON.stringify(verdicts.slice(0, 100)));
  } catch { /* quota exceeded, ignore */ }
}

export default function GeopoliticalDashboard() {
  // Category filter
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const activeCategory = GEO_CATEGORIES.find(c => c.id === activeCategoryId) || GEO_CATEGORIES[0];

  // News feed — 10s polling, SWR server cache (instant stale response + background refresh)
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

  // Load verdicts from localStorage on mount
  useEffect(() => {
    setVerdicts(loadVerdicts());
  }, []);

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

  // Count critical articles for status bar
  const criticalCount = articles.filter(a => a.urgency === 'CRITICAL').length;

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

        {criticalCount > 0 && (
          <span className="ml-auto text-[9px] text-red-400 font-bold animate-pulse">
            {criticalCount} CRITICAL
          </span>
        )}
      </div>

      {/* Main Content */}
      <main className="flex-1 flex gap-3 p-3 md:p-4 max-w-[1920px] mx-auto w-full min-h-0">
        {/* Left: News Feed (45%) */}
        <div className="w-full md:w-[45%] flex flex-col min-h-0">
          <NewsFeed
            articles={articles}
            isLoading={isLoading}
            selectedId={selectedArticle?.id ?? null}
            onSelect={handleSelectArticle}
            newArticleCount={newArticleCount}
          />
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

        {/* Right: Polymarket + Stats (25%) */}
        <div className="hidden lg:flex lg:w-[25%] flex-col gap-3 min-h-0">
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

          {/* Feed health */}
          <div className="glass-card p-3" style={{ borderColor: 'rgba(245,158,11,0.08)' }}>
            <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-2">
              FONTES ATIVAS
            </div>
            <div className="space-y-1">
              {[
                { name: 'Google News', key: 'google' },
                { name: 'BBC World', key: 'bbc' },
                { name: 'The Guardian', key: 'guardian' },
                { name: 'Al Jazeera', key: 'aljazeera' },
                { name: 'France24', key: 'france24' },
                { name: 'Deutsche Welle', key: 'dw' },
                { name: 'NHK World', key: 'nhk' },
                { name: 'CNBC World', key: 'cnbc' },
                { name: 'Sky News', key: 'sky' },
                { name: 'GDELT', key: 'gdelt' },
                { name: 'Polymarket', key: 'poly' },
              ].map(({ name, key }) => {
                const isHit = key === 'poly'
                  ? geoMarkets.length > 0
                  : sourcesHit.includes(key) || (sources || []).some(s =>
                      s.toLowerCase().includes(key.toLowerCase())
                    );
                return (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-[9px] text-nexzen-muted">{name}</span>
                    <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      isHit ? 'bg-green-500' : 'bg-nexzen-muted/20'
                    }`} />
                  </div>
                );
              })}
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
          <span>Tribunal: Framework Institucional v2.0</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-amber-500/40">SPECTER GEOPOLITICAL v2.0</span>
        </div>
      </div>
    </div>
  );
}
