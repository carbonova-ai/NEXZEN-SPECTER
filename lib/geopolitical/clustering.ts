// ── Article Clustering Engine ──
// Groups related articles into story threads to reduce noise and provide context.
// Uses tag-based similarity + title n-gram overlap for fast, deterministic clustering.

import type { GeoArticle, ArticleCluster, UrgencyLevel } from './types';

const URGENCY_ORDER: Record<UrgencyLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Compute similarity between two articles (0-1) based on shared tags + title words */
function similarity(a: GeoArticle, b: GeoArticle): number {
  // Tag overlap (weighted heavily)
  const aTags = new Set(a.tags);
  const bTags = new Set(b.tags);
  const sharedTags = [...aTags].filter(t => bTags.has(t)).length;
  const totalTags = new Set([...aTags, ...bTags]).size;
  const tagSim = totalTags > 0 ? sharedTags / totalTags : 0;

  // Title word overlap (bigrams for better precision)
  const aWords = extractSignificantWords(a.title);
  const bWords = extractSignificantWords(b.title);
  const sharedWords = aWords.filter(w => bWords.includes(w)).length;
  const totalWords = new Set([...aWords, ...bWords]).size;
  const wordSim = totalWords > 0 ? sharedWords / totalWords : 0;

  // Combined: tags matter more (0.6) + words (0.4)
  return tagSim * 0.6 + wordSim * 0.4;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'about', 'says', 'said',
  'new', 'news', 'report', 'reports', 'according', 'also', 'amid', 'its',
  'and', 'but', 'or', 'if', 'while', 'that', 'this', 'it', 'he', 'she',
  'they', 'we', 'them', 'their', 'his', 'her', 'our', 'your', 'what',
]);

function extractSignificantWords(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/** Generate a human-readable label for a cluster based on shared tags and titles */
function generateClusterLabel(articles: GeoArticle[]): string {
  // Count tag frequency
  const tagCounts = new Map<string, number>();
  for (const a of articles) {
    for (const t of a.tags) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }

  // Get top 2-3 tags that appear in majority of articles
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));

  if (topTags.length > 0) return topTags.join(' / ');

  // Fallback: use the most common significant words from titles
  const wordCounts = new Map<string, number>();
  for (const a of articles) {
    for (const w of extractSignificantWords(a.title)) {
      wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
    }
  }
  const topWords = [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

  return topWords.join(' ') || 'Uncategorized';
}

const SIM_THRESHOLD = 0.25; // minimum similarity to cluster together

/**
 * Cluster articles into story threads.
 * Uses simple agglomerative clustering (fast enough for 100-200 articles).
 */
export function clusterArticles(articles: GeoArticle[]): ArticleCluster[] {
  if (articles.length === 0) return [];

  // Assign each article to a cluster
  const assignments = new Array<number>(articles.length).fill(-1);
  const clusters: GeoArticle[][] = [];

  for (let i = 0; i < articles.length; i++) {
    if (assignments[i] !== -1) continue;

    // Start a new cluster with this article
    const clusterIdx = clusters.length;
    const cluster: GeoArticle[] = [articles[i]];
    assignments[i] = clusterIdx;

    // Find all articles similar to this one
    for (let j = i + 1; j < articles.length; j++) {
      if (assignments[j] !== -1) continue;
      // Check similarity against cluster seed (first article)
      if (similarity(articles[i], articles[j]) >= SIM_THRESHOLD) {
        cluster.push(articles[j]);
        assignments[j] = clusterIdx;
      }
    }

    clusters.push(cluster);
  }

  // Convert to ArticleCluster objects
  return clusters
    .filter(c => c.length >= 1)
    .map((clusterArticles, idx) => {
      // Collect all tags
      const allTags = new Set<string>();
      for (const a of clusterArticles) {
        for (const t of a.tags) allTags.add(t);
      }

      // Find max urgency
      const sorted = [...clusterArticles].sort((a, b) =>
        URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]
      );
      const maxUrgency = sorted[0].urgency;

      // Average urgency score
      const avgScore = clusterArticles.reduce((s, a) => s + a.urgencyScore, 0) / clusterArticles.length;

      // Latest seen
      const latest = clusterArticles.reduce((max, a) =>
        a.seenAt > max ? a.seenAt : max, clusterArticles[0].seenAt
      );

      const clusterId = `cluster-${idx}-${Date.now().toString(36)}`;

      // Assign cluster ID to articles
      for (const a of clusterArticles) {
        a.clusterId = clusterId;
      }

      return {
        id: clusterId,
        label: generateClusterLabel(clusterArticles),
        tags: [...allTags],
        articleCount: clusterArticles.length,
        maxUrgency,
        avgUrgencyScore: Math.round(avgScore * 10) / 10,
        latestSeenAt: latest,
        articles: clusterArticles,
      };
    })
    .sort((a, b) => {
      const urgDiff = URGENCY_ORDER[a.maxUrgency] - URGENCY_ORDER[b.maxUrgency];
      if (urgDiff !== 0) return urgDiff;
      return b.avgUrgencyScore - a.avgUrgencyScore;
    });
}
