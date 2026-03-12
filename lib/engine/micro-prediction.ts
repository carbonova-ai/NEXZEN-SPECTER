import {
  TickData,
  PriceProjection,
  TargetProximity,
  DirectionConviction,
  MicroPrediction,
  PredictionDirection,
  CandleData,
  IndicatorValues,
} from '@/lib/types';

// ── Tick Buffer Configuration ──
const TICK_BUFFER_WINDOW_MS = 120_000; // Keep 2 minutes of ticks
const MIN_TICKS_FOR_PROJECTION = 10;   // Need at least 10 ticks
const VELOCITY_WINDOW_MS = 15_000;     // 15s window for velocity calc
const ACCEL_WINDOW_MS = 30_000;        // 30s window for acceleration

// ── Direction Safety ──
const DEAD_ZONE_THRESHOLD = 0.015;     // Score must exceed ±0.015 to call direction
const STRONG_CONVICTION = 0.08;        // |score| > 0.08 = STRONG
const MODERATE_CONVICTION = 0.04;      // |score| > 0.04 = MODERATE

// ── Tick Buffer (ring buffer for zero-allocation updates) ──
export class TickBuffer {
  private buffer: TickData[] = [];
  private maxSize = 5000; // ~5000 ticks in 2min at high volume

  push(tick: TickData) {
    this.buffer.push(tick);
    // Prune old ticks periodically
    if (this.buffer.length > this.maxSize) {
      const cutoff = Date.now() - TICK_BUFFER_WINDOW_MS;
      this.buffer = this.buffer.filter(t => t.timestamp >= cutoff);
    }
  }

  getRecent(windowMs: number): TickData[] {
    const cutoff = Date.now() - windowMs;
    // Binary search for performance on large buffers
    let lo = 0, hi = this.buffer.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.buffer[mid].timestamp < cutoff) lo = mid + 1;
      else hi = mid;
    }
    return this.buffer.slice(lo);
  }

  get length(): number {
    return this.buffer.length;
  }

  get latest(): TickData | null {
    return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : null;
  }

  clear() {
    this.buffer = [];
  }
}

// ── Velocity & Acceleration ──

function computeVelocity(ticks: TickData[]): number {
  if (ticks.length < 2) return 0;
  const first = ticks[0];
  const last = ticks[ticks.length - 1];
  const dt = (last.timestamp - first.timestamp) / 1000; // seconds
  if (dt < 0.1) return 0;
  return (last.price - first.price) / dt; // $/sec
}

function computeAcceleration(ticks: TickData[]): number {
  if (ticks.length < 6) return 0;
  const mid = Math.floor(ticks.length / 2);
  const firstHalf = ticks.slice(0, mid);
  const secondHalf = ticks.slice(mid);
  const v1 = computeVelocity(firstHalf);
  const v2 = computeVelocity(secondHalf);
  const dt1 = (firstHalf[firstHalf.length - 1].timestamp - firstHalf[0].timestamp) / 1000;
  const dt2 = (secondHalf[secondHalf.length - 1].timestamp - secondHalf[0].timestamp) / 1000;
  const avgDt = (dt1 + dt2) / 2;
  if (avgDt < 0.1) return 0;
  return (v2 - v1) / avgDt; // $/sec²
}

// Volume-weighted velocity: gives more weight to high-volume ticks
function computeVWVelocity(ticks: TickData[]): number {
  if (ticks.length < 2) return 0;
  const first = ticks[0];
  const last = ticks[ticks.length - 1];
  const dt = (last.timestamp - first.timestamp) / 1000;
  if (dt < 0.1) return 0;

  // Volume-weighted price change
  let totalVolume = 0;
  let weightedChange = 0;
  for (let i = 1; i < ticks.length; i++) {
    const change = ticks[i].price - ticks[i - 1].price;
    const vol = ticks[i].quantity;
    weightedChange += change * vol;
    totalVolume += vol;
  }
  if (totalVolume === 0) return 0;
  return (weightedChange / totalVolume) / dt;
}

// ── Price Projection ──

function projectPrice(
  currentPrice: number,
  ticks: TickData[],
  timeframeMs: number,
): PriceProjection {
  const velocityTicks = ticks.filter(t => t.timestamp >= Date.now() - VELOCITY_WINDOW_MS);
  const accelTicks = ticks.filter(t => t.timestamp >= Date.now() - ACCEL_WINDOW_MS);

  const velocity = computeVelocity(velocityTicks);
  const vwVelocity = computeVWVelocity(velocityTicks);
  const acceleration = computeAcceleration(accelTicks);

  // Blend regular and VW velocity (VW is more reliable for direction)
  const blendedVelocity = velocity * 0.4 + vwVelocity * 0.6;

  const dt = timeframeMs / 1000; // seconds into future

  // Kinematic projection: price + v*t + 0.5*a*t²
  // Dampen acceleration to avoid over-extrapolation
  const dampedAccel = acceleration * 0.3; // Only use 30% of measured acceleration
  const projectedPrice = currentPrice + blendedVelocity * dt + 0.5 * dampedAccel * dt * dt;

  const projectedMove = ((projectedPrice - currentPrice) / currentPrice) * 100;

  // Confidence based on data quality
  let confidence = 0;
  if (velocityTicks.length >= MIN_TICKS_FOR_PROJECTION) {
    // Base confidence from tick count
    confidence = Math.min(1, velocityTicks.length / 50);

    // Reduce confidence if velocity is very erratic
    const velocityStd = computeVelocityStd(velocityTicks);
    const velocityMag = Math.abs(blendedVelocity);
    if (velocityMag > 0) {
      const snr = velocityMag / (velocityStd + 0.001); // Signal-to-noise
      confidence *= Math.min(1, snr / 2);
    }

    // Longer projections are less confident
    if (timeframeMs > 60_000) {
      confidence *= 0.8;
    }
  }

  return {
    timeframeMs,
    projectedPrice,
    projectedMove,
    confidence: Math.max(0, Math.min(1, confidence)),
    velocity: blendedVelocity,
    acceleration: dampedAccel,
  };
}

