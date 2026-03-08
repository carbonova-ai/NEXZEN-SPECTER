import { supabase } from './client';
import { PaperTrade } from '@/lib/types';
import type { Database } from './database.types';

type PaperTradeRow = Database['public']['Tables']['paper_trades']['Row'];

export async function savePaperTrade(trade: PaperTrade): Promise<void> {
  const { error } = await supabase.from('paper_trades').insert({
    id: trade.id,
    prediction_id: trade.predictionId,
    direction: trade.direction,
    confidence: trade.confidence,
    probability: trade.probability,
    stake: trade.stake,
    entry_price: trade.entryPrice,
    exit_price: trade.exitPrice,
    yes_price: trade.yesPrice,
    payout: trade.payout,
    pnl: trade.pnl,
    status: trade.status,
    skip_reason: trade.skipReason,
    bankroll_before: trade.bankrollBefore,
    bankroll_after: trade.bankrollAfter,
    resolved_at: trade.resolvedAt ? new Date(trade.resolvedAt).toISOString() : null,
  });

  if (error) console.error('[Supabase] Failed to save paper trade:', error.message);
}

export async function resolvePaperTrade(
  id: string,
  exitPrice: number,
  status: 'WON' | 'LOST',
  payout: number,
  pnl: number,
  bankrollAfter: number
): Promise<void> {
  const { error } = await supabase.from('paper_trades').update({
    exit_price: exitPrice,
    status,
    payout,
    pnl,
    bankroll_after: bankrollAfter,
    resolved_at: new Date().toISOString(),
  }).eq('id', id);

  if (error) console.error('[Supabase] Failed to resolve paper trade:', error.message);
}

export async function fetchRecentPaperTrades(limit = 200): Promise<PaperTrade[]> {
  const { data, error } = await supabase
    .from('paper_trades')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error || !data) {
    console.error('[Supabase] Failed to fetch paper trades:', error?.message);
    return [];
  }

  return (data as PaperTradeRow[]).map(row => ({
    id: row.id,
    predictionId: row.prediction_id,
    direction: row.direction as 'UP' | 'DOWN',
    confidence: row.confidence as 'LOW' | 'MED' | 'HIGH',
    probability: row.probability,
    stake: row.stake,
    entryPrice: row.entry_price,
    exitPrice: row.exit_price,
    yesPrice: row.yes_price,
    payout: row.payout,
    pnl: row.pnl,
    status: row.status as PaperTrade['status'],
    skipReason: row.skip_reason,
    bankrollBefore: row.bankroll_before,
    bankrollAfter: row.bankroll_after,
    timestamp: new Date(row.created_at).getTime(),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).getTime() : null,
  }));
}
