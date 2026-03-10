// ── Geopolitical Threat Level Calculator ──
// Computes a DEFCON-style composite threat level from all articles.
// Considers: urgency distribution, keyword density, recency, velocity of events.

import type { GeoArticle, ThreatLevel, ThreatSeverity } from './types';

/** Compute the composite geopolitical threat level from articles */
export function computeThreatLevel(
  articles: GeoArticle[],
  prevThreatScore?: number,
): ThreatLevel {
  if (articles.length === 0) {
    return {
      severity: 'STABLE',
      score: 0,
      dominantCategory: 'none',
      activeHotspots: [],
      trend: 'stable',
      summary: 'Nenhum evento monitorado',
    };
  }

  const now = Date.now();

  // ── 1. Urgency Distribution Score (0-40 points) ──
  let criticals = 0, highs = 0, mediums = 0;
  for (const a of articles) {
    // Weight by recency: events < 30min are 100%, < 2h are 60%, older are 30%
    const ageMs = now - new Date(a.seenAt).getTime();
    const recencyWeight = ageMs < 30 * 60000 ? 1.0 : ageMs < 2 * 3600000 ? 0.6 : 0.3;

    if (a.urgency === 'CRITICAL') criticals += recencyWeight;
    else if (a.urgency === 'HIGH') highs += recencyWeight;
    else if (a.urgency === 'MEDIUM') mediums += recencyWeight;
  }

  const urgencyScore = Math.min(40,
    criticals * 12 + highs * 4 + mediums * 1
  );

  // ── 2. Event Velocity (0-20 points) ──
  // How many articles in the last 30 minutes? Spike = escalation
  const recentArticles = articles.filter(a =>
    now - new Date(a.seenAt).getTime() < 30 * 60000
  ).length;
  const velocityScore = Math.min(20, recentArticles * 2);

  // ── 3. Topic Concentration (0-20 points) ──
  // If many articles share the same tags, it's a developing crisis
  const tagCounts = new Map<string, number>();
  for (const a of articles) {
    for (const t of a.tags) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }
  const maxTagCount = tagCounts.size > 0 ? Math.max(...tagCounts.values()) : 0;
  const concentrationScore = Math.min(20,
    maxTagCount >= 10 ? 20 : maxTagCount >= 5 ? 12 : maxTagCount >= 3 ? 6 : 0
  );

  // ── 4. Average Urgency Score Bonus (0-20 points) ──
  const topArticles = articles.slice(0, 20);
  const avgUrgency = topArticles.reduce((s, a) => s + a.urgencyScore, 0) / topArticles.length;
  const avgBonus = Math.min(20, avgUrgency * 1.2);

  // ── Composite ──
  const totalScore = Math.min(100, urgencyScore + velocityScore + concentrationScore + avgBonus);

  // Determine severity
  let severity: ThreatSeverity;
  if (totalScore >= 75) severity = 'CRITICAL';
  else if (totalScore >= 55) severity = 'SEVERE';
  else if (totalScore >= 35) severity = 'HIGH';
  else if (totalScore >= 15) severity = 'ELEVATED';
  else severity = 'STABLE';

  // Dominant category (most frequent tag)
  const dominantTag = tagCounts.size > 0
    ? [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    : 'none';

  // Active hotspots (tags with 3+ articles)
  const hotspots = [...tagCounts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  // Trend detection
  let trend: ThreatLevel['trend'] = 'stable';
  if (prevThreatScore !== undefined) {
    const diff = totalScore - prevThreatScore;
    if (diff > 5) trend = 'escalating';
    else if (diff < -5) trend = 'de-escalating';
  }

  // Generate summary
  const summary = generateSummary(severity, criticals, hotspots, recentArticles);

  return {
    severity,
    score: Math.round(totalScore),
    dominantCategory: dominantTag,
    activeHotspots: hotspots,
    trend,
    summary,
  };
}

function generateSummary(
  severity: ThreatSeverity,
  criticals: number,
  hotspots: string[],
  recentCount: number,
): string {
  if (severity === 'CRITICAL') {
    return `ALERTA MAXIMO: ${Math.ceil(criticals)} evento(s) critico(s). Hotspots: ${hotspots.slice(0, 3).join(', ') || 'multiplos'}. ${recentCount} eventos nos ultimos 30min.`;
  }
  if (severity === 'SEVERE') {
    return `Tensao elevada: ${hotspots.slice(0, 3).join(', ') || 'multiplas regioes'}. Monitorar escalada.`;
  }
  if (severity === 'HIGH') {
    return `Atividade acima do normal em ${hotspots.slice(0, 2).join(', ') || 'varias regioes'}.`;
  }
  if (severity === 'ELEVATED') {
    return `Atividade geopolitica leve. ${hotspots.length > 0 ? `Foco: ${hotspots[0]}` : 'Sem hotspots definidos'}.`;
  }
  return 'Cenario geopolitico estavel. Sem eventos criticos.';
}
