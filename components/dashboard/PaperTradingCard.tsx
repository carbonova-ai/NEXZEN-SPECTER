'use client';

import { PaperTrade, PaperTradingStats } from '@/lib/types';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';

interface PaperTradingCardProps {
  stats: PaperTradingStats | null;
  lastTrade: PaperTrade | null;
  onResetCircuitBreaker: () => void;
}

function BankrollDisplay({ stats }: { stats: PaperTradingStats }) {
  const pnl = stats.bankroll - stats.initialBankroll;
  const pnlPercent = (pnl / stats.initialBankroll) * 100;
  const isPositive = pnl >= 0;

  return (
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-bold tabular-nums text-nexzen-text">
        ${stats.bankroll.toFixed(2)}
      </span>
      <span className={`text-sm font-bold tabular-nums ${isPositive ? 'text-nexzen-primary' : 'text-nexzen-danger'}`}>
        {isPositive ? '+' : ''}{pnl.toFixed(2)} ({isPositive ? '+' : ''}{pnlPercent.toFixed(1)}%)
      </span>
    </div>
  );
}

function TradeRow({ trade }: { trade: PaperTrade }) {
  if (trade.status === 'SKIPPED') {
    return (
      <div className="flex items-center justify-between text-[10px] py-1 border-b border-nexzen-border/30">
        <div className="flex items-center gap-1.5">
          <span className="text-nexzen-muted">SKIP</span>
          <span className="text-nexzen-muted truncate max-w-[120px]">{trade.skipReason}</span>
        </div>
        <span className="text-nexzen-muted tabular-nums">$0</span>
      </div>
    );
  }

  const isWon = trade.status === 'WON';
  const isOpen = trade.status === 'OPEN';
  const arrow = trade.direction === 'UP' ? '\u25B2' : '\u25BC';

  return (
    <div className="flex items-center justify-between text-[10px] py-1 border-b border-nexzen-border/30">
      <div className="flex items-center gap-1.5">
        <span className={trade.direction === 'UP' ? 'text-nexzen-primary' : 'text-nexzen-danger'}>
          {arrow}
        </span>
        <span className="text-nexzen-text tabular-nums">${trade.stake.toFixed(2)}</span>
        <span className={`text-[9px] ${
          isOpen ? 'text-yellow-500' : isWon ? 'text-nexzen-primary' : 'text-nexzen-danger'
        }`}>
          {trade.status}
        </span>
      </div>
      <span className={`tabular-nums font-medium ${
        isOpen ? 'text-yellow-500' : isWon ? 'text-nexzen-primary' : 'text-nexzen-danger'
      }`}>
        {isOpen ? 'pending' : `${(trade.pnl ?? 0) >= 0 ? '+' : ''}$${(trade.pnl ?? 0).toFixed(2)}`}
      </span>
    </div>
  );
}

export function PaperTradingCard({ stats, lastTrade, onResetCircuitBreaker }: PaperTradingCardProps) {
  if (!stats) {
    return (
      <div className="glass-card p-4">
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-2">PAPER TRADING</div>
        <div className="flex items-center justify-center h-24">
          <div className="text-nexzen-muted text-sm animate-pulse">INITIALIZING...</div>
        </div>
      </div>
    );
  }

  const bankrollData = stats.bankrollHistory.map(p => ({ value: p.bankroll }));
  const pnl = stats.bankroll - stats.initialBankroll;
  const isPositive = pnl >= 0;

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wider text-nexzen-muted">
          PAPER TRADING
          {stats.circuitBreakerActive && (
            <span className="ml-2 text-nexzen-danger animate-pulse">CIRCUIT BREAKER</span>
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
          <span className={`text-[9px] px-1.5 py-0.5 rounded ${
            stats.winRate >= 0.55 ? 'bg-nexzen-primary/10 text-nexzen-primary' :
            stats.winRate >= 0.50 ? 'bg-yellow-500/10 text-yellow-500' :
            'bg-nexzen-danger/10 text-nexzen-danger'
          }`}>
            {stats.totalTrades > 0 ? `${(stats.winRate * 100).toFixed(1)}% WR` : 'NO TRADES'}
          </span>
        </div>
      </div>

      <BankrollDisplay stats={stats} />

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-2 mt-3 mb-3 text-[10px]">
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
          <div className="text-nexzen-muted">ROI</div>
          <div className={`tabular-nums font-medium ${stats.roi >= 0 ? 'text-nexzen-primary' : 'text-nexzen-danger'}`}>
            {(stats.roi * 100).toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-nexzen-muted">Skipped</div>
          <div className="tabular-nums text-nexzen-muted">{stats.skipped}</div>
        </div>
      </div>

      {/* Bankroll Chart */}
      <div className="border-t border-nexzen-border pt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-nexzen-muted uppercase">Bankroll</span>
          <span className="text-[10px] text-nexzen-muted tabular-nums">
            Peak: ${stats.peakBankroll.toFixed(2)}
          </span>
        </div>

        {bankrollData.length > 1 ? (
          <ResponsiveContainer width="100%" height={60}>
            <AreaChart data={bankrollData}>
              <defs>
                <linearGradient id="bankrollGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? '#00ff41' : '#ff4444'} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={isPositive ? '#00ff41' : '#ff4444'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis domain={['dataMin', 'dataMax']} hide />
              <Area
                type="monotone"
                dataKey="value"
                stroke={isPositive ? '#00ff41' : '#ff4444'}
                strokeWidth={1.5}
                fill="url(#bankrollGrad)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[60px] flex items-center justify-center text-[10px] text-nexzen-muted">
            Waiting for trades...
          </div>
        )}

        <div className="flex justify-between text-[10px] text-nexzen-muted mt-1">
          <span>Max DD: {(stats.maxDrawdown * 100).toFixed(1)}%</span>
          <span>Avg Stake: ${stats.avgStake.toFixed(2)}</span>
          <span>Loss Streak: {stats.consecutiveLosses}/{stats.maxConsecutiveLosses}</span>
        </div>
      </div>

      {/* Best/Worst & Recent Trades */}
      {stats.totalTrades > 0 && (
        <div className="border-t border-nexzen-border pt-3 mt-3">
          <div className="flex justify-between text-[10px] mb-2">
            <div>
              <span className="text-nexzen-muted">Best: </span>
              <span className="text-nexzen-primary tabular-nums">+${stats.bestTrade.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-nexzen-muted">Worst: </span>
              <span className="text-nexzen-danger tabular-nums">${stats.worstTrade.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-nexzen-muted">Total P&L: </span>
              <span className={`tabular-nums ${stats.totalPnl >= 0 ? 'text-nexzen-primary' : 'text-nexzen-danger'}`}>
                {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Last trade */}
          {lastTrade && (
            <div className="text-[10px] text-nexzen-muted uppercase mb-1">Last Trade</div>
          )}
          {lastTrade && <TradeRow trade={lastTrade} />}
        </div>
      )}
    </div>
  );
}
