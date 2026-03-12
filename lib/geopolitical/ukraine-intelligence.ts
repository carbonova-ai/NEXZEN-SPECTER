// ══════════════════════════════════════════════════════════════
// UKRAINE INTELLIGENCE ENGINE — SPECTER WAR MODULE
//
// Dedicated intelligence processing for Ukraine theater:
// - Escalation ladder scoring (frozen conflict → NATO involvement)
// - Ukraine-specific keyword taxonomy
// - Frontline dynamics + territorial control
// - Nuclear risk (Zaporizhzhia NPP + Russian doctrine)
// - Western weapons tracking
// - Energy market impact
// ══════════════════════════════════════════════════════════════

import type { GeoArticle } from './types';

// ── Escalation Ladder ──

export type UkraineEscalationPhase =
  | 'FROZEN_CONFLICT'           // Status quo, low-intensity fighting
  | 'DIPLOMATIC_PRESSURE'       // UN resolutions, diplomatic isolation
  | 'SANCTIONS_ESCALATION'      // New Western sanctions on Russia
  | 'FRONTLINE_INTENSIFICATION' // Increased fighting on existing lines
  | 'TERRITORIAL_SHIFT'         // Major land gains/losses
  | 'WEAPONS_ESCALATION'        // New advanced weapons delivered/used
  | 'NUCLEAR_RHETORIC'          // Russian nuclear threats, doctrine changes
  | 'NATO_INVOLVEMENT';         // Direct NATO involvement / Article 5

export interface UkraineEscalationState {
  phase: UkraineEscalationPhase;
  score: number;
  previousPhase: UkraineEscalationPhase | null;
  phaseChangedAt: string | null;
  velocity: number;
  signals: UkraineEscalationSignal[];
  nuclearRisk: UkraineNuclearRisk;
  frontlineStatus: FrontlineStatus;
  marketImplications: string[];
}

export interface UkraineEscalationSignal {
  type: string;
  source: string;
  weight: number;
  timestamp: string;
  description: string;
}

export interface UkraineNuclearRisk {
  level: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
  zaporizhzhiaNPP: 'STABLE' | 'CONTESTED' | 'SHELLING' | 'CRITICAL';
  russianDoctrine: 'STANDARD' | 'LOWERED_THRESHOLD' | 'TACTICAL_THREATENED' | 'UNKNOWN';
  lastUpdate: string;
  signals: string[];
}

export interface FrontlineStatus {
  overallMomentum: 'UKRAINE_ADVANCING' | 'RUSSIA_ADVANCING' | 'STALEMATE' | 'UNKNOWN';
  keyFronts: FrontStatus[];
  recentEvents: string[];
}

export interface FrontStatus {
  name: string;
  status: 'ACTIVE_COMBAT' | 'SHELLING' | 'PROBING' | 'QUIET';
  momentum: 'UKRAINE' | 'RUSSIA' | 'CONTESTED';
}

// ── Ukraine-Specific Keywords ──

