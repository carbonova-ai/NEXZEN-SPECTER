'use client';

import type { RuinGuardConfig } from '@/lib/engine/ruin-guard';
import type { EdgeSignal } from '@/lib/engine/edge-detector';

// ── Props ──

interface MicroStrategyCardProps {
  bankroll: number;
  initialBankroll: number;
  ruinGuardStats: {
    tradesLast24h: number;
    pnlLast24h: number;
    pnlLastHour: number;
    maxTradesPerDay: number;
    dailyLossLimit: number;
    hourlyLossLimit: number;
    permanentHalt: boolean;
    profitLocked: boolean;
    lockedAmount: number;
  } | null;
  edgeSignals: EdgeSignal[];
  ruinGuardConfig: RuinGuardConfig;
}

// ── Status Indicators ──

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
      ok ? 'bg-nexzen-primary/10 text-nexzen-primary' : 'bg-nexzen-danger/10 text-nexzen-danger'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-nexzen-primary' : 'bg-nexzen-danger'}`} />
      {label}
    </div>
  );
}

// ── Bankroll Bar ──

function BankrollBar({ bankroll, initial, floor }: { bankroll: number; initial: number; floor: number }) {
  // Scale: floor (0%) to initial*1.5 (100%) for visual range
  const maxDisplay = initial * 1.5;
  const bankrollPct = Math.max(0, Math.min(100, ((bankroll - floor) / (maxDisplay - floor)) * 100));
  const floorPct = 0; // floor is always at 0% of the bar
  const initialPct = ((initial - floor) / (maxDisplay - floor)) * 100;

  const pnl = bankroll - initial;
  const isPositive = pnl >= 0;

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline">
        <span className="text-lg font-bold tabular-nums text-nexzen-text">
          ${bankroll.toFixed(2)}
        </span>
        <span className={`text-xs font-bold tabular-nums ${isPositive ? 'text-nexzen-primary' : 'text-nexzen-danger'}`}>
          {isPositive ? '+' : ''}{pnl.toFixed(2)} ({isPositive ? '+' : ''}{((pnl / initial) * 100).toFixed(1)}%)
        </span>
      </div>
      <div className="relative h-2 bg-nexzen-border/30 rounded-full overflow-hidden">
        {/* Bankroll fill */}
        <div
          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${
            isPositive ? 'bg-nexzen-primary' : 'bg-nexzen-danger'
          }`}
          style={{ width: `${bankrollPct}%` }}
        />
        {/* Floor marker */}
        <div
          className="absolute top-0 h-full w-px bg-red-500"
          style={{ left: `${floorPct}%` }}
          title={`Ruin floor: $${floor}`}
        />
        {/* Initial marker */}
        <div
          className="absolute top-0 h-full w-px bg-nexzen-muted/50"
          style={{ left: `${initialPct}%` }}
          title={`Start: $${initial}`}
        />
      </div>
      <div className="flex justify-between text-[9px] text-nexzen-muted">
        <span>$${floor} FLOOR</span>
        <span>$${initial} START</span>
      </div>
    </div>
  );
}

// ── Edge Signal Row ──

function EdgeSignalRow({ signal }: { signal: EdgeSignal }) {
  const typeLabel = {
    STALE_PRICE: 'STALE',
    CROSS_MARKET: 'X-MKT',
    ORACLE_LAG: 'ORACLE',
  }[signal.type];

  const strengthColor =
    signal.strength >= 0.7 ? 'text-nexzen-primary' :
    signal.strength >= 0.4 ? 'text-yellow-500' :
    'text-nexzen-muted';

  return (
    <div className="flex items-center justify-between text-[10px] py-1 border-b border-nexzen-border/30">
      <div className="flex items-center gap-1.5">
        <span className={`font-mono font-bold ${strengthColor}`}>{typeLabel}</span>
        <span className="text-nexzen-text truncate max-w-[160px]">
          {signal.marketQuestion}
        </span>
      </div>
      <span className={`tabular-nums font-medium ${strengthColor}`}>
        {(signal.strength * 100).toFixed(0)}%
      </span>
    </div>
  );
}

// ── Main Component ──

export default function MicroStrategyCard({
  bankroll,
  initialBankroll,
  ruinGuardStats,
  edgeSignals,
  ruinGuardConfig,
}: MicroStrategyCardProps) {
  const stats = ruinGuardStats;
  const floor = ruinGuardConfig.absoluteFloor;
  const topSignals = edgeSignals.slice(0, 3);

  return (
    <div className="bg-nexzen-surface border border-nexzen-border rounded-lg p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-nexzen-text tracking-wider uppercase">
          Micro Strategy
        </h3>
        <div className="flex gap-1">
          {stats && (
            <>
              <StatusBadge
                ok={!stats.permanentHalt}
                label={stats.permanentHalt ? 'HALTED' : 'ACTIVE'}
              />
              {stats.profitLocked && (
                <StatusBadge ok={true} label={`LOCK $${stats.lockedAmount}`} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Bankroll Bar */}
      <BankrollBar bankroll={bankroll} initial={initialBankroll} floor={floor} />

      {/* Daily Stats Grid */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          {/* Trades counter */}
          <div className="text-center">
            <div className="text-[9px] text-nexzen-muted uppercase">Trades/Day</div>
            <div className={`text-sm font-bold tabular-nums ${
              stats.tradesLast24h >= stats.maxTradesPerDay ? 'text-nexzen-danger' : 'text-nexzen-text'
            }`}>
              {stats.tradesLast24h}/{stats.maxTradesPerDay}
            </div>
          </div>

          {/* Daily PnL */}
          <div className="text-center">
            <div className="text-[9px] text-nexzen-muted uppercase">Daily P&L</div>
            <div className={`text-sm font-bold tabular-nums ${
              stats.pnlLast24h >= 0 ? 'text-nexzen-primary' : 'text-nexzen-danger'
            }`}>
              {stats.pnlLast24h >= 0 ? '+' : ''}{stats.pnlLast24h.toFixed(2)}
            </div>
            <div className="text-[8px] text-nexzen-muted">
              limit -${stats.dailyLossLimit}
            </div>
          </div>

          {/* Hourly PnL */}
          <div className="text-center">
            <div className="text-[9px] text-nexzen-muted uppercase">Hour P&L</div>
            <div className={`text-sm font-bold tabular-nums ${
              stats.pnlLastHour >= 0 ? 'text-nexzen-primary' : 'text-nexzen-danger'
            }`}>
              {stats.pnlLastHour >= 0 ? '+' : ''}{stats.pnlLastHour.toFixed(2)}
            </div>
            <div className="text-[8px] text-nexzen-muted">
              limit -${stats.hourlyLossLimit}
            </div>
          </div>
        </div>
      )}

      {/* Edge Signals */}
      <div>
        <div className="text-[9px] text-nexzen-muted uppercase mb-1">Top Edge Signals</div>
        {topSignals.length > 0 ? (
          topSignals.map((signal, i) => (
            <EdgeSignalRow key={`${signal.marketId}-${i}`} signal={signal} />
          ))
        ) : (
          <div className="text-[10px] text-nexzen-muted py-2 text-center">
            No edge signals detected
          </div>
        )}
      </div>
    </div>
  );
}
