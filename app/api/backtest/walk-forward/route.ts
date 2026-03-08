/**
 * Walk-Forward Backtest API
 *
 * Runs walk-forward validation on historical predictions from Supabase.
 *
 * GET /api/backtest/walk-forward
 *   ?inSample=50&outOfSample=20&step=10
 */

import { NextResponse } from 'next/server';
import { fetchRecentPredictions } from '@/lib/supabase/predictions';
import { runWalkForward, type WalkForwardConfig, DEFAULT_WF_CONFIG } from '@/lib/backtest/walk-forward';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const inSampleSize = parseInt(url.searchParams.get('inSample') ?? '') || DEFAULT_WF_CONFIG.inSampleSize;
    const outOfSampleSize = parseInt(url.searchParams.get('outOfSample') ?? '') || DEFAULT_WF_CONFIG.outOfSampleSize;
    const stepSize = parseInt(url.searchParams.get('step') ?? '') || DEFAULT_WF_CONFIG.stepSize;

    // Fetch historical predictions
    const predictions = await fetchRecentPredictions(500);

    if (predictions.length === 0) {
      return NextResponse.json({
        error: 'No prediction history found',
        minRequired: inSampleSize + outOfSampleSize,
      }, { status: 404 });
    }

    const resolved = predictions.filter(p => p.outcome !== 'PENDING');
    const minRequired = inSampleSize + outOfSampleSize;

    if (resolved.length < minRequired) {
      return NextResponse.json({
        error: `Not enough resolved predictions (${resolved.length}/${minRequired})`,
        resolved: resolved.length,
        minRequired,
      }, { status: 400 });
    }

    const config: WalkForwardConfig = {
      inSampleSize,
      outOfSampleSize,
      stepSize,
      minWindows: DEFAULT_WF_CONFIG.minWindows,
    };

    const result = runWalkForward(predictions, config);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({
      error: 'Backtest failed',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
