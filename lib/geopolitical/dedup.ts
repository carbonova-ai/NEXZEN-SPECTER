// ══════════════════════════════════════════════════════════════
// SEMANTIC DEDUPLICATION ENGINE
//
// Improved deduplication beyond simple title fingerprinting:
// 1. Trigram similarity (Jaccard on character trigrams)
// 2. URL-based dedup (same domain + path = same article)
// 3. Temporal clustering (within 10min + trigram > 0.5 = same story)
// ══════════════════════════════════════════════════════════════

import type { GeoArticle } from './types';

// ── Trigram Similarity ──

function extractTrigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const trigrams = new Set<string>();
  for (let i = 0; i <= normalized.length - 3; i++) {
    trigrams.add(normalized.slice(i, i + 3));
  }
  return trigrams;
}

export function trigramSimilarity(a: string, b: string): number {
  const trigramsA = extractTrigrams(a);
  const trigramsB = extractTrigrams(b);
  if (trigramsA.size === 0 || trigramsB.size === 0) return 0;

  let intersection = 0;
  for (const t of trigramsA) {
    if (trigramsB.has(t)) intersection++;
  }

  const union = trigramsA.size + trigramsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ── URL Dedup ──

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Strip tracking params, anchors, trailing slashes
    u.hash = '';
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_medium');
    u.searchParams.delete('utm_campaign');
    u.searchParams.delete('utm_content');
    u.searchParams.delete('utm_term');
    u.searchParams.delete('ref');
    u.searchParams.delete('source');
    return `${u.hostname}${u.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

// ── Priority Classification ──

const CRITICAL_PRIORITY_PATTERNS = [
  /\b(nuclear strike|war declared|hormuz closed|iran attacks?|bombing iran|missile launch)\b/i,
  /\b(nuclear test|weapons.grade|90%.enrichment|invasion|mobilization)\b/i,
  /\b(ceasefire broken|state of emergency|martial law)\b/i,
];

const HIGH_PRIORITY_PATTERNS = [
  /\b(sanctions|enrichment|iaea|centrifuge|proxy|hezbollah attack|houthi)\b/i,
  /\b(carrier group|troops deployed|military exercise|drone strike)\b/i,
  /\b(escalation|confrontation|retaliation|blockade)\b/i,
];

export type ArticlePriority = 'CRITICAL' | 'HIGH' | 'ROUTINE';

export function classifyPriority(title: string, snippet?: string): ArticlePriority {
  const text = `${title} ${snippet || ''}`;
  for (const p of CRITICAL_PRIORITY_PATTERNS) {
    if (p.test(text)) return 'CRITICAL';
  }
  for (const p of HIGH_PRIORITY_PATTERNS) {
    if (p.test(text)) return 'HIGH';
  }
  return 'ROUTINE';
}

// ── Fast Title Hash (O(n) pre-filter) ──
// Generates a normalized 4-word fingerprint for fast exact-match dedup
// before the expensive O(n²) trigram pass.

function titleFingerprint(title: string): string {
  const words = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .sort();
  // Take first 4 significant words as fingerprint
  return words.slice(0, 4).join('|');
}

// ── Semantic Dedup (main export) ──

export function semanticDedup(articles: GeoArticle[]): GeoArticle[] {
  if (articles.length <= 1) return articles;

  // Phase 0: FAST HASH PRE-FILTER (O(n) — catches 60-80% of dupes instantly)
  const fingerprintMap = new Map<string, GeoArticle>();
  const survivors: GeoArticle[] = [];

  for (const article of articles) {
    const fp = titleFingerprint(article.title);
    if (fp.length < 4) {
      // Too short to fingerprint, let through
      survivors.push(article);
      continue;
    }
    const existing = fingerprintMap.get(fp);
    if (existing) {
      // Exact fingerprint match — keep higher urgency
      if (article.urgencyScore > existing.urgencyScore) {
        fingerprintMap.set(fp, {
          ...article,
          snippet: article.snippet || existing.snippet,
          imageUrl: article.imageUrl || existing.imageUrl,
        });
      }
    } else {
      fingerprintMap.set(fp, article);
    }
  }
  survivors.push(...fingerprintMap.values());

  // Phase 1: URL dedup (exact URL match = same article, keep higher urgency)
  const urlMap = new Map<string, GeoArticle>();

  for (const article of survivors) {
    const normalizedUrl = normalizeUrl(article.url);
    const existing = urlMap.get(normalizedUrl);
    if (existing) {
      if (article.urgencyScore > existing.urgencyScore) {
        urlMap.set(normalizedUrl, {
          ...article,
          snippet: article.snippet || existing.snippet,
          imageUrl: article.imageUrl || existing.imageUrl,
        });
      }
    } else {
      urlMap.set(normalizedUrl, article);
    }
  }

  const urlDeduped = [...urlMap.values()];

  // Phase 2: Title trigram dedup (similarity > 0.7 = same story)
  // Now runs on a much smaller set thanks to Phase 0
  const kept: GeoArticle[] = [];
  const used = new Set<number>();

  for (let i = 0; i < urlDeduped.length; i++) {
    if (used.has(i)) continue;

    let bestArticle = urlDeduped[i];
    const cluster: number[] = [i];

    for (let j = i + 1; j < urlDeduped.length; j++) {
      if (used.has(j)) continue;

      const sim = trigramSimilarity(urlDeduped[i].title, urlDeduped[j].title);
      if (sim > 0.7) {
        cluster.push(j);
        used.add(j);
        if (urlDeduped[j].urgencyScore > bestArticle.urgencyScore) {
          bestArticle = {
            ...urlDeduped[j],
            snippet: urlDeduped[j].snippet || bestArticle.snippet,
            imageUrl: urlDeduped[j].imageUrl || bestArticle.imageUrl,
          };
        }
      }
    }

    // Phase 3: Temporal clustering for medium-similarity articles
    if (cluster.length === 1) {
      for (let j = i + 1; j < urlDeduped.length; j++) {
        if (used.has(j)) continue;

        const timeDiff = Math.abs(
          new Date(urlDeduped[i].seenAt).getTime() - new Date(urlDeduped[j].seenAt).getTime()
        );
        if (timeDiff > 10 * 60 * 1000) continue;

        const sim = trigramSimilarity(urlDeduped[i].title, urlDeduped[j].title);
        if (sim > 0.5) {
          used.add(j);
          if (urlDeduped[j].urgencyScore > bestArticle.urgencyScore) {
            bestArticle = {
              ...urlDeduped[j],
              snippet: urlDeduped[j].snippet || bestArticle.snippet,
              imageUrl: urlDeduped[j].imageUrl || bestArticle.imageUrl,
            };
          }
        }
      }
    }

    used.add(i);
    kept.push(bestArticle);
  }

  return kept;
}
