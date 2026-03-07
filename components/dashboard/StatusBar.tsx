'use client';

import { useEffect, useState } from 'react';
import { ConnectionStatus } from '@/lib/types';

interface StatusBarProps {
  binanceStatus: ConnectionStatus;
  polymarketStatus: ConnectionStatus;
  polymarketError: string | null;
}

function ConnectionDot({ status, label }: { status: ConnectionStatus; label: string }) {
  const colorMap: Record<ConnectionStatus, string> = {
    connected: 'bg-nexzen-primary glow-dot',
    connecting: 'bg-yellow-500 animate-pulse',
    disconnected: 'bg-nexzen-muted',
    error: 'bg-nexzen-danger glow-dot',
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${colorMap[status]}`} />
      <span className="text-[10px] uppercase tracking-wider text-nexzen-muted">{label}</span>
    </div>
  );
}

export function StatusBar({ binanceStatus, polymarketStatus, polymarketError }: StatusBarProps) {
  const [time, setTime] = useState('');

  useEffect(() => {
    function updateTime() {
      setTime(new Date().toUTCString().split(' ').slice(4, 5).join(' '));
    }
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const effectivePolyStatus: ConnectionStatus = polymarketError ? 'error' : polymarketStatus;

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-nexzen-surface/80 backdrop-blur-md border-b border-nexzen-primary/20">
      <div className="flex items-center gap-2">
        <h1 className="text-base font-bold tracking-wider glow-text text-nexzen-primary">
          N&Xi;X&Zeta;&Xi;N SP&Xi;CT&Xi;R
        </h1>
        <span className="text-[10px] text-nexzen-muted ml-1">v0.1</span>
      </div>

      <div className="flex items-center gap-4">
        <ConnectionDot status={binanceStatus} label="BINANCE" />
        <ConnectionDot status={effectivePolyStatus} label="POLYMARKET" />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-nexzen-muted">BTC/USDT</span>
        <span className="text-xs font-mono text-nexzen-text">{time} UTC</span>
      </div>
    </div>
  );
}
