'use client';

import { useState } from 'react';
import type { ArticleCluster, GeoArticle } from '@/lib/geopolitical/types';
import { URGENCY_CONFIG } from '@/lib/geopolitical/types';

interface ClusterViewProps {
  clusters: ArticleCluster[];
  onSelectArticle: (article: GeoArticle) => void;
  selectedId: string | null;
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function ClusterCard({
  cluster,
  onSelectArticle,
  selectedId,
}: {
  cluster: ArticleCluster;
  onSelectArticle: (article: GeoArticle) => void;
  selectedId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const urg = URGENCY_CONFIG[cluster.maxUrgency];
  const isCritical = cluster.maxUrgency === 'CRITICAL';

  return (
    <div className={`rounded-lg border ${urg.border} ${urg.bg} overflow-hidden ${isCritical ? 'ring-1 ring-red-500/20' : ''}`}>
      {/* Cluster header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-2.5 flex items-start gap-2"
      >
        <div className="flex flex-col items-center shrink-0 mt-0.5">
          <span className={`text-[7px] font-black px-1.5 py-0.5 rounded ${urg.color} ${isCritical ? 'bg-red-500/20 animate-pulse' : ''}`}>
            {urg.label}
          </span>
          <span className="text-[8px] text-nexzen-muted tabular-nums mt-0.5">
            ×{cluster.articleCount}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className={`text-[11px] font-bold leading-snug ${
            isCritical ? 'text-red-300' : 'text-nexzen-text'
          }`}>
            {cluster.label}
          </h3>

          {/* Tags */}
          <div className="flex flex-wrap gap-0.5 mt-1">
            {cluster.tags.slice(0, 5).map(t => (
              <span key={t} className="text-[7px] text-amber-400/70 bg-amber-500/5 px-1 py-0.5 rounded">
                {t}
              </span>
            ))}
          </div>

          {/* Meta */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[8px] text-nexzen-muted">
              Avg score: {cluster.avgUrgencyScore.toFixed(1)}
            </span>
            <span className="text-[8px] text-nexzen-muted">
              {timeAgo(cluster.latestSeenAt)}
            </span>
          </div>
        </div>

        <span className="text-[9px] text-nexzen-muted shrink-0">
          {expanded ? '▼' : '▶'}
        </span>
      </button>

      {/* Expanded articles */}
      {expanded && (
        <div className="border-t border-nexzen-border/10 p-1.5 space-y-1 bg-nexzen-bg/30">
          {cluster.articles.map(article => {
            const aUrg = URGENCY_CONFIG[article.urgency];
            const isSelected = selectedId === article.id;

            return (
              <button
                key={article.id}
                onClick={() => onSelectArticle(article)}
                className={`w-full text-left px-2 py-1.5 rounded text-[9px] transition-all ${
                  isSelected
                    ? 'bg-amber-500/10 border border-amber-500/30'
                    : 'hover:bg-nexzen-surface/50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`text-[6px] font-black ${aUrg.color}`}>
                    {aUrg.label}
                  </span>
                  <span className="text-nexzen-text leading-snug flex-1 line-clamp-1">
                    {article.title}
                  </span>
                  <span className="text-[8px] text-nexzen-muted shrink-0">
                    {article.source}
                  </span>
                  <span className="text-[8px] text-nexzen-muted shrink-0 tabular-nums">
                    {timeAgo(article.seenAt)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ClusterView({ clusters, onSelectArticle, selectedId }: ClusterViewProps) {
  // Only show clusters with 2+ articles (singles go to regular feed)
  const multiClusters = clusters.filter(c => c.articleCount >= 2);
  const singleCount = clusters.filter(c => c.articleCount === 1).length;

  if (multiClusters.length === 0) {
    return (
      <div className="text-[9px] text-nexzen-muted/60 text-center py-4">
        Nenhum cluster de historias detectado. Artigos com topicos unicos.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-[9px] text-nexzen-muted uppercase">
          {multiClusters.length} threads detectadas
        </span>
        {singleCount > 0 && (
          <span className="text-[8px] text-nexzen-muted/50">
            +{singleCount} unicos
          </span>
        )}
      </div>
      {multiClusters.map(cluster => (
        <ClusterCard
          key={cluster.id}
          cluster={cluster}
          onSelectArticle={onSelectArticle}
          selectedId={selectedId}
        />
      ))}
    </div>
  );
}
