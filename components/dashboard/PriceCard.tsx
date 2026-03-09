'use client';

import { useRef, useEffect, useState } from 'react';
import { TickerData } from '@/lib/types';

interface PriceCardProps {
  ticker: TickerData | null;
  chainlinkPrice: number | null;
  chainlinkDelta: number | null;
}

export function PriceCard({ ticker, chainlinkPrice, chainlinkDelta }: PriceCardProps) {
  const prevPriceRef = useRef<number | null>(null);
  const [flashClass, setFlashClass] = useState('');

  useEffect(() => {
    if (!ticker) return;
    const prev = prevPriceRef.current;
    prevPriceRef.current = ticker.price;
    if (prev === null || prev === ticker.price) return;
    const cls = ticker.price > prev ? 'animate-flash-green' : 'animate-flash-red';
    // Defer setState to avoid synchronous cascade
    const raf = requestAnimationFrame(() => {
      setFlashClass(cls);
    });
    const timeout = setTimeout(() => setFlashClass(''), 300);
    return () => { cancelAnimationFrame(raf); clearTimeout(timeout); };
  }, [ticker]);

  if (!ticker) {
    return (
      <div className="glass-card p-4">
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-2">BTC/USDT</div>
        <div className="text-2xl font-bold text-nexzen-muted animate-pulse">CONNECTING...</div>
      </div>
    );
  }

  const isPositive = ticker.priceChangePercent24h >= 0;
  const changeColor = isPositive ? 'text-nexzen-primary' : 'text-nexzen-danger';

  const deltaAbs = chainlinkDelta !== null ? Math.abs(chainlinkDelta) : 0;
  const deltaColor = deltaAbs >= 0.003 ? 'text-yellow-400' : deltaAbs >= 0.001 ? 'text-nexzen-text' : 'text-nexzen-muted';

  return (
    <div className={`glass-card p-4 ${flashClass}`}>
      {/* Binance live price */}
      <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          BTC/USDT
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-nexzen-primary animate-pulse-glow" />
        </span>
        <span className="text-nexzen-muted/60 normal-case">via Binance WS</span>
      </div>

      <div className="text-2xl font-bold text-nexzen-text tabular-nums">
        ${ticker.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>

      <div className={`text-sm mt-1 ${changeColor} tabular-nums`}>
        {isPositive ? '+' : ''}{ticker.priceChangePercent24h.toFixed(2)}%
        <span className="text-nexzen-muted ml-1 text-xs">24h</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
        <div>
          <span className="text-nexzen-muted">H: </span>
          <span className="tabular-nums">${ticker.high24h.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
        </div>
        <div>
          <span className="text-nexzen-muted">L: </span>
          <span className="tabular-nums">${ticker.low24h.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
        </div>
      </div>

      {/* Chainlink oracle price */}
      <div className="mt-3 pt-3 border-t border-nexzen-border/50">
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-1 flex items-center justify-between">
          <span>Oracle BTC/USD</span>
          <span className="text-nexzen-muted/60 normal-case">via Chainlink · Arbitrum</span>
        </div>
        {chainlinkPrice !== null ? (
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-nexzen-text tabular-nums">
              ${chainlinkPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {chainlinkDelta !== null && (
              <span className={`text-[11px] tabular-nums ${deltaColor}`}>
                Delta: {chainlinkDelta >= 0 ? '+' : ''}{(chainlinkDelta * 100).toFixed(3)}%
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-nexzen-muted animate-pulse">Connecting...</span>
        )}
      </div>

      {/* Volume */}
      <div className="mt-2 text-[11px]">
        <span className="text-nexzen-muted">Vol 24h: </span>
        <span className="tabular-nums">${(ticker.volume24h / 1e9).toFixed(2)}B</span>
      </div>
    </div>
  );
}
