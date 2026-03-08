/**
 * Health Monitor
 *
 * Tracks the health status of all data sources:
 *   - Binance WebSocket (ticker + kline + aggTrade)
 *   - Polymarket WebSocket (real-time prices)
 *   - Chainlink RPC (oracle price feed)
 *   - Prediction Engine (cycle health)
 *
 * Calculates uptime, error rate, and staleness for each source.
 */

import type { ConnectionStatus } from '@/lib/types';

export type ServiceName = 'binance' | 'polymarket' | 'chainlink' | 'prediction';

export interface ServiceHealth {
  name: ServiceName;
  status: ConnectionStatus;
  uptimePercent: number;       // 0-100
  lastHeartbeat: number;       // timestamp
  errorCount: number;          // errors in current window
  errorRate: number;           // errors per minute
  latencyMs: number | null;    // last known latency
  staleMs: number;             // ms since last heartbeat
  isStale: boolean;            // staleMs > threshold
}

export interface HealthSnapshot {
  services: ServiceHealth[];
  overallStatus: 'healthy' | 'degraded' | 'critical';
  uptimePercent: number;       // average across services
  timestamp: number;
}

// Staleness thresholds per service (ms)
const STALE_THRESHOLDS: Record<ServiceName, number> = {
  binance: 5_000,       // Binance should update every ~250ms
  polymarket: 30_000,   // Polymarket polls every 5-15s
  chainlink: 15_000,    // Chainlink polls every 3s
  prediction: 360_000,  // Prediction cycle is 5 min
};

const ERROR_WINDOW_MS = 60_000; // Track errors in 1-minute window

interface HealthRecord {
  status: ConnectionStatus;
  timestamp: number;
}

export class HealthMonitor {
  private heartbeats: Record<ServiceName, number> = {
    binance: 0, polymarket: 0, chainlink: 0, prediction: 0,
  };

  private statuses: Record<ServiceName, ConnectionStatus> = {
    binance: 'disconnected', polymarket: 'disconnected',
    chainlink: 'disconnected', prediction: 'disconnected',
  };

  private latencies: Record<ServiceName, number | null> = {
    binance: null, polymarket: null, chainlink: null, prediction: null,
  };

  private errors: Record<ServiceName, number[]> = {
    binance: [], polymarket: [], chainlink: [], prediction: [],
  };

  // Uptime tracking: list of status changes
  private history: Record<ServiceName, HealthRecord[]> = {
    binance: [], polymarket: [], chainlink: [], prediction: [],
  };

  private startTime: number = Date.now();
  private maxHistory = 1000;

  recordHeartbeat(service: ServiceName, status: ConnectionStatus, latencyMs?: number): void {
    const now = Date.now();
    this.heartbeats[service] = now;

    if (this.statuses[service] !== status) {
      this.history[service].push({ status, timestamp: now });
      if (this.history[service].length > this.maxHistory) {
        this.history[service] = this.history[service].slice(-this.maxHistory);
      }
    }

    this.statuses[service] = status;

    if (latencyMs !== undefined) {
      this.latencies[service] = latencyMs;
    }

    if (status === 'error') {
      this.errors[service].push(now);
    }
  }

  recordError(service: ServiceName): void {
    this.errors[service].push(Date.now());
  }

  getServiceHealth(service: ServiceName): ServiceHealth {
    const now = Date.now();
    const staleMs = this.heartbeats[service] > 0 ? now - this.heartbeats[service] : now - this.startTime;
    const isStale = staleMs > STALE_THRESHOLDS[service];

    // Clean old errors
    const cutoff = now - ERROR_WINDOW_MS;
    this.errors[service] = this.errors[service].filter(t => t > cutoff);

    // Calculate uptime from history
    const uptimePercent = this.calculateUptime(service);

    return {
      name: service,
      status: isStale && this.statuses[service] === 'connected' ? 'disconnected' : this.statuses[service],
      uptimePercent,
      lastHeartbeat: this.heartbeats[service],
      errorCount: this.errors[service].length,
      errorRate: this.errors[service].length, // per minute (window is 1 min)
      latencyMs: this.latencies[service],
      staleMs,
      isStale,
    };
  }

  getSnapshot(): HealthSnapshot {
    const services: ServiceName[] = ['binance', 'polymarket', 'chainlink', 'prediction'];
    const healthList = services.map(s => this.getServiceHealth(s));

    const avgUptime = healthList.reduce((s, h) => s + h.uptimePercent, 0) / healthList.length;

    const criticalCount = healthList.filter(h => h.status === 'error' || (h.isStale && h.status !== 'connecting')).length;
    const degradedCount = healthList.filter(h => h.status === 'disconnected' || h.isStale).length;

    let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (criticalCount >= 2) overallStatus = 'critical';
    else if (criticalCount >= 1 || degradedCount >= 2) overallStatus = 'degraded';

    return {
      services: healthList,
      overallStatus,
      uptimePercent: avgUptime,
      timestamp: Date.now(),
    };
  }

  private calculateUptime(service: ServiceName): number {
    const records = this.history[service];
    if (records.length === 0) {
      return this.statuses[service] === 'connected' ? 100 : 0;
    }

    const now = Date.now();
    const windowStart = this.startTime;
    const windowDuration = now - windowStart;
    if (windowDuration <= 0) return 100;

    let connectedMs = 0;
    let lastConnectedAt: number | null = null;

    for (const record of records) {
      if (record.status === 'connected') {
        lastConnectedAt = record.timestamp;
      } else if (lastConnectedAt !== null) {
        connectedMs += record.timestamp - lastConnectedAt;
        lastConnectedAt = null;
      }
    }

    // If currently connected, count from last connected to now
    if (lastConnectedAt !== null && this.statuses[service] === 'connected') {
      connectedMs += now - lastConnectedAt;
    }

    return Math.min(100, (connectedMs / windowDuration) * 100);
  }

  // Serialize for API response
  toJSON(): HealthSnapshot {
    return this.getSnapshot();
  }
}

// Singleton for client-side use
let _instance: HealthMonitor | null = null;
export function getHealthMonitor(): HealthMonitor {
  if (!_instance) _instance = new HealthMonitor();
  return _instance;
}
