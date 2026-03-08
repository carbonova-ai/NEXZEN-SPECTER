'use client';

import { Prediction } from '@/lib/types';

interface PredictionCardProps {
  prediction: Prediction | null;
  nextPredictionIn: number;
}

function SignalBar({ label, value }: { label: string; value: number }) {
  const absValue = Math.abs(value);
  const isPositive = value >= 0;
  const color = isPositive ? 'bg-nexzen-primary' : 'bg-nexzen-danger';
  const width = Math.round(absValue * 100);

  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-10 text-nexzen-muted uppercase">{label}</span>
      <div className="flex-1 h-1.5 bg-nexzen-surface rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.max(width, 2)}%`, marginLeft: isPositive ? '50%' : `${50 - width}%` }}
        />
      </div>
      <span className={`w-8 text-right tabular-nums ${isPositive ? 'text-nexzen-primary' : 'text-nexzen-danger'}`}>
        {value > 0 ? '+' : ''}{value.toFixed(2)}
      </span>
    </div>
  );
}

function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const progress = 1 - seconds / total;
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="48" height="48" className="-rotate-90">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="#222" strokeWidth="2" />
        <circle
          cx="24" cy="24" r={radius} fill="none"
          stroke="#00ff41" strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <span className="absolute text-[10px] tabular-nums text-nexzen-text">
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
      </span>
    </div>
  );
}

export function PredictionCard({ prediction, nextPredictionIn }: PredictionCardProps) {
  if (!prediction) {
    return (
      <div className="glass-card p-4">
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-2">NEXT PREDICTION</div>
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <div className="text-nexzen-muted text-sm animate-pulse">INITIALIZING...</div>
            <div className="text-[10px] text-nexzen-muted mt-1">Collecting market data</div>
          </div>
        </div>
      </div>
    );
  }

  const isUp = prediction.direction === 'UP';
  const dirColor = isUp ? 'text-nexzen-primary' : 'text-nexzen-danger';
  const arrow = isUp ? '\u25B2' : '\u25BC';

  const confidenceColor = {
    HIGH: 'text-nexzen-primary',
    MED: 'text-yellow-500',
    LOW: 'text-nexzen-muted',
  }[prediction.confidence];

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted">PREDICTION</div>
        <CountdownRing seconds={nextPredictionIn} total={300} />
      </div>

      <div className="flex items-baseline gap-2 mb-1">
        <span className={`text-3xl font-bold ${dirColor}`}>{arrow}</span>
        <span className={`text-2xl font-bold ${dirColor}`}>{prediction.direction}</span>
        <span className={`text-xl font-bold ${dirColor} tabular-nums`}>
          {(prediction.probability * 100).toFixed(1)}%
        </span>
      </div>

      <div className={`text-xs mb-3 ${confidenceColor}`}>
        Confidence: {prediction.confidence}
      </div>

      <div className="grid grid-cols-2 gap-1 text-[11px] mb-3">
        <div>
          <span className="text-nexzen-muted">Entry: </span>
          <span className="tabular-nums">${prediction.entryPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
        </div>
        <div>
          <span className="text-nexzen-muted">Target: </span>
          <span className="tabular-nums">${prediction.targetPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div className="space-y-1.5 border-t border-nexzen-border pt-3">
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-1">SIGNAL BREAKDOWN</div>
        <SignalBar label="RSI" value={prediction.signals.rsiSignal} />
        <SignalBar label="MACD" value={prediction.signals.macdSignal} />
        <SignalBar label="SMA" value={prediction.signals.smaSignal} />
        <SignalBar label="BOLL" value={prediction.signals.bollingerSignal} />
        <SignalBar label="VOL" value={prediction.signals.volumeSignal} />
        <SignalBar label="POLY" value={prediction.signals.polymarketSignal} />
        <SignalBar label="CHAIN" value={prediction.signals.chainlinkDeltaSignal} />
      </div>
    </div>
  );
}
