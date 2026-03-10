'use client';

import { memo } from 'react';
import { PredictionResult } from '@/lib/types';

interface SignalHistoryProps {
  history: PredictionResult[];
}

export const SignalHistory = memo(function SignalHistory({ history }: SignalHistoryProps) {
  const sorted = [...history].reverse().slice(0, 50);

  return (
    <div className="glass-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-3">SIGNAL HISTORY</div>

      {sorted.length === 0 ? (
        <div className="text-center py-6 text-nexzen-muted text-xs">
          No signals yet. Waiting for first cycle...
        </div>
      ) : (
        <div className="overflow-y-auto max-h-[260px] space-y-0.5">
          {sorted.map((result) => {
            const time = new Date(result.timestamp).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            });

            const isUp = result.direction === 'UP';
            const dirColor = isUp ? 'text-nexzen-primary' : 'text-nexzen-danger';
            const arrow = isUp ? '\u25B2' : '\u25BC';

            const outcomeColor = {
              WIN: 'text-nexzen-primary',
              LOSS: 'text-nexzen-danger',
              PENDING: 'text-nexzen-muted',
            }[result.outcome];

            const outcomeBg = {
              WIN: 'bg-nexzen-primary/10',
              LOSS: 'bg-nexzen-danger/10',
              PENDING: 'bg-nexzen-surface',
            }[result.outcome];

            return (
              <div
                key={result.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-[11px] ${outcomeBg}`}
              >
                <span className="text-nexzen-muted tabular-nums w-12">{time}</span>
                <span className={`${dirColor} w-8`}>{arrow} {result.direction}</span>
                <span className="text-nexzen-text tabular-nums w-10">
                  {(result.probability * 100).toFixed(0)}%
                </span>
                <span className={`${outcomeColor} w-10 font-bold`}>
                  {result.outcome === 'PENDING' ? '...' : result.outcome}
                </span>
                <span className={`tabular-nums text-right flex-1 ${
                  (result.pnlPercent ?? 0) >= 0 ? 'text-nexzen-primary' : 'text-nexzen-danger'
                }`}>
                  {result.pnlPercent !== null
                    ? `${result.pnlPercent >= 0 ? '+' : ''}${result.pnlPercent.toFixed(3)}%`
                    : '-'
                  }
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