export const UKRAINE_CRITICAL_KEYWORDS: [string, number, UkraineEscalationPhase][] = [
  // NATO involvement (highest escalation)
  ['nato article 5', 30, 'NATO_INVOLVEMENT'],
  ['nato intervenes', 28, 'NATO_INVOLVEMENT'],
  ['nato troops ukraine', 28, 'NATO_INVOLVEMENT'],
  ['nato no-fly zone', 26, 'NATO_INVOLVEMENT'],
  ['nato direct involvement', 28, 'NATO_INVOLVEMENT'],
  ['poland ukraine border incident', 22, 'NATO_INVOLVEMENT'],

  // Nuclear rhetoric/risk
  ['russia nuclear', 26, 'NUCLEAR_RHETORIC'],
  ['tactical nuclear', 28, 'NUCLEAR_RHETORIC'],
  ['nuclear doctrine', 24, 'NUCLEAR_RHETORIC'],
  ['nuclear escalation', 26, 'NUCLEAR_RHETORIC'],
  ['zaporizhzhia nuclear', 22, 'NUCLEAR_RHETORIC'],
  ['nuclear plant shelling', 24, 'NUCLEAR_RHETORIC'],
  ['putin nuclear threat', 26, 'NUCLEAR_RHETORIC'],
  ['nuclear warning', 22, 'NUCLEAR_RHETORIC'],
  ['dirty bomb', 24, 'NUCLEAR_RHETORIC'],

  // Weapons escalation
  ['f-16 ukraine', 20, 'WEAPONS_ESCALATION'],
  ['atacms ukraine', 20, 'WEAPONS_ESCALATION'],
  ['storm shadow', 18, 'WEAPONS_ESCALATION'],
  ['scalp missile', 18, 'WEAPONS_ESCALATION'],
  ['taurus missile', 18, 'WEAPONS_ESCALATION'],
  ['himars', 16, 'WEAPONS_ESCALATION'],
  ['patriot ukraine', 18, 'WEAPONS_ESCALATION'],
  ['leopard tank', 16, 'WEAPONS_ESCALATION'],
  ['abrams ukraine', 16, 'WEAPONS_ESCALATION'],
  ['long-range missiles ukraine', 22, 'WEAPONS_ESCALATION'],
  ['weapons package ukraine', 14, 'WEAPONS_ESCALATION'],
  ['arms delivery ukraine', 14, 'WEAPONS_ESCALATION'],
  ['cluster munitions', 18, 'WEAPONS_ESCALATION'],
  ['depleted uranium', 16, 'WEAPONS_ESCALATION'],

  // Territorial shifts
  ['ukraine counteroffensive', 22, 'TERRITORIAL_SHIFT'],
  ['russia offensive', 22, 'TERRITORIAL_SHIFT'],
  ['crimea attack', 20, 'TERRITORIAL_SHIFT'],
  ['crimea bridge', 20, 'TERRITORIAL_SHIFT'],
  ['kerch bridge', 20, 'TERRITORIAL_SHIFT'],
  ['ukraine recaptures', 22, 'TERRITORIAL_SHIFT'],
  ['russia captures', 22, 'TERRITORIAL_SHIFT'],
  ['bakhmut', 16, 'TERRITORIAL_SHIFT'],
  ['avdiivka', 16, 'TERRITORIAL_SHIFT'],
  ['pokrovsk', 16, 'TERRITORIAL_SHIFT'],
  ['tokmak', 14, 'TERRITORIAL_SHIFT'],
  ['kursk incursion', 22, 'TERRITORIAL_SHIFT'],
  ['kursk ukraine', 20, 'TERRITORIAL_SHIFT'],
  ['kherson', 14, 'TERRITORIAL_SHIFT'],
  ['zaporizhzhia front', 16, 'TERRITORIAL_SHIFT'],
  ['breakthrough', 20, 'TERRITORIAL_SHIFT'],
  ['encirclement', 20, 'TERRITORIAL_SHIFT'],

  // Frontline intensification
  ['ukraine front', 14, 'FRONTLINE_INTENSIFICATION'],
  ['donbas fighting', 14, 'FRONTLINE_INTENSIFICATION'],
  ['donetsk battle', 14, 'FRONTLINE_INTENSIFICATION'],
  ['luhansk', 12, 'FRONTLINE_INTENSIFICATION'],
  ['shelling ukraine', 14, 'FRONTLINE_INTENSIFICATION'],
  ['artillery barrage', 14, 'FRONTLINE_INTENSIFICATION'],
  ['drone strike ukraine', 16, 'FRONTLINE_INTENSIFICATION'],
  ['shahed drone', 14, 'FRONTLINE_INTENSIFICATION'],
  ['missile strike ukraine', 18, 'FRONTLINE_INTENSIFICATION'],
  ['ukraine casualties', 16, 'FRONTLINE_INTENSIFICATION'],
  ['russia casualties', 16, 'FRONTLINE_INTENSIFICATION'],

  // Sanctions escalation
  ['russia sanctions', 14, 'SANCTIONS_ESCALATION'],
  ['sanctions package', 14, 'SANCTIONS_ESCALATION'],
  ['oil price cap', 16, 'SANCTIONS_ESCALATION'],
  ['russian oil ban', 16, 'SANCTIONS_ESCALATION'],
  ['russia swift', 18, 'SANCTIONS_ESCALATION'],
  ['russian assets frozen', 16, 'SANCTIONS_ESCALATION'],
  ['sanctions evasion', 12, 'SANCTIONS_ESCALATION'],

  // Diplomatic
  ['peace talks ukraine', 12, 'DIPLOMATIC_PRESSURE'],
  ['ukraine ceasefire', 14, 'DIPLOMATIC_PRESSURE'],
  ['zelensky peace', 12, 'DIPLOMATIC_PRESSURE'],
  ['ukraine negotiations', 10, 'DIPLOMATIC_PRESSURE'],
  ['peace summit', 12, 'DIPLOMATIC_PRESSURE'],
  ['china mediation', 12, 'DIPLOMATIC_PRESSURE'],
  ['grain deal', 10, 'DIPLOMATIC_PRESSURE'],
  ['prisoner exchange', 10, 'DIPLOMATIC_PRESSURE'],

  // Russian mobilization
  ['russia mobilization', 20, 'FRONTLINE_INTENSIFICATION'],
  ['russian conscription', 18, 'FRONTLINE_INTENSIFICATION'],
  ['wagner', 14, 'FRONTLINE_INTENSIFICATION'],
  ['prigozhin', 14, 'FRONTLINE_INTENSIFICATION'],
  ['shoigu', 10, 'FRONTLINE_INTENSIFICATION'],
  ['gerasimov', 10, 'FRONTLINE_INTENSIFICATION'],
  ['russia reserves', 14, 'FRONTLINE_INTENSIFICATION'],

  // Leaders
  ['zelensky', 8, 'DIPLOMATIC_PRESSURE'],
  ['putin ukraine', 10, 'DIPLOMATIC_PRESSURE'],
  ['syrskyi', 10, 'FRONTLINE_INTENSIFICATION'],
  ['budanov', 10, 'FRONTLINE_INTENSIFICATION'],
  ['zaluzhny', 10, 'FRONTLINE_INTENSIFICATION'],

  // Energy
  ['nord stream', 14, 'SANCTIONS_ESCALATION'],
  ['gas pipeline', 10, 'SANCTIONS_ESCALATION'],
  ['ukraine energy', 12, 'FRONTLINE_INTENSIFICATION'],
  ['ukraine power grid', 14, 'FRONTLINE_INTENSIFICATION'],
  ['russia gas europe', 12, 'SANCTIONS_ESCALATION'],
];

