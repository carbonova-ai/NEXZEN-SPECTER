'use client';

import { useState } from 'react';
import type { GeoMarket } from '@/hooks/usePolymarketGeo';

interface PolymarketGeoPanelProps {
  markets: GeoMarket[];
  isLoading: boolean;
  error: string | null;
  lastRefreshed: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  war: 'text-red-400',
  sanctions: 'text-orange-400',
  elections: 'text-blue-400',
  diplomacy: 'text-cyan-400',
  geopolitics: 'text-amber-400',
  energy: 'text-yellow-400',
  economy: 'text-green-400',
  crypto: 'text-purple-400',
  humanitarian: 'text-pink-400',
};

const CATEGORY_BG: Record<string, string> = {
  war: 'bg-red-500/10',
  sanctions: 'bg-orange-500/10',
  elections: 'bg-blue-500/10',
  diplomacy: 'bg-cyan-500/10',
  geopolitics: 'bg-amber-500/10',
  energy: 'bg-yellow-500/10',
  economy: 'bg-green-500/10',
  crypto: 'bg-purple-500/10',
  humanitarian: 'bg-pink-500/10',
};

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
}

function MarketRow({ market }: { market: GeoMarket }) {
  const yesPrice = market.outcomePrices[0] ?? 0;
  const yesPct = Math.round(yesPrice * 100);
  const catColor = CATEGORY_COLORS[market.category] || 'text-nexzen-muted';
  const catBg = CATEGORY_BG[market.category] || 'bg-nexzen-card/40';

  const trendIcon = market.priceDirection === 'up' ? '▲' : market.priceDirection === 'down' ? '▼' : '';
  const trendColor = market.priceDirection === 'up'
    ? 'text-green-400'
    : market.priceDirection === 'down'
    ? 'text-red-400'
    : '';
  const changePct = Math.abs(market.priceChangePct) > 0.1
    ? `${market.priceChangePct > 0 ? '+' : ''}${market.priceChangePct.toFixed(1)}%`
    : '';

  return (
    <div className="p-2.5 rounded-lg bg-nexzen-card/40 border border-nexzen-border/20 hover:border-nexzen-border/40 transition-all group">
      <a
        href={`https://polymarket.com/event/${market.slug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {/* Category tag */}
        <div className="flex items-center gap-1.5 mb-1">
          <span className={`text-[7px] uppercase font-bold px-1 py-0.5 rounded ${catColor} ${catBg}`}>
            {market.category}
          </span>
          {changePct && (
            <span className={`text-[8px] font-bold tabular-nums ${trendColor}`}>
              {trendIcon} {changePct}
            </span>
          )}
        </div>

        {/* Question */}
        <h4 className="text-[10px] text-nexzen-text leading-snug group-hover:text-amber-500 transition-colors">
          {market.question}
        </h4>

        {/* Probability bar */}
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex-1 h-2 rounded-full bg-nexzen-surface overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                yesPct >= 70 ? 'bg-gradient-to-r from-green-500 to-green-400' :
                yesPct >= 40 ? 'bg-gradient-to-r from-yellow-500 to-amber-400' :
                'bg-gradient-to-r from-red-500 to-red-400'
              }`}
              style={{ width: `${yesPct}%` }}
            />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className={`text-[10px] font-bold tabular-nums ${
              yesPct >= 70 ? 'text-green-400' :
              yesPct >= 40 ? 'text-amber-400' :
              'text-red-400'
            }`}>
              {yesPct}%
            </span>
            <span className="text-[7px] text-nexzen-muted">YES</span>
          </div>
        </div>

        {/* Volume + Expiry + Liquidity */}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[8px] text-nexzen-muted">
            Vol: {formatVolume(market.volume)}
          </span>
          {market.liquidity > 0 && (
            <span className="text-[8px] text-nexzen-muted">
              Liq: {formatVolume(market.liquidity)}
            </span>
          )}
          {market.endDate && (
            <span className="text-[8px] text-nexzen-muted ml-auto">
              {new Date(market.endDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>
      </a>
    </div>
  );
}

export function PolymarketGeoPanel({ markets, isLoading, error, lastRefreshed }: PolymarketGeoPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const displayMarkets = showAll ? markets : markets.slice(0, 10);

  // Count by category
  const catCounts = markets.reduce<Record<string, number>>((acc, m) => {
    acc[m.category] = (acc[m.category] || 0) + 1;
    return acc;
  }, {});

  // Count markets with movement
  const movingCount = markets.filter(m => Math.abs(m.priceChangePct) > 0.5).length;

  return (
    <div className="glass-card flex flex-col" style={{ borderColor: 'rgba(245,158,11,0.08)' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-nexzen-border/20">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
          <span className="text-[10px] uppercase tracking-wider text-nexzen-muted">
            POLYMARKET LIVE
          </span>
        </div>
        <div className="flex items-center gap-2">
          {movingCount > 0 && (
            <span className="text-[8px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-bold">
              {movingCount} MOVING
            </span>
          )}
          <span className="text-[9px] text-nexzen-muted tabular-nums">
            {markets.length} mercados
          </span>
        </div>
      </div>

      {/* Category distribution */}
      {markets.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 py-1.5 border-b border-nexzen-border/10">
          {Object.entries(catCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([cat, count]) => (
              <span
                key={cat}
                className={`text-[7px] px-1 py-0.5 rounded uppercase ${CATEGORY_COLORS[cat] || 'text-nexzen-muted'} ${CATEGORY_BG[cat] || ''}`}
              >
                {cat}: {count}
              </span>
            ))}
        </div>
      )}

      {/* Markets list */}
      <div className="flex-1 overflow-y-auto p-2" style={{ maxHeight: 'calc(100vh - 400px)' }}>
        {isLoading ? (
          <div className="text-[10px] text-nexzen-muted animate-pulse py-4 text-center">
            Conectando Polymarket...
          </div>
        ) : error ? (
          <div className="text-[10px] text-nexzen-danger py-4 text-center">{error}</div>
        ) : markets.length === 0 ? (
          <div className="text-[10px] text-nexzen-muted py-4 text-center">
            Nenhum mercado geopolitico ativo
          </div>
        ) : (
          <div className="space-y-1.5">
            {displayMarkets.map((m) => (
              <MarketRow key={m.id} market={m} />
            ))}

            {markets.length > 10 && (
              <button
                onClick={() => setShowAll(!showAll)}
                className="w-full py-1.5 text-[9px] text-amber-500/70 hover:text-amber-500 transition-colors"
              >
                {showAll ? 'Mostrar menos' : `Ver todos (${markets.length})`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-nexzen-border/10 flex items-center justify-between">
        <span className="text-[8px] text-nexzen-muted">
          Refresh: 30s
        </span>
        <span className="text-[8px] text-purple-400/50">
          polymarket.com
        </span>
      </div>
    </div>
  );
}
