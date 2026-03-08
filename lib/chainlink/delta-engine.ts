// ── Chainlink-Binance Delta Engine ──
// Core intelligence: detects price divergence between Binance spot and Chainlink oracle
// to generate edge signals for Polymarket resolution prediction.

import {
  DELTA_SIGNIFICANT_THRESHOLD,
  DELTA_EDGE_THRESHOLD,
  DELTA_IMMINENT_THRESHOLD,
  CHAINLINK_HEARTBEAT_S,
} from './config';
import type { ChainlinkPrice, DeltaSnapshot, DeltaAnalysis } from './types';

const MAX_SNAPSHOTS = 200;
const HEARTBEAT_MS = CHAINLINK_HEARTBEAT_S * 1000;

export class DeltaEngine {
  private snapshots: DeltaSnapshot[] = [];

  pushSnapshot(binancePrice: number, chainlink: ChainlinkPrice): DeltaSnapshot {
    const delta = binancePrice - chainlink.price;
    const deltaPercent = delta / chainlink.price;

    let deltaDirection: DeltaSnapshot['deltaDirection'];
    if (deltaPercent > DELTA_SIGNIFICANT_THRESHOLD) {
      deltaDirection = 'binance_leading';
    } else if (deltaPercent < -DELTA_SIGNIFICANT_THRESHOLD) {
      deltaDirection = 'chainlink_leading';
    } else {
      deltaDirection = 'aligned';
    }

    const snapshot: DeltaSnapshot = {
      binancePrice,
      chainlinkPrice: chainlink.price,
      delta,
      deltaPercent,
      deltaDirection,
      chainlinkStaleness: chainlink.staleness,
      timestamp: Date.now(),
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots = this.snapshots.slice(-MAX_SNAPSHOTS);
    }

    return snapshot;
  }

  analyze(): DeltaAnalysis {
    if (this.snapshots.length === 0) {
      return this.emptyAnalysis();
    }

    const current = this.snapshots[this.snapshots.length - 1];
    // Last 60 snapshots (~3 min at 3s polling)
    const recent = this.snapshots.slice(-60);

    const avgDeltaPercent =
      recent.reduce((sum, s) => sum + s.deltaPercent, 0) / recent.length;
    const maxDeltaPercent =
      recent.reduce((max, s) => Math.max(max, Math.abs(s.deltaPercent)), 0);

    const absDelta = Math.abs(current.deltaPercent);
    const direction = current.deltaDirection;
    const staleness = current.chainlinkStaleness;

    // Chainlink update imminent if deviation approaching threshold
    const chainlinkUpdateImminent = absDelta >= DELTA_IMMINENT_THRESHOLD;

    // ── Edge Signal Computation ──
    let edgeSignal = 0;
    let edgeConfidence = 0;

    if (absDelta >= DELTA_EDGE_THRESHOLD) {
      // Scenario A: Binance leads Chainlink significantly
      // Oracle will "catch up" → resolution price moves in Binance's direction
      const strength = Math.min(absDelta / DELTA_EDGE_THRESHOLD, 2.0) / 2.0;
      const sign = current.deltaPercent > 0 ? 1 : -1;

      // Staleness factor: higher staleness = more confident the oracle hasn't updated
      const stalenessFactor = Math.min(staleness / HEARTBEAT_MS, 1.0) * 0.3 + 0.7;

      edgeSignal = sign * strength * stalenessFactor;
      edgeConfidence = strength * 0.8;
    } else if (chainlinkUpdateImminent) {
      // Scenario B: Update is imminent (deviation > 0.4%)
      const sign = current.deltaPercent > 0 ? 1 : -1;
      edgeSignal = sign * 0.8;
      edgeConfidence = 0.7;
    } else if (absDelta >= DELTA_SIGNIFICANT_THRESHOLD) {
      // Scenario C: Moderate delta, mild edge
      const sign = current.deltaPercent > 0 ? 1 : -1;
      const strength = absDelta / DELTA_EDGE_THRESHOLD;
      edgeSignal = sign * strength * 0.5;
      edgeConfidence = 0.4;
    }
    // else: aligned, no edge (edgeSignal stays 0)

    // Clamp edge signal to [-1, 1]
    edgeSignal = Math.max(-1, Math.min(1, edgeSignal));
    edgeConfidence = Math.max(0, Math.min(1, edgeConfidence));

    return {
      currentDelta: current,
      recentDeltas: recent,
      avgDeltaPercent,
      maxDeltaPercent,
      deltaDirection: direction,
      chainlinkUpdateImminent,
      edgeSignal,
      edgeConfidence,
      timeSinceLastChainlinkUpdate: staleness,
    };
  }

  getSnapshotCount(): number {
    return this.snapshots.length;
  }

  private emptyAnalysis(): DeltaAnalysis {
    return {
      currentDelta: null,
      recentDeltas: [],
      avgDeltaPercent: 0,
      maxDeltaPercent: 0,
      deltaDirection: 'aligned',
      chainlinkUpdateImminent: false,
      edgeSignal: 0,
      edgeConfidence: 0,
      timeSinceLastChainlinkUpdate: 0,
    };
  }
}
