'use client';

import type { MarketConfig } from '@/lib/config/markets';

interface MarketSelectorProps {
  activeMarket: MarketConfig;
  availableMarkets: MarketConfig[];
  onSelect: (id: string) => void;
}

export function MarketSelector({ activeMarket, availableMarkets, onSelect }: MarketSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      {availableMarkets.map(market => (
        <button
          key={market.id}
          onClick={() => onSelect(market.id)}
          className={`px-2 py-0.5 text-[9px] font-bold rounded transition-colors ${
            market.id === activeMarket.id
              ? 'bg-nexzen-primary/20 text-nexzen-primary border border-nexzen-primary/50'
              : 'bg-nexzen-surface text-nexzen-muted border border-nexzen-border hover:border-nexzen-muted'
          }`}
        >
          {market.baseAsset}
        </button>
      ))}
    </div>
  );
}
