/**
 * News Sentiment API
 *
 * Fetches crypto news from CryptoCompare and scores sentiment.
 * No API key required for basic access.
 *
 * GET /api/signals/news
 */

import { NextResponse } from 'next/server';
import { analyzeNewsSentiment, type NewsArticle } from '@/lib/signals/news-sentiment';

const CRYPTOCOMPARE_NEWS = 'https://min-api.cryptocompare.com/data/v2/news/';

async function fetchCryptoNews(): Promise<NewsArticle[]> {
  try {
    const res = await fetch(
      `${CRYPTOCOMPARE_NEWS}?categories=BTC,Trading&sortOrder=latest&limit=30`,
      { next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) } // Cache 60s, 5s timeout
    );

    if (!res.ok) return [];

    const data = await res.json();
    const articles: NewsArticle[] = [];

    for (const item of data.Data ?? []) {
      articles.push({
        title: item.title ?? '',
        source: item.source_info?.name ?? item.source ?? 'Unknown',
        url: item.url ?? '',
        publishedAt: (item.published_on ?? 0) * 1000,
        categories: item.categories ?? '',
      });
    }

    return articles;
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const articles = await fetchCryptoNews();
    const analysis = analyzeNewsSentiment(articles);
    return NextResponse.json(analysis);
  } catch {
    return NextResponse.json({
      signal: 0,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      totalArticles: 0,
      topHeadlines: [],
      lastUpdate: Date.now(),
    });
  }
}
