// ── News-Polymarket Correlation Engine ──
// Automatically matches news articles with related Polymarket markets
// and detects when news might be driving market movements.

import type { GeoArticle } from './types';

export interface MarketCorrelation {
  articleId: string;
  articleTitle: string;
  marketId: string;
  marketQuestion: string;
  yesPct: number;
  priceDirection: 'up' | 'down' | 'stable';
  priceChangePct: number;
  correlationScore: number; // 0-1 how related
  signal: 'CONFIRMING' | 'CONTRADICTING' | 'NEUTRAL';
  // CONFIRMING: news + market moving same direction (bad news + price drop)
  // CONTRADICTING: news says X but market says opposite
  // NEUTRAL: unclear relationship
}

export interface CorrelationSummary {
  totalCorrelations: number;
  confirmingCount: number;
  contradictingCount: number;
  topCorrelations: MarketCorrelation[];
  marketMomentum: 'RISK_ON' | 'RISK_OFF' | 'MIXED'; // overall market read
}

interface MinimalMarket {
  id: string;
  question: string;
  outcomePrices: number[];
  priceDirection: 'up' | 'down' | 'stable';
  priceChangePct: number;
  category: string;
  volume: number;
}

// Keyword → sentiment mapping for correlation detection
const NEGATIVE_KEYWORDS = new Set([
  'war', 'attack', 'bombing', 'missile', 'invasion', 'sanctions', 'collapse',
  'crash', 'crisis', 'killed', 'dead', 'escalation', 'threat', 'nuclear',
  'coup', 'terror', 'default', 'recession', 'famine', 'embargo',
]);

const POSITIVE_KEYWORDS = new Set([
  'peace', 'ceasefire', 'deal', 'agreement', 'treaty', 'summit', 'recovery',
  'growth', 'surge', 'rally', 'breakthrough', 'resolved', 'cooperation',
  'alliance', 'de-escalation', 'withdraw', 'diplomatic',
]);

function getArticleSentiment(article: GeoArticle): 'negative' | 'positive' | 'neutral' {
  const text = `${article.title} ${article.snippet}`.toLowerCase();
  let negScore = 0, posScore = 0;
  for (const kw of NEGATIVE_KEYWORDS) {
    if (text.includes(kw)) negScore++;
  }
  for (const kw of POSITIVE_KEYWORDS) {
    if (text.includes(kw)) posScore++;
  }
  if (negScore > posScore + 1) return 'negative';
  if (posScore > negScore + 1) return 'positive';
  return 'neutral';
}

function computeCorrelationScore(article: GeoArticle, market: MinimalMarket): number {
  const articleText = `${article.title} ${article.snippet}`.toLowerCase();
  const marketText = market.question.toLowerCase();

  // Shared significant words
  const articleWords = articleText.split(/\s+/).filter(w => w.length > 3);
  const marketWords = marketText.split(/\s+/).filter(w => w.length > 3);
  const shared = articleWords.filter(w => marketWords.includes(w)).length;
  const wordScore = Math.min(1, shared / 3); // 3+ shared words = max

  // Shared tags (if article has tags matching market keywords)
  let tagScore = 0;
  for (const tag of article.tags) {
    if (marketText.includes(tag.replace(/-/g, ' '))) tagScore += 0.3;
  }
  tagScore = Math.min(1, tagScore);

  return wordScore * 0.5 + tagScore * 0.5;
}

function determineSignal(
  articleSentiment: 'negative' | 'positive' | 'neutral',
  marketDirection: 'up' | 'down' | 'stable',
): MarketCorrelation['signal'] {
  if (articleSentiment === 'neutral' || marketDirection === 'stable') return 'NEUTRAL';

  // For geopolitical markets: "Will X happen?" → bad news usually pushes YES up
  // So negative news + market up = CONFIRMING (market agrees it's bad)
  // Negative news + market down = CONTRADICTING (market doesn't buy it)
  if (articleSentiment === 'negative' && marketDirection === 'up') return 'CONFIRMING';
  if (articleSentiment === 'negative' && marketDirection === 'down') return 'CONTRADICTING';
  if (articleSentiment === 'positive' && marketDirection === 'down') return 'CONFIRMING';
  if (articleSentiment === 'positive' && marketDirection === 'up') return 'CONTRADICTING';

  return 'NEUTRAL';
}

/**
 * Find correlations between news articles and Polymarket markets.
 * Returns the top correlations sorted by strength.
 */
export function findCorrelations(
  articles: GeoArticle[],
  markets: MinimalMarket[],
): CorrelationSummary {
  const correlations: MarketCorrelation[] = [];

  // Only check recent articles (last 2 hours) and moving markets
  const recentArticles = articles.filter(a =>
    Date.now() - new Date(a.seenAt).getTime() < 2 * 3600000
  ).slice(0, 30);

  const movingMarkets = markets.filter(m =>
    Math.abs(m.priceChangePct) > 0.3 || m.volume > 50000
  );

  for (const article of recentArticles) {
    for (const market of movingMarkets) {
      const score = computeCorrelationScore(article, market);
      if (score < 0.2) continue; // too weak

      const sentiment = getArticleSentiment(article);
      const yesPct = Math.round((market.outcomePrices[0] ?? 0) * 100);
      const signal = determineSignal(sentiment, market.priceDirection);

      correlations.push({
        articleId: article.id,
        articleTitle: article.title,
        marketId: market.id,
        marketQuestion: market.question,
        yesPct,
        priceDirection: market.priceDirection,
        priceChangePct: market.priceChangePct,
        correlationScore: score,
        signal,
      });
    }
  }

  // Sort by correlation strength × market movement
  correlations.sort((a, b) => {
    const scoreA = a.correlationScore * (1 + Math.abs(a.priceChangePct) * 0.1);
    const scoreB = b.correlationScore * (1 + Math.abs(b.priceChangePct) * 0.1);
    return scoreB - scoreA;
  });

  // Deduplicate: keep best correlation per article-market pair
  const seen = new Set<string>();
  const unique = correlations.filter(c => {
    const key = `${c.articleId}-${c.marketId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const top = unique.slice(0, 15);
  const confirming = top.filter(c => c.signal === 'CONFIRMING').length;
  const contradicting = top.filter(c => c.signal === 'CONTRADICTING').length;

  // Overall momentum
  let momentum: CorrelationSummary['marketMomentum'] = 'MIXED';
  if (confirming > contradicting * 2) momentum = 'RISK_OFF';
  else if (contradicting > confirming * 2) momentum = 'RISK_ON';

  return {
    totalCorrelations: top.length,
    confirmingCount: confirming,
    contradictingCount: contradicting,
    topCorrelations: top,
    marketMomentum: momentum,
  };
}