// ── Ukraine-Specific Tag Patterns ──

export const UKRAINE_TAG_PATTERNS: [RegExp, string][] = [
  // Fronts
  [/\b(donbas|donetsk|luhansk|donets?k)\b/i, 'donbas'],
  [/\b(crimea|sevastopol|kerch)\b/i, 'crimea'],
  [/\b(zaporizhzhia|zaporozhye)\b/i, 'zaporizhzhia'],
  [/\b(kherson)\b/i, 'kherson'],
  [/\b(bakhmut|chasiv yar)\b/i, 'bakhmut'],
  [/\b(avdiivka|pokrovsk|vuhledar)\b/i, 'donetsk-front'],
  [/\b(kursk)\b/i, 'kursk'],
  [/\b(kharkiv)\b/i, 'kharkiv'],

  // Military
  [/\b(himars|patriot|f.16|atacms|storm.shadow|taurus)\b/i, 'western-weapons'],
  [/\b(leopard|abrams|challenger|bradley)\b/i, 'western-armor'],
  [/\b(shahed|lancet|geran)\b/i, 'russian-drones'],
  [/\b(iskander|kalibr|kinzhal|zircon)\b/i, 'russian-missiles'],
  [/\b(wagner|pmc)\b/i, 'wagner'],
  [/\b(azov|aidar)\b/i, 'ukraine-forces'],
  [/\b(vdv|spetsnaz)\b/i, 'russian-forces'],

  // Nuclear
  [/\b(zaporizhzhia.*nuclear|nuclear.*plant|npp)\b/i, 'nuclear-plant'],
  [/\b(tactical.*nuclear|nuclear.*weapon|nuclear.*doctrine)\b/i, 'nuclear-threat'],

  // Organizations
  [/\b(nato)\b/i, 'nato'],
  [/\b(eu|european.union)\b/i, 'eu'],
  [/\b(iaea)\b/i, 'iaea'],
  [/\b(isw|institute.*study.*war)\b/i, 'isw'],

  // Leaders
  [/\b(zelensky|zelenskyy)\b/i, 'zelensky'],
  [/\b(putin)\b/i, 'putin'],
  [/\b(shoigu|gerasimov)\b/i, 'russian-mil-leaders'],
  [/\b(syrskyi|budanov|zaluzhny)\b/i, 'ukraine-mil-leaders'],

  // Energy/Economy
  [/\b(nord.stream|gas.pipeline)\b/i, 'energy-infrastructure'],
  [/\b(grain.deal|black.sea.grain)\b/i, 'grain'],
  [/\b(oil.cap|price.cap)\b/i, 'sanctions-oil'],
];

