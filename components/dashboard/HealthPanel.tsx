'use client';

import type { HealthSnapshot, ServiceHealth } from '@/lib/health/monitor';

interface HealthPanelProps {
  health: HealthSnapshot;
}

function statusColor(status: string): string {
  switch (status) {
    case 'connected': return 'bg-nexzen-primary';
    case 'connecting': return 'bg-yellow-500 animate-pulse';
    case 'disconnected': return 'bg-nexzen-muted';
    case 'error': return 'bg-nexzen-danger';
    default: return 'bg-nexzen-muted';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'connected': return 'ONLINE';
    case 'connecting': return 'CONNECTING';
    case 'disconnected': return 'OFFLINE';
    case 'error': return 'ERROR';
    default: return 'UNKNOWN';
  }
}

function uptimeColor(pct: number): string {
  if (pct >= 99) return 'text-nexzen-primary';
  if (pct >= 95) return 'text-yellow-500';
  return 'text-nexzen-danger';
}

function ServiceRow({ service }: { service: ServiceHealth }) {
  const nameMap: Record<string, string> = {
    binance: 'BINANCE WS',
    polymarket: 'POLYMARKET',
    chainlink: 'CHAINLINK',
    prediction: 'PRED ENGINE',
  };

  const staleLabel = service.staleMs < 1000 ? '<1s' :
    service.staleMs < 60_000 ? `${(service.staleMs / 1000).toFixed(0)}s` :
    `${(service.staleMs / 60_000).toFixed(0)}m`;

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-nexzen-border/30 last:border-0">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${statusColor(service.status)}`} />
        <span className="text-[10px] text-nexzen-text font-medium w-20">
          {nameMap[service.name] ?? service.name}
        </span>
      </div>

      <div className="flex items-center gap-3 text-[9px] tabular-nums">
        {/* Status */}
        <span className={`w-16 text-center ${
          service.status === 'connected' ? 'text-nexzen-primary' :
          service.status === 'error' ? 'text-nexzen-danger' : 'text-nexzen-muted'
        }`}>
          {statusLabel(service.status)}
        </span>

        {/* Uptime */}
        <span className={`w-10 text-right ${uptimeColor(service.uptimePercent)}`}>
          {service.uptimePercent.toFixed(1)}%
        </span>

        {/* Latency */}
        <span className="w-10 text-right text-nexzen-muted">
          {service.latencyMs !== null ? `${service.latencyMs}ms` : '—'}
        </span>

        {/* Last seen */}
        <span className={`w-8 text-right ${service.isStale ? 'text-nexzen-danger' : 'text-nexzen-muted'}`}>
          {service.lastHeartbeat > 0 ? staleLabel : '—'}
        </span>

        {/* Errors */}
        {service.errorCount > 0 && (
          <span className="text-nexzen-danger">
            {service.errorCount}err
          </span>
        )}
      </div>
    </div>
  );
}

export function HealthPanel({ health }: HealthPanelProps) {
  const overallColor = {
    healthy: 'text-nexzen-primary',
    degraded: 'text-yellow-500',
    critical: 'text-nexzen-danger',
  }[health.overallStatus];

  const overallDot = {
    healthy: 'bg-nexzen-primary',
    degraded: 'bg-yellow-500 animate-pulse',
    critical: 'bg-nexzen-danger animate-pulse',
  }[health.overallStatus];

  return (
    <div className="glass-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="text-[10px] uppercase tracking-wider text-nexzen-muted">SYSTEM HEALTH</div>
          <div className={`w-2 h-2 rounded-full ${overallDot}`} />
          <span className={`text-[9px] font-bold uppercase ${overallColor}`}>
            {health.overallStatus}
          </span>
        </div>
        <span className={`text-[10px] tabular-nums ${uptimeColor(health.uptimePercent)}`}>
          {health.uptimePercent.toFixed(1)}% uptime
        </span>
      </div>

      {/* Column headers */}
      <div className="flex items-center justify-between text-[8px] text-nexzen-muted uppercase mb-1 px-0">
        <span className="w-24">Service</span>
        <div className="flex items-center gap-3">
          <span className="w-16 text-center">Status</span>
          <span className="w-10 text-right">Up%</span>
          <span className="w-10 text-right">Lat</span>
          <span className="w-8 text-right">Last</span>
        </div>
      </div>

      {/* Service rows */}
      <div>
        {health.services.map(service => (
          <ServiceRow key={service.name} service={service} />
        ))}
      </div>
    </div>
  );
}
