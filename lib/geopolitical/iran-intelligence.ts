// ══════════════════════════════════════════════════════════════
// IRAN INTELLIGENCE ENGINE — SPECTER WAR MODULE
//
// Dedicated intelligence processing for Iran theater:
// - Escalation ladder scoring (diplomatic → nuclear → military)
// - Iran-specific keyword taxonomy (English + Farsi transliteration)
// - Source credibility for Iran-specific outlets
// - IRGC/proxy network mapping
// - Nuclear program milestone tracking
// ══════════════════════════════════════════════════════════════

import type { GeoArticle } from './types';

// ── Escalation Ladder ──
// Each level represents a distinct phase of Iran conflict escalation.
// Markets price these differently — the key is detecting transitions BEFORE the market.

export type EscalationPhase =
  | 'BASELINE'        // Normal diplomatic noise
  | 'DIPLOMATIC_TENSION' // Diplomatic recalls, harsh rhetoric
  | 'SANCTIONS_WAVE'  // New sanctions announced/expanded
  | 'PROXY_ACTIVATION' // Hezbollah/Houthi/militia activity spikes
  | 'MILITARY_POSTURE' // Carrier groups, troop movements, exercises
  | 'NUCLEAR_ESCALATION' // Enrichment breaches, IAEA confrontation
  | 'DIRECT_CONFRONTATION' // Strikes, seizures, direct military action
  | 'WAR_FOOTING';    // Full mobilization, declared hostilities

export interface EscalationState {
  phase: EscalationPhase;
  score: number;           // 0-100 composite
  previousPhase: EscalationPhase | null;
  phaseChangedAt: string | null;
  velocity: number;        // rate of escalation change per hour
  signals: EscalationSignal[];
  nuclearStatus: NuclearStatus;
  proxyActivity: ProxyActivity;
  marketImplications: string[];
}

export interface EscalationSignal {
  type: string;
  source: string;
  weight: number;
  timestamp: string;
  description: string;
}

export interface NuclearStatus {
  enrichmentLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'WEAPONS_GRADE' | 'UNKNOWN';
  iaeaAccess: 'FULL' | 'PARTIAL' | 'DENIED' | 'UNKNOWN';
  breakoutEstimate: string; // e.g., "2 weeks", "3 months", "unknown"
  lastUpdate: string;
  signals: string[];
}

export interface ProxyActivity {
  hezbollah: ActivityLevel;
  houthis: ActivityLevel;
  iraqMilitias: ActivityLevel;
  syriaPresence: ActivityLevel;
  overallThreat: ActivityLevel;
  recentEvents: string[];
}

export type ActivityLevel = 'DORMANT' | 'LOW' | 'ELEVATED' | 'ACTIVE' | 'COMBAT';

// ── Iran-Specific Keywords ──
// Weighted by escalation significance. Higher weight = bigger market impact.

