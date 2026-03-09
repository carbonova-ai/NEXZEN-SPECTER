'use client';

import { useMemo } from 'react';
import type { PredictionResult } from '@/lib/types';

interface SignalHeatmapProps {
  history: PredictionResult[];
}

const SIGNAL_KEYS = [
  { key: 'rsiSignal', label: 'RSI' },
  { key: 'macdSignal', label: 'MACD' },
  { key: 'smaSignal', label: 'SMA' },
  { key: 'bollingerSignal', label: 'BOLL' },
  { key: 'volumeSignal', label: 'VOL' },
  { key: 'vwapSignal', label: 'VWAP' },
  { key: 'polymarketSignal', label: 'POLY' },
  { key: 'chainlinkDeltaSignal', label: 'CHAIN' },
  { key: 'orderBookSignal', label: 'OBOOK' },
  { key: 'fundingRateSignal', label: 'FUND' },
  { key: 'onChainSignal', label: 'WHALE' },
  { key: 'newsSentimentSignal', label: 'NEWS' },
  { key: 'mlEnsembleSignal', label: 'ML' },
] as const;

interface SignalContribution {
  key: string;
  label: string;
  winContribution: number;    // How often this signal was correct when it agreed
  accuracy: number;           // Correct / (Correct + Incorrect)
  avgStrength: number;        // Average absolute signal value
  recentTrend: number;        // Recent accuracy vs overall (-1 to 1)
}

function heatColor(value: number): string {
  // value: 0 to 1, maps from red → yellow → green
  if (value >= 0.6) return 'bg-nexzen-primary/60';
  if (value >= 0.55) return 'bg-nexzen-primary/30';
  if (value >= 0.5) return 'bg-yellow-500/30';
  if (value >= 0.45) return 'bg-orange-500/30';
  return 'bg-nexzen-danger/30';
}

function trendArrow(trend: number): string {
  if (trend > 0.05) return '↑';
  if (trend < -0.05) return '↓';
  return '→';
}

function trendColor(trend: number): string {
  if (trend > 0.05) return 'text-nexzen-primary';
  if (trend < -0.05) return 'text-nexzen-danger';
  return 'text-nexzen-muted';
}

export function SignalHeatmap({ history }: SignalHeatmapProps) {
  const contributions = useMemo((): SignalContribution[] => {
    const resolved = history.filter(p => p.outcome !== 'PENDING' && p.signals);
    if (resolved.length < 5) return [];

    // Split into recent (last 30%) and overall
    const recentCutoff = Math.max(0, resolved.length - Math.ceil(resolved.length * 0.3));

    return SIGNAL_KEYS.map(({ key, label }) => {
      let correct = 0;
      let incorrect = 0;
      let totalStrength = 0;
      let signalCount = 0;
      let recentCorrect = 0;
      let recentTotal = 0;

      for (let i = 0; i < resolved.length; i++) {
        const pred = resolved[i];
        const signals = pred.signals as unknown as Record<string, number>;
        const signalValue = signals[key] ?? 0;

        if (Math.abs(signalValue) < 0.05) continue; // Neutral

        signalCount++;
        totalStrength += Math.abs(signalValue);

        const signalDir = signalValue > 0 ? 'UP' : 'DOWN';
        const isCorrect =
          (signalDir === pred.direction && pred.outcome === 'WIN') ||
          (signalDir !== pred.direction && pred.outcome === 'LOSS');

        if (isCorrect) correct++;
        else incorrect++;

        if (i >= recentCutoff) {
          recentTotal++;
          if (isCorrect) recentCorrect++;
        }
      }

      const total = correct + incorrect;
      const accuracy = total > 0 ? correct / total : 0.5;
      const recentAccuracy = recentTotal > 0 ? recentCorrect / recentTotal : accuracy;

      return {
        key,
        label,
        winContribution: total > 0 ? correct / total : 0,
        accuracy,
        avgStrength: signalCount > 0 ? totalStrength / signalCount : 0,
        recentTrend: recentAccuracy - accuracy,
      };
    });
  }, [history]);

  if (contributions.length === 0) {
    return (
      <div className="glass-card p-4">
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-2">SIGNAL HEATMAP</div>
        <div className="text-center py-4 text-nexzen-muted text-xs">
          Need more data...
        </div>
      </div>
    );
  }

  // Sort by accuracy descending
  const sorted = [...contributions].sort((a, b) => b.accuracy - a.accuracy);

  return (
    <div className="glass-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-3">SIGNAL HEATMAP</div>

      {/* Header */}
      <div className="flex items-center justify-between text-[8px] text-nexzen-muted uppercase mb-1">
        <span className="w-12">Signal</span>
        <span className="w-10 text-center">Acc</span>
        <span className="w-12 text-center">Strength</span>
        <span className="w-6 text-center">Trend</span>
        <span className="flex-1 text-right">Heat</span>
      </div>

      {/* Rows */}
      <div className="space-y-1">
        {sorted.map(sig => (
          <div key={sig.key} className="flex items-center justify-between py-1">
            <span className="text-[10px] text-nexzen-text font-medium w-12">{sig.label}</span>

            <span className={`text-[10px] tabular-nums w-10 text-center font-medium ${
              sig.accuracy >= 0.55 ? 'text-nexzen-primary' :
              sig.accuracy >= 0.50 ? 'text-yellow-500' : 'text-nexzen-danger'
            }`}>
              {(sig.accuracy * 100).toFixed(0)}%
            </span>

            <span className="text-[10px] tabular-nums w-12 text-center text-nexzen-muted">
              {sig.avgStrength.toFixed(2)}
            </span>

            <span className={`text-[10px] w-6 text-center ${trendColor(sig.recentTrend)}`}>
              {trendArrow(sig.recentTrend)}
            </span>

            {/* Heat bar */}
            <div className="flex-1 ml-2 h-3 bg-nexzen-surface rounded overflow-hidden">
              <div
                className={`h-full rounded ${heatColor(sig.accuracy)} transition-all duration-500`}
                style={{ width: `${Math.max(10, sig.accuracy * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
