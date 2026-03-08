'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { PredictionResult } from '@/lib/types';

interface EquityCurveChartProps {
  history: PredictionResult[];
}

interface EquityPoint {
  index: number;
  equity: number;
  drawdown: number;
  timestamp: number;
  outcome: string;
}

export function EquityCurveChart({ history }: EquityCurveChartProps) {
  const data = useMemo(() => {
    const resolved = history.filter(p => p.outcome !== 'PENDING' && p.pnlPercent !== null);
    if (resolved.length === 0) return [];

    let equity = 100;
    let peak = 100;
    const points: EquityPoint[] = [{ index: 0, equity: 100, drawdown: 0, timestamp: 0, outcome: '' }];

    for (let i = 0; i < resolved.length; i++) {
      const pnl = (resolved[i].pnlPercent ?? 0) / 100;
      equity *= (1 + pnl);
      peak = Math.max(peak, equity);
      const drawdown = ((peak - equity) / peak) * 100;

      points.push({
        index: i + 1,
        equity: parseFloat(equity.toFixed(2)),
        drawdown: parseFloat(drawdown.toFixed(2)),
        timestamp: resolved[i].timestamp,
        outcome: resolved[i].outcome,
      });
    }

    return points;
  }, [history]);

  if (data.length < 2) {
    return (
      <div className="glass-card p-4">
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-2">EQUITY CURVE</div>
        <div className="text-center py-6 text-nexzen-muted text-xs">
          Waiting for resolved predictions...
        </div>
      </div>
    );
  }

  const lastEquity = data[data.length - 1].equity;
  const isProfit = lastEquity >= 100;
  const maxDD = Math.max(...data.map(d => d.drawdown));

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted">EQUITY CURVE</div>
        <div className="flex items-center gap-3 text-[10px] tabular-nums">
          <span className={isProfit ? 'text-nexzen-primary' : 'text-nexzen-danger'}>
            {isProfit ? '+' : ''}{(lastEquity - 100).toFixed(2)}%
          </span>
          <span className="text-nexzen-danger">
            DD: {maxDD.toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isProfit ? '#00ff41' : '#ff4444'} stopOpacity={0.3} />
                <stop offset="95%" stopColor={isProfit ? '#00ff41' : '#ff4444'} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="index"
              tick={{ fill: '#666', fontSize: 9 }}
              axisLine={{ stroke: '#222' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#666', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              width={35}
              tickFormatter={(v: number) => `${v.toFixed(0)}`}
            />
            <ReferenceLine y={100} stroke="#666" strokeDasharray="3 3" />
            <Tooltip
              contentStyle={{
                background: '#111',
                border: '1px solid #222',
                borderRadius: 4,
                fontSize: 10,
                color: '#e5e5e5',
              }}
              formatter={(value: unknown, name: unknown) => {
                const v = Number(value);
                if (name === 'equity') return [`${v.toFixed(2)}%`, 'Equity'];
                return [`${v.toFixed(2)}%`, 'Drawdown'];
              }}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke={isProfit ? '#00ff41' : '#ff4444'}
              fill="url(#equityGrad)"
              strokeWidth={1.5}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