export const IRAN_CRITICAL_KEYWORDS: [string, number, EscalationPhase][] = [
  // Nuclear escalation (highest market impact)
  ['weapons-grade uranium', 25, 'NUCLEAR_ESCALATION'],
  ['90% enrichment', 25, 'NUCLEAR_ESCALATION'],
  ['nuclear weapon', 25, 'NUCLEAR_ESCALATION'],
  ['nuclear test', 30, 'NUCLEAR_ESCALATION'],
  ['nuclear breakout', 25, 'NUCLEAR_ESCALATION'],
  ['uranium enrichment', 18, 'NUCLEAR_ESCALATION'],
  ['enrichment breach', 22, 'NUCLEAR_ESCALATION'],
  ['centrifuge', 16, 'NUCLEAR_ESCALATION'],
  ['fordow', 18, 'NUCLEAR_ESCALATION'],
  ['natanz', 18, 'NUCLEAR_ESCALATION'],
  ['iaea inspectors expelled', 25, 'NUCLEAR_ESCALATION'],
  ['iaea access denied', 22, 'NUCLEAR_ESCALATION'],
  ['jcpoa', 14, 'DIPLOMATIC_TENSION'],
  ['nuclear deal', 14, 'DIPLOMATIC_TENSION'],

  // Direct military confrontation
  ['iran strikes', 28, 'DIRECT_CONFRONTATION'],
  ['iran attack', 26, 'DIRECT_CONFRONTATION'],
  ['iran retaliates', 28, 'DIRECT_CONFRONTATION'],
  ['iran missile launch', 28, 'DIRECT_CONFRONTATION'],
  ['iran drone attack', 26, 'DIRECT_CONFRONTATION'],
  ['strike on iran', 28, 'DIRECT_CONFRONTATION'],
  ['attack on iran', 26, 'DIRECT_CONFRONTATION'],
  ['bombing iran', 30, 'DIRECT_CONFRONTATION'],
  ['iran war', 30, 'WAR_FOOTING'],
  ['war with iran', 30, 'WAR_FOOTING'],
  ['iran mobilization', 22, 'WAR_FOOTING'],
  ['strait of hormuz closed', 28, 'DIRECT_CONFRONTATION'],
  ['hormuz blockade', 26, 'DIRECT_CONFRONTATION'],
  ['persian gulf incident', 20, 'DIRECT_CONFRONTATION'],
  ['tanker seized', 22, 'DIRECT_CONFRONTATION'],
  ['tanker attack', 22, 'DIRECT_CONFRONTATION'],

  // IRGC operations
  ['irgc', 14, 'MILITARY_POSTURE'],
  ['quds force', 16, 'MILITARY_POSTURE'],
  ['revolutionary guard', 14, 'MILITARY_POSTURE'],
  ['irgc commander killed', 26, 'DIRECT_CONFRONTATION'],
  ['irgc designated', 16, 'SANCTIONS_WAVE'],

  // Military posture
  ['carrier group persian gulf', 20, 'MILITARY_POSTURE'],
  ['us forces middle east', 16, 'MILITARY_POSTURE'],
  ['b-52 iran', 18, 'MILITARY_POSTURE'],
  ['military exercise iran', 14, 'MILITARY_POSTURE'],
  ['iran missile test', 18, 'MILITARY_POSTURE'],
  ['iran military drill', 14, 'MILITARY_POSTURE'],
  ['iran air defense', 14, 'MILITARY_POSTURE'],

  // Proxy network
  ['hezbollah iran', 16, 'PROXY_ACTIVATION'],
  ['houthi iran', 16, 'PROXY_ACTIVATION'],
  ['iran proxy', 16, 'PROXY_ACTIVATION'],
  ['axis of resistance', 14, 'PROXY_ACTIVATION'],
  ['iran militia iraq', 16, 'PROXY_ACTIVATION'],
  ['iran syria', 14, 'PROXY_ACTIVATION'],
  ['iran hezbollah missiles', 20, 'PROXY_ACTIVATION'],
  ['houthi red sea', 18, 'PROXY_ACTIVATION'],
  ['houthi ship attack', 20, 'PROXY_ACTIVATION'],

  // Sanctions
  ['iran sanctions', 14, 'SANCTIONS_WAVE'],
  ['iran oil sanctions', 16, 'SANCTIONS_WAVE'],
  ['iran embargo', 16, 'SANCTIONS_WAVE'],
  ['iran oil exports', 12, 'SANCTIONS_WAVE'],
  ['iran bank sanctions', 16, 'SANCTIONS_WAVE'],
  ['iran swift', 18, 'SANCTIONS_WAVE'],
  ['maximum pressure', 14, 'SANCTIONS_WAVE'],

  // Diplomatic
  ['iran nuclear talks', 12, 'DIPLOMATIC_TENSION'],
  ['iran negotiations', 10, 'DIPLOMATIC_TENSION'],
  ['iran diplomat expelled', 14, 'DIPLOMATIC_TENSION'],
  ['iran ambassador recalled', 14, 'DIPLOMATIC_TENSION'],
  ['iran ultimatum', 16, 'DIPLOMATIC_TENSION'],
  ['iran threatens', 14, 'DIPLOMATIC_TENSION'],
  ['khamenei warns', 16, 'DIPLOMATIC_TENSION'],
  ['khamenei', 10, 'DIPLOMATIC_TENSION'],
  ['raisi', 8, 'DIPLOMATIC_TENSION'],
  ['rouhani', 8, 'DIPLOMATIC_TENSION'],
  ['zarif', 8, 'DIPLOMATIC_TENSION'],

  // Oil/Energy impact
  ['iran oil', 10, 'SANCTIONS_WAVE'],
  ['iran crude', 10, 'SANCTIONS_WAVE'],
  ['hormuz strait', 14, 'MILITARY_POSTURE'],
  ['strait of hormuz', 14, 'MILITARY_POSTURE'],
  ['persian gulf tension', 14, 'MILITARY_POSTURE'],

  // Israel-Iran axis
  ['israel iran', 16, 'MILITARY_POSTURE'],
  ['iran israel strike', 24, 'DIRECT_CONFRONTATION'],
  ['israel attacks iran', 26, 'DIRECT_CONFRONTATION'],
  ['iran retaliates israel', 26, 'DIRECT_CONFRONTATION'],
  ['shadow war iran', 14, 'MILITARY_POSTURE'],
  ['mossad iran', 14, 'MILITARY_POSTURE'],
  ['assassination iran', 20, 'DIRECT_CONFRONTATION'],

  // Cyber warfare
  ['iran cyber attack', 16, 'MILITARY_POSTURE'],
  ['stuxnet', 14, 'MILITARY_POSTURE'],
  ['iran hack', 14, 'MILITARY_POSTURE'],
];

