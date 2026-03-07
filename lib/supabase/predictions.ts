import { supabase } from './client';
import { Prediction, PredictionResult, PerformanceStats } from '@/lib/types';
import type { Database } from './database.types';

type PredictionRow = Database['public']['Tables']['predictions']['Row'];

export async function savePrediction(prediction: Prediction): Promise<void> {
  const { error } = await supabase.from('predictions').insert({
    id: prediction.id,
    direction: prediction.direction,
    probability: prediction.probability,
    confidence: prediction.confidence,
    entry_price: prediction.entryPrice,
    target_price: prediction.targetPrice,
    exit_price: null,
    outcome: 'PENDING',
    pnl_percent: null,
    polymarket_sentiment: prediction.polymarketSentiment,
    signals: prediction.signals as unknown as Record<string, number>,
    reasoning: prediction.reasoning,
    indicators: prediction.indicators as unknown as Record<string, unknown>,
    expires_at: new Date(prediction.expiresAt).toISOString(),
  });

  if (error) console.error('[Supabase] Failed to save prediction:', error.message);
}

export async function resolvePrediction(
  id: string,
  exitPrice: number,
  outcome: 'WIN' | 'LOSS',
  pnlPercent: number
): Promise<void> {
  const { error } = await supabase.from('predictions').update({
    exit_price: exitPrice,
    outcome,
    pnl_percent: pnlPercent,
    resolved_at: new Date().toISOString(),
  }).eq('id', id);

  if (error) console.error('[Supabase] Failed to resolve prediction:', error.message);
}

export async function fetchRecentPredictions(limit = 100): Promise<PredictionResult[]> {
  const { data, error } = await supabase
    .from('predictions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.error('[Supabase] Failed to fetch predictions:', error?.message);
    return [];
  }

  return (data as PredictionRow[]).map(row => ({
    id: row.id,
    direction: row.direction as 'UP' | 'DOWN',
    probability: row.probability,
    confidence: row.confidence as 'LOW' | 'MED' | 'HIGH',
    entryPrice: row.entry_price,
    targetPrice: row.target_price,
    exitPrice: row.exit_price,
    outcome: row.outcome as 'WIN' | 'LOSS' | 'PENDING',
    pnlPercent: row.pnl_percent,
    polymarketSentiment: row.polymarket_sentiment,
    signals: row.signals as unknown as PredictionResult['signals'],
    reasoning: row.reasoning,
    indicators: row.indicators as unknown as PredictionResult['indicators'],
    timestamp: new Date(row.created_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
  }));
}

export async function savePerformanceSnapshot(stats: PerformanceStats): Promise<void> {
  const lastEquity = stats.equityCurve.length > 0
    ? stats.equityCurve[stats.equityCurve.length - 1].equity
    : 100;

  const { error } = await supabase.from('performance_snapshots').insert({
    total_predictions: stats.totalPredictions,
    wins: stats.wins,
    losses: stats.losses,
    win_rate: stats.winRate,
    streak_current: stats.streakCurrent,
    streak_best: stats.streakBest,
    max_drawdown: stats.maxDrawdown,
    equity: lastEquity,
  });

  if (error) console.error('[Supabase] Failed to save performance:', error.message);
}
