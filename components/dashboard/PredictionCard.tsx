'use client';

import { Prediction, MicroPrediction } from '@/lib/types';

interface PredictionCardProps {
  prediction: Prediction | null;
  nextPredictionIn: number;
  microPrediction?: MicroPrediction | null;
  currentPrice?: number | null;
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

function SafetyBadge({ score, flags }: { score: number; flags: string[] }) {
  const color = score >= 0.7 ? 'text-nexzen-primary border-nexzen-primary/30'
    : score >= 0.4 ? 'text-yellow-500 border-yellow-500/30'
    : 'text-nexzen-danger border-nexzen-danger/30';

  const label = score >= 0.7 ? 'SAFE' : score >= 0.4 ? 'CAUTION' : 'RISKY';

  return (
    <div className={`border rounded px-2 py-1 ${color}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold">{label}</span>
        <span className="text-[10px] tabular-nums">{(score * 100).toFixed(0)}%</span>
      </div>
      {flags.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {flags.slice(0, 3).map((f, i) => (
            <div key={i} className="text-[8px] text-nexzen-muted/70 leading-tight">{f}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConvictionBadge({ conviction }: { conviction: string }) {
  const config = {
    STRONG: { color: 'bg-nexzen-primary/20 text-nexzen-primary', label: 'STRONG' },
    MODERATE: { color: 'bg-yellow-500/20 text-yellow-500', label: 'MODERATE' },
    WEAK: { color: 'bg-nexzen-muted/20 text-nexzen-muted', label: 'WEAK' },
    DEAD_ZONE: { color: 'bg-nexzen-danger/20 text-nexzen-danger', label: 'DEAD ZONE' },
  }[conviction] ?? { color: 'bg-nexzen-muted/20 text-nexzen-muted', label: conviction };

  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${config.color}`}>
      {config.label}
    </span>
  );
}

function EtaBadge({ eta }: { eta: string }) {
  const config = {
    BEFORE: { color: 'text-yellow-500', label: 'BEFORE' },
    AT: { color: 'text-nexzen-primary', label: 'AT TARGET' },
    BEYOND: { color: 'text-nexzen-primary', label: 'BEYOND' },
    UNKNOWN: { color: 'text-nexzen-muted', label: '---' },
  }[eta] ?? { color: 'text-nexzen-muted', label: eta };

  return <span className={`text-[9px] font-bold tabular-nums ${config.color}`}>{config.label}</span>;
}

function ProjectionRow({ label, projection, currentPrice }: {
  label: string;
  projection: { projectedPrice: number; projectedMove: number; confidence: number; velocity: number };
  currentPrice: number;
}) {
  const isUp = projection.projectedMove >= 0;
  const moveColor = isUp ? 'text-nexzen-primary' : 'text-nexzen-danger';

  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-nexzen-muted w-8">{label}</span>
      <span className={`tabular-nums font-bold ${moveColor}`}>
        ${projection.projectedPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}
      </span>
      <span className={`tabular-nums ${moveColor}`}>
        {isUp ? '+' : ''}{projection.projectedMove.toFixed(3)}%
      </span>
      <div className="flex items-center gap-1">
        <div className="w-8 h-1 bg-nexzen-surface rounded-full overflow-hidden">
          <div
            className="h-full bg-nexzen-accent rounded-full"
            style={{ width: `${Math.round(projection.confidence * 100)}%` }}
          />
        </div>
        <span className="text-nexzen-muted text-[8px]">{(projection.confidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

export function PredictionCard({ prediction, nextPredictionIn, microPrediction, currentPrice }: PredictionCardProps) {
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

  const micro = microPrediction;
  const price = currentPrice ?? prediction.entryPrice;

  return (
    <div className="glass-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="text-[10px] uppercase tracking-wider text-nexzen-muted">PREDICTION</div>
          {micro && <ConvictionBadge conviction={micro.directionConviction.conviction} />}
        </div>
        <CountdownRing seconds={nextPredictionIn} total={300} />
      </div>

      {/* Direction + Probability */}
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

      {/* Price & Target */}
      <div className="grid grid-cols-2 gap-1 text-[11px] mb-3">
        <div>
          <span className="text-nexzen-muted">Entry: </span>
          <span className="tabular-nums">${prediction.entryPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
        </div>
        <div>
          <span className="text-nexzen-muted">Target: </span>
          <span className="tabular-nums">${prediction.targetPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
        </div>
        {currentPrice && (
          <div>
            <span className="text-nexzen-muted">Now: </span>
            <span className={`tabular-nums font-bold ${currentPrice >= prediction.entryPrice === isUp ? 'text-nexzen-primary' : 'text-nexzen-danger'}`}>
              ${currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
        {micro && (
          <div>
            <span className="text-nexzen-muted">Dist: </span>
            <span className="tabular-nums text-nexzen-accent">
              {micro.targetProximity.distancePercent >= 0 ? '+' : ''}{micro.targetProximity.distancePercent.toFixed(3)}%
            </span>
          </div>
        )}
        <div className="col-span-2 text-[9px] text-nexzen-muted/50 mt-0.5">
          Entry via Binance · Resolve via {prediction.resolutionSource === 'chainlink' ? 'Chainlink Oracle' : 'Binance'}
        </div>
      </div>

      {/* Micro-Prediction: Projections + Target Proximity */}
      {micro && micro.tickCount >= 10 && (
        <div className="border-t border-nexzen-border pt-3 mb-3">
          <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-2">PRICE PROJECTIONS</div>

          <ProjectionRow label="T+1m" projection={micro.projection1min} currentPrice={price} />
          <ProjectionRow label="T+2m" projection={micro.projection2min} currentPrice={price} />

          {/* Target ETA */}
          <div className="flex items-center justify-between mt-2 text-[10px]">
            <span className="text-nexzen-muted">Target ETA</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="text-nexzen-muted text-[8px]">1m:</span>
                <EtaBadge eta={micro.targetProximity.eta1min} />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-nexzen-muted text-[8px]">2m:</span>
                <EtaBadge eta={micro.targetProximity.eta2min} />
              </div>
            </div>
          </div>

          {/* Tick Momentum */}
          <div className="flex items-center justify-between mt-2 text-[10px]">
            <span className="text-nexzen-muted">Tick Momentum</span>
            <div className="flex items-center gap-1.5">
              <div className="w-16 h-1.5 bg-nexzen-surface rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${micro.tickMomentum >= 0 ? 'bg-nexzen-primary' : 'bg-nexzen-danger'}`}
                  style={{
                    width: `${Math.round(Math.abs(micro.tickMomentum) * 50)}%`,
                    marginLeft: micro.tickMomentum >= 0 ? '50%' : `${50 - Math.abs(micro.tickMomentum) * 50}%`,
                  }}
                />
              </div>
              <span className={`text-[9px] tabular-nums ${micro.tickMomentum >= 0 ? 'text-nexzen-primary' : 'text-nexzen-danger'}`}>
                {micro.tickMomentum >= 0 ? '+' : ''}{micro.tickMomentum.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Approaching indicator */}
          <div className="flex items-center justify-between mt-1 text-[10px]">
            <span className="text-nexzen-muted">Target Approach</span>
            <span className={`text-[9px] font-bold ${micro.targetProximity.approachingTarget ? 'text-nexzen-primary' : 'text-nexzen-danger'}`}>
              {micro.targetProximity.approachingTarget ? 'APPROACHING' : 'DIVERGING'}
            </span>
          </div>
        </div>
      )}

      {/* Safety Score */}
      {micro && (
        <div className="border-t border-nexzen-border pt-3 mb-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wider text-nexzen-muted">TRADE SAFETY</div>
            <SafetyBadge
              score={micro.directionConviction.safetyScore}
              flags={micro.directionConviction.safetyFlags}
            />
          </div>
        </div>
      )}

      {/* Signal Breakdown */}
      <div className="space-y-1.5 border-t border-nexzen-border pt-3">
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-1">SIGNAL BREAKDOWN</div>
        <SignalBar label="RSI" value={prediction.signals.rsiSignal} />
        <SignalBar label="MACD" value={prediction.signals.macdSignal} />
        <SignalBar label="SMA" value={prediction.signals.smaSignal} />
        <SignalBar label="BOLL" value={prediction.signals.bollingerSignal} />
        <SignalBar label="VOL" value={prediction.signals.volumeSignal} />
        <SignalBar label="VWAP" value={prediction.signals.vwapSignal} />
        <SignalBar label="POLY" value={prediction.signals.polymarketSignal} />
        <SignalBar label="CHAIN" value={prediction.signals.chainlinkDeltaSignal} />
      </div>
    </div>
  );
}