// ── Iran-Specific Tag Patterns ──

export const IRAN_TAG_PATTERNS: [RegExp, string][] = [
  // Nuclear program
  [/\b(enrichment|centrifuge|uranium|plutonium)\b/i, 'nuclear-program'],
  [/\b(fordow|natanz|isfahan|arak|bushehr)\b/i, 'nuclear-sites'],
  [/\b(iaea|atomic energy|rafael grossi)\b/i, 'iaea'],
  [/\b(jcpoa|nuclear deal|nuclear agreement)\b/i, 'nuclear-deal'],
  [/\b(breakout|weapons.grade|90.percent)\b/i, 'breakout-risk'],

  // Military/IRGC
  [/\b(irgc|revolutionary guard|pasdaran)\b/i, 'irgc'],
  [/\b(quds force|qods force)\b/i, 'quds-force'],
  [/\b(basij|paramilitary)\b/i, 'basij'],
  [/\b(shahab|fateh|emad|sejjil|khorramshahr)\b/i, 'iran-missiles'],
  [/\b(shahed|mohajer|ababil)\b/i, 'iran-drones'],

  // Proxy network
  [/\b(hezbollah|hizbollah|nasrallah)\b/i, 'hezbollah'],
  [/\b(houthi|ansar.allah)\b/i, 'houthis'],
  [/\b(hashd|pmu|popular.mobilization)\b/i, 'iraq-militias'],
  [/\b(axis.of.resistance)\b/i, 'axis-resistance'],

  // Geography
  [/\b(tehran|isfahan|tabriz|shiraz|mashhad|qom)\b/i, 'iran-cities'],
  [/\b(hormuz|persian.gulf|gulf.of.oman)\b/i, 'hormuz'],
  [/\b(red.sea|bab.el.mandeb|aden)\b/i, 'red-sea'],

  // Leaders
  [/\b(khamenei|supreme.leader)\b/i, 'khamenei'],
  [/\b(raisi|pezeshkian)\b/i, 'iran-president'],
  [/\b(soleimani|qaani)\b/i, 'quds-commanders'],

  // Oil/Economy
  [/\b(iran.oil|iran.crude|iran.exports)\b/i, 'iran-oil'],
  [/\b(iran.sanction|maximum.pressure)\b/i, 'iran-sanctions'],
  [/\b(iran.economy|rial|toman)\b/i, 'iran-economy'],

  // Israel axis
  [/\b(israel.iran|iran.israel)\b/i, 'israel-iran'],
  [/\b(shadow.war|covert.operation)\b/i, 'shadow-war'],
];

