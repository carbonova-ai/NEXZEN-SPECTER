/**
 * Portfolio Optimizer
 *
 * Multi-position management with correlation-aware sizing.
 * Uses simplified Markowitz mean-variance optimization
 * adapted for prediction market positions.
 *
 * Features:
 * - Correlation matrix between assets
 * - Kelly criterion adjusted for correlation
 * - Maximum total exposure limits
 * - Position-level risk budgeting
 */

export interface Position {
  marketId: string;
  asset: string;
  direction: 'UP' | 'DOWN';
  stake: number;
  entryPrice: number;
  currentPrice: number;
  confidence: number;
  openedAt: number;
}

export interface PortfolioState {
  positions: Position[];
  totalExposure: number;
  maxExposure: number;
  correlationMatrix: number[][];
  riskBudget: Record<string, number>;
  diversificationRatio: number;
}

export interface AllocationAdvice {
  asset: string;
  maxStake: number;
  adjustedKelly: number;   // Kelly fraction adjusted for correlation
  reason: string;
}

// Configuration
const MAX_TOTAL_EXPOSURE_PCT = 0.25; // Max 25% of bankroll across all positions
const MAX_SINGLE_EXPOSURE_PCT = 0.10; // Max 10% per position
const MAX_POSITIONS = 3;              // Max 3 concurrent positions
const CORRELATION_PENALTY = 0.5;      // Reduce allocation if assets are correlated

// Approximate correlations (BTC/ETH/SOL)
const DEFAULT_CORRELATIONS: Record<string, Record<string, number>> = {
  BTC: { BTC: 1.0, ETH: 0.85, SOL: 0.75 },
  ETH: { BTC: 0.85, ETH: 1.0, SOL: 0.80 },
  SOL: { BTC: 0.75, ETH: 0.80, SOL: 1.0 },
};

/**
 * Get correlation between two assets.
 */
function getCorrelation(asset1: string, asset2: string): number {
  return DEFAULT_CORRELATIONS[asset1]?.[asset2] ?? 0.5;
}

/**
 * Calculate portfolio diversification ratio.
 * Higher = more diversified (good).
 */
function calculateDiversificationRatio(positions: Position[]): number {
  if (positions.length <= 1) return 1;

  const assets = [...new Set(positions.map(p => p.asset))];
  if (assets.length <= 1) return 0.5; // Same asset = poor diversification

  let sumWeightedCorr = 0;
  let pairCount = 0;

  for (let i = 0; i < assets.length; i++) {
    for (let j = i + 1; j < assets.length; j++) {
      sumWeightedCorr += getCorrelation(assets[i], assets[j]);
      pairCount++;
    }
  }

  const avgCorrelation = pairCount > 0 ? sumWeightedCorr / pairCount : 1;
  return 1 - avgCorrelation; // 0 = perfectly correlated, 1 = uncorrelated
}

/**
 * Get allocation advice for a new potential position.
 */
export function getAllocationAdvice(
  asset: string,
  confidence: number,
  winRate: number,
  bankroll: number,
  currentPositions: Position[]
): AllocationAdvice {
  // Check position limit
  if (currentPositions.length >= MAX_POSITIONS) {
    return {
      asset,
      maxStake: 0,
      adjustedKelly: 0,
      reason: `Max positions (${MAX_POSITIONS}) reached`,
    };
  }

  // Calculate current exposure
  const totalExposure = currentPositions.reduce((s, p) => s + p.stake, 0);
  const exposurePct = totalExposure / bankroll;

  if (exposurePct >= MAX_TOTAL_EXPOSURE_PCT) {
    return {
      asset,
      maxStake: 0,
      adjustedKelly: 0,
      reason: `Max exposure (${(MAX_TOTAL_EXPOSURE_PCT * 100).toFixed(0)}%) reached`,
    };
  }

  // Base Kelly fraction
  const kellyFull = winRate > 0.5 ? (winRate - (1 - winRate)) / 1 : 0;
  const kellyQuarter = kellyFull * 0.25; // Quarter-Kelly

  // Correlation penalty
  const sameAssetPositions = currentPositions.filter(p => p.asset === asset);
  const correlatedPositions = currentPositions.filter(
    p => p.asset !== asset && getCorrelation(p.asset, asset) > 0.7
  );

  let correlationFactor = 1;
  if (sameAssetPositions.length > 0) {
    correlationFactor *= 0.3; // Already have same asset
  }
  if (correlatedPositions.length > 0) {
    correlationFactor *= (1 - CORRELATION_PENALTY * correlatedPositions.length);
  }
  correlationFactor = Math.max(0.1, correlationFactor);

  // Adjusted Kelly
  const adjustedKelly = kellyQuarter * correlationFactor * confidence;

  // Max stake
  const remainingBudget = (MAX_TOTAL_EXPOSURE_PCT - exposurePct) * bankroll;
  const singleMax = bankroll * MAX_SINGLE_EXPOSURE_PCT;
  const kellyStake = bankroll * adjustedKelly;
  const maxStake = Math.max(0, Math.min(kellyStake, singleMax, remainingBudget));

  let reason = `Kelly=${(adjustedKelly * 100).toFixed(1)}%`;
  if (correlationFactor < 1) {
    reason += ` (corr adj ${(correlationFactor * 100).toFixed(0)}%)`;
  }

  return {
    asset,
    maxStake: parseFloat(maxStake.toFixed(2)),
    adjustedKelly,
    reason,
  };
}

/**
 * Get current portfolio state.
 */
export function getPortfolioState(
  positions: Position[],
  bankroll: number
): PortfolioState {
  const assets = [...new Set(positions.map(p => p.asset))];

  // Build correlation matrix
  const correlationMatrix = assets.map(a1 =>
    assets.map(a2 => getCorrelation(a1, a2))
  );

  // Risk budget per asset
  const riskBudget: Record<string, number> = {};
  for (const asset of assets) {
    const assetStake = positions
      .filter(p => p.asset === asset)
      .reduce((s, p) => s + p.stake, 0);
    riskBudget[asset] = assetStake / bankroll;
  }

  return {
    positions,
    totalExposure: positions.reduce((s, p) => s + p.stake, 0),
    maxExposure: bankroll * MAX_TOTAL_EXPOSURE_PCT,
    correlationMatrix,
    riskBudget,
    diversificationRatio: calculateDiversificationRatio(positions),
  };
}
