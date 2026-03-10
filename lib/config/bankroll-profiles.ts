/**
 * Bankroll Profiles — Named configuration presets for different capital levels
 *
 * Centralizes all parameters that scale with bankroll size so they
 * don't need to be scattered across multiple files as magic numbers.
 */

import type { PaperTradingConfig } from '@/lib/types';
import type { RuinGuardConfig } from '@/lib/engine/ruin-guard';

// ── Profile Interface ──

export interface BankrollProfile {
  name: string;
  description: string;
  tradingConfig: PaperTradingConfig;
  ruinGuard: RuinGuardConfig;
  portfolio: {
    maxTotalExposurePct: number;
    maxSingleExposurePct: number;
    maxPositions: number;
  };
  alerts: {
    winRateWarning: number;
    winRateCritical: number;
    drawdownWarning: number;
    drawdownCritical: number;
  };
  apiSafetyLimit: number; // Max USDC per trade at API level
}

// ── Profiles ──

export const PROFILES: Record<string, BankrollProfile> = {
  'micro-100': {
    name: 'Micro ($100)',
    description: 'Ultra-conservative for $100 bankroll. Fifth-Kelly, tight stops, max 2 positions.',
    tradingConfig: {
      initialBankroll: 100,
      maxStakePercent: 0.04,
      kellyFraction: 0.20,
      minStake: 1,
      maxStake: 5,
      circuitBreakerDrawdown: 0.25,
      circuitBreakerLosses: 3,
      spreadCost: 0.02,
    },
    ruinGuard: {
      absoluteFloor: 40,
      dailyLossLimit: 10,
      hourlyLossLimit: 5,
      cooldownAfterLossMs: 600_000,
      maxTradesPerDay: 20,
      profitLockThreshold: 130,
      profitLockAmount: 20,
    },
    portfolio: {
      maxTotalExposurePct: 0.20,
      maxSingleExposurePct: 0.05,
      maxPositions: 2,
    },
    alerts: {
      winRateWarning: 0.50,
      winRateCritical: 0.45,
      drawdownWarning: 0.15,
      drawdownCritical: 0.25,
    },
    apiSafetyLimit: 10,
  },

  'small-500': {
    name: 'Small ($500)',
    description: 'Conservative for $500 bankroll. Quarter-Kelly, moderate stops.',
    tradingConfig: {
      initialBankroll: 500,
      maxStakePercent: 0.05,
      kellyFraction: 0.25,
      minStake: 2,
      maxStake: 25,
      circuitBreakerDrawdown: 0.20,
      circuitBreakerLosses: 4,
      spreadCost: 0.02,
    },
    ruinGuard: {
      absoluteFloor: 200,
      dailyLossLimit: 40,
      hourlyLossLimit: 20,
      cooldownAfterLossMs: 300_000,
      maxTradesPerDay: 30,
      profitLockThreshold: 650,
      profitLockAmount: 50,
    },
    portfolio: {
      maxTotalExposurePct: 0.25,
      maxSingleExposurePct: 0.08,
      maxPositions: 3,
    },
    alerts: {
      winRateWarning: 0.48,
      winRateCritical: 0.43,
      drawdownWarning: 0.12,
      drawdownCritical: 0.20,
    },
    apiSafetyLimit: 50,
  },

  'standard-1000': {
    name: 'Standard ($1000)',
    description: 'Standard configuration for $1000 bankroll. Quarter-Kelly, standard stops.',
    tradingConfig: {
      initialBankroll: 1000,
      maxStakePercent: 0.05,
      kellyFraction: 0.25,
      minStake: 2,
      maxStake: 50,
      circuitBreakerDrawdown: 0.15,
      circuitBreakerLosses: 5,
      spreadCost: 0.02,
    },
    ruinGuard: {
      absoluteFloor: 400,
      dailyLossLimit: 80,
      hourlyLossLimit: 40,
      cooldownAfterLossMs: 300_000,
      maxTradesPerDay: 40,
      profitLockThreshold: 1300,
      profitLockAmount: 100,
    },
    portfolio: {
      maxTotalExposurePct: 0.25,
      maxSingleExposurePct: 0.10,
      maxPositions: 3,
    },
    alerts: {
      winRateWarning: 0.48,
      winRateCritical: 0.42,
      drawdownWarning: 0.10,
      drawdownCritical: 0.15,
    },
    apiSafetyLimit: 100,
  },
};

// ── Active Profile ──

const ACTIVE_PROFILE_KEY = 'micro-100';

export function getActiveProfile(): BankrollProfile {
  return PROFILES[ACTIVE_PROFILE_KEY];
}

export function getProfileByKey(key: string): BankrollProfile | undefined {
  return PROFILES[key];
}
