'use client';

import { memo, useMemo } from 'react';
import type { PredictionResult } from '@/lib/types';
import { detectRegime, regimeLabel, regimeColor, type MarketRegime } from '@/lib/engine/weight-optimizer';

interface RegimeTimelineProps {
  history: PredictionResult[];
}

interface RegimeSegment {
  regime: MarketRegime;
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
  duration: number;       // in predictions
  winRate: number;
  trades: number;
}

export const RegimeTimeline = memo(function RegimeTimeline({ history }: RegimeTimelineProps) {
  const segments = useMemo((): RegimeSegment[] => {
    const resolved = history.filter(p => p.outcome !== 'PENDING');
    if (resolved.length < 10) return [];

    const segs: RegimeSegment[] = [];
    const windowSize = 10; // Regime detection window

    let currentRegime: MarketRegime = 'UNKNOWN';
    let segStart = 0;
    let segStartTime = resolved[0]?.timestamp ?? 0;
    let segWins = 0;
    let segTotal = 0;

    for (let i = windowSize; i <= resolved.length; i += 5) {
      const window = resolved.slice(Math.max(0, i - 50), i);
      const regime = detectRegime(window);

      if (regime !== currentRegime && currentRegime !== 'UNKNOWN') {
        // Close current segment
        segs.push({
          regime: currentRegime,
          startIndex: segStart,
          endIndex: i - 1,
          startTime: segStartTime,
          endTime: resolved[Math.min(i - 1, resolved.length - 1)].timestamp,
          duration: i - segStart,
          winRate: segTotal > 0 ? segWins / segTotal : 0,
          trades: segTotal,
        });

        segStart = i;
        segStartTime = resolved[Math.min(i, resolved.length - 1)]?.timestamp ?? 0;
        segWins = 0;
        segTotal = 0;
      }

      currentRegime = regime;

      // Count wins in this step
      const stepPreds = resolved.slice(Math.max(segStart, i - 5), i);
      for (const p of stepPreds) {
        if (p.outcome === 'WIN') segWins++;
        segTotal++;
      }
    }

    // Close final segment
    if (currentRegime !== 'UNKNOWN' && segTotal > 0) {
      segs.push({
        regime: currentRegime,
        startIndex: segStart,
        endIndex: resolved.length - 1,
        startTime: segStartTime,
        endTime: resolved[resolved.length - 1].timestamp,
        duration: resolved.length - segStart,
        winRate: segTotal > 0 ? segWins / segTotal : 0,
        trades: segTotal,
      });
    }

    return segs;
  }, [history]);

  if (segments.length === 0) {
    return (
      <div className="glass-card p-4">
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-2">REGIME TIMELINE</div>
        <div className="text-center py-4 text-nexzen-muted text-xs">
          Need more data for regime analysis...
        </div>
      </div>
    );
  }

  const totalDuration = segments.reduce((s, seg) => s + seg.duration, 0);

  return (
    <div className="glass-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-3">REGIME TIMELINE</div>

      {/* Timeline bar */}
      <div className="flex h-4 rounded-full overflow-hidden mb-3">
        {segments.map((seg, i) => {
          const widthPct = Math.max(3, (seg.duration / totalDuration) * 100);
          const bgColor = {
            'TRENDING_UP': 'bg-nexzen-primary/50',
            'TRENDING_DOWN': 'bg-nexzen-danger/50',
            'RANGING': 'bg-yellow-500/50',
            'VOLATILE': 'bg-orange-500/50',
            'UNKNOWN': 'bg-nexzen-muted/30',
          }[seg.regime];

          return (
            <div
              key={i}
              className={`${bgColor} border-r border-nexzen-bg/50 last:border-0 relative group`}
              style={{ width: `${widthPct}%` }}
              title={`${regimeLabel(seg.regime)} — ${seg.trades} trades, ${(seg.winRate * 100).toFixed(0)}% WR`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
        {(['TRENDING_UP', 'TRENDING_DOWN', 'RANGING', 'VOLATILE'] as MarketRegime[]).map(r => {
          const count = segments.filter(s => s.regime === r).length;
          if (count === 0) return null;
          return (
            <div key={r} className="flex items-center gap-1 text-[9px]">
              <div className={`w-2 h-2 rounded-sm ${
                r === 'TRENDING_UP' ? 'bg-nexzen-primary/50' :
                r === 'TRENDING_DOWN' ? 'bg-nexzen-danger/50' :
                r === 'RANGING' ? 'bg-yellow-500/50' : 'bg-orange-500/50'
              }`} />
              <span className={regimeColor(r)}>{regimeLabel(r)}</span>
            </div>
          );
        })}
      </div>

      {/* Segment details */}
      <div className="space-y-1 max-h-[100px] overflow-y-auto">
        {segments.slice(-5).reverse().map((seg, i) => (
          <div key={i} className="flex items-center justify-between text-[10px] py-1 border-b border-nexzen-border/30 last:border-0">
            <div className="flex items-center gap-2">
              <span className={`font-medium ${regimeColor(seg.regime)}`}>
                {regimeLabel(seg.regime)}
              </span>
              <span className="text-nexzen-muted">
                {seg.trades} trades
              </span>
            </div>
            <span className={`tabular-nums ${
              seg.winRate >= 0.55 ? 'text-nexzen-primary' :
              seg.winRate >= 0.50 ? 'text-yellow-500' : 'text-nexzen-danger'
            }`}>
              {(seg.winRate * 100).toFixed(0)}% WR
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});