// ── Source Credibility for Iran Coverage ──

export interface IranSource {
  name: string;
  country: string;
  credibility: 'TIER1' | 'TIER2' | 'TIER3' | 'PROPAGANDA';
  bias: 'WESTERN' | 'IRANIAN_STATE' | 'GULF' | 'ISRAELI' | 'NEUTRAL';
  speedRating: number; // 1-10 how fast they break Iran news
  notes: string;
}

export const IRAN_SOURCE_CREDIBILITY: Record<string, IranSource> = {
  // Tier 1: Primary intelligence-grade sources
  'reuters': { name: 'Reuters', country: 'UK', credibility: 'TIER1', bias: 'NEUTRAL', speedRating: 9, notes: 'Gold standard for Iran/nuclear' },
  'ap': { name: 'Associated Press', country: 'US', credibility: 'TIER1', bias: 'NEUTRAL', speedRating: 9, notes: 'Reliable wire service' },
  'afp': { name: 'AFP', country: 'France', credibility: 'TIER1', bias: 'NEUTRAL', speedRating: 8, notes: 'Good MENA coverage' },
  'bloomberg': { name: 'Bloomberg', country: 'US', credibility: 'TIER1', bias: 'WESTERN', speedRating: 8, notes: 'Best for sanctions/oil impact' },

  // Tier 2: Strong secondary sources
  'bbc': { name: 'BBC', country: 'UK', credibility: 'TIER2', bias: 'WESTERN', speedRating: 7, notes: 'BBC Persian is excellent' },
  'aljazeera': { name: 'Al Jazeera', country: 'Qatar', credibility: 'TIER2', bias: 'GULF', speedRating: 8, notes: 'Fast MENA coverage, Qatar-biased' },
  'guardian': { name: 'The Guardian', country: 'UK', credibility: 'TIER2', bias: 'WESTERN', speedRating: 6, notes: 'Good analysis, slower breaking' },
  'ft': { name: 'Financial Times', country: 'UK', credibility: 'TIER2', bias: 'WESTERN', speedRating: 7, notes: 'Best for oil/sanctions market impact' },
  'france24': { name: 'France24', country: 'France', credibility: 'TIER2', bias: 'WESTERN', speedRating: 7, notes: 'Good European perspective' },
  'dw': { name: 'Deutsche Welle', country: 'Germany', credibility: 'TIER2', bias: 'WESTERN', speedRating: 6, notes: 'DW Farsi excellent' },

  // Tier 3: Regional/specialized (use with caution)
  'timesofisrael': { name: 'Times of Israel', country: 'Israel', credibility: 'TIER3', bias: 'ISRAELI', speedRating: 9, notes: 'Fastest on Israel-Iran, strong bias' },
  'jpost': { name: 'Jerusalem Post', country: 'Israel', credibility: 'TIER3', bias: 'ISRAELI', speedRating: 8, notes: 'Israeli perspective, fast' },
  'alarabiya': { name: 'Al Arabiya', country: 'UAE', credibility: 'TIER3', bias: 'GULF', speedRating: 7, notes: 'Saudi-aligned, anti-Iran bias' },

  // Propaganda (use ONLY for signal detection, never trust content)
  'presstv': { name: 'Press TV', country: 'Iran', credibility: 'PROPAGANDA', bias: 'IRANIAN_STATE', speedRating: 10, notes: 'Iranian state media — fastest on Iran gov positions' },
  'irna': { name: 'IRNA', country: 'Iran', credibility: 'PROPAGANDA', bias: 'IRANIAN_STATE', speedRating: 10, notes: 'Official news agency — government mouthpiece' },
  'tasnimnews': { name: 'Tasnim', country: 'Iran', credibility: 'PROPAGANDA', bias: 'IRANIAN_STATE', speedRating: 10, notes: 'IRGC-affiliated — military signal source' },
  'fars': { name: 'Fars News', country: 'Iran', credibility: 'PROPAGANDA', bias: 'IRANIAN_STATE', speedRating: 9, notes: 'IRGC-linked, hardliner views' },
  'mehrnews': { name: 'Mehr News', country: 'Iran', credibility: 'PROPAGANDA', bias: 'IRANIAN_STATE', speedRating: 8, notes: 'Semi-official, moderate' },
};

