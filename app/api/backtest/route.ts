import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { optimizeWeights } from '@/lib/engine/weight-optimizer';
import { DEFAULT_ENGINE_CONFIG, type PredictionResult } from '@/lib/types';
import type { Database } from '@/lib/supabase/database.types';

type PredictionRow = Database['public']['Tables']['predictions']['Row'];

/**
 * GET /api/backtest — Run weight optimization on historical predictions
 *
 * Query params:
 *   limit: number of predictions to analyze (default 200)
 */
export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '200', 10);

  try {
    // Fetch resolved predictions from Supabase
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .neq('outcome', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(Math.min(limit, 500));

    if (error) {
      return NextResponse.json(
        { error: `Supabase error: ${error.message}` },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        message: 'No resolved predictions yet',
        samplesUsed: 0,
        optimizedWeights: DEFAULT_ENGINE_CONFIG.weights,
      });
    }

    // Convert rows to PredictionResult
    const predictions: PredictionResult[] = (data as PredictionRow[]).map(row => ({
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
      chainlinkPrice: row.chainlink_price ?? null,
      chainlinkDelta: row.chainlink_delta ?? null,
      resolutionSource: (row.resolution_source as 'chainlink' | 'binance') ?? 'binance',
      signals: row.signals as unknown as PredictionResult['signals'],
      reasoning: row.reasoning,
      indicators: row.indicators as unknown as PredictionResult['indicators'],
      timestamp: new Date(row.created_at).getTime(),
      expiresAt: new Date(row.expires_at).getTime(),
    }));

    // Run optimization
    const result = optimizeWeights(predictions, DEFAULT_ENGINE_CONFIG);

    return NextResponse.json({
      ...result,
      currentWeights: DEFAULT_ENGINE_CONFIG.weights,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
