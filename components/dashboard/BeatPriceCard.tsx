'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { Btc5mData } from '@/hooks/useBtc5mMarket';

interface BeatPriceCardProps {
  currentPrice: number | null;
  chainlinkDelta: number | null;
  /** Chainlink oracle price — used as price-to-beat for accurate Polymarket resolution */
  chainlinkPrice?: number | null;
  candles?: { open: number; high: number; low: number; close: number; volume: number; timestamp: number }[];
  fundingRateSignal?: number | null;
  orderBookSignal?: number | null;
  /** BTC 5-min market data (lifted from page.tsx to avoid duplicate API calls) */
  polyData: Btc5mData;
  polyLoading: boolean;
  polyError: string | null;
}

type Signal = 'BUY_UP' | 'BUY_DOWN' | 'WAIT';
type Conviction = 'STRONG' | 'MODERATE' | 'WEAK';

// ── Tick Momentum Tracker — detects micro-trends from price ticks ──
interface TickMomentum {
  direction: 'UP' | 'DOWN' | 'FLAT';
  strength: number;
  ticksUp: number;
  ticksDown: number;
  velocityPerSec: number;
}

function useTickMomentum(price: number | null): TickMomentum {
  const ticksRef = useRef<{ price: number; time: number }[]>([]);
  const [momentum, setMomentum] = useState<TickMomentum>({
    direction: 'FLAT', strength: 0, ticksUp: 0, ticksDown: 0, velocityPerSec: 0,
  });

  useEffect(() => {
    if (price === null) return;
    const now = Date.now();
    const ticks = ticksRef.current;

    ticks.push({ price, time: now });

    // Keep last 60 seconds of ticks
    const cutoff = now - 60_000;
    while (ticks.length > 0 && ticks[0].time < cutoff) ticks.shift();
    if (ticks.length < 3) return;

    let up = 0, down = 0;
    for (let i = 1; i < ticks.length; i++) {
      if (ticks[i].price > ticks[i - 1].price) up++;
      else if (ticks[i].price < ticks[i - 1].price) down++;
    }

    // Velocity: price change over last 10 seconds
    const recentCutoff = now - 10_000;
    const recentTicks = ticks.filter(t => t.time >= recentCutoff);
    const velocity = recentTicks.length >= 2
      ? (recentTicks[recentTicks.length - 1].price - recentTicks[0].price) /
        ((recentTicks[recentTicks.length - 1].time - recentTicks[0].time) / 1000)
      : 0;

    const total = up + down || 1;
    const ratio = (up - down) / total;
    const strength = Math.min(1, Math.abs(ratio) * 1.5);

    setMomentum({
      direction: ratio > 0.15 ? 'UP' : ratio < -0.15 ? 'DOWN' : 'FLAT',
      strength,
      ticksUp: up,
      ticksDown: down,
      velocityPerSec: velocity,
    });
  }, [price]);

  return momentum;
}

// ── VWAP Calculator — Volume Weighted Average Price edge ──
function useVWAP(candles?: BeatPriceCardProps['candles']): { vwap: number | null; deviation: number | null } {
  return useMemo(() => {
    if (!candles || candles.length < 5) return { vwap: null, deviation: null };

    const recent = candles.slice(-12);
    let cumulativeTPV = 0;
    let cumulativeVolume = 0;

    for (const c of recent) {
      const tp = (c.high + c.low + c.close) / 3;
      cumulativeTPV += tp * c.volume;
      cumulativeVolume += c.volume;
    }

    if (cumulativeVolume === 0) return { vwap: null, deviation: null };

    const vwap = cumulativeTPV / cumulativeVolume;
    const lastClose = recent[recent.length - 1].close;
    const deviation = (lastClose - vwap) / vwap;

    return { vwap, deviation };
  }, [candles]);
}

