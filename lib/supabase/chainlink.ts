import { supabase } from './client';
import type { ChainlinkPrice, DeltaSnapshot } from '@/lib/chainlink/types';

export async function saveChainlinkSnapshot(price: ChainlinkPrice): Promise<void> {
  const { error } = await supabase.from('chainlink_snapshots').insert({
    price: price.price,
    round_id: price.roundId,
    updated_at_chain: new Date(price.updatedAt).toISOString(),
    staleness_ms: price.staleness,
    network: price.network,
  });

  if (error) console.error('[Supabase] Failed to save chainlink snapshot:', error.message);
}

export async function saveDeltaSnapshot(delta: DeltaSnapshot, edgeSignal: number = 0): Promise<void> {
  const { error } = await supabase.from('delta_history').insert({
    binance_price: delta.binancePrice,
    chainlink_price: delta.chainlinkPrice,
    delta_percent: delta.deltaPercent,
    delta_direction: delta.deltaDirection,
    edge_signal: edgeSignal,
  });

  if (error) console.error('[Supabase] Failed to save delta snapshot:', error.message);
}