// ── Source Credibility ──

export const UKRAINE_SOURCE_CREDIBILITY: Record<string, {
  name: string; country: string;
  credibility: 'TIER1' | 'TIER2' | 'TIER3' | 'PROPAGANDA';
  bias: 'WESTERN' | 'UKRAINIAN' | 'RUSSIAN_STATE' | 'NEUTRAL' | 'OSINT';
  speedRating: number;
}> = {
  'reuters': { name: 'Reuters', country: 'UK', credibility: 'TIER1', bias: 'NEUTRAL', speedRating: 9 },
  'bbc': { name: 'BBC', country: 'UK', credibility: 'TIER1', bias: 'WESTERN', speedRating: 8 },
  'guardian': { name: 'Guardian', country: 'UK', credibility: 'TIER1', bias: 'WESTERN', speedRating: 7 },
  'understandingwar': { name: 'ISW', country: 'US', credibility: 'TIER1', bias: 'WESTERN', speedRating: 6 },
  'ukrinform': { name: 'Ukrinform', country: 'Ukraine', credibility: 'TIER2', bias: 'UKRAINIAN', speedRating: 9 },
  'kyivindependent': { name: 'Kyiv Independent', country: 'Ukraine', credibility: 'TIER2', bias: 'UKRAINIAN', speedRating: 9 },
  'pravda': { name: 'Ukrayinska Pravda', country: 'Ukraine', credibility: 'TIER2', bias: 'UKRAINIAN', speedRating: 9 },
  'aljazeera': { name: 'Al Jazeera', country: 'Qatar', credibility: 'TIER2', bias: 'NEUTRAL', speedRating: 8 },
  'france24': { name: 'France24', country: 'France', credibility: 'TIER2', bias: 'WESTERN', speedRating: 7 },
  'rt': { name: 'RT', country: 'Russia', credibility: 'PROPAGANDA', bias: 'RUSSIAN_STATE', speedRating: 10 },
  'tass': { name: 'TASS', country: 'Russia', credibility: 'PROPAGANDA', bias: 'RUSSIAN_STATE', speedRating: 10 },
};

// ── Ukraine Article Analyzer ──

export interface UkraineAnalysis {
  isUkraineRelated: boolean;
  relevanceScore: number;
  escalationPhase: UkraineEscalationPhase;
  escalationDelta: number;
  ukraineTags: string[];
  nuclearRelevant: boolean;
  weaponsRelevant: boolean;
  frontlineRelevant: boolean;
  energyImpact: boolean;
  sourceCredibility: typeof UKRAINE_SOURCE_CREDIBILITY[string] | null;
  marketSignals: UkraineMarketSignal[];
}

export interface UkraineMarketSignal {
  market: string;
  direction: 'YES_UP' | 'YES_DOWN' | 'UNCERTAIN';
  confidence: number;
  reasoning: string;
  timeframe: 'MINUTES' | 'HOURS' | 'DAYS';
}

