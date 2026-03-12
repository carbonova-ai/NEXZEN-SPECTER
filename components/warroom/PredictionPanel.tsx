'use client';

import type { WarMarket } from '@/hooks/useWarMarkets';

// ══════════════════════════════════════════════════════════════
// PredictionPanel — Reusable Polymarket War Predictions Display
//
// Shows prediction markets for a given theater with prices,
// volume, direction, and edge indicators.
// ══════════════════════════════════════════════════════════════

interface PredictionPanelProps {
  markets: WarMarket[];
  theater: 'iran' | 'ukraine';
  title?: string;
  maxItems?: number;
  onMarketSelect?: (market: WarMarket) => void;
  selectedMarketId?: string | null;
}

const THEATER_STYLES = {
  iran: {
    accent: 'text-red-400',
    accentBg: 'bg-red-500/10',
    accentBorder: 'border-red-500/20',
    headerBg: 'rgba(239,68,68,0.1)',
    dot: 'bg-red-500',
    label: 'IRAN',
  },
  ukraine: {
    accent: 'text-blue-400',
    accentBg: 'bg-blue-500/10',
    accentBorder: 'border-blue-500/20',
    headerBg: 'rgba(59,130,246,0.1)',
    dot: 'bg-blue-500',
    label: 'UKRAINE',
  },
};

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
}

export default function PredictionPanel({
  markets,
  theater,
  title,
  maxItems = 15,
  onMarketSelect,
  selectedMarketId,
}: PredictionPanelProps) {
  const style = THEATER_STYLES[theater];

  return (
    <div className="glass-card flex flex-col h-full" style={{ borderColor: style.headerBg }}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-nexzen-border/20">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${style.dot} animate-pulse`} />
          <span className={`text-[10px] uppercase tracking-wider ${style.accent} font-bold`}>
            {title || `${style.label} PREDICTIONS`}
          </span>
          <span className="text-[9px] text-nexzen-muted tabular-nums">
            {markets.length} markets
          </span>
        </div>
      </div>

      {/* Markets List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5" style={{ maxHeight: 'calc(100vh - 300px)' }}>
        {markets.slice(0, maxItems).map(market => {
          const yesPrice = market.outcomePrices[0] ?? 0;
          const yesPct = Math.round(yesPrice * 100);
          const isSelected = selectedMarketId === market.id;

          return (
            <button
              key={market.id}
              onClick={() => onMarketSelect?.(market)}
              className={`w-full text-left p-2.5 rounded border transition-all ${
                isSelected
                  ? `${style.accentBorder} ${style.accentBg}`
                  : 'border-nexzen-border/10 hover:border-nexzen-border/30 hover:bg-nexzen-surface/30'
              }`}
            >
              {/* Question */}
              <div className="text-[10px] text-nexzen-text leading-tight line-clamp-2 mb-1.5">
                {market.question}
              </div>

              {/* Price Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* YES Price (prominent) */}
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] text-nexzen-muted">YES</span>
                    <span className={`text-[13px] font-bold tabular-nums ${
                      market.priceDirection === 'up' ? 'text-green-400' :
                      market.priceDirection === 'down' ? 'text-red-400' :
                      'text-nexzen-text'
                    }`}>
                      {yesPct}%
                    </span>
                  </div>

                  {/* Direction Arrow */}
                  {Math.abs(market.priceChangePct) > 0.5 && (
                    <span className={`text-[9px] tabular-nums ${
                      market.priceChangePct > 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {market.priceChangePct > 0 ? '▲' : '▼'}
                      {Math.abs(market.priceChangePct).toFixed(1)}%
                    </span>
                  )}
                </div>

                {/* Volume + Liquidity */}
                <div className="flex items-center gap-2 text-[7px] text-nexzen-muted">
                  <span>Vol: {formatVolume(market.volume)}</span>
                  {market.liquidity > 0 && (
                    <span>Liq: {formatVolume(market.liquidity)}</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        {markets.length === 0 && (
          <div className="text-center text-[10px] text-nexzen-muted py-8">
            No {style.label.toLowerCase()} prediction markets found
          </div>
        )}
      </div>
    </div>
  );
}
