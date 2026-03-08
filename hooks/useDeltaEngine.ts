'use client';

import { useState, useEffect, useRef } from 'react';
import { DeltaEngine } from '@/lib/chainlink/delta-engine';
import type { ChainlinkPrice, DeltaAnalysis } from '@/lib/chainlink/types';

interface UseDeltaEngineReturn {
  delta: DeltaAnalysis | null;
  edgeSignal: number;
  snapshotCount: number;
}

export function useDeltaEngine(
  binancePrice: number | null,
  chainlinkPrice: ChainlinkPrice | null
): UseDeltaEngineReturn {
  const engineRef = useRef<DeltaEngine>(new DeltaEngine());
  const [delta, setDelta] = useState<DeltaAnalysis | null>(null);
  const [edgeSignal, setEdgeSignal] = useState(0);
  const [snapshotCount, setSnapshotCount] = useState(0);

  // Throttle: max 1 analysis per second
  const lastAnalysisRef = useRef(0);

  useEffect(() => {
    if (binancePrice === null || chainlinkPrice === null) return;
    if (binancePrice <= 0 || chainlinkPrice.price <= 0) return;

    const now = Date.now();
    if (now - lastAnalysisRef.current < 1000) return;
    lastAnalysisRef.current = now;

    const engine = engineRef.current;
    engine.pushSnapshot(binancePrice, chainlinkPrice);
    const analysis = engine.analyze();

    setDelta(analysis);
    setEdgeSignal(analysis.edgeSignal);
    setSnapshotCount(engine.getSnapshotCount());
  }, [binancePrice, chainlinkPrice]);

  return { delta, edgeSignal, snapshotCount };
}