export function analyzeUkraineArticle(article: GeoArticle): UkraineAnalysis {
  const text = `${article.title} ${article.snippet}`.toLowerCase();

  const ukraineMentions = /\b(ukraine|ukrainian|kyiv|kiev|donbas|donetsk|crimea|zelensky|zaporizhzhia|kherson|luhansk|bakhmut|kursk.*incursion)\b/i;
  const isUkraineRelated = ukraineMentions.test(text) || article.tags.includes('ukraine');

  if (!isUkraineRelated) {
    return {
      isUkraineRelated: false, relevanceScore: 0, escalationPhase: 'FROZEN_CONFLICT',
      escalationDelta: 0, ukraineTags: [], nuclearRelevant: false, weaponsRelevant: false,
      frontlineRelevant: false, energyImpact: false, sourceCredibility: null, marketSignals: [],
    };
  }

  let maxWeight = 0;
  let detectedPhase: UkraineEscalationPhase = 'FROZEN_CONFLICT';
  let totalWeight = 0;
  let matchCount = 0;

  for (const [keyword, weight, phase] of UKRAINE_CRITICAL_KEYWORDS) {
    if (text.includes(keyword)) {
      if (weight > maxWeight) {
        maxWeight = weight;
        detectedPhase = phase;
      }
      totalWeight += weight;
      matchCount++;
    }
  }

  const ukraineTags: string[] = [];
  for (const [pattern, tag] of UKRAINE_TAG_PATTERNS) {
    if (pattern.test(text)) ukraineTags.push(tag);
  }

  const nuclearRelevant = ukraineTags.some(t => t.startsWith('nuclear'));
  const weaponsRelevant = ukraineTags.some(t => t.startsWith('western-') || t.startsWith('russian-'));
  const frontlineRelevant = ukraineTags.some(t =>
    ['donbas', 'crimea', 'zaporizhzhia', 'kherson', 'bakhmut', 'donetsk-front', 'kursk', 'kharkiv'].includes(t)
  );
  const energyImpact = /\b(gas|pipeline|nord stream|grain|energy|power grid|blackout)\b/i.test(text);

  const sourceDomain = article.domain?.toLowerCase().replace(/^www\./, '') || '';
  const sourceKey = Object.keys(UKRAINE_SOURCE_CREDIBILITY).find(k => sourceDomain.includes(k));
  const sourceCredibility = sourceKey ? UKRAINE_SOURCE_CREDIBILITY[sourceKey] : null;

  const relevanceScore = Math.min(100,
    maxWeight * 2 +
    Math.min(totalWeight, 40) +
    (matchCount > 1 ? matchCount * 3 : 0) +
    (nuclearRelevant ? 15 : 0) +
    (weaponsRelevant ? 10 : 0) +
    (sourceCredibility?.credibility === 'TIER1' ? 5 : 0)
  );

  const escalationDelta = Math.min(20,
    maxWeight * 0.5 +
    (nuclearRelevant ? 8 : 0) +
    (detectedPhase === 'NATO_INVOLVEMENT' ? 15 : 0) +
    (detectedPhase === 'NUCLEAR_RHETORIC' ? 10 : 0)
  );

  const marketSignals = generateUkraineMarketSignals(text, detectedPhase, ukraineTags, energyImpact);

  return {
    isUkraineRelated: true, relevanceScore, escalationPhase: detectedPhase,
    escalationDelta, ukraineTags, nuclearRelevant, weaponsRelevant,
    frontlineRelevant, energyImpact, sourceCredibility, marketSignals,
  };
}

function generateUkraineMarketSignals(
  text: string,
  phase: UkraineEscalationPhase,
  tags: string[],
  energyImpact: boolean,
): UkraineMarketSignal[] {
  const signals: UkraineMarketSignal[] = [];

  if (phase === 'NATO_INVOLVEMENT') {
    signals.push({
      market: 'NATO Ukraine', direction: 'YES_UP', confidence: 0.85,
      reasoning: 'NATO involvement signals detected', timeframe: 'MINUTES',
    });
    signals.push({
      market: 'World War', direction: 'YES_UP', confidence: 0.6,
      reasoning: 'NATO involvement raises global conflict risk', timeframe: 'HOURS',
    });
  }

  if (phase === 'NUCLEAR_RHETORIC') {
    signals.push({
      market: 'nuclear weapon used', direction: 'YES_UP', confidence: 0.7,
      reasoning: 'Nuclear rhetoric/doctrine change detected', timeframe: 'HOURS',
    });
    if (tags.includes('nuclear-plant')) {
      signals.push({
        market: 'nuclear incident', direction: 'YES_UP', confidence: 0.65,
        reasoning: 'Zaporizhzhia NPP threat elevated', timeframe: 'HOURS',
      });
    }
  }

  if (phase === 'TERRITORIAL_SHIFT') {
    signals.push({
      market: 'Ukraine territory', direction: text.includes('recapture') || text.includes('counteroffensive') ? 'YES_UP' : 'YES_DOWN',
      confidence: 0.6, reasoning: `Territorial shift: ${tags.filter(t => ['crimea', 'donbas', 'kursk', 'kherson'].includes(t)).join(', ')}`,
      timeframe: 'DAYS',
    });
  }

  if (phase === 'WEAPONS_ESCALATION') {
    signals.push({
      market: 'Ukraine war', direction: 'YES_UP', confidence: 0.5,
      reasoning: 'Major weapons delivery/escalation', timeframe: 'DAYS',
    });
  }

  if (energyImpact) {
    signals.push({
      market: 'gas price', direction: 'YES_UP', confidence: 0.6,
      reasoning: 'Energy infrastructure affected', timeframe: 'HOURS',
    });
  }

  if (/\b(ceasefire|peace|de-escalat|withdraw|negotiations)\b/.test(text)) {
    signals.push({
      market: 'Ukraine ceasefire', direction: 'YES_UP', confidence: 0.5,
      reasoning: 'De-escalation signal detected', timeframe: 'DAYS',
    });
  }

  return signals;
}