// ── Iran Article Analyzer ──

export interface IranAnalysis {
  isIranRelated: boolean;
  relevanceScore: number;      // 0-100
  escalationPhase: EscalationPhase;
  escalationDelta: number;     // how much this shifts escalation
  iranTags: string[];
  nuclearRelevant: boolean;
  proxyRelevant: boolean;
  oilImpact: boolean;
  sourceCredibility: IranSource | null;
  marketSignals: IranMarketSignal[];
}

export interface IranMarketSignal {
  market: string;              // Polymarket question pattern
  direction: 'YES_UP' | 'YES_DOWN' | 'UNCERTAIN';
  confidence: number;          // 0-1
  reasoning: string;
  timeframe: 'MINUTES' | 'HOURS' | 'DAYS';
}

/**
 * Analyze a single article for Iran intelligence value.
 * Returns detailed analysis including escalation impact and market signals.
 */
export function analyzeIranArticle(article: GeoArticle): IranAnalysis {
  const text = `${article.title} ${article.snippet}`.toLowerCase();

  // Check if Iran-related
  const iranMentions = /\b(iran|iranian|tehran|persian|irgc|quds|khamenei|raisi|pezeshkian|hezbollah.*iran|houthi.*iran|hormuz)\b/i;
  const isIranRelated = iranMentions.test(text) || article.tags.includes('iran');

  if (!isIranRelated) {
    return {
      isIranRelated: false,
      relevanceScore: 0,
      escalationPhase: 'BASELINE',
      escalationDelta: 0,
      iranTags: [],
      nuclearRelevant: false,
      proxyRelevant: false,
      oilImpact: false,
      sourceCredibility: null,
      marketSignals: [],
    };
  }

  // Score relevance and detect escalation phase
  let maxWeight = 0;
  let detectedPhase: EscalationPhase = 'BASELINE';
  let totalWeight = 0;
  let matchCount = 0;

  for (const [keyword, weight, phase] of IRAN_CRITICAL_KEYWORDS) {
    if (text.includes(keyword)) {
      if (weight > maxWeight) {
        maxWeight = weight;
        detectedPhase = phase;
      }
      totalWeight += weight;
      matchCount++;
    }
  }

  // Extract Iran-specific tags
  const iranTags: string[] = [];
  for (const [pattern, tag] of IRAN_TAG_PATTERNS) {
    if (pattern.test(text)) iranTags.push(tag);
  }

  // Detect nuclear relevance
  const nuclearRelevant = iranTags.some(t =>
    t.startsWith('nuclear') || t === 'iaea' || t === 'breakout-risk'
  );

  // Detect proxy activity
  const proxyRelevant = iranTags.some(t =>
    ['hezbollah', 'houthis', 'iraq-militias', 'axis-resistance'].includes(t)
  );

  // Detect oil impact
  const oilImpact = /\b(oil|crude|brent|wti|hormuz|tanker|pipeline|energy)\b/i.test(text);

  // Source credibility
  const sourceDomain = article.domain?.toLowerCase().replace(/^www\./, '') || '';
  const sourceKey = Object.keys(IRAN_SOURCE_CREDIBILITY).find(k =>
    sourceDomain.includes(k)
  );
  const sourceCredibility = sourceKey ? IRAN_SOURCE_CREDIBILITY[sourceKey] : null;

  // Calculate relevance score
  const relevanceScore = Math.min(100,
    maxWeight * 2 +
    Math.min(totalWeight, 40) +
    (matchCount > 1 ? matchCount * 3 : 0) +
    (nuclearRelevant ? 15 : 0) +
    (oilImpact ? 10 : 0) +
    (sourceCredibility?.credibility === 'TIER1' ? 5 : 0)
  );

  // Calculate escalation delta (how much this article shifts the needle)
  const escalationDelta = Math.min(20,
    maxWeight * 0.5 +
    (nuclearRelevant ? 5 : 0) +
    (detectedPhase === 'DIRECT_CONFRONTATION' ? 10 : 0) +
    (detectedPhase === 'WAR_FOOTING' ? 15 : 0)
  );

  // Generate market signals
  const marketSignals = generateIranMarketSignals(text, detectedPhase, iranTags, oilImpact);

  return {
    isIranRelated: true,
    relevanceScore,
    escalationPhase: detectedPhase,
    escalationDelta,
    iranTags,
    nuclearRelevant,
    proxyRelevant,
    oilImpact,
    sourceCredibility,
    marketSignals,
  };
}

