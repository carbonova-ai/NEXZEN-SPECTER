'use client';

import { useState } from 'react';
import { LiveTrade, LiveTradingStats } from '@/lib/engine/live-trading';

interface LiveTradingCardProps {
  stats: LiveTradingStats | null;
  lastTrade: LiveTrade | null;
  configured: boolean | null;
  onToggleEnabled: () => void;
  onResetCircuitBreaker: () => void;
}

function ConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-nexzen-bg/90 rounded-lg">
      <div className="text-center p-4">
        <div className="text-nexzen-danger text-sm font-bold mb-2">REAL MONEY</div>
        <div className="text-nexzen-text text-xs mb-3">
          This will place real trades on Polymarket using your wallet.
          Losses are permanent.
        </div>
        <div className="flex gap-2 justify-center">
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-[10px] font-bold bg-nexzen-danger/20 border border-nexzen-danger text-nexzen-danger rounded hover:bg-nexzen-danger/30 transition-colors"
          >
            ENABLE LIVE
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-[10px] font-bold bg-nexzen-surface border border-nexzen-border text-nexzen-muted rounded hover:bg-nexzen-border transition-colors"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

function TradeRow({ trade }: { trade: LiveTrade }) {
  if (trade.status === 'SKIPPED') {
    return (
      <div className="flex items-center justify-between text-[10px] py-1 border-b border-nexzen-border/30">
        <span className="text-nexzen-muted truncate max-w-[160px]">{trade.skipReason}</span>
        <span className="text-nexzen-muted">SKIP</span>
      </div>
    );
  }

  const arrow = trade.direction === 'UP' ? '\u25B2' : '\u25BC';
  const isFilled = trade.status === 'FILLED';
  const hasPnl = trade.pnl !== null;

  return (
    <div className="flex items-center justify-between text-[10px] py-1 border-b border-nexzen-border/30">
      <div className="flex items-center gap-1.5">
        <span className={trade.direction === 'UP' ? 'text-nexzen-primary' : 'text-nexzen-danger'}>
          {arrow}
        </span>
        <span className="text-nexzen-text tabular-nums">${trade.stake.toFixed(2)}</span>
        {trade.status === 'FAILED' && (
          <span className="text-[9px] text-nexzen-danger">FAILED</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {trade.orderId && (
          <span className="text-[8px] text-nexzen-muted/50 tabular-nums">
            {trade.orderId.slice(0, 8)}...
          </span>
        )}
        <span className={`tabular-nums font-medium ${
          !hasPnl ? 'text-yellow-500' :
          (trade.pnl ?? 0) >= 0 ? 'text-nexzen-primary' : 'text-nexzen-danger'
        }`}>
          {!hasPnl ? 'live' : `${(trade.pnl ?? 0) >= 0 ? '+' : ''}$${(trade.pnl ?? 0).toFixed(2)}`}
        </span>
      </div>
    </div>
  );
}

export function LiveTradingCard({
  stats,
  lastTrade,
  configured,
  onToggleEnabled,
  onResetCircuitBreaker,
}: LiveTradingCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  // Not configured
  if (configured === false) {
    return (
      <div className="glass-card p-4">
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-2">LIVE TRADING</div>
        <div className="text-center py-4">
          <div className="text-nexzen-muted text-xs mb-2">Not Configured</div>
          <div className="text-[10px] text-nexzen-muted/70 space-y-1">
            <div>Add to .env.local:</div>
            <div className="font-mono text-[9px] text-left bg-nexzen-surface p-2 rounded">
              POLYMARKET_API_KEY=...<br />
              POLYMARKET_API_SECRET=...<br />
              POLYMARKET_API_PASSPHRASE=...<br />
              POLYGON_PRIVATE_KEY=0x...
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading
  if (!stats || configured === null) {
    return (
      <div className="glass-card p-4">
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-2">LIVE TRADING</div>
        <div className="flex items-center justify-center h-24">
          <div className="text-nexzen-muted text-sm animate-pulse">CHECKING...</div>
        </div>
      </div>
    );
  }

  const pnl = stats.bankroll - 1000; // Assume $1000 initial
  const isPositive = pnl >= 0;

  const handleToggle = () => {
    if (!stats.enabled) {
      setShowConfirm(true);
    } else {
      onToggleEnabled();
    }
  };

  return (
    <div className="glass-card p-4 relative">
      {showConfirm && (
        <ConfirmDialog
          onConfirm={() => {
            setShowConfirm(false);
            onToggleEnabled();
          }}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="text-[10px] uppercase tracking-wider text-nexzen-muted">LIVE TRADING</div>
          {stats.circuitBreakerActive && (
            <span className="text-[9px] text-nexzen-danger animate-pulse">HALTED</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {stats.circuitBreakerActive && (
            <button
              onClick={onResetCircuitBreaker}
              className="text-[9px] px-2 py-0.5 bg-nexzen-surface border border-nexzen-border rounded hover:bg-nexzen-border transition-colors text-nexzen-muted"
            >
              RESET
            </button>
          )}
          <button
            onClick={handleToggle}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              stats.enabled ? 'bg-nexzen-primary/30' : 'bg-nexzen-surface'
            } border ${stats.enabled ? 'border-nexzen-primary' : 'border-nexzen-border'}`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                stats.enabled
                  ? 'left-5 bg-nexzen-primary'
                  : 'left-0.5 bg-nexzen-muted'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${
          stats.enabled ? 'bg-nexzen-primary animate-pulse' : 'bg-nexzen-muted'
        }`} />
        <span className={`text-xs font-bold ${
          stats.enabled ? 'text-nexzen-primary' : 'text-nexzen-muted'
        }`}>
          {stats.enabled ? 'ACTIVE' : 'STANDBY'}
        </span>
        {stats.enabled && (
          <span className="text-[9px] text-nexzen-danger/70 ml-auto">REAL USDC</span>
        )}
      </div>

      {/* Bankroll */}
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-xl font-bold tabular-nums text-nexzen-text">
          ${stats.bankroll.toFixed(2)}
        </span>
        {stats.totalTrades > 0 && (
          <span className={`text-xs font-bold tabular-nums ${isPositive ? 'text-nexzen-primary' : 'text-nexzen-danger'}`}>
            {isPositive ? '+' : ''}{pnl.toFixed(2)}
          </span>
        )}
      </div>

      {/* Stats Grid */}
      {stats.totalTrades > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-3 text-[10px]">
          <div>
            <div className="text-nexzen-muted">Trades</div>
            <div className="tabular-nums font-medium">{stats.totalTrades}</div>
          </div>
          <div>
            <div className="text-nexzen-muted">W/L</div>
            <div>
              <span className="text-nexzen-primary tabular-nums">{stats.wins}</span>
              <span className="text-nexzen-muted">/</span>
              <span className="text-nexzen-danger tabular-nums">{stats.losses}</span>
            </div>
          </div>
          <div>
            <div className="text-nexzen-muted">WR</div>
            <div className={`tabular-nums font-medium ${
              stats.winRate >= 0.55 ? 'text-nexzen-primary' :
              stats.winRate >= 0.50 ? 'text-yellow-500' : 'text-nexzen-danger'
            }`}>
              {(stats.winRate * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-nexzen-muted">ROI</div>
            <div className={`tabular-nums font-medium ${stats.roi >= 0 ? 'text-nexzen-primary' : 'text-nexzen-danger'}`}>
              {(stats.roi * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      )}

      {/* Risk info */}
      <div className="flex justify-between text-[10px] text-nexzen-muted border-t border-nexzen-border pt-2">
        <span>Max DD: {(stats.maxDrawdown * 100).toFixed(1)}%</span>
        <span>Skip: {stats.skipped}</span>
        <span>Losses: {stats.consecutiveLosses}/5</span>
      </div>

      {/* Last Trade */}
      {lastTrade && lastTrade.status !== 'SKIPPED' && (
        <div className="border-t border-nexzen-border pt-2 mt-2">
          <div className="text-[10px] text-nexzen-muted uppercase mb-1">Last Trade</div>
          <TradeRow trade={lastTrade} />
        </div>
      )}
    </div>
  );
}
