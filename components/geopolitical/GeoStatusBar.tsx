'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface GeoStatusBarProps {
  totalArticles: number;
  secondsSinceUpdate: number;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  activeCategory: string;
  sources: string[];
  sourcesHit: string[];
  latencyMs: number;
  newArticleCount: number;
  polymarketCount: number;
  // v3.0
  threatSeverity?: string;
  threatScore?: number;
  correlationMomentum?: 'RISK_ON' | 'RISK_OFF' | 'MIXED';
}

const SOURCE_NAMES = ['Google', 'BBC', 'Guardian', 'Al Jazeera', 'France24', 'DW', 'NHK', 'CNBC', 'Sky', 'GDELT'];

export function GeoStatusBar({
  totalArticles,
  secondsSinceUpdate,
  isLoading,
  error,
  onRefresh,
  activeCategory,
  sources,
  sourcesHit,
  latencyMs,
  newArticleCount,
  polymarketCount,
  threatSeverity,
  threatScore,
  correlationMomentum,
}: GeoStatusBarProps) {
  const [time, setTime] = useState('');

  useEffect(() => {
    function updateTime() {
      setTime(new Date().toUTCString().split(' ').slice(4, 5).join(' '));
    }
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const feedStatus = error ? 'error' : isLoading ? 'connecting' : 'connected';
  const feedColor = feedStatus === 'connected'
    ? 'bg-nexzen-primary glow-dot'
    : feedStatus === 'connecting'
    ? 'bg-yellow-500 animate-pulse'
    : 'bg-nexzen-danger glow-dot';

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-nexzen-surface/80 backdrop-blur-md border-b border-amber-500/20">
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 group">
          <h1 className="text-base font-bold tracking-wider text-amber-500" style={{ textShadow: '0 0 10px rgba(245,158,11,0.5), 0 0 20px rgba(245,158,11,0.3)' }}>
            SP&#926;CT&#926;R GEO
          </h1>
        </Link>
        <span className="text-[10px] text-nexzen-muted">WAR ROOM v3.0</span>
      </div>

      <div className="flex items-center gap-4">
        {/* Connection status */}
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${feedColor}`} />
          <span className="text-[10px] uppercase tracking-wider text-nexzen-muted">
            {sourcesHit.length > 0 ? `${sourcesHit.length} FONTES` : 'MULTI-SOURCE'}
          </span>
        </div>

        {/* Source indicators */}
        <div className="flex items-center gap-0.5">
          {SOURCE_NAMES.map((src) => {
            const srcKey = src.toLowerCase().split(' ')[0];
            const isHit = sourcesHit.some(s => s.toLowerCase().includes(srcKey));
            const isActive = isHit || (sources || []).some(s =>
              s.toLowerCase().includes(srcKey)
            ) || totalArticles > 0;
            return (
              <span
                key={src}
                className={`text-[7px] px-1 py-0.5 rounded transition-all ${
                  isHit ? 'text-green-400 bg-green-500/10 font-bold' :
                  isActive ? 'text-amber-500/80 bg-amber-500/5' :
                  'text-nexzen-muted/20'
                }`}
                title={src}
              >
                {src.slice(0, 3).toUpperCase()}
              </span>
            );
          })}
        </div>

        {/* Threat Level Badge */}
        {threatSeverity && threatScore !== undefined && (
          <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${
            threatSeverity === 'CRITICAL' ? 'text-red-400 bg-red-500/15 border-red-500/40 animate-pulse' :
            threatSeverity === 'SEVERE' ? 'text-orange-400 bg-orange-500/10 border-orange-500/30' :
            threatSeverity === 'HIGH' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' :
            threatSeverity === 'ELEVATED' ? 'text-yellow-400 bg-yellow-500/5 border-yellow-500/20' :
            'text-green-400 bg-green-500/5 border-green-500/20'
          }`}>
            {threatSeverity === 'CRITICAL' ? 'DEFCON 1' :
             threatSeverity === 'SEVERE' ? 'DEFCON 2' :
             threatSeverity === 'HIGH' ? 'DEFCON 3' :
             threatSeverity === 'ELEVATED' ? 'DEFCON 4' : 'DEFCON 5'}
            <span className="ml-1 text-[8px] opacity-70">{threatScore}</span>
          </span>
        )}

        {/* Momentum */}
        {correlationMomentum && correlationMomentum !== 'MIXED' && (
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
            correlationMomentum === 'RISK_OFF' ? 'text-red-400 bg-red-500/10' : 'text-green-400 bg-green-500/10'
          }`}>
            {correlationMomentum === 'RISK_OFF' ? 'RISK OFF' : 'RISK ON'}
          </span>
        )}

        {/* Stats */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-nexzen-muted tabular-nums">
            {totalArticles} artigos
          </span>
          {polymarketCount > 0 && (
            <span className="text-[10px] text-purple-400/70 tabular-nums">
              {polymarketCount} mkts
            </span>
          )}
        </div>

        {/* New articles indicator */}
        {newArticleCount > 0 && (
          <span className="text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded font-bold animate-pulse">
            +{newArticleCount}
          </span>
        )}

        {/* Latency */}
        {latencyMs > 0 && (
          <span className={`text-[9px] tabular-nums ${
            latencyMs < 2000 ? 'text-green-400/60' :
            latencyMs < 5000 ? 'text-yellow-400/60' :
            'text-red-400/60'
          }`}>
            {latencyMs < 1000 ? `${latencyMs}ms` : `${(latencyMs / 1000).toFixed(1)}s`}
          </span>
        )}

        {/* Time since update */}
        <span className={`text-[10px] tabular-nums ${
          secondsSinceUpdate < 20 ? 'text-nexzen-primary' :
          secondsSinceUpdate < 40 ? 'text-yellow-500' :
          'text-nexzen-danger'
        }`}>
          {secondsSinceUpdate}s
        </span>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="text-[10px] text-amber-500/70 hover:text-amber-500 transition-colors disabled:opacity-30"
        >
          {isLoading ? '...' : 'REFRESH'}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
          {activeCategory}
        </span>
        <Link href="/" className="text-[9px] text-nexzen-muted hover:text-nexzen-primary transition-colors">
          BTC 5MIN
        </Link>
        <Link href="/backtest" className="text-[9px] text-nexzen-muted hover:text-nexzen-primary transition-colors">
          BACKTEST
        </Link>
        <span className="text-xs font-mono text-nexzen-text">{time} UTC</span>
      </div>
    </div>
  );
}