/**
 * Generate market signals based on Iran article analysis.
 * Maps geopolitical events to likely Polymarket movements.
 */
function generateIranMarketSignals(
  text: string,
  phase: EscalationPhase,
  tags: string[],
  oilImpact: boolean,
): IranMarketSignal[] {
  const signals: IranMarketSignal[] = [];

  // Nuclear-related signals
  if (tags.some(t => t.startsWith('nuclear') || t === 'iaea' || t === 'breakout-risk')) {
    if (phase === 'NUCLEAR_ESCALATION') {
      signals.push({
        market: 'Iran nuclear weapon',
        direction: 'YES_UP',
        confidence: 0.8,
        reasoning: 'Nuclear escalation increases probability of weapons program',
        timeframe: 'HOURS',
      });
      signals.push({
        market: 'Iran military strike',
        direction: 'YES_UP',
        confidence: 0.6,
        reasoning: 'Nuclear escalation raises preemptive strike probability',
        timeframe: 'DAYS',
      });
    }
    if (/\b(deal|agreement|talks resume|negotiat)\b/.test(text)) {
      signals.push({
        market: 'Iran nuclear deal',
        direction: 'YES_UP',
        confidence: 0.5,
        reasoning: 'Diplomatic engagement suggests deal possibility',
        timeframe: 'DAYS',
      });
    }
  }

  // Military confrontation signals
  if (phase === 'DIRECT_CONFRONTATION' || phase === 'WAR_FOOTING') {
    signals.push({
      market: 'Iran war',
      direction: 'YES_UP',
      confidence: phase === 'WAR_FOOTING' ? 0.9 : 0.7,
      reasoning: `Direct confrontation phase: ${phase}`,
      timeframe: 'MINUTES',
    });
    signals.push({
      market: 'oil price above',
      direction: 'YES_UP',
      confidence: 0.85,
      reasoning: 'Military escalation drives oil spike via Hormuz risk',
      timeframe: 'MINUTES',
    });
  }

  // Proxy activation signals
  if (phase === 'PROXY_ACTIVATION') {
    if (tags.includes('houthis') || tags.includes('red-sea')) {
      signals.push({
        market: 'Red Sea shipping',
        direction: 'YES_UP',
        confidence: 0.7,
        reasoning: 'Houthi activity disrupts Red Sea shipping',
        timeframe: 'HOURS',
      });
    }
    if (tags.includes('hezbollah')) {
      signals.push({
        market: 'Lebanon conflict',
        direction: 'YES_UP',
        confidence: 0.65,
        reasoning: 'Hezbollah activation signals Iran proxy escalation',
        timeframe: 'HOURS',
      });
    }
  }

  // Sanctions signals
  if (phase === 'SANCTIONS_WAVE') {
    signals.push({
      market: 'Iran sanctions',
      direction: 'YES_UP',
      confidence: 0.75,
      reasoning: 'New sanctions wave detected',
      timeframe: 'HOURS',
    });
    if (oilImpact) {
      signals.push({
        market: 'oil price',
        direction: 'YES_UP',
        confidence: 0.6,
        reasoning: 'Oil sanctions reduce supply, push prices up',
        timeframe: 'DAYS',
      });
    }
  }

  // De-escalation signals (contrarian opportunities)
  if (/\b(ceasefire|peace|de-escalat|withdraw|stand down|diplomatic solution)\b/.test(text)) {
    signals.push({
      market: 'Iran war',
      direction: 'YES_DOWN',
      confidence: 0.6,
      reasoning: 'De-escalation signal detected — war probability drops',
      timeframe: 'HOURS',
    });
  }

  return signals;
}

