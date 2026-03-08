'use client';

interface FooterBarProps {
  latency: number;
  totalCycles: number;
  polymarketOnline: boolean;
  priceIntegrity: 'verified' | 'unverified' | 'divergent';
}

const integrityConfig = {
  verified: { label: 'VERIFIED', color: 'text-nexzen-primary' },
  unverified: { label: 'UNVERIFIED', color: 'text-yellow-500' },
  divergent: { label: 'DIVERGENT', color: 'text-nexzen-danger' },
} as const;

export function FooterBar({ latency, totalCycles, polymarketOnline, priceIntegrity }: FooterBarProps) {
  const integrity = integrityConfig[priceIntegrity];

  return (
    <div className="flex items-center justify-center gap-4 px-4 py-2 bg-nexzen-surface/50 border-t border-nexzen-border/50 text-[10px] text-nexzen-muted">
      <span className="flex items-center gap-1">
        <span className="w-1 h-1 rounded-full bg-nexzen-primary animate-pulse-glow" />
        SPECTER ENGINE v0.1
      </span>
      <span className="text-nexzen-border">|</span>
      <span className="tabular-nums">Latency: {latency}ms</span>
      <span className="text-nexzen-border">|</span>
      <span className={`tabular-nums ${integrity.color}`}>
        Price: {integrity.label}
      </span>
      <span className="text-nexzen-border">|</span>
      <span className="tabular-nums">Cycles: {totalCycles}</span>
      <span className="text-nexzen-border">|</span>
      <span className={polymarketOnline ? 'text-nexzen-primary' : 'text-nexzen-danger'}>
        Poly: {polymarketOnline ? 'ONLINE' : 'OFFLINE'}
      </span>
    </div>
  );
}
