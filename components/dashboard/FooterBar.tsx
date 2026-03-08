'use client';

interface FooterBarProps {
  latency: number;
  totalCycles: number;
  polymarketOnline: boolean;
  priceIntegrity: 'verified' | 'unverified' | 'divergent';
  chainlinkDelta: number | null;
  chainlinkOnline: boolean;
}

const integrityConfig = {
  verified: { label: 'VERIFIED', color: 'text-nexzen-primary' },
  unverified: { label: 'UNVERIFIED', color: 'text-yellow-500' },
  divergent: { label: 'DIVERGENT', color: 'text-nexzen-danger' },
} as const;

export function FooterBar({ latency, totalCycles, polymarketOnline, priceIntegrity, chainlinkDelta, chainlinkOnline }: FooterBarProps) {
  const integrity = integrityConfig[priceIntegrity];

  const hasEdge = chainlinkDelta !== null && Math.abs(chainlinkDelta) >= 0.002;
  const deltaDisplay = chainlinkDelta !== null
    ? `${chainlinkDelta >= 0 ? '+' : ''}${(chainlinkDelta * 100).toFixed(3)}%`
    : 'N/A';

  return (
    <div className="flex items-center justify-center gap-4 px-4 py-2 bg-nexzen-surface/50 border-t border-nexzen-border/50 text-[10px] text-nexzen-muted">
      <span className="flex items-center gap-1">
        <span className="w-1 h-1 rounded-full bg-nexzen-primary animate-pulse-glow" />
        SPECTER ENGINE v0.2
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
      <span className="text-nexzen-border">|</span>
      <span className={chainlinkOnline ? 'text-nexzen-primary' : 'text-nexzen-danger'}>
        Oracle: {chainlinkOnline ? 'ONLINE' : 'OFFLINE'}
      </span>
      <span className="text-nexzen-border">|</span>
      <span className={`tabular-nums ${hasEdge ? 'text-yellow-400 font-bold' : 'text-nexzen-muted'}`}>
        {hasEdge ? 'EDGE ' : ''}Delta: {deltaDisplay}
      </span>
    </div>
  );
}