/**
 * Compute the overall Iran escalation state from multiple articles.
 * Aggregates signals across all Iran-related news.
 */
export function computeIranEscalation(
  articles: GeoArticle[],
  previousState?: EscalationState,
): EscalationState {
  const analyses = articles
    .map(a => ({ article: a, analysis: analyzeIranArticle(a) }))
    .filter(x => x.analysis.isIranRelated)
    .sort((a, b) => b.analysis.relevanceScore - a.analysis.relevanceScore);

  if (analyses.length === 0) {
    return {
      phase: 'BASELINE',
      score: 0,
      previousPhase: previousState?.phase || null,
      phaseChangedAt: previousState?.phaseChangedAt || null,
      velocity: 0,
      signals: [],
      nuclearStatus: { enrichmentLevel: 'UNKNOWN', iaeaAccess: 'UNKNOWN', breakoutEstimate: 'unknown', lastUpdate: '', signals: [] },
      proxyActivity: { hezbollah: 'DORMANT', houthis: 'DORMANT', iraqMilitias: 'DORMANT', syriaPresence: 'DORMANT', overallThreat: 'DORMANT', recentEvents: [] },
      marketImplications: [],
    };
  }

  // Aggregate escalation scores
  const now = Date.now();
  let totalScore = 0;
  const phaseVotes = new Map<EscalationPhase, number>();
  const allSignals: EscalationSignal[] = [];
  const allMarketSignals: IranMarketSignal[] = [];
  let nuclearCount = 0;
  let proxyCount = 0;

  for (const { article, analysis } of analyses) {
    // Weight by recency
    const ageMs = now - new Date(article.seenAt).getTime();
    const recencyWeight = ageMs < 15 * 60000 ? 1.0 : ageMs < 60 * 60000 ? 0.7 : ageMs < 3 * 3600000 ? 0.4 : 0.2;

    const weightedScore = analysis.escalationDelta * recencyWeight;
    totalScore += weightedScore;

    // Vote for escalation phase
    const currentVotes = phaseVotes.get(analysis.escalationPhase) || 0;
    phaseVotes.set(analysis.escalationPhase, currentVotes + analysis.relevanceScore * recencyWeight);

    // Collect signals
    if (analysis.relevanceScore > 20) {
      allSignals.push({
        type: analysis.escalationPhase,
        source: article.source,
        weight: analysis.relevanceScore * recencyWeight,
        timestamp: article.seenAt,
        description: article.title,
      });
    }

    allMarketSignals.push(...analysis.marketSignals);
    if (analysis.nuclearRelevant) nuclearCount++;
    if (analysis.proxyRelevant) proxyCount++;
  }

  // Determine dominant phase
  let dominantPhase: EscalationPhase = 'BASELINE';
  let maxVotes = 0;
  for (const [phase, votes] of phaseVotes) {
    if (votes > maxVotes) {
      maxVotes = votes;
      dominantPhase = phase;
    }
  }

  // Escalation score (0-100)
  const PHASE_SCORES: Record<EscalationPhase, number> = {
    'BASELINE': 0,
    'DIPLOMATIC_TENSION': 15,
    'SANCTIONS_WAVE': 30,
    'PROXY_ACTIVATION': 45,
    'MILITARY_POSTURE': 55,
    'NUCLEAR_ESCALATION': 70,
    'DIRECT_CONFRONTATION': 85,
    'WAR_FOOTING': 95,
  };

  const basePhaseScore = PHASE_SCORES[dominantPhase];
  const signalBonus = Math.min(20, totalScore * 0.5);
  const compositeScore = Math.min(100, basePhaseScore + signalBonus);

  // Velocity: compare with previous state
  let velocity = 0;
  if (previousState) {
    const prevTime = previousState.phaseChangedAt
      ? new Date(previousState.phaseChangedAt).getTime()
      : now - 3600000;
    const hoursElapsed = Math.max(0.1, (now - prevTime) / 3600000);
    velocity = (compositeScore - previousState.score) / hoursElapsed;
  }

  // Phase transition detection
  const phaseChanged = previousState && dominantPhase !== previousState.phase;

  // Nuclear status inference
  const nuclearStatus: NuclearStatus = {
    enrichmentLevel: nuclearCount > 3 ? 'HIGH' : nuclearCount > 0 ? 'MEDIUM' : 'UNKNOWN',
    iaeaAccess: analyses.some(x => x.analysis.iranTags.includes('iaea')) ? 'PARTIAL' : 'UNKNOWN',
    breakoutEstimate: 'unknown',
    lastUpdate: new Date().toISOString(),
    signals: analyses
      .filter(x => x.analysis.nuclearRelevant)
      .map(x => x.article.title)
      .slice(0, 5),
  };

  // Proxy activity inference
  const proxyActivity: ProxyActivity = {
    hezbollah: analyses.some(x => x.analysis.iranTags.includes('hezbollah')) ? 'ACTIVE' : 'DORMANT',
    houthis: analyses.some(x => x.analysis.iranTags.includes('houthis')) ? 'ACTIVE' : 'DORMANT',
    iraqMilitias: analyses.some(x => x.analysis.iranTags.includes('iraq-militias')) ? 'ACTIVE' : 'DORMANT',
    syriaPresence: analyses.some(x => x.analysis.iranTags.includes('shadow-war')) ? 'ELEVATED' : 'LOW',
    overallThreat: proxyCount >= 3 ? 'COMBAT' : proxyCount >= 1 ? 'ACTIVE' : 'DORMANT',
    recentEvents: analyses
      .filter(x => x.analysis.proxyRelevant)
      .map(x => x.article.title)
      .slice(0, 5),
  };

  // Deduplicate market implications
  const marketImplications = [...new Set(
    allMarketSignals.map(s => `${s.market}: ${s.direction} (${Math.round(s.confidence * 100)}% conf)`)
  )].slice(0, 10);

  return {
    phase: dominantPhase,
    score: Math.round(compositeScore),
    previousPhase: phaseChanged ? previousState!.phase : previousState?.previousPhase || null,
    phaseChangedAt: phaseChanged ? new Date().toISOString() : previousState?.phaseChangedAt || null,
    velocity: Math.round(velocity * 10) / 10,
    signals: allSignals.slice(0, 20),
    nuclearStatus,
    proxyActivity,
    marketImplications,
  };
}

