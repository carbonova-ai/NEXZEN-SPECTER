'use client';

import type { OrderBookAnalysis } from '@/lib/signals/order-book';
import type { FundingRateAnalysis } from '@/lib/signals/funding-rate';
import type { OnChainAnalysis } from '@/lib/signals/on-chain';
import type { NewsSentimentAnalysis } from '@/lib/signals/news-sentiment';

interface IntelligencePanelProps {
  orderBook: OrderBookAnalysis | null;
  fundingRate: FundingRateAnalysis | null;
  onChain: OnChainAnalysis | null;
  newsSentiment: NewsSentimentAnalysis | null;
  mlAccuracy: number | null;
}

function SignalBar({ label, value, detail }: { label: string; value: number | null; detail?: string }) {
  const v = value ?? 0;
  const color = v > 0.1 ? 'text-nexzen-primary' : v < -0.1 ? 'text-nexzen-danger' : 'text-nexzen-muted';
  const barColor = v > 0.1 ? 'bg-nexzen-primary/50' : v < -0.1 ? 'bg-nexzen-danger/50' : 'bg-nexzen-muted/30';
  const barWidth = Math.abs(v) * 50; // 50% max width each direction

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-nexzen-border/20 last:border-0">
      <span className="text-[10px] text-nexzen-muted w-14 uppercase">{label}</span>

      {/* Bidirectional bar */}
      <div className="flex-1 flex items-center h-3">
        <div className="w-1/2 flex justify-end">
          {v < 0 && (
            <div
              className={`h-2 ${barColor} rounded-l transition-all duration-500`}
              style={{ width: `${barWidth}%` }}
            />
          )}
        </div>
        <div className="w-px h-3 bg-nexzen-border/50" />
        <div className="w-1/2">
          {v > 0 && (
            <div
              className={`h-2 ${barColor} rounded-r transition-all duration-500`}
              style={{ width: `${barWidth}%` }}
            />
          )}
        </div>
      </div>

      <span className={`text-[10px] tabular-nums font-medium w-10 text-right ${color}`}>
        {value !== null ? `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%` : '—'}
      </span>

      {detail && (
        <span className="text-[8px] text-nexzen-muted w-16 text-right truncate" title={detail}>
          {detail}
        </span>
      )}
    </div>
  );
}

export function IntelligencePanel({
  orderBook,
  fundingRate,
  onChain,
  newsSentiment,
  mlAccuracy,
}: IntelligencePanelProps) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted">INTELLIGENCE SIGNALS</div>
        <span className="text-[9px] text-nexzen-muted">Phase 5</span>
      </div>

      <SignalBar
        label="BOOK"
        value={orderBook?.signal ?? null}
        detail={orderBook ? `${orderBook.whaleOrders} whales` : undefined}
      />
      <SignalBar
        label="FUND"
        value={fundingRate?.signal ?? null}
        detail={fundingRate ? `${fundingRate.ratePercent.toFixed(4)}%` : undefined}
      />
      <SignalBar
        label="CHAIN"
        value={onChain?.signal ?? null}
        detail={onChain ? onChain.whaleActivity : undefined}
      />
      <SignalBar
        label="NEWS"
        value={newsSentiment?.signal ?? null}
        detail={newsSentiment ? `${newsSentiment.totalArticles} articles` : undefined}
      />
      <SignalBar
        label="ML"
        value={mlAccuracy !== null && mlAccuracy > 0 ? (mlAccuracy - 0.5) * 2 : null}
        detail={mlAccuracy !== null ? `${(mlAccuracy * 100).toFixed(0)}% acc` : undefined}
      />

      {/* News headlines */}
      {newsSentiment && newsSentiment.topHeadlines.length > 0 && (
        <div className="mt-2 pt-2 border-t border-nexzen-border/30">
          <div className="text-[8px] text-nexzen-muted uppercase mb-1">Top Headlines</div>
          {newsSentiment.topHeadlines.slice(0, 2).map((h, i) => (
            <div key={i} className="text-[9px] text-nexzen-text truncate py-0.5" title={h}>
              {h}
            </div>
          ))}
        </div>
      )}

      {/* Order book depth */}
      {orderBook && (
        <div className="mt-2 pt-2 border-t border-nexzen-border/30">
          <div className="flex justify-between text-[9px]">
            <span className="text-nexzen-primary tabular-nums">
              BID {orderBook.bidDepth.toFixed(0)}
            </span>
            <span className="text-nexzen-muted">
              Spread {(orderBook.spreadPercent * 100).toFixed(2)}%
            </span>
            <span className="text-nexzen-danger tabular-nums">
              ASK {orderBook.askDepth.toFixed(0)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
