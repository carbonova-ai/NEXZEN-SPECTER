'use client';

import { PerformanceStats } from '@/lib/types';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';

interface PerformanceCardProps {
  performance: PerformanceStats;
}

function WinRateRing({ rate }: { rate: number }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - rate);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="72" height="72" className="-rotate-90">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="#222" strokeWidth="4" />
        <circle
          cx="36" cy="36" r={radius} fill="none"
          stroke={rate >= 0.6 ? '#00ff41' : rate >= 0.5 ? '#eab308' : '#ff4444'}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <span className="absolute text-sm font-bold tabular-nums text-nexzen-text">
        {(rate * 100).toFixed(1)}%
      </span>
    </div>
  );
}

export function PerformanceCard({ performance }: PerformanceCardProps) {
  const equityData = performance.equityCurve.map(p => ({
    value: p.equity,
  }));

  const lastEquity = performance.equityCurve.length > 0
    ? performance.equityCurve[performance.equityCurve.length - 1].equity
    : 100;

  const equityPnl = lastEquity - 100;
  const equityColor = equityPnl >= 0 ? 'text-nexzen-primary' : 'text-nexzen-danger';

  return (
    <div className="glass-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-3">PERFORMANCE</div>

      {performance.totalPredictions === 0 ? (
        <div className="text-center py-6 text-nexzen-muted text-xs">
          No data yet
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 mb-4">
            <WinRateRing rate={performance.winRate} />
            <div className="space-y-1 text-[11px]">
              <div>
                <span className="text-nexzen-muted">Total: </span>
                <span className="tabular-nums">{performance.totalPredictions}</span>
              </div>
              <div>
                <span className="text-nexzen-primary tabular-nums">{performance.wins}W</span>
                <span className="text-nexzen-muted"> / </span>
                <span className="text-nexzen-danger tabular-nums">{performance.losses}L</span>
              </div>
              <div>
                <span className="text-nexzen-muted">Streak: </span>
                <span className="text-nexzen-primary tabular-nums">{performance.streakCurrent}W</span>
                <span className="text-nexzen-muted"> (best: {performance.streakBest})</span>
              </div>
            </div>
          </div>

          <div className="border-t border-nexzen-border pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-nexzen-muted uppercase">Equity Curve</span>
              <span className={`text-xs font-bold tabular-nums ${equityColor}`}>
                {equityPnl >= 0 ? '+' : ''}{equityPnl.toFixed(2)}
              </span>
            </div>

            {equityData.length > 1 ? (
              <ResponsiveContainer width="100%" height={80}>
                <AreaChart data={equityData}>
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={equityPnl >= 0 ? '#00ff41' : '#ff4444'} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={equityPnl >= 0 ? '#00ff41' : '#ff4444'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={['dataMin', 'dataMax']} hide />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={equityPnl >= 0 ? '#00ff41' : '#ff4444'}
                    strokeWidth={1.5}
                    fill="url(#equityGrad)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-20 flex items-center justify-center text-[10px] text-nexzen-muted">
                Need more data...
              </div>
            )}

            <div className="flex justify-between text-[10px] text-nexzen-muted mt-1">
              <span>Drawdown: {performance.maxDrawdown.toFixed(2)}%</span>
              <span>Avg Conf: {(performance.avgConfidence * 100).toFixed(0)}%</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
