'use client';

import { PolymarketMarket } from '@/lib/polymarket/types';
import { PolymarketMarketCard } from './PolymarketMarketCard';

interface PolymarketPanelProps {
  markets: PolymarketMarket[];
  midpoints: Map<string, number>;
  sentimentScore: number | null;
  isLoading: boolean;
  error: string | null;
}

function SentimentGauge({ score }: { score: number }) {
  // Map -1..1 to 0..100 for positioning
  const position = ((score + 1) / 2) * 100;

  const getColor = (s: number) => {
    if (s > 0.3) return 'text-nexzen-primary';
    if (s < -0.3) return 'text-nexzen-danger';
    return 'text-yellow-500';
  };

  const getLabel = (s: number) => {
    if (s > 0.5) return 'STRONG BULL';
    if (s > 0.2) return 'BULLISH';
    if (s < -0.5) return 'STRONG BEAR';
    if (s < -0.2) return 'BEARISH';
    return 'NEUTRAL';
  };

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-nexzen-muted uppercase">Market Sentiment</span>
        <span className={`text-xs font-bold tabular-nums ${getColor(score)}`}>
          {score >= 0 ? '+' : ''}{score.toFixed(2)} {getLabel(score)}
        </span>
      </div>
      <div className="relative h-2 rounded-full overflow-hidden bg-gradient-to-r from-nexzen-danger via-yellow-500 to-nexzen-primary">
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-nexzen-bg transition-all duration-500"
          style={{ left: `calc(${position}% - 6px)` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-nexzen-muted mt-0.5">
        <span>BEARISH</span>
        <span>BULLISH</span>
      </div>
    </div>
  );
}

export function PolymarketPanel({ markets, midpoints, sentimentScore, isLoading, error }: PolymarketPanelProps) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted">
          POLYMARKET INTELLIGENCE
        </div>
        {error ? (
          <span className="text-[9px] text-nexzen-danger uppercase">OFFLINE</span>
        ) : (
          <span className="flex items-center gap-1 text-[9px] text-nexzen-primary uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-nexzen-primary animate-pulse-glow" />
            LIVE
          </span>
        )}
      </div>

      {error ? (
        <div className="text-center py-4">
          <div className="text-nexzen-danger text-xs mb-1">FEED OFFLINE</div>
          <div className="text-[10px] text-nexzen-muted">{error}</div>
          <div className="text-[10px] text-nexzen-muted mt-1">Engine continues without market sentiment</div>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-nexzen-surface/60 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {sentimentScore !== null && <SentimentGauge score={sentimentScore} />}

          <div className="space-y-2 overflow-y-auto max-h-[300px]">
            {markets.length === 0 ? (
              <div className="text-center py-4 text-[10px] text-nexzen-muted">
                No active BTC markets found
              </div>
            ) : (
              markets.slice(0, 8).map(market => (
                <PolymarketMarketCard
                  key={market.id}
                  market={market}
                  midpoint={market.clobTokenIds?.[0] ? midpoints.get(market.clobTokenIds[0]) ?? null : null}
                />
              ))
            )}
          </div>

          {markets.length > 0 && (
            <div className="text-[9px] text-nexzen-muted mt-2 text-center">
              {markets.length} active BTC market{markets.length !== 1 ? 's' : ''} tracked
            </div>
          )}
        </>
      )}
    </div>
  );
}