function computeVelocityStd(ticks: TickData[]): number {
  if (ticks.length < 3) return 0;
  const velocities: number[] = [];
  for (let i = 1; i < ticks.length; i++) {
    const dt = (ticks[i].timestamp - ticks[i - 1].timestamp) / 1000;
    if (dt > 0.01) {
      velocities.push((ticks[i].price - ticks[i - 1].price) / dt);
    }
  }
  if (velocities.length < 2) return 0;
  const mean = velocities.reduce((s, v) => s + v, 0) / velocities.length;
  const variance = velocities.reduce((s, v) => s + (v - mean) ** 2, 0) / velocities.length;
  return Math.sqrt(variance);
}

// ── Target Proximity ──

function computeTargetProximity(
  currentPrice: number,
  targetPrice: number,
  proj1min: PriceProjection,
  proj2min: PriceProjection,
  direction: PredictionDirection,
): TargetProximity {
  const distancePercent = ((targetPrice - currentPrice) / currentPrice) * 100;
  const absDistance = Math.abs(distancePercent);

  // Is price moving toward target?
  const isUp = direction === 'UP';
  const approachingTarget = isUp
    ? proj1min.velocity > 0
    : proj1min.velocity < 0;

  // ETA analysis: will projected price reach/exceed target?
  function classifyEta(projectedPrice: number): 'BEFORE' | 'AT' | 'BEYOND' | 'UNKNOWN' {
    const projDistance = ((projectedPrice - targetPrice) / targetPrice) * 100;
    const atThreshold = 0.02; // Within 0.02% = "at target"

    if (Math.abs(projDistance) <= atThreshold) return 'AT';
    if (isUp) {
      return projectedPrice > targetPrice ? 'BEYOND' : 'BEFORE';
    } else {
      return projectedPrice < targetPrice ? 'BEYOND' : 'BEFORE';
    }
  }

  const eta1min = proj1min.confidence > 0.2 ? classifyEta(proj1min.projectedPrice) : 'UNKNOWN';
  const eta2min = proj2min.confidence > 0.2 ? classifyEta(proj2min.projectedPrice) : 'UNKNOWN';

  // Proximity score: 1 = at target, 0 = far away
  // Use exponential decay: within 0.1% = score ~1, at 0.5% = score ~0.37
  const proximityScore = Math.exp(-absDistance / 0.15);

  return {
    distancePercent,
    eta1min,
    eta2min,
    proximityScore,
    approachingTarget,
  };
}

// ── Direction Conviction with Dead Zone ──

export function computeDirectionConviction(
  aggregateScore: number,
  indicators: IndicatorValues,
  signalAgreementRatio: number,
  tickMomentum: number,
): DirectionConviction {
  const safetyFlags: string[] = [];
  let safetyScore = 1.0;

  // Dead zone: if score is too close to zero, don't commit to a direction
  const absScore = Math.abs(aggregateScore);
  if (absScore < DEAD_ZONE_THRESHOLD) {
    return {
      direction: aggregateScore >= 0 ? 'UP' : 'DOWN',
      conviction: 'DEAD_ZONE',
      rawScore: aggregateScore,
      safetyScore: 0,
      safetyFlags: ['Score in dead zone — no clear direction'],
    };
  }

  const direction: PredictionDirection = aggregateScore >= 0 ? 'UP' : 'DOWN';

  // ── Conviction level ──
  let conviction: 'STRONG' | 'MODERATE' | 'WEAK';
  if (absScore >= STRONG_CONVICTION) {
    conviction = 'STRONG';
  } else if (absScore >= MODERATE_CONVICTION) {
    conviction = 'MODERATE';
  } else {
    conviction = 'WEAK';
  }

  // ── Safety checks ──

  // 1. Tick momentum contradicts signal direction
  const momentumConflict = (direction === 'UP' && tickMomentum < -0.3) ||
                           (direction === 'DOWN' && tickMomentum > 0.3);
  if (momentumConflict) {
    safetyFlags.push('Tick momentum contradicts signal direction');
    safetyScore -= 0.2;
  }

  // 2. Low signal agreement
  if (signalAgreementRatio < 0.4) {
    safetyFlags.push('Low signal agreement (<40%)');
    safetyScore -= 0.15;
  }

  // 3. High volatility (Bollinger width > 2.5)
  if (indicators.bollingerBands && indicators.bollingerBands.width > 2.5) {
    safetyFlags.push('Extreme volatility (BB width > 2.5%)');
    safetyScore -= 0.15;
  }

  // 4. RSI extreme — potential reversal
  if (indicators.rsi !== null) {
    if ((direction === 'UP' && indicators.rsi > 75) ||
        (direction === 'DOWN' && indicators.rsi < 25)) {
      safetyFlags.push('RSI at extreme — reversal risk');
      safetyScore -= 0.1;
    }
  }

  // 5. VWAP mean reversion zone
  if (indicators.vwap?.isMeanReversion) {
    safetyFlags.push('VWAP mean-reversion zone — snap-back likely');
    safetyScore -= 0.1;
  }

  // 6. Weak conviction gets inherent penalty
  if (conviction === 'WEAK') {
    safetyScore -= 0.1;
  }

  safetyScore = Math.max(0, Math.min(1, safetyScore));

  return {
    direction,
    conviction,
    rawScore: aggregateScore,
    safetyScore,
    safetyFlags,
  };
}

