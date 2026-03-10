// ── Geopolitical Dashboard Types ──

export type UrgencyLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface GeoArticle {
  id: string;
  title: string;
  snippet: string; // description/summary extracted from RSS
  url: string;
  source: string;
  sourceCountry: string;
  language: string;
  seenAt: string; // ISO timestamp
  imageUrl: string | null;
  domain: string;
  urgency: UrgencyLevel;
  urgencyScore: number; // 0-100 composite score for fine-grained sorting
}

export interface GeoNewsFeed {
  articles: GeoArticle[];
  fetchedAt: string;
  query: string;
  totalResults: number;
  sourcesHit: string[]; // which sources returned data
  latencyMs: number; // total fetch time
}

export type TribunalVerdict = 'APORTAR' | 'NAO_APORTAR' | 'AGUARDAR';

export interface TribunalResult {
  eventId: string;
  headline: string;
  verdict: TribunalVerdict;
  confidence: number; // 1-10
  impactScore: number; // 1-10
  affectedMarkets: string[];
  timeframe: 'IMEDIATO' | 'CURTO_PRAZO' | 'LONGO_PRAZO';
  justification: string;
  rawResponse: string;
  judgedAt: string;
  // New fields
  riskReward: string; // risk/reward assessment
  catalysts: string[]; // key catalysts identified
  contrarian: string; // contrarian view
}

export interface GeoCategory {
  id: string;
  label: string;
  query: string;
  color: string;
  icon: string;
}

export const GEO_CATEGORIES: GeoCategory[] = [
  { id: 'all', label: 'TODOS', query: 'geopolitics OR war OR sanctions OR conflict OR military OR crisis', color: '#e5e5e5', icon: '◉' },
  { id: 'war', label: 'GUERRA', query: 'war OR military OR invasion OR bombing OR troops OR missile', color: '#ff4444', icon: '⚔' },
  { id: 'sanctions', label: 'SANÇÕES', query: 'sanctions OR embargo OR trade war OR tariff OR ban', color: '#ff8800', icon: '⛔' },
  { id: 'elections', label: 'ELEIÇÕES', query: 'election OR vote OR president OR parliament OR democracy', color: '#4488ff', icon: '🗳' },
  { id: 'economy', label: 'ECONOMIA', query: 'central bank OR interest rate OR inflation OR recession OR GDP OR fed', color: '#00ff41', icon: '📊' },
  { id: 'energy', label: 'ENERGIA', query: 'oil OR gas OR OPEC OR pipeline OR energy crisis OR nuclear energy', color: '#ffcc00', icon: '⚡' },
  { id: 'crypto', label: 'CRYPTO', query: 'bitcoin OR crypto OR regulation OR SEC OR stablecoin OR CBDC', color: '#8b5cf6', icon: '₿' },
  { id: 'diplomacy', label: 'DIPLOMACIA', query: 'summit OR treaty OR UN OR NATO OR G7 OR G20 OR diplomacy OR alliance', color: '#06b6d4', icon: '🤝' },
];

// ── Urgency Scoring (multi-keyword composite) ──

const CRITICAL_KEYWORDS: [string, number][] = [
  ['breaking', 15], ['just in', 14], ['urgent', 14], ['alert', 12],
  ['missile strike', 20], ['nuclear', 18], ['invasion', 18], ['declares war', 20],
  ['attack', 14], ['bombing', 16], ['explosion', 14], ['assassination', 18],
  ['coup', 18], ['martial law', 16], ['state of emergency', 16],
  ['airstrike', 16], ['troops deployed', 14], ['ceasefire broken', 16],
  ['default', 14], ['bank collapse', 16], ['market crash', 16], ['flash crash', 16],
  ['hostage', 14], ['chemical weapon', 20], ['biological weapon', 20],
  ['cyber attack', 14], ['infrastructure attack', 14],
  ['mass casualt', 18], ['genocide', 20], ['ethnic cleansing', 20],
  ['currency collapse', 16], ['hyperinflation', 16],
  ['terrorist', 16], ['terror attack', 18],
  ['pandemic', 14], ['outbreak', 12],
];

