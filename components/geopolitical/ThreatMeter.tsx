'use client';

import { useEffect, useRef } from 'react';
import type { ThreatLevel } from '@/lib/geopolitical/types';
import { THREAT_CONFIG } from '@/lib/geopolitical/types';

interface ThreatMeterProps {
  threatLevel: ThreatLevel;
}

export function ThreatMeter({ threatLevel }: ThreatMeterProps) {
  const config = THREAT_CONFIG[threatLevel.severity];
  const prevScoreRef = useRef(threatLevel.score);

  useEffect(() => {
    prevScoreRef.current = threatLevel.score;
  }, [threatLevel.score]);

  const trendIcon = threatLevel.trend === 'escalating' ? '▲'
    : threatLevel.trend === 'de-escalating' ? '▼' : '→';
  const trendColor = threatLevel.trend === 'escalating' ? 'text-red-400'
    : threatLevel.trend === 'de-escalating' ? 'text-green-400' : 'text-nexzen-muted';

  return (
    <div className={`glass-card p-3 ${config.border} border`} style={{ borderColor: undefined }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-nexzen-muted">
            THREAT LEVEL
          </span>
          <span className={`text-[8px] font-bold ${trendColor}`}>
            {trendIcon} {threatLevel.trend.toUpperCase()}
          </span>
        </div>
        <span className={`text-xs font-black ${config.color}`}>
          {config.label}
        </span>
      </div>

      {/* Gauge bar */}
      <div className="relative h-3 rounded-full bg-nexzen-surface overflow-hidden mb-2">
        {/* Gradient segments */}
        <div className="absolute inset-0 flex">
          <div className="w-1/5 bg-green-500/20" />
          <div className="w-1/5 bg-yellow-500/20" />
          <div className="w-1/5 bg-amber-500/20" />
          <div className="w-1/5 bg-orange-500/20" />
          <div className="w-1/5 bg-red-500/20" />
        </div>
        {/* Score indicator */}
        <div
          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out ${
            threatLevel.severity === 'CRITICAL' ? 'bg-gradient-to-r from-red-600 to-red-400' :
            threatLevel.severity === 'SEVERE' ? 'bg-gradient-to-r from-orange-600 to-orange-400' :
            threatLevel.severity === 'HIGH' ? 'bg-gradient-to-r from-amber-600 to-amber-400' :
            threatLevel.severity === 'ELEVATED' ? 'bg-gradient-to-r from-yellow-600 to-yellow-400' :
            'bg-gradient-to-r from-green-600 to-green-400'
          }`}
          style={{ width: `${threatLevel.score}%` }}
        />
        {/* Score marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-white/80 transition-all duration-1000 ease-out"
          style={{ left: `${threatLevel.score}%` }}
        />
      </div>

      {/* Score + Details */}
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-lg font-black tabular-nums ${config.color}`}>
          {threatLevel.score}
        </span>
        <span className="text-[8px] text-nexzen-muted">/100</span>
        <div className="flex-1" />
        {threatLevel.dominantCategory !== 'none' && (
          <span className="text-[8px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
            {threatLevel.dominantCategory}
          </span>
        )}
      </div>

      {/* Hotspots */}
      {threatLevel.activeHotspots.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {threatLevel.activeHotspots.map(h => (
            <span
              key={h}
              className={`text-[7px] px-1 py-0.5 rounded uppercase font-bold ${
                threatLevel.severity === 'CRITICAL' ? 'text-red-300 bg-red-500/15' :
                threatLevel.severity === 'SEVERE' ? 'text-orange-300 bg-orange-500/10' :
                'text-amber-300 bg-amber-500/10'
              }`}
            >
              {h}
            </span>
          ))}
        </div>
      )}

      {/* Summary */}
      <p className="text-[9px] text-nexzen-muted leading-relaxed">
        {threatLevel.summary}
      </p>
    </div>
  );
}
