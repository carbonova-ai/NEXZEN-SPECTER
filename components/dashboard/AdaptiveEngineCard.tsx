'use client';

import { useState, useEffect } from 'react';
import { DEFAULT_ENGINE_CONFIG } from '@/lib/types';
import { type OptimizationResult, type MarketRegime, regimeLabel, regimeColor } from '@/lib/engine/weight-optimizer';
import type { Alert } from '@/lib/engine/alerts';

interface AdaptiveEngineCardProps {
  optimization: OptimizationResult | null;
  regime: MarketRegime;
  alerts: Alert[];
  adaptiveEnabled: boolean;
  onToggleAdaptive: () => void;
  onForceOptimize: () => void;
}

function WeightBar({
  label,
  current,
  optimized,
}: {
  label: string;
  current: number;
  optimized: number;
}) {
  const delta = optimized - current;
  const deltaColor = delta > 0.02 ? 'text-nexzen-primary' : delta < -0.02 ? 'text-nexzen-danger' : 'text-nexzen-muted';

  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-12 text-nexzen-muted uppercase">{label}</span>
      <div className="flex-1 h-1.5 bg-nexzen-surface rounded-full overflow-hidden relative">
        {/* Current weight (dim) */}
        <div
          className="absolute h-full bg-nexzen-muted/30 rounded-full"
          style={{ width: `${current * 100}%` }}
        />
        {/* Optimized weight (bright) */}
        <div
          className="absolute h-full bg-nexzen-primary/70 rounded-full transition-all duration-500"
          style={{ width: `${optimized * 100}%` }}
        />
      </div>
      <span className="w-8 text-right tabular-nums text-nexzen-text">
        {(optimized * 100).toFixed(0)}%
      </span>
      <span className={`w-8 text-right tabular-nums text-[9px] ${deltaColor}`}>
        {delta > 0 ? '+' : ''}{(delta * 100).toFixed(1)}
      </span>
    </div>
  );
}

function AccuracyDot({ accuracy }: { accuracy: number }) {
  const color = accuracy >= 0.6 ? 'bg-nexzen-primary' : accuracy >= 0.5 ? 'bg-yellow-500' : 'bg-nexzen-danger';
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} title={`${(accuracy * 100).toFixed(0)}%`} />
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const levelColor = {
    INFO: 'text-nexzen-muted',
    WARNING: 'text-yellow-500',
    CRITICAL: 'text-nexzen-danger',
  }[alert.level];

  const [ageLabel, setAgeLabel] = useState('now');
  useEffect(() => {
    function update() {
      const age = Date.now() - alert.timestamp;
      setAgeLabel(age < 60_000 ? 'now' :
        age < 3_600_000 ? `${Math.floor(age / 60_000)}m` :
        `${Math.floor(age / 3_600_000)}h`);
    }
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [alert.timestamp]);

  return (
    <div className="flex items-center justify-between text-[10px] py-1 border-b border-nexzen-border/30">
      <div className="flex items-center gap-1.5">
        <span className={`font-bold ${levelColor}`}>{alert.level[0]}</span>
        <span className="text-nexzen-text truncate max-w-[180px]">{alert.title}</span>
      </div>
      <span className="text-nexzen-muted tabular-nums">{ageLabel}</span>
    </div>
  );
}

export function AdaptiveEngineCard({
  optimization,
  regime,
  alerts,
  adaptiveEnabled,
  onToggleAdaptive,
  onForceOptimize,
}: AdaptiveEngineCardProps) {
  const defaultWeights = DEFAULT_ENGINE_CONFIG.weights;

  return (
    <div className="glass-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="text-[10px] uppercase tracking-wider text-nexzen-muted">ADAPTIVE ENGINE</div>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${regimeColor(regime)} bg-nexzen-surface`}>
            {regimeLabel(regime)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onForceOptimize}
            className="text-[9px] px-2 py-0.5 bg-nexzen-surface border border-nexzen-border rounded hover:bg-nexzen-border transition-colors text-nexzen-muted"
            title="Force re-optimization"
          >
            OPTIMIZE
          </button>
          <button
            onClick={onToggleAdaptive}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              adaptiveEnabled ? 'bg-nexzen-primary/30 border-nexzen-primary' : 'bg-nexzen-surface border-nexzen-border'
            } border`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                adaptiveEnabled ? 'left-5 bg-nexzen-primary' : 'left-0.5 bg-nexzen-muted'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${adaptiveEnabled ? 'bg-nexzen-primary animate-pulse' : 'bg-nexzen-muted'}`} />
        <span className={`text-xs font-bold ${adaptiveEnabled ? 'text-nexzen-primary' : 'text-nexzen-muted'}`}>
          {adaptiveEnabled ? 'ADAPTIVE' : 'STATIC WEIGHTS'}
        </span>
        {optimization && (
          <span className="text-[9px] text-nexzen-muted ml-auto tabular-nums">
            {optimization.samplesUsed} samples
          </span>
        )}
      </div>

      {/* Weight comparison */}
      {optimization && (
        <div className="space-y-1.5 mb-3">
          <div className="flex items-center justify-between text-[9px] text-nexzen-muted uppercase mb-1">
            <span>Signal Weights</span>
            <div className="flex items-center gap-2">
              <span>Acc</span>
              <span>Opt%</span>
              <span>Delta</span>
            </div>
          </div>
          {optimization.signalAccuracies.map(acc => (
            <div key={acc.key} className="flex items-center gap-1">
              <AccuracyDot accuracy={acc.accuracy} />
              <WeightBar
                label={acc.key.replace('chainlinkDelta', 'chain').replace('polymarket', 'poly').replace('bollinger', 'boll')}
                current={defaultWeights[acc.key as keyof typeof defaultWeights]}
                optimized={acc.optimizedWeight}
              />
            </div>
          ))}
        </div>
      )}

      {/* Performance metrics */}
      {optimization && optimization.samplesUsed > 0 && (
        <div className="grid grid-cols-3 gap-2 text-[10px] border-t border-nexzen-border pt-2 mb-3">
          <div>
            <div className="text-nexzen-muted">Win Rate</div>
            <div className={`tabular-nums font-medium ${
              optimization.overallWinRate >= 0.55 ? 'text-nexzen-primary' :
              optimization.overallWinRate >= 0.50 ? 'text-yellow-500' : 'text-nexzen-danger'
            }`}>
              {(optimization.overallWinRate * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-nexzen-muted">Est. Improvement</div>
            <div className={`tabular-nums font-medium ${
              optimization.improvement > 0 ? 'text-nexzen-primary' : 'text-nexzen-danger'
            }`}>
              {optimization.improvement > 0 ? '+' : ''}{(optimization.improvement * 100).toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-nexzen-muted">Regime</div>
            <div className={`font-medium ${regimeColor(regime)}`}>
              {regimeLabel(regime)}
            </div>
          </div>
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="border-t border-nexzen-border pt-2">
          <div className="text-[9px] uppercase text-nexzen-muted mb-1">Recent Alerts</div>
          <div className="max-h-[80px] overflow-y-auto">
            {alerts.slice(-5).reverse().map(alert => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      )}

      {/* No data state */}
      {!optimization && (
        <div className="text-center py-4 text-nexzen-muted text-xs">
          Waiting for prediction data...
        </div>
      )}
    </div>
  );
}
