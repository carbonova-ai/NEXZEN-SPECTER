'use client';

import { useRef, useEffect, useState } from 'react';
import { TickerData } from '@/lib/types';

interface PriceCardProps {
  ticker: TickerData | null;
}

export function PriceCard({ ticker }: PriceCardProps) {
  const prevPriceRef = useRef<number | null>(null);
  const [flashClass, setFlashClass] = useState('');

  useEffect(() => {
    if (!ticker) return;
    const prev = prevPriceRef.current;
    if (prev !== null && prev !== ticker.price) {
      setFlashClass(ticker.price > prev ? 'animate-flash-green' : 'animate-flash-red');
      const timeout = setTimeout(() => setFlashClass(''), 300);
      prevPriceRef.current = ticker.price;
      return () => clearTimeout(timeout);
    }
    prevPriceRef.current = ticker.price;
  }, [ticker?.price, ticker]);

  if (!ticker) {
    return (
      <div className="glass-card p-4">
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-2">BTC PRICE LIVE</div>
        <div className="text-2xl font-bold text-nexzen-muted animate-pulse">CONNECTING...</div>
      </div>
    );
  }

  const isPositive = ticker.priceChangePercent24h >= 0;
  const changeColor = isPositive ? 'text-nexzen-primary' : 'text-nexzen-danger';

  return (
    <div className={`glass-card p-4 ${flashClass}`}>
      <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-2">
        BTC PRICE LIVE
        <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-nexzen-primary animate-pulse-glow" />
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
        <div className="col-span-2">
          <span className="text-nexzen-muted">Vol: </span>
          <span className="tabular-nums">
            ${(ticker.volume24h / 1e9).toFixed(2)}B
          </span>
        </div>
      </div>
    </div>
  );
}