export function computeUkraineEscalation(
  articles: GeoArticle[],
  previousState?: UkraineEscalationState,
): UkraineEscalationState {
  const analyses = articles
    .map(a => ({ article: a, analysis: analyzeUkraineArticle(a) }))
    .filter(x => x.analysis.isUkraineRelated)
    .sort((a, b) => b.analysis.relevanceScore - a.analysis.relevanceScore);

  if (analyses.length === 0) {
    return {
      phase: 'FROZEN_CONFLICT', score: 0,
      previousPhase: previousState?.phase || null,
      phaseChangedAt: previousState?.phaseChangedAt || null,
      velocity: 0, signals: [],
      nuclearRisk: { level: 'LOW', zaporizhzhiaNPP: 'STABLE', russianDoctrine: 'UNKNOWN', lastUpdate: '', signals: [] },
      frontlineStatus: { overallMomentum: 'UNKNOWN', keyFronts: [], recentEvents: [] },
      marketImplications: [],
    };
  }

  const now = Date.now();
  let totalScore = 0;
  const phaseVotes = new Map<UkraineEscalationPhase, number>();
  const allSignals: UkraineEscalationSignal[] = [];
  const allMarketSignals: UkraineMarketSignal[] = [];
  let nuclearCount = 0;

  for (const { article, analysis } of analyses) {
    const ageMs = now - new Date(article.seenAt).getTime();
    const recencyWeight = ageMs < 15 * 60000 ? 1.0 : ageMs < 60 * 60000 ? 0.7 : ageMs < 3 * 3600000 ? 0.4 : 0.2;

    totalScore += analysis.escalationDelta * recencyWeight;
    const currentVotes = phaseVotes.get(analysis.escalationPhase) || 0;
    phaseVotes.set(analysis.escalationPhase, currentVotes + analysis.relevanceScore * recencyWeight);

    if (analysis.relevanceScore > 20) {
      allSignals.push({
        type: analysis.escalationPhase, source: article.source,
        weight: analysis.relevanceScore * recencyWeight,
        timestamp: article.seenAt, description: article.title,
      });
    }

    allMarketSignals.push(...analysis.marketSignals);
    if (analysis.nuclearRelevant) nuclearCount++;
  }

  let dominantPhase: UkraineEscalationPhase = 'FROZEN_CONFLICT';
  let maxVotes = 0;
  for (const [phase, votes] of phaseVotes) {
    if (votes > maxVotes) { maxVotes = votes; dominantPhase = phase; }
  }

  const PHASE_SCORES: Record<UkraineEscalationPhase, number> = {
    'FROZEN_CONFLICT': 0, 'DIPLOMATIC_PRESSURE': 15, 'SANCTIONS_ESCALATION': 30,
    'FRONTLINE_INTENSIFICATION': 45, 'TERRITORIAL_SHIFT': 60,
    'WEAPONS_ESCALATION': 70, 'NUCLEAR_RHETORIC': 85, 'NATO_INVOLVEMENT': 95,
  };

  const basePhaseScore = PHASE_SCORES[dominantPhase];
  const signalBonus = Math.min(20, totalScore * 0.5);
  const compositeScore = Math.min(100, basePhaseScore + signalBonus);

  let velocity = 0;
  if (previousState) {
    const prevTime = previousState.phaseChangedAt
      ? new Date(previousState.phaseChangedAt).getTime() : now - 3600000;
    const hoursElapsed = Math.max(0.1, (now - prevTime) / 3600000);
    velocity = (compositeScore - previousState.score) / hoursElapsed;
  }

  const phaseChanged = previousState && dominantPhase !== previousState.phase;

  const nuclearRisk: UkraineNuclearRisk = {
    level: nuclearCount > 3 ? 'HIGH' : nuclearCount > 1 ? 'ELEVATED' : nuclearCount > 0 ? 'MODERATE' : 'LOW',
    zaporizhzhiaNPP: analyses.some(x => x.analysis.ukraineTags.includes('nuclear-plant')) ? 'CONTESTED' : 'STABLE',
    russianDoctrine: analyses.some(x => x.analysis.ukraineTags.includes('nuclear-threat')) ? 'LOWERED_THRESHOLD' : 'STANDARD',
    lastUpdate: new Date().toISOString(),
    signals: analyses.filter(x => x.analysis.nuclearRelevant).map(x => x.article.title).slice(0, 5),
  };

  // Frontline status inference
  const frontRelevant = analyses.filter(x => x.analysis.frontlineRelevant);
  const ukraineAdvancing = frontRelevant.some(x =>
    /\b(recapture|liberat|counteroffensive|ukraine advance|ukraine push)\b/i.test(x.article.title)
  );
  const russiaAdvancing = frontRelevant.some(x =>
    /\b(russia capture|russia advance|russia push|falls to russia)\b/i.test(x.article.title)
  );

  const frontlineStatus: FrontlineStatus = {
    overallMomentum: ukraineAdvancing && !russiaAdvancing ? 'UKRAINE_ADVANCING'
      : russiaAdvancing && !ukraineAdvancing ? 'RUSSIA_ADVANCING'
      : frontRelevant.length > 0 ? 'STALEMATE' : 'UNKNOWN',
    keyFronts: [
      { name: 'Donbas', status: analyses.some(x => x.analysis.ukraineTags.includes('donbas')) ? 'ACTIVE_COMBAT' : 'QUIET', momentum: 'CONTESTED' },
      { name: 'Zaporizhzhia', status: analyses.some(x => x.analysis.ukraineTags.includes('zaporizhzhia')) ? 'ACTIVE_COMBAT' : 'QUIET', momentum: 'CONTESTED' },
      { name: 'Kherson', status: analyses.some(x => x.analysis.ukraineTags.includes('kherson')) ? 'SHELLING' : 'QUIET', momentum: 'CONTESTED' },
      { name: 'Kursk', status: analyses.some(x => x.analysis.ukraineTags.includes('kursk')) ? 'ACTIVE_COMBAT' : 'QUIET', momentum: 'UKRAINE' },
    ],
    recentEvents: frontRelevant.map(x => x.article.title).slice(0, 5),
  };

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
    nuclearRisk,
    frontlineStatus,
    marketImplications,
  };
}