// ── Tick Momentum (normalized to [-1, +1]) ──

export function computeTickMomentum(ticks: TickData[]): number {
  if (ticks.length < 5) return 0;

  const recent = ticks.slice(-Math.min(ticks.length, 100));
  let upVolume = 0;
  let downVolume = 0;

  for (let i = 1; i < recent.length; i++) {
    const change = recent[i].price - recent[i - 1].price;
    const vol = recent[i].quantity;
    if (change > 0) upVolume += vol;
    else if (change < 0) downVolume += vol;
  }

  const total = upVolume + downVolume;
  if (total === 0) return 0;

  // Normalized: +1 = all buying, -1 = all selling
  return (upVolume - downVolume) / total;
}

// ── Signal Agreement Ratio ──

export function computeSignalAgreement(
  signals: Record<string, number>,
  direction: PredictionDirection,
): number {
  const values = Object.values(signals).filter(v => Math.abs(v) > 0.05);
  if (values.length === 0) return 0;

  const isUp = direction === 'UP';
  const agreeing = values.filter(v => isUp ? v > 0 : v < 0).length;
  return agreeing / values.length;
}

// ── Main Micro-Prediction Generator ──

export function generateMicroPrediction(
  tickBuffer: TickBuffer,
  currentPrice: number,
  targetPrice: number,
  direction: PredictionDirection,
  aggregateScore: number,
  indicators: IndicatorValues,
  signalAgreementRatio: number,
): MicroPrediction {
  const allTicks = tickBuffer.getRecent(TICK_BUFFER_WINDOW_MS);
  const recentTicks = tickBuffer.getRecent(60_000); // Last 60s for momentum

  const tickMomentum = computeTickMomentum(recentTicks);

  const proj1min = projectPrice(currentPrice, allTicks, 60_000);
  const proj2min = projectPrice(currentPrice, allTicks, 120_000);

  const targetProximity = computeTargetProximity(
    currentPrice, targetPrice, proj1min, proj2min, direction
  );

  const directionConviction = computeDirectionConviction(
    aggregateScore, indicators, signalAgreementRatio, tickMomentum
  );

  return {
    projection1min: proj1min,
    projection2min: proj2min,
    targetProximity,
    directionConviction,
    tickMomentum,
    tickCount: allTicks.length,
    updatedAt: Date.now(),
  };
}

// ── Volatility-Adjusted Target ──

export function computeVolatilityAdjustedTarget(
  currentPrice: number,
  aggregateScore: number,
  indicators: IndicatorValues,
  candles: CandleData[],
): number {
  // Base move: 0.5% per unit score
  let baseMovePercent = 0.005;

  // Adjust based on recent volatility (ATR proxy from last 14 candles)
  if (candles.length >= 14) {
    const recent = candles.slice(-14);
    let totalRange = 0;
    for (const c of recent) {
      totalRange += (c.high - c.low) / c.close;
    }
    const avgRange = totalRange / recent.length;

    // If avg range > 0.5%, increase base move; if < 0.3%, decrease
    if (avgRange > 0.005) {
      baseMovePercent = Math.min(0.01, avgRange * 0.8); // Cap at 1%
    } else if (avgRange < 0.003) {
      baseMovePercent = Math.max(0.002, avgRange * 1.2); // Floor at 0.2%
    }
  }

  // Bollinger width adjustment
  if (indicators.bollingerBands) {
    const bbWidth = indicators.bollingerBands.width;
    if (bbWidth > 2.0) {
      baseMovePercent *= 1.2; // Wider target in volatile markets
    } else if (bbWidth < 0.8) {
      baseMovePercent *= 0.7; // Tighter target in squeeze
    }
  }

  const movePercent = aggregateScore * baseMovePercent;
  return currentPrice * (1 + movePercent);
}