/**
 * Get escalation phase display config.
 */
export const ESCALATION_CONFIG: Record<EscalationPhase, { label: string; color: string; bg: string; icon: string; description: string }> = {
  BASELINE:              { label: 'BASELINE',         color: 'text-green-400',  bg: 'bg-green-500/10',  icon: '◯', description: 'Normal diplomatic activity' },
  DIPLOMATIC_TENSION:    { label: 'TENSÃO',           color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: '◬', description: 'Diplomatic tension escalating' },
  SANCTIONS_WAVE:        { label: 'SANÇÕES',          color: 'text-orange-400', bg: 'bg-orange-500/10', icon: '⛔', description: 'Sanctions wave in progress' },
  PROXY_ACTIVATION:      { label: 'PROXY ATIVO',     color: 'text-orange-500', bg: 'bg-orange-500/15', icon: '⚡', description: 'Proxy network activated' },
  MILITARY_POSTURE:      { label: 'POSTURA MILITAR',  color: 'text-red-400',    bg: 'bg-red-500/10',    icon: '⚔', description: 'Military positioning detected' },
  NUCLEAR_ESCALATION:    { label: 'NUCLEAR',          color: 'text-red-500',    bg: 'bg-red-500/15',    icon: '☢', description: 'Nuclear program escalation' },
  DIRECT_CONFRONTATION:  { label: 'CONFRONTO',        color: 'text-red-600',    bg: 'bg-red-500/20',    icon: '💥', description: 'Direct military confrontation' },
  WAR_FOOTING:           { label: 'GUERRA',           color: 'text-red-700',    bg: 'bg-red-600/25',    icon: '🔥', description: 'War footing / active hostilities' },
};
