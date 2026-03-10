'use client';

import { useEffect, useRef, useState } from 'react';
import type { GeoArticle } from '@/lib/geopolitical/types';
import { URGENCY_CONFIG } from '@/lib/geopolitical/types';

interface NewsFeedProps {
  articles: GeoArticle[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (article: GeoArticle) => void;
  newArticleCount: number;
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function sourceFlagEmoji(country: string): string {
  const flags: Record<string, string> = {
    'United States': 'US', 'United Kingdom': 'UK', 'Russia': 'RU',
    'China': 'CN', 'Israel': 'IL', 'Iran': 'IR', 'Ukraine': 'UA',
    'France': 'FR', 'Germany': 'DE', 'Brazil': 'BR', 'India': 'IN',
    'Japan': 'JP', 'Turkey': 'TR', 'Saudi Arabia': 'SA', 'Qatar': 'QA',
    'US': 'US',
  };
  return flags[country] || country?.slice(0, 2)?.toUpperCase() || '??';
}

function EventCard({
  article,
  isSelected,
  onSelect,
  isNew,
}: {
  article: GeoArticle;
  isSelected: boolean;
  onSelect: () => void;
  isNew: boolean;
}) {
  const urg = URGENCY_CONFIG[article.urgency];
  const isCritical = article.urgency === 'CRITICAL';
  const isHigh = article.urgency === 'HIGH';

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${
        isSelected
          ? 'bg-amber-500/10 border-amber-500/40 shadow-lg shadow-amber-500/5'
          : `${urg.bg} ${urg.border} hover:brightness-125`
      } ${isNew ? 'animate-flash-green' : ''} ${isCritical ? 'ring-1 ring-red-500/30' : ''}`}
    >
      <div className="flex items-start gap-2">
        {/* Urgency + Country badge */}
        <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
          <span className={`text-[7px] font-black px-1.5 py-0.5 rounded ${urg.color} ${isCritical ? 'bg-red-500/20 animate-pulse' : isHigh ? 'bg-orange-500/10' : ''}`}>
            {urg.label}
          </span>
          <span className="text-[7px] font-bold text-nexzen-muted/50">
            {sourceFlagEmoji(article.sourceCountry)}
          </span>
          {/* Score indicator */}
          <span className={`text-[6px] tabular-nums ${
            article.urgencyScore >= 14 ? 'text-red-400' :
            article.urgencyScore >= 8 ? 'text-orange-400' :
            'text-nexzen-muted/40'
          }`}>
            {article.urgencyScore > 0 ? article.urgencyScore.toFixed(0) : ''}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3 className={`text-xs font-medium leading-snug ${
            isSelected ? 'text-amber-500' :
            isCritical ? 'text-red-300' :
            isHigh ? 'text-orange-200' :
            'text-nexzen-text'
          }`}>
            {article.title}
          </h3>

          {/* Snippet preview */}
          {article.snippet && (
            <p className="text-[9px] text-nexzen-muted/60 mt-0.5 line-clamp-1 leading-relaxed">
              {article.snippet}
            </p>
          )}

          {/* Tags */}
          {article.tags && article.tags.length > 0 && (
            <div className="flex flex-wrap gap-0.5 mt-1">
              {article.tags.slice(0, 4).map(tag => (
                <span key={tag} className="text-[6px] text-amber-400/60 bg-amber-500/5 px-1 py-0.5 rounded">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] text-nexzen-muted truncate max-w-[120px]">
              {article.source}
            </span>
            <span className="text-[7px] text-nexzen-muted/30">|</span>
            <span className="text-[9px] text-nexzen-muted truncate max-w-[100px]">
              {article.domain}
            </span>
            {article.snippetScore > 0 && (
              <span className="text-[7px] text-cyan-400/50 tabular-nums" title="Snippet urgency score">
                S:{article.snippetScore.toFixed(0)}
              </span>
            )}
            <span className={`text-[9px] tabular-nums ml-auto ${
              article.urgency === 'CRITICAL' ? 'text-red-400' : 'text-nexzen-muted'
            }`}>
              {timeAgo(article.seenAt)}
            </span>
          </div>
        </div>

        {/* Selection indicator */}
        {isSelected && (
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 glow-dot shrink-0 mt-1" />
        )}
      </div>
    </button>
  );
}

// Breaking news banner for CRITICAL articles
function BreakingBanner({ articles }: { articles: GeoArticle[] }) {
  const criticals = articles.filter(a => a.urgency === 'CRITICAL');
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    if (criticals.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIdx(prev => (prev + 1) % criticals.length);
    }, 4000); // faster rotation
    return () => clearInterval(interval);
  }, [criticals.length]);

  if (criticals.length === 0) return null;

  const current = criticals[currentIdx % criticals.length];
  if (!current) return null;

  return (
    <div className="mx-2 mt-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30">
      <div className="flex items-center gap-2">
        <span className="text-[8px] font-black text-red-400 bg-red-500/20 px-2 py-0.5 rounded shrink-0 animate-pulse">
          BREAKING
        </span>
        <span className="text-[10px] text-red-300 truncate font-medium flex-1">
          {current.title}
        </span>
        <span className="text-[9px] text-red-400/70 shrink-0 tabular-nums">
          {timeAgo(current.seenAt)}
        </span>
        {criticals.length > 1 && (
          <span className="text-[8px] text-red-400/50 shrink-0 tabular-nums">
            {currentIdx + 1}/{criticals.length}
          </span>
        )}
      </div>
      {current.snippet && (
        <p className="text-[8px] text-red-300/50 mt-1 line-clamp-1 ml-[52px]">
          {current.snippet}
        </p>
      )}
    </div>
  );
}

export function NewsFeed({ articles, isLoading, selectedId, onSelect, newArticleCount }: NewsFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // Track new articles for flash animation
  const newIds = useRef(new Set<string>());
  useEffect(() => {
    if (articles.length > prevCountRef.current) {
      const newArticles = articles.slice(0, articles.length - prevCountRef.current);
      newArticles.forEach(a => newIds.current.add(a.id));
      setTimeout(() => newIds.current.clear(), 600);
    }
    prevCountRef.current = articles.length;
  }, [articles]);

  // Count by urgency
  const counts = {
    CRITICAL: articles.filter(a => a.urgency === 'CRITICAL').length,
    HIGH: articles.filter(a => a.urgency === 'HIGH').length,
    MEDIUM: articles.filter(a => a.urgency === 'MEDIUM').length,
    LOW: articles.filter(a => a.urgency === 'LOW').length,
  };

  return (
    <div className="glass-card flex flex-col h-full" style={{ borderColor: 'rgba(245,158,11,0.08)' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-nexzen-border/20">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${counts.CRITICAL > 0 ? 'bg-red-500' : 'bg-nexzen-primary'} animate-pulse`} />
          <span className="text-[10px] uppercase tracking-wider text-nexzen-muted">
            FEED AO VIVO
          </span>
          {newArticleCount > 0 && (
            <span className="text-[8px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded font-bold animate-pulse">
              +{newArticleCount} NOVOS
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {counts.CRITICAL > 0 && (
            <span className="text-[8px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded font-bold">
              {counts.CRITICAL} CRIT
            </span>
          )}
          {counts.HIGH > 0 && (
            <span className="text-[8px] text-orange-400 bg-orange-500/5 px-1.5 py-0.5 rounded">
              {counts.HIGH} HIGH
            </span>
          )}
          <span className="text-[10px] text-nexzen-muted tabular-nums">
            {articles.length}
          </span>
        </div>
      </div>

      {/* Breaking news banner */}
      <BreakingBanner articles={articles} />

      {/* Feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto p-2 space-y-1.5" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {isLoading && articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            <div className="text-nexzen-muted text-xs">
              Conectando 8+ fontes...
            </div>
          </div>
        ) : articles.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-nexzen-muted text-xs">
              Nenhum evento encontrado neste periodo
            </div>
          </div>
        ) : (
          articles.map((article) => (
            <EventCard
              key={article.id}
              article={article}
              isSelected={selectedId === article.id}
              onSelect={() => onSelect(article)}
              isNew={newIds.current.has(article.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
