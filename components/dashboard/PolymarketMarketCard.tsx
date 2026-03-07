'use client';

import { PolymarketMarket } from '@/lib/polymarket/types';

interface PolymarketMarketCardProps {
  market: PolymarketMarket;
  midpoint: number | null;
}

export function PolymarketMarketCard({ market, midpoint }: PolymarketMarketCardProps) {
  const yesPrice = midpoint
    ?? (market.outcomePrices?.[0] ? parseFloat(market.outcomePrices[0]) : null);
  const noPrice = yesPrice !== null ? 1 - yesPrice : null;

  const yesPercent = yesPrice !== null ? yesPrice * 100 : 50;
  const volume = market.volume || 0;

  return (
    <div className="bg-nexzen-surface/60 rounded px-3 py-2 border border-nexzen-border/50 hover:border-nexzen-primary/20 transition-colors">
      <div className="text-[11px] text-nexzen-text leading-tight mb-2 line-clamp-2">
        {market.question}
      </div>

      {/* Yes/No probability bar */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] text-nexzen-primary tabular-nums w-12">
          YES {yesPercent.toFixed(0)}%
        </span>
        <div className="flex-1 h-1.5 bg-nexzen-danger/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-nexzen-primary rounded-full transition-all duration-500"
            style={{ width: `${yesPercent}%` }}
          />
        </div>
        <span className="text-[10px] text-nexzen-danger tabular-nums w-12 text-right">
          {noPrice !== null ? `NO ${(noPrice * 100).toFixed(0)}%` : '-'}
        </span>
      </div>

      <div className="flex items-center justify-between text-[10px] text-nexzen-muted">
        <span>Vol: ${volume >= 1e6 ? `${(volume / 1e6).toFixed(1)}M` : volume >= 1e3 ? `${(volume / 1e3).toFixed(0)}K` : volume.toFixed(0)}</span>
        {market.endDate && (
          <span>Ends: {new Date(market.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        )}
      </div>
    </div>
  );
}
