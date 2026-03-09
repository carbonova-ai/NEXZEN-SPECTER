'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { WalkForwardResult } from '@/lib/backtest/walk-forward';
import { formatMetric } from '@/lib/backtest/metrics';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';

export default function BacktestPage() {
  const [result, setResult] = useState<WalkForwardResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Config
  const [inSample, setInSample] = useState(50);
  const [outOfSample, setOutOfSample] = useState(20);
  const [step, setStep] = useState(10);

  async function runBacktest() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/backtest/walk-forward?inSample=${inSample}&outOfSample=${outOfSample}&step=${step}`
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Backtest failed');
        return;
      }

      setResult(data);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-nexzen-bg p-4 md:p-6">
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold text-nexzen-text">Walk-Forward Backtest</h1>
            <p className="text-xs text-nexzen-muted mt-1">
              Validate adaptive weight optimization on historical data
            </p>
          </div>
          <Link href="/" className="text-xs text-nexzen-primary hover:underline">
            ← Dashboard
          </Link>
        </div>

        {/* Config Panel */}
        <div className="glass-card p-4 mb-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-[10px] text-nexzen-muted uppercase block mb-1">In-Sample</label>
              <input
                type="number"
                value={inSample}
                onChange={e => setInSample(parseInt(e.target.value) || 50)}
                className="w-20 bg-nexzen-surface border border-nexzen-border rounded px-2 py-1 text-xs text-nexzen-text"
              />
            </div>
            <div>
              <label className="text-[10px] text-nexzen-muted uppercase block mb-1">Out-of-Sample</label>
              <input
                type="number"
                value={outOfSample}
                onChange={e => setOutOfSample(parseInt(e.target.value) || 20)}
                className="w-20 bg-nexzen-surface border border-nexzen-border rounded px-2 py-1 text-xs text-nexzen-text"
              />
            </div>
            <div>
              <label className="text-[10px] text-nexzen-muted uppercase block mb-1">Step Size</label>
              <input
                type="number"
                value={step}
                onChange={e => setStep(parseInt(e.target.value) || 10)}
                className="w-20 bg-nexzen-surface border border-nexzen-border rounded px-2 py-1 text-xs text-nexzen-text"
              />
            </div>
            <button
              onClick={runBacktest}
              disabled={loading}
              className="px-4 py-1.5 bg-nexzen-primary/20 border border-nexzen-primary text-nexzen-primary text-xs rounded hover:bg-nexzen-primary/30 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Running...' : 'Run Backtest'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="glass-card p-4 mb-4 border-nexzen-danger/50">
            <span className="text-nexzen-danger text-xs">{error}</span>
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <MetricCard
                label="Sharpe Ratio"
                value={formatMetric(result.aggregateMetrics.sharpeRatio, 'ratio')}
                isGood={result.aggregateMetrics.sharpeRatio > 0}
              />
              <MetricCard
                label="Win Rate"
                value={formatMetric(result.aggregateMetrics.winRate, 'percent')}
                isGood={result.aggregateMetrics.winRate > 0.5}
              />
              <MetricCard
                label="Profit Factor"
                value={formatMetric(result.aggregateMetrics.profitFactor, 'ratio')}
                isGood={result.aggregateMetrics.profitFactor > 1}
              />
              <MetricCard
                label="Max Drawdown"
                value={formatMetric(result.aggregateMetrics.maxDrawdown, 'percent')}
                isGood={result.aggregateMetrics.maxDrawdown < 0.1}
                invert
              />
            </div>

            {/* Detailed Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* OOS Equity Curve */}
              <div className="glass-card p-4">
                <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-3">
                  OUT-OF-SAMPLE EQUITY
                </div>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={buildEquityCurve(result)}
                      margin={{ top: 5, right: 5, bottom: 0, left: 0 }}
                    >
                      <defs>
                        <linearGradient id="oosGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00ff41" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#00ff41" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="window" tick={{ fill: '#666', fontSize: 9 }} axisLine={{ stroke: '#222' }} />
                      <YAxis tick={{ fill: '#666', fontSize: 9 }} axisLine={false} width={35} />
                      <Tooltip
                        contentStyle={{ background: '#111', border: '1px solid #222', fontSize: 10 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="equity"
                        stroke="#00ff41"
                        fill="url(#oosGrad)"
                        strokeWidth={1.5}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Window Win Rates */}
              <div className="glass-card p-4">
                <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-3">
                  WINDOW WIN RATES (OOS)
                </div>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={result.windows.map((w, i) => ({
                        window: `W${i + 1}`,
                        winRate: w.outOfSampleMetrics.winRate * 100,
                        regime: w.regime,
                      }))}
                      margin={{ top: 5, right: 5, bottom: 0, left: 0 }}
                    >
                      <XAxis dataKey="window" tick={{ fill: '#666', fontSize: 9 }} axisLine={{ stroke: '#222' }} />
                      <YAxis tick={{ fill: '#666', fontSize: 9 }} axisLine={false} width={30} domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{ background: '#111', border: '1px solid #222', fontSize: 10 }}
                        formatter={(v: unknown) => [`${Number(v).toFixed(1)}%`, 'Win Rate']}
                      />
                      <Bar dataKey="winRate" radius={[2, 2, 0, 0]}>
                        {result.windows.map((w, i) => (
                          <Cell
                            key={i}
                            fill={w.outOfSampleMetrics.winRate >= 0.55 ? '#00ff41' :
                                  w.outOfSampleMetrics.winRate >= 0.50 ? '#ffaa00' : '#ff4444'}
                            fillOpacity={0.6}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Improvement Summary */}
            <div className="glass-card p-4 mb-4">
              <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-3">
                ADAPTIVE vs STATIC IMPROVEMENT
              </div>
              <div className="grid grid-cols-4 gap-4 text-center">
                <ImprovementCell label="Sharpe" value={result.improvement.sharpe} format="ratio" />
                <ImprovementCell label="Win Rate" value={result.improvement.winRate} format="percent" />
                <ImprovementCell label="Profit Factor" value={result.improvement.profitFactor} format="ratio" />
                <ImprovementCell label="Drawdown" value={result.improvement.maxDrawdown} format="percent" />
              </div>
            </div>

            {/* Window Details */}
            <div className="glass-card p-4">
              <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-3">
                WINDOW DETAILS ({result.windows.length} windows, {result.totalOOSTrades} OOS trades)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-nexzen-muted uppercase border-b border-nexzen-border">
                      <th className="py-1 text-left">Window</th>
                      <th className="py-1 text-left">Regime</th>
                      <th className="py-1 text-right">IS WR</th>
                      <th className="py-1 text-right">OOS WR</th>
                      <th className="py-1 text-right">IS Sharpe</th>
                      <th className="py-1 text-right">OOS Sharpe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.windows.map((w, i) => (
                      <tr key={i} className="border-b border-nexzen-border/30">
                        <td className="py-1.5 text-nexzen-text">W{i + 1}</td>
                        <td className="py-1.5">
                          <span className={`text-[9px] font-bold ${
                            w.regime === 'TRENDING_UP' ? 'text-nexzen-primary' :
                            w.regime === 'TRENDING_DOWN' ? 'text-nexzen-danger' :
                            w.regime === 'RANGING' ? 'text-yellow-500' : 'text-orange-500'
                          }`}>
                            {w.regime.replace('TRENDING_', '↕')}
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-nexzen-muted">
                          {(w.inSampleMetrics.winRate * 100).toFixed(1)}%
                        </td>
                        <td className={`py-1.5 text-right tabular-nums ${
                          w.outOfSampleMetrics.winRate >= 0.55 ? 'text-nexzen-primary' :
                          w.outOfSampleMetrics.winRate >= 0.50 ? 'text-yellow-500' : 'text-nexzen-danger'
                        }`}>
                          {(w.outOfSampleMetrics.winRate * 100).toFixed(1)}%
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-nexzen-muted">
                          {w.inSampleMetrics.sharpeRatio.toFixed(2)}
                        </td>
                        <td className={`py-1.5 text-right tabular-nums ${
                          w.outOfSampleMetrics.sharpeRatio > 0 ? 'text-nexzen-primary' : 'text-nexzen-danger'
                        }`}>
                          {w.outOfSampleMetrics.sharpeRatio.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <div className="glass-card p-8 text-center">
            <div className="text-nexzen-muted text-sm mb-2">No backtest results yet</div>
            <div className="text-nexzen-muted text-xs">
              Configure parameters above and click &quot;Run Backtest&quot; to validate the adaptive strategy
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper Components ──

function MetricCard({ label, value, isGood, invert }: {
  label: string; value: string; isGood: boolean; invert?: boolean;
}) {
  const color = (invert ? !isGood : isGood) ? 'text-nexzen-primary' : 'text-nexzen-danger';
  return (
    <div className="glass-card p-3 text-center">
      <div className="text-[9px] text-nexzen-muted uppercase mb-1">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function ImprovementCell({ label, value, format }: {
  label: string; value: number; format: 'ratio' | 'percent';
}) {
  const formatted = format === 'percent'
    ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`
    : `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;

  return (
    <div>
      <div className="text-[9px] text-nexzen-muted uppercase mb-1">{label}</div>
      <div className={`text-xs font-bold tabular-nums ${value >= 0 ? 'text-nexzen-primary' : 'text-nexzen-danger'}`}>
        {formatted}
      </div>
    </div>
  );
}

function buildEquityCurve(result: WalkForwardResult) {
  const points = [{ window: 'Start', equity: 100 }];
  let equity = 100;

  for (let i = 0; i < result.windows.length; i++) {
    const wr = result.windows[i].outOfSampleMetrics;
    equity *= (1 + wr.totalReturn);
    points.push({ window: `W${i + 1}`, equity: parseFloat(equity.toFixed(2)) });
  }

  return points;
}