const HIGH_KEYWORDS: [string, number][] = [
  ['sanctions', 10], ['embargo', 10], ['military', 8], ['escalation', 10],
  ['conflict', 8], ['crisis', 8], ['threat', 8], ['warning', 8],
  ['deploy', 8], ['strikes', 8], ['casualties', 10], ['killed', 10],
  ['shutdown', 8], ['ban', 6], ['blockade', 10], ['collapse', 10],
  ['plunge', 8], ['surge', 6], ['skyrocket', 8],
  ['interest rate', 8], ['fed cut', 10], ['fed hike', 10],
  ['recession', 10], ['inflation', 8], ['stagflation', 10],
  ['mobilization', 10], ['conscription', 10], ['proxy war', 10],
  ['arms deal', 8], ['weapons', 8], ['warship', 8], ['fighter jet', 8],
  ['drone strike', 10], ['artillery', 8], ['shelling', 10],
  ['refugee', 8], ['humanitarian', 8], ['famine', 10],
  ['blackout', 8], ['power grid', 8], ['pipeline', 6],
  ['indictment', 8], ['impeach', 8], ['arrested', 6],
  ['hack', 8], ['breach', 8], ['ransomware', 8],
  ['downgrade', 8], ['debt crisis', 10], ['bailout', 8],
];

const MEDIUM_KEYWORDS: [string, number][] = [
  ['election', 5], ['vote', 4], ['president', 4], ['parliament', 4],
  ['summit', 5], ['treaty', 5], ['negotiate', 5], ['diplomat', 5],
  ['tariff', 6], ['trade', 4], ['oil', 5], ['opec', 6],
  ['bitcoin', 5], ['crypto', 4], ['regulation', 4], ['sec', 4],
  ['policy', 3], ['reform', 3], ['nato', 5], ['un', 3],
  ['g7', 5], ['g20', 5], ['alliance', 4], ['coalition', 4],
  ['currency', 4], ['gdp', 5], ['unemployment', 5],
  ['supply chain', 5], ['chip', 4], ['semiconductor', 5],
  ['ai regulation', 6], ['antitrust', 5],
];

export function scoreUrgency(title: string): UrgencyLevel {
  const lower = title.toLowerCase();
  const score = computeUrgencyScore(lower);

  if (score >= 14) return 'CRITICAL';
  if (score >= 8) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  return 'LOW';
}

export function computeUrgencyScore(lowerTitle: string): number {
  let maxScore = 0;
  let totalBonus = 0;
  let matchCount = 0;

  for (const [kw, weight] of CRITICAL_KEYWORDS) {
    if (lowerTitle.includes(kw)) {
      maxScore = Math.max(maxScore, weight);
      totalBonus += weight * 0.3;
      matchCount++;
    }
  }
  for (const [kw, weight] of HIGH_KEYWORDS) {
    if (lowerTitle.includes(kw)) {
      maxScore = Math.max(maxScore, weight);
      totalBonus += weight * 0.2;
      matchCount++;
    }
  }
  for (const [kw, weight] of MEDIUM_KEYWORDS) {
    if (lowerTitle.includes(kw)) {
      maxScore = Math.max(maxScore, weight);
      totalBonus += weight * 0.1;
      matchCount++;
    }
  }

  // Multi-keyword bonus: articles matching multiple keywords are more important
  const multiBonus = matchCount > 1 ? Math.min(matchCount * 1.5, 6) : 0;

  return maxScore + multiBonus + Math.min(totalBonus, 8);
}

export const URGENCY_CONFIG: Record<UrgencyLevel, { label: string; color: string; bg: string; border: string; glow: string }> = {
  CRITICAL: { label: 'CRIT', color: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/40', glow: 'shadow-red-500/20' },
  HIGH: { label: 'HIGH', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', glow: 'shadow-orange-500/10' },
  MEDIUM: { label: 'MED', color: 'text-yellow-400', bg: 'bg-yellow-500/5', border: 'border-yellow-500/20', glow: '' },
  LOW: { label: 'LOW', color: 'text-nexzen-muted', bg: 'bg-nexzen-card/40', border: 'border-nexzen-border/30', glow: '' },
};

// ── Title Cleaning ──
// Google News appends " - Source Name" to titles. Strip it.
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*[-–—|]\s*(The )?(New York Times|Washington Post|BBC|CNN|Reuters|AP|Guardian|Al Jazeera|NPR|PBS|NBC|CBS|ABC|Fox News|CNBC|Bloomberg|WSJ|Wall Street Journal|Time Magazine|Politico|The Hill|Forbes|Business Insider|Yahoo|MSN|USA Today|France24|DW|NHK|Sky News|Financial Times|The Economist|Axios|The Atlantic|Vox|Vice News|Daily Mail|South China Morning Post|Times of India|Haaretz|Jerusalem Post|RT|TASS|Nikkei|Kyodo News|Yonhap|Xinhua).*$/i, '')
    .replace(/\s*[-–—|]\s*[A-Z][A-Za-z\s.]{2,30}$/, '') // generic " - Source" pattern
    .trim();
}