// ── Signal Performance Tracker ──
function useSignalTracker() {
  const historyRef = useRef<{ signal: Signal; priceAtSignal: number; target: number; timestamp: number; resolved?: boolean; won?: boolean }[]>([]);
  const [stats, setStats] = useState({ total: 0, wins: 0, winRate: 0 });

  const recordSignal = useCallback((signal: Signal, currentPrice: number, target: number) => {
    if (signal === 'WAIT') return;
    historyRef.current.push({ signal, priceAtSignal: currentPrice, target, timestamp: Date.now() });
    if (historyRef.current.length > 100) historyRef.current.shift();
  }, []);

  const resolveSignals = useCallback((finalPrice: number) => {
    let updated = false;
    for (const entry of historyRef.current) {
      if (entry.resolved) continue;
      const age = Date.now() - entry.timestamp;
      if (age < 240_000) continue;

      entry.resolved = true;
      updated = true;
      entry.won = entry.signal === 'BUY_UP' ? finalPrice > entry.target : finalPrice < entry.target;
    }

    if (updated) {
      const resolved = historyRef.current.filter(e => e.resolved);
      const wins = resolved.filter(e => e.won).length;
      setStats({ total: resolved.length, wins, winRate: resolved.length > 0 ? wins / resolved.length : 0 });
    }
  }, []);

  return { stats, recordSignal, resolveSignals };
}