export const UKRAINE_ESCALATION_CONFIG: Record<UkraineEscalationPhase, { label: string; color: string; bg: string; icon: string; description: string }> = {
  FROZEN_CONFLICT:           { label: 'CONGELADO',    color: 'text-blue-400',   bg: 'bg-blue-500/10',   icon: '❄', description: 'Low-intensity status quo' },
  DIPLOMATIC_PRESSURE:       { label: 'DIPLOMACIA',   color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   icon: '🤝', description: 'Diplomatic pressure active' },
  SANCTIONS_ESCALATION:      { label: 'SANÇÕES',      color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: '⛔', description: 'Sanctions escalating' },
  FRONTLINE_INTENSIFICATION: { label: 'FRONTLINE',    color: 'text-orange-400', bg: 'bg-orange-500/10', icon: '⚔', description: 'Frontline fighting intensifying' },
  TERRITORIAL_SHIFT:         { label: 'TERRITORIAL',  color: 'text-orange-500', bg: 'bg-orange-500/15', icon: '🗺', description: 'Major territorial changes' },
  WEAPONS_ESCALATION:        { label: 'ARMAMENTO',    color: 'text-red-400',    bg: 'bg-red-500/10',    icon: '🚀', description: 'Weapons escalation' },
  NUCLEAR_RHETORIC:          { label: 'NUCLEAR',      color: 'text-red-500',    bg: 'bg-red-500/15',    icon: '☢', description: 'Nuclear rhetoric elevated' },
  NATO_INVOLVEMENT:          { label: 'NATO',         color: 'text-red-600',    bg: 'bg-red-500/20',    icon: '🛡', description: 'NATO involvement risk' },
};
