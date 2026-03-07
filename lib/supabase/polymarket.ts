import { supabase } from './client';
import { PolymarketMarket } from '@/lib/polymarket/types';
import type { Database } from './database.types';

type PolymarketRow = Database['public']['Tables']['polymarket_snapshots']['Row'];

export async function savePolymarketSnapshot(
  markets: PolymarketMarket[],
  midpoints: Map<string, number>,
  sentimentScore: number
): Promise<void> {
  const rows = markets.slice(0, 20).map(market => {
    const tokenId = market.clobTokenIds?.[0];
    const yesPrice = tokenId
      ? midpoints.get(tokenId) ?? parseFloat(market.outcomePrices?.[0] ?? '0.5')
      : parseFloat(market.outcomePrices?.[0] ?? '0.5');

    return {
      market_id: market.id,
      question: market.question,
      yes_price: yesPrice,
      no_price: 1 - yesPrice,
      volume: market.volume || 0,
      liquidity: market.liquidity || 0,
      sentiment_score: sentimentScore,
    };
  });

  if (rows.length === 0) return;

  const { error } = await supabase.from('polymarket_snapshots').insert(rows);
  if (error) console.error('[Supabase] Failed to save polymarket snapshot:', error.message);
}

export async function fetchPolymarketHistory(
  marketId: string,
  limit = 100
): Promise<{ timestamp: number; yesPrice: number; sentiment: number }[]> {
  const { data, error } = await supabase
    .from('polymarket_snapshots')
    .select('created_at, yes_price, sentiment_score')
    .eq('market_id', marketId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as Pick<PolymarketRow, 'created_at' | 'yes_price' | 'sentiment_score'>[]).map(row => ({
    timestamp: new Date(row.created_at).getTime(),
    yesPrice: row.yes_price,
    sentiment: row.sentiment_score,
  })).reverse();
}