export function BeatPriceCard({ currentPrice, chainlinkDelta, chainlinkPrice, candles, fundingRateSignal, orderBookSignal, polyData, polyLoading, polyError }: BeatPriceCardProps) {
  const momentum = useTickMomentum(currentPrice);
  const { vwap, deviation: vwapDeviation } = useVWAP(candles);
  const { stats: signalStats, recordSignal, resolveSignals } = useSignalTracker();

  // ── Countdown timer ──
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, []);

  const windowEnd = polyData?.window?.end ?? 0;
  const windowStart = polyData?.window?.start ?? 0;
  const remaining = Math.max(0, windowEnd - now);
  const totalWindow = windowEnd - windowStart;
  const elapsed = totalWindow > 0 ? Math.max(0, now - windowStart) : 0;
  const progressPct = totalWindow > 0 ? Math.min(100, (elapsed / totalWindow) * 100) : 0;
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const isWindowActive = windowEnd > now && windowStart <= now;

  // ── Auto-capture price-to-beat at window start ──
  const [priceToBeat, setPriceToBeat] = useState<number | null>(null);
  const [manualOverride, setManualOverride] = useState('');
  const lastWindowRef = useRef(0);

  useEffect(() => {
    if (windowStart > 0 && windowStart !== lastWindowRef.current) {
      // Prefer Chainlink price — Polymarket resolves against the oracle, not Binance spot.
      // Chainlink lags ~3-10s behind Binance; using it as the baseline avoids a systematic
      // bias where the "price to beat" is always slightly ahead of the resolution price.
      const capturePrice = (chainlinkPrice !== null && chainlinkPrice !== undefined)
        ? chainlinkPrice
        : currentPrice;
      if (capturePrice !== null) {
        lastWindowRef.current = windowStart;
        if (!manualOverride) {
          const price = capturePrice;
          const timeout = setTimeout(() => setPriceToBeat(price), 0);
          return () => clearTimeout(timeout);
        }
      }
    }
  }, [windowStart, currentPrice, chainlinkPrice, manualOverride]);

  // Resolve signals at window transition
  useEffect(() => {
    if (windowStart > 0 && currentPrice !== null) {
      resolveSignals(currentPrice);
    }
  }, [windowStart, currentPrice, resolveSignals]);

  const handleOverride = (val: string) => {
    setManualOverride(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) setPriceToBeat(parsed);
    else if (val === '') setPriceToBeat(null);
  };

  const upOdds = polyData?.odds?.up ?? null;
  const downOdds = polyData?.odds?.down ?? null;

  // ══════════════════════════════════════════
  // ADVANCED MULTI-SIGNAL ANALYSIS ENGINE
  // ══════════════════════════════════════════
  const target = priceToBeat;
  const hasTarget = target !== null && target > 0;

  const analysis = useMemo(() => {
    if (!hasTarget || currentPrice === null) return null;

    const diff = currentPrice - target;
    const diffPercent = (diff / target) * 100;

    // SIGNAL 1: Fast Price Edge (arrives 100-500ms before Poly updates)
    const priceSignal = diffPercent !== 0
      ? Math.max(-1, Math.min(1, diffPercent / 0.15))
      : 0;

    // SIGNAL 2: Polymarket CLOB consensus
    const polyUp = upOdds ?? 0.5;
    const polyDown = downOdds ?? 0.5;
    const polyBias = polyUp - polyDown;

    // SIGNAL 3: Chainlink oracle divergence
    const deltaBias = chainlinkDelta !== null
      ? Math.sign(chainlinkDelta) * Math.min(Math.abs(chainlinkDelta) * 100, 1)
      : 0;

    // SIGNAL 4: Tick Momentum (60s micro-trend)
    const momentumSignal = momentum.direction === 'UP'
      ? momentum.strength
      : momentum.direction === 'DOWN' ? -momentum.strength : 0;

    // SIGNAL 5: VWAP Deviation (institutional flow)
    const vwapSignal = vwapDeviation !== null
      ? Math.max(-1, Math.min(1, vwapDeviation * 50))
      : 0;

    // SIGNAL 6: Order Book Imbalance
    const obSignal = orderBookSignal ?? 0;

    // SIGNAL 7: Funding Rate Contrarian
    const frSignal = fundingRateSignal ?? 0;

    // ── TIME-ADAPTIVE WEIGHTING ──
    // Early: weight market consensus more (poly, orderbook)
    // Late: weight fast signals more (price, momentum)
    const timeProgress = totalWindow > 0 ? elapsed / totalWindow : 0.5;
    const lateBoost = Math.max(0, timeProgress * 1.5 - 0.5);
    const earlyBoost = Math.max(0, 1 - timeProgress * 1.5);

    const weights: Record<string, number> = {
      price:     0.25 + lateBoost * 0.15,
      poly:      0.20 + earlyBoost * 0.10,
      delta:     0.15,
      momentum:  0.10 + lateBoost * 0.10,
      vwap:      0.10,
      orderBook: 0.10 - lateBoost * 0.05,
      funding:   0.05,
    };

    const wTotal = Object.values(weights).reduce((s, w) => s + w, 0);
    for (const k of Object.keys(weights)) weights[k] /= wTotal;

    const combined =
      priceSignal * weights.price +
      polyBias * weights.poly +
      deltaBias * weights.delta +
      momentumSignal * weights.momentum +
      vwapSignal * weights.vwap +
      obSignal * weights.orderBook +
      frSignal * weights.funding;

    // ── CONVICTION: signal agreement ──
    const signals = [priceSignal, polyBias, deltaBias, momentumSignal, vwapSignal, obSignal, frSignal];
    const agreeing = signals.filter(s => Math.sign(s) === Math.sign(combined) && Math.abs(s) > 0.05).length;
    const totalActive = signals.filter(s => Math.abs(s) > 0.05).length;
    const agreementRatio = totalActive > 0 ? agreeing / totalActive : 0;

    let conviction: Conviction;
    if (agreementRatio >= 0.7 && Math.abs(combined) > 0.08) conviction = 'STRONG';
    else if (agreementRatio >= 0.5 && Math.abs(combined) > 0.04) conviction = 'MODERATE';
    else conviction = 'WEAK';

    // ── TIME URGENCY ──
    let urgencyLabel = '';
    let urgencyMultiplier = 1;
    if (remaining > 0 && remaining < 30_000) { urgencyLabel = ' — LAST 30s!'; urgencyMultiplier = 1.3; }
    else if (remaining > 0 && remaining < 60_000) { urgencyLabel = ' — FINAL MIN'; urgencyMultiplier = 1.15; }
    else if (remaining > 0 && remaining < 120_000) { urgencyLabel = ' — 2min left'; }

    const finalScore = combined * urgencyMultiplier;

    // ── DYNAMIC THRESHOLD: lower late, higher early ──
    const threshold = timeProgress > 0.7 ? 0.02 : timeProgress > 0.4 ? 0.03 : 0.05;

    let signal: Signal;
    let reason: string;

    if (finalScore > threshold) {
      signal = 'BUY_UP';
      reason = diff > 0
        ? `+$${Math.abs(diff).toFixed(2)} above · Poly UP ${(polyUp * 100).toFixed(0)}¢ · ${agreeing}/${totalActive} agree${urgencyLabel}`
        : `Poly UP ${(polyUp * 100).toFixed(0)}¢ · momentum ${momentum.direction}${urgencyLabel}`;
    } else if (finalScore < -threshold) {
      signal = 'BUY_DOWN';
      reason = diff < 0
        ? `-$${Math.abs(diff).toFixed(2)} below · Poly DN ${(polyDown * 100).toFixed(0)}¢ · ${agreeing}/${totalActive} agree${urgencyLabel}`
        : `Poly DN ${(polyDown * 100).toFixed(0)}¢ · momentum ${momentum.direction}${urgencyLabel}`;
    } else {
      signal = 'WAIT';
      reason = `No clear edge — ${totalActive} signals, ${agreeing} agree${urgencyLabel}`;
    }

    return {
      signal, reason, diff, diffPercent, polyUp, polyDown, combined: finalScore,
      conviction, agreeing, totalActive, agreementRatio,
      subSignals: { price: priceSignal, poly: polyBias, delta: deltaBias, momentum: momentumSignal, vwap: vwapSignal, orderBook: obSignal, funding: frSignal },
      weights,
    };
  }, [hasTarget, target, currentPrice, upOdds, downOdds, chainlinkDelta, remaining, elapsed, totalWindow, momentum, vwapDeviation, orderBookSignal, fundingRateSignal]);

  // Record signals for tracking
  const lastSignalRef = useRef<string>('');
  useEffect(() => {
    if (!analysis || !currentPrice || !target) return;
    const key = `${analysis.signal}-${windowStart}`;
    if (key === lastSignalRef.current) return;
    if (analysis.signal !== 'WAIT' && analysis.conviction !== 'WEAK') {
      lastSignalRef.current = key;
      recordSignal(analysis.signal, currentPrice, target);
    }
  }, [analysis, currentPrice, target, windowStart, recordSignal]);

  const signalCfg = {
    BUY_UP:   { color: 'text-nexzen-primary', bg: 'bg-nexzen-primary/10 border-nexzen-primary/30', icon: '▲', label: 'BUY UP' },
    BUY_DOWN: { color: 'text-nexzen-danger',  bg: 'bg-nexzen-danger/10 border-nexzen-danger/30',   icon: '▼', label: 'BUY DOWN' },
    WAIT:     { color: 'text-yellow-500',     bg: 'bg-yellow-500/10 border-yellow-500/30',         icon: '◆', label: 'WAIT' },
  };

  const convictionCfg: Record<Conviction, { color: string; label: string }> = {
    STRONG:   { color: 'text-nexzen-primary', label: 'STRONG' },
    MODERATE: { color: 'text-yellow-500', label: 'MOD' },
    WEAK:     { color: 'text-nexzen-muted', label: 'WEAK' },
  };

  const cfg = analysis ? signalCfg[analysis.signal] : null;
  const upPct = (upOdds ?? 0.5) * 100;
  const downPct = (downOdds ?? 0.5) * 100;
  const priceDiff = hasTarget && currentPrice !== null ? currentPrice - target : null;

  const timerColor = remaining > 0 && remaining < 30_000
    ? 'text-nexzen-danger animate-pulse'
    : remaining > 0 && remaining < 60_000 ? 'text-nexzen-danger'
    : remaining > 0 && remaining < 120_000 ? 'text-yellow-500' : 'text-nexzen-text';

  const connStatus = polyError ? 'ERROR' : polyLoading ? 'CONNECTING' : polyData?.market ? 'LIVE' : 'NO MARKET';
  const connColor = connStatus === 'LIVE' ? 'bg-nexzen-primary' : connStatus === 'CONNECTING' ? 'bg-yellow-500' : 'bg-nexzen-danger';

  const momColor = momentum.direction === 'UP' ? 'text-nexzen-primary' : momentum.direction === 'DOWN' ? 'text-nexzen-danger' : 'text-nexzen-muted';
  const momIcon = momentum.direction === 'UP' ? '↑' : momentum.direction === 'DOWN' ? '↓' : '·';

  return (
    <div className="glass-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-nexzen-muted">BTC Up/Down · 5min</span>
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${connColor} animate-pulse-glow`} />
          <span className="text-[9px] text-nexzen-muted/50">{connStatus === 'LIVE' ? 'EDGE MODE' : connStatus}</span>
          {signalStats.total > 0 && (
            <span className={`text-[9px] tabular-nums ml-1 ${signalStats.winRate >= 0.55 ? 'text-nexzen-primary' : signalStats.winRate >= 0.5 ? 'text-yellow-500' : 'text-nexzen-danger'}`}>
              {signalStats.wins}W/{signalStats.total - signalStats.wins}L ({(signalStats.winRate * 100).toFixed(0)}%)
            </span>
          )}
        </div>

        {isWindowActive && (
          <div className="text-right">
            <div className={`text-xl font-bold tabular-nums leading-none ${timerColor}`}>
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </div>
            <div className="w-20 h-1 bg-nexzen-surface rounded-full mt-0.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${progressPct > 80 ? 'bg-nexzen-danger' : progressPct > 60 ? 'bg-yellow-500' : 'bg-nexzen-primary'}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="text-[8px] text-nexzen-muted uppercase tracking-wider">remaining</div>
          </div>
        )}
      </div>

      {polyData?.market?.question && (
        <div className="text-[9px] text-nexzen-muted/50 mb-2 truncate">{polyData.market.question}</div>
      )}

      {/* Three columns */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        {/* Price to Beat + Current */}
        <div>
          <div className="text-[9px] uppercase tracking-wider text-nexzen-muted mb-0.5">Price to Beat</div>
          <div className="text-base font-bold text-nexzen-text tabular-nums">
            ${target?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'}
          </div>
          <div className="text-[8px] text-nexzen-muted/40 mb-1">{manualOverride ? 'manual' : 'auto-captured'}</div>

          <div className="text-[9px] uppercase tracking-wider text-nexzen-muted mb-0.5">
            Current <span className="text-nexzen-primary/50 normal-case">WS</span>
          </div>
          <div className={`text-base font-bold tabular-nums ${priceDiff !== null && priceDiff >= 0 ? 'text-nexzen-primary' : 'text-nexzen-danger'}`}>
            ${currentPrice?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'}
          </div>
          {priceDiff !== null && (
            <div className={`text-[11px] tabular-nums font-bold ${priceDiff >= 0 ? 'text-nexzen-primary' : 'text-nexzen-danger'}`}>
              {priceDiff >= 0 ? '▲' : '▼'} ${Math.abs(priceDiff).toFixed(2)} ({((priceDiff / (target || 1)) * 100).toFixed(3)}%)
            </div>
          )}
        </div>

        {/* Polymarket CLOB Odds */}
        <div>
          <div className="text-[9px] uppercase tracking-wider text-nexzen-muted mb-1">Polymarket CLOB</div>
          {upOdds !== null && downOdds !== null ? (
            <div className="space-y-1.5">
              <div>
                <div className="flex items-center justify-between text-[11px] mb-0.5">
                  <span className="text-nexzen-primary font-bold">UP</span>
                  <span className="text-nexzen-primary tabular-nums font-bold">{upPct.toFixed(1)}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-nexzen-bg/80 overflow-hidden">
                  <div className="h-full bg-nexzen-primary/50 rounded-full transition-all duration-500" style={{ width: `${upPct}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px] mb-0.5">
                  <span className="text-nexzen-danger font-bold">DOWN</span>
                  <span className="text-nexzen-danger tabular-nums font-bold">{downPct.toFixed(1)}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-nexzen-bg/80 overflow-hidden">
                  <div className="h-full bg-nexzen-danger/50 rounded-full transition-all duration-500" style={{ width: `${downPct}%` }} />
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-nexzen-muted animate-pulse">{polyLoading ? 'Connecting...' : 'Searching...'}</div>
          )}
        </div>

        {/* Momentum + VWAP */}
        <div>
          <div className="text-[9px] uppercase tracking-wider text-nexzen-muted mb-1">Tick Momentum</div>
          <div className={`text-lg font-bold ${momColor} flex items-center gap-1`}>
            <span>{momIcon}{momIcon}{momIcon}</span>
            <span className="text-[10px] tabular-nums">{(momentum.strength * 100).toFixed(0)}%</span>
          </div>
          <div className="text-[9px] text-nexzen-muted tabular-nums">
            {momentum.ticksUp}↑ {momentum.ticksDown}↓ · {momentum.velocityPerSec >= 0 ? '+' : ''}{momentum.velocityPerSec.toFixed(1)}$/s
          </div>

          {vwap !== null && vwapDeviation !== null && (
            <div className="mt-2">
              <div className="text-[9px] uppercase tracking-wider text-nexzen-muted mb-0.5">VWAP Edge</div>
              <div className={`text-[11px] tabular-nums font-bold ${vwapDeviation >= 0 ? 'text-nexzen-primary' : 'text-nexzen-danger'}`}>
                {vwapDeviation >= 0 ? '▲' : '▼'} {(Math.abs(vwapDeviation) * 100).toFixed(3)}%
              </div>
              <div className="text-[8px] text-nexzen-muted/40 tabular-nums">VWAP ${vwap.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
            </div>
          )}
        </div>
      </div>

      {/* Override */}
      <div className="flex items-center gap-2 mb-3 text-[10px]">
        <span className="text-nexzen-muted">Override:</span>
        <div className="relative flex-1">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-nexzen-muted text-[10px]">$</span>
          <input
            type="number"
            value={manualOverride}
            onChange={(e) => handleOverride(e.target.value)}
            placeholder="auto"
            className="w-full pl-5 pr-2 py-1 bg-nexzen-bg/80 border border-nexzen-border/30 rounded text-[11px] text-nexzen-text tabular-nums placeholder:text-nexzen-muted/30 focus:outline-none focus:border-nexzen-accent/60 transition-colors"
          />
        </div>
      </div>

      {/* Signal */}
      {analysis && cfg ? (
        <div className={`rounded border p-3 ${cfg.bg} transition-all duration-300`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold ${cfg.color} flex items-center gap-2`}>
                <span className="text-xl">{cfg.icon}</span>
                {cfg.label}
              </span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded border ${convictionCfg[analysis.conviction].color} bg-nexzen-surface/50`}>
                {convictionCfg[analysis.conviction].label}
              </span>
            </div>
            <span className={`text-[10px] tabular-nums font-mono ${cfg.color}`}>
              {analysis.combined > 0 ? '+' : ''}{analysis.combined.toFixed(4)}
            </span>
          </div>
          <div className="text-[11px] text-nexzen-muted">{analysis.reason}</div>

          {/* Sub-signal breakdown */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 pt-2 border-t border-white/5 text-[9px] text-nexzen-muted/60">
            {Object.entries(analysis.subSignals).map(([key, val]) => {
              const color = val > 0.05 ? 'text-nexzen-primary' : val < -0.05 ? 'text-nexzen-danger' : 'text-nexzen-muted/40';
              const pct = (analysis.weights[key] * 100).toFixed(0);
              return (
                <span key={key}>
                  {key.charAt(0).toUpperCase() + key.slice(1)} <span className={color}>{pct}%</span>
                  <span className={`ml-0.5 tabular-nums ${color}`}>{val > 0 ? '+' : ''}{val.toFixed(2)}</span>
                </span>
              );
            })}
          </div>

          {/* Agreement meter */}
          <div className="mt-1.5 flex items-center gap-2 text-[9px]">
            <span className="text-nexzen-muted/50">Agreement:</span>
            <div className="flex-1 h-1.5 bg-nexzen-surface rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${analysis.agreementRatio >= 0.7 ? 'bg-nexzen-primary' : analysis.agreementRatio >= 0.5 ? 'bg-yellow-500' : 'bg-nexzen-danger'}`}
                style={{ width: `${analysis.agreementRatio * 100}%` }}
              />
            </div>
            <span className="text-nexzen-muted/50 tabular-nums">{analysis.agreeing}/{analysis.totalActive}</span>
          </div>
        </div>
      ) : (
        <div className="rounded border border-nexzen-border/30 bg-nexzen-bg/50 p-3 text-center">
          <span className="text-[11px] text-nexzen-muted">
            {!currentPrice ? 'Waiting for Binance price...' : !polyData?.market ? 'Searching for active BTC 5min market...' : 'Syncing with next window...'}
          </span>
        </div>
      )}
    </div>
  );
}
