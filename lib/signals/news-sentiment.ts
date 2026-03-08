/**
 * News Sentiment Signal
 *
 * Analyzes crypto news headlines for bullish/bearish sentiment.
 * Uses keyword scoring with recency weighting.
 *
 * Signal: -1 (very bearish news) to +1 (very bullish news)
 */

export interface NewsArticle {
  title: string;
  source: string;
  url: string;
  publishedAt: number;    // timestamp
  categories: string;
}

export interface NewsSentimentAnalysis {
  signal: number;          // -1 to +1
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  totalArticles: number;
  topHeadlines: string[];  // Top 3 most impactful
  lastUpdate: number;
}

// Keyword dictionaries with weights
const BULLISH_KEYWORDS: Record<string, number> = {
  'surge': 0.8, 'soar': 0.8, 'rally': 0.7, 'bullish': 0.7,
  'breakout': 0.6, 'all-time high': 0.9, 'ath': 0.8,
  'adoption': 0.5, 'institutional': 0.5, 'etf approved': 0.9,
  'accumulation': 0.6, 'buy': 0.4, 'upgrade': 0.5,
  'recovery': 0.5, 'rebound': 0.6, 'pump': 0.6,
  'milestone': 0.5, 'partnership': 0.4, 'launch': 0.3,
  'growth': 0.4, 'gains': 0.5, 'upside': 0.5,
  'outperform': 0.5, 'record': 0.6, 'moon': 0.3,
};

const BEARISH_KEYWORDS: Record<string, number> = {
  'crash': 0.9, 'plunge': 0.8, 'dump': 0.7, 'bearish': 0.7,
  'sell-off': 0.7, 'selloff': 0.7, 'decline': 0.5,
  'hack': 0.8, 'exploit': 0.7, 'vulnerability': 0.6,
  'regulation': 0.4, 'ban': 0.7, 'crackdown': 0.6,
  'fraud': 0.7, 'scam': 0.6, 'bankrupt': 0.9,
  'liquidation': 0.6, 'collapse': 0.9, 'fear': 0.5,
  'warning': 0.4, 'risk': 0.3, 'lawsuit': 0.5,
  'sec': 0.4, 'investigate': 0.5, 'downgrade': 0.5,
  'outflow': 0.4, 'loss': 0.4, 'correction': 0.5,
};

/**
 * Score a single headline for sentiment.
 */
function scoreHeadline(title: string): { score: number; magnitude: number } {
  const lower = title.toLowerCase();
  let bullishScore = 0;
  let bearishScore = 0;

  for (const [keyword, weight] of Object.entries(BULLISH_KEYWORDS)) {
    if (lower.includes(keyword)) bullishScore += weight;
  }

  for (const [keyword, weight] of Object.entries(BEARISH_KEYWORDS)) {
    if (lower.includes(keyword)) bearishScore += weight;
  }

  const score = bullishScore - bearishScore;
  const magnitude = Math.abs(bullishScore - bearishScore); // Net strength, not ambiguity
  return { score, magnitude };
}

/**
 * Analyze news articles and generate sentiment signal.
 */
export function analyzeNewsSentiment(articles: NewsArticle[]): NewsSentimentAnalysis {
  if (articles.length === 0) {
    return {
      signal: 0,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      totalArticles: 0,
      topHeadlines: [],
      lastUpdate: Date.now(),
    };
  }

  const now = Date.now();
  let weightedBullish = 0;
  let weightedBearish = 0;
  let totalWeight = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;

  const scoredArticles: { title: string; score: number; magnitude: number }[] = [];

  for (const article of articles) {
    const { score, magnitude } = scoreHeadline(article.title);

    // Recency weight: exponential decay over 24 hours
    const ageHours = (now - article.publishedAt) / (1000 * 60 * 60);
    const recencyWeight = Math.exp(-ageHours / 3); // Half-life of 3 hours — crypto prices in breaking news fast

    // BTC-specific boost
    const isBTC = article.title.toLowerCase().includes('bitcoin') ||
                  article.title.toLowerCase().includes('btc');
    const relevanceBoost = isBTC ? 1.5 : 1.0;

    const weight = recencyWeight * relevanceBoost;

    if (score > 0.1) {
      weightedBullish += score * weight;
      bullishCount++;
    } else if (score < -0.1) {
      weightedBearish += Math.abs(score) * weight;
      bearishCount++;
    } else {
      neutralCount++;
    }

    totalWeight += weight;
    scoredArticles.push({ title: article.title, score, magnitude });
  }

  // Normalize signal
  let signal = 0;
  if (totalWeight > 0) {
    signal = (weightedBullish - weightedBearish) / totalWeight;
  }

  // Dampen signal — news is noisy
  signal *= 0.7;

  // Clamp
  signal = Math.max(-1, Math.min(1, signal));

  // Top headlines by magnitude
  scoredArticles.sort((a, b) => b.magnitude - a.magnitude);
  const topHeadlines = scoredArticles.slice(0, 3).map(a => a.title);

  return {
    signal,
    bullishCount,
    bearishCount,
    neutralCount,
    totalArticles: articles.length,
    topHeadlines,
    lastUpdate: Date.now(),
  };
}

/**
 * Fetch news sentiment from our API.
 */
export async function fetchNewsSentimentSignal(): Promise<NewsSentimentAnalysis | null> {
  try {
    const res = await fetch('/api/signals/news');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
