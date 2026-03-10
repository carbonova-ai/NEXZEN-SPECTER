'use client';

import { useState } from 'react';
import type { CorrelationSummary, MarketCorrelation } from '@/lib/geopolitical/correlation';

interface CorrelationPanelProps {
  correlations: CorrelationSummary;
}

const SIGNAL_CONFIG = {
  CONFIRMING: { label: 'CONFIRMANDO', color: 'text-red-400', bg: 'bg-red-500/10', icon: '⚠' },
  CONTRADICTING: { label: 'CONTRADIZENDO', color: 'text-green-400', bg: 'bg-green-500/10', icon: '↻' },
  NEUTRAL: { label: 'NEUTRO', color: 'text-nexzen-muted', bg: 'bg-nexzen-surface/50', icon: '—' },
};

const MOMENTUM_CONFIG = {
  RISK_OFF: { label: 'RISK OFF', color: 'text-red-400', bg: 'bg-red-500/10' },
  RISK_ON: { label: 'RISK ON', color: 'text-green-400', bg: 'bg-green-500/10' },
  MIXED: { label: 'MIXED', color: 'text-amber-400', bg: 'bg-amber-500/10' },
};

function CorrelationRow({ correlation: c }: { correlation: MarketCorrelation }) {
  const signal = SIGNAL_CONFIG[c.signal];
  const trendIcon = c.priceDirection === 'up' ? '▲' : c.priceDirection === 'down' ? '▼' : '';
  const trendColor = c.priceDirection === 'up' ? 'text-green-400' : c.priceDirection === 'down' ? 'text-red-400' : '';

  return (
    <div className="bg-nexzen-card/40 rounded-lg border border-nexzen-border/20 p-2 space-y-1">
      {/* Article title */}
      <div className="text-[9px] text-nexzen-text leading-snug line-clamp-1 font-medium">
        {c.articleTitle}
      </div>

      {/* Market + Price */}
      <div className="flex items-center gap-1.5">
        <span className="text-[8px] text-purple-400 truncate flex-1">
          {c.marketQuestion}
        </span>
        <span className={`text-[9px] font-bold tabular-nums ${trendColor}`}>
          {trendIcon} {c.yesPct}%
        </span>
      </div>

      {/* Signal + Correlation strength */}
      <div className="flex items-center justify-between">
        <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded ${signal.color} ${signal.bg}`}>
          {signal.icon} {signal.label}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[7px] text-nexzen-muted">Correlacao:</span>
          <div className="w-12 h-1 rounded-full bg-nexzen-surface overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${c.correlationScore * 100}%` }}
            />
          </div>
          <span className="text-[7px] text-nexzen-muted tabular-nums">
            {(c.correlationScore * 100).toFixed(0)}%
          </span>
        </div>
        {Math.abs(c.priceChangePct) > 0.5 && (
          <span className={`text-[7px] tabular-nums ${trendColor}`}>
            {c.priceChangePct > 0 ? '+' : ''}{c.priceChangePct.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

export function CorrelationPanel({ correlations }: CorrelationPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const momentum = MOMENTUM_CONFIG[correlations.marketMomentum];
  const display = showAll ? correlations.topCorrelations : correlations.topCorrelations.slice(0, 5);

  if (correlations.totalCorrelations === 0) {
    return (
      <div className="glass-card p-3" style={{ borderColor: 'rgba(245,158,11,0.08)' }}>
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-2">
          NEWS × MARKETS
        </div>
        <p className="text-[9px] text-nexzen-muted/60 text-center py-3">
          Nenhuma correlacao detectada. Mercados estaveis ou noticias sem impacto claro.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-3" style={{ borderColor: 'rgba(245,158,11,0.08)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-nexzen-muted">
            NEWS × MARKETS
          </span>
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${momentum.color} ${momentum.bg}`}>
            {momentum.label}
          </span>
        </div>
        <span className="text-[9px] text-nexzen-muted tabular-nums">
          {correlations.totalCorrelations} links
        </span>
      </div>

      {/* Signal summary */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[8px] text-red-400">
          {correlations.confirmingCount} confirmando
        </span>
        <span className="text-[7px] text-nexzen-border">|</span>
        <span className="text-[8px] text-green-400">
          {correlations.contradictingCount} contradizendo
        </span>
      </div>

      {/* Correlation list */}
      <div className="space-y-1.5">
        {display.map((c, i) => (
          <CorrelationRow key={`${c.articleId}-${c.marketId}-${i}`} correlation={c} />
        ))}
      </div>

      {correlations.topCorrelations.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-2 py-1 text-[9px] text-amber-500/70 hover:text-amber-500 transition-colors"
        >
          {showAll ? 'Mostrar menos' : `Ver todas (${correlations.topCorrelations.length})`}
        </button>
      )}
    </div>
  );
}
