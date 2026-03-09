'use client';

import { useState, useEffect, useRef } from 'react';
import type { ConnectionStatus } from '@/lib/types';
import { HealthMonitor, type HealthSnapshot, type ServiceName } from '@/lib/health/monitor';

/**
 * useHealthMonitor — aggregates health data from all data sources.
 *
 * Records heartbeats whenever connection status or latency changes,
 * and provides a real-time HealthSnapshot for the UI.
 */

export function useHealthMonitor(
  binanceStatus: ConnectionStatus,
  polymarketStatus: ConnectionStatus,
  chainlinkStatus: ConnectionStatus,
  binanceLatency: number,
  predictionCycles: number
) {
  const monitorRef = useRef<HealthMonitor>(null!);
  if (monitorRef.current === null) {
    monitorRef.current = new HealthMonitor();
  }
  const [health, setHealth] = useState<HealthSnapshot>(() => {
    const m = new HealthMonitor();
    return m.getSnapshot();
  });

  // Record heartbeats when statuses change
  useEffect(() => {
    monitorRef.current.recordHeartbeat('binance', binanceStatus, binanceLatency);
  }, [binanceStatus, binanceLatency]);

  useEffect(() => {
    monitorRef.current.recordHeartbeat('polymarket', polymarketStatus);
  }, [polymarketStatus]);

  useEffect(() => {
    monitorRef.current.recordHeartbeat('chainlink', chainlinkStatus);
  }, [chainlinkStatus]);

  // Prediction engine heartbeat: beat whenever a new cycle completes
  useEffect(() => {
    if (predictionCycles > 0) {
      monitorRef.current.recordHeartbeat('prediction', 'connected');
    }
  }, [predictionCycles]);

  // Refresh snapshot every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setHealth(monitorRef.current.getSnapshot());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Send health alert if a service goes down
  useEffect(() => {
    const snapshot = monitorRef.current.getSnapshot();
    const downServices = snapshot.services.filter(
      s => s.isStale && s.name !== 'prediction'
    );

    if (downServices.length > 0) {
      // Notify via notification API (fire and forget)
      const names = downServices.map(s => s.name).join(', ');
      fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'HEALTH',
          level: downServices.length >= 2 ? 'CRITICAL' : 'WARNING',
          title: 'Data Source Down',
          message: `Stale connections: ${names}`,
          fields: downServices.map(s => ({
            name: s.name.toUpperCase(),
            value: `Stale ${(s.staleMs / 1000).toFixed(0)}s`,
            inline: true,
          })),
        }),
      }).catch(() => {});
    }
  }, [health.overallStatus]);

  return {
    health,
    recordError: (service: ServiceName) => monitorRef.current.recordError(service),
  };
}
