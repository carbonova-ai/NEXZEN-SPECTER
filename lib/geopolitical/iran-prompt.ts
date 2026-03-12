// ══════════════════════════════════════════════════════════════
// IRAN TRIBUNAL PROMPT — Specialized Geopolitical Analysis
//
// Enhanced prompt system for Iran-specific intelligence analysis.
// Includes: nuclear program expertise, IRGC dynamics, proxy networks,
// sanctions architecture, oil market impact, and Israel-Iran axis.
// ══════════════════════════════════════════════════════════════

import type { GeoArticle } from './types';
import type { GeoMarket } from '@/hooks/usePolymarketGeo';
import type { EscalationState } from './iran-intelligence';

/**
 * Iran-specific system prompt for the Tribunal.
 * This replaces the generic TRIBUNAL_PROJECT_INSTRUCTIONS when analyzing Iran events.
 */
export const IRAN_TRIBUNAL_INSTRUCTIONS = `Você é o TRIBUNAL DE GUERRA IRAN do NEXZEN SPECTER — analista de inteligência militar e nuclear de elite.

═══ MISSÃO ═══
Analisar eventos relacionados ao Irã em tempo real para detectar ASSIMETRIA DE INFORMAÇÃO em mercados de predição (Polymarket). Seu objetivo: identificar quando o mercado está ERRADO e capitalizar ANTES da correção.

═══ CONTEXTO IRAN ═══

PROGRAMA NUCLEAR:
- Irã enriquece urânio a 60% (próximo de weapons-grade 90%)
- Facilities: Natanz (principal), Fordow (subterrâneo/fortificado), Isfahan (conversão), Arak (água pesada)
- IAEA reporta que Irã tem ~120kg de urânio 60% (suficiente para ~3 armas se enriquecido a 90%)
- Tempo de breakout estimado: ~2 semanas para material de 1 arma
- Cascatas de centrifugas IR-6 (avançadas) instaladas em Fordow

IRGC & FORÇAS ARMADAS:
- IRGC (Corpo de Guardiões) é independente das forças armadas regulares
- Força Quds: operações externas, proxies, inteligência
- Arsenal de mísseis: Shahab-3, Emad, Khorramshahr (alcance 2000km+)
- Drones: Shahed-136 (kamikaze), Mohajer-6 (reconhecimento)
- Defesa aérea: S-300 (russo), Bavar-373 (doméstico)

REDE DE PROXIES (EIXO DE RESISTÊNCIA):
- Hezbollah (Líbano): 150k+ mísseis, força mais poderosa
- Houthis (Yemen): ataques Red Sea, mísseis anti-navio
- Milícias Iraquianas (PMU/Hashd al-Shaabi): ataques a bases US
- Presença na Síria: via IRGC + milícias afegãs/paquistanesas

SANÇÕES:
- Óleo: sanções US proíbem compra de crude iraniano (China importa ~1.5M bpd)
- Financeiras: SWIFT desconectado, OFAC sanctions extensivas
- Nucleares: JCPOA waivers expirados
- Secondary sanctions: afetam qualquer empresa que negocie com Irã

ESTREITO DE HORMUZ:
- 21% do consumo mundial de petróleo passa por Hormuz
- Largura mínima: ~39km (2 canais de 3km cada)
- Irã ameaça fechar regularmente — NUNCA fechou de fato
- Fechamento = spike imediato de $20-50 em crude oil

ISRAEL-IRÃ:
- Shadow war: assassinatos de cientistas, sabotagem (Stuxnet, explosões)
- Israel ameaça strikes preventivos ao programa nuclear
- Distância: ~1500km (dentro do alcance F-35I com reabastecimento)
- Iron Dome / Arrow / David's Sling vs mísseis iranianos

═══ FRAMEWORK DE ANÁLISE IRAN ═══

1. CLASSIFICAR O EVENTO
   - NUCLEAR: mudança no programa nuclear (enrichment, IAEA, breakout)
   - MILITAR: movimentação de forças, exercícios, postura
   - PROXY: atividade Hezbollah/Houthi/milícias
   - SANÇÕES: novas sanções, enforcement, evasão
   - DIPLOMACIA: negociações, talks, ultimatos
   - PETRÓLEO: impacto em supply/preço de crude
   - CONFRONTO DIRETO: strikes, seizures, ação militar direta

2. ESCALA DE ESCALAÇÃO (ONDE ESTAMOS?)
   - BASELINE → TENSÃO DIPLOMÁTICA → ONDA DE SANÇÕES
   - → ATIVAÇÃO DE PROXIES → POSTURA MILITAR → ESCALAÇÃO NUCLEAR
   - → CONFRONTO DIRETO → PÉ DE GUERRA

   Para cada evento, indique: onde estávamos ANTES, onde estamos AGORA, e qual a PROBABILIDADE de subir mais um nível.

3. ANÁLISE DE MERCADO
   - Qual a probabilidade ATUAL no Polymarket? (se fornecida)
   - Qual sua estimativa REAL da probabilidade?
   - Se GAP > 5%: OPORTUNIDADE
   - Se GAP < 5%: mercado está eficiente, não apostar

4. VELOCIDADE & TIMING
   - Este evento é ÚNICO ou parte de uma SEQUÊNCIA?
   - Qual a velocidade de escalação? (eventos/hora)
   - Quando o mercado vai PRECIFICAR isto? (minutos, horas, dias)
   - Janela de oportunidade: quanto tempo temos?

5. IMPACTO PETRÓLEO
   - Impacto direto no supply? (Hormuz, sanções, produção)
   - Impacto indireto? (risk premium, especulação)
   - Quantificar: $X/barril estimado de impacto

═══ FORMATO DE RESPOSTA ═══

---VEREDICTO-INICIO---
VEREDICTO: [APORTAR | NAO_APORTAR | AGUARDAR]
CONFIANCA: [1-10]
IMPACTO: [1-10]
ESCALACAO_ANTES: [fase anterior]
ESCALACAO_AGORA: [fase atual]
PROB_SUBIR_NIVEL: [0-100%]
MERCADOS: [lista separada por vírgula]
TIMEFRAME: [IMEDIATO | CURTO_PRAZO | LONGO_PRAZO]
JANELA_OPORTUNIDADE: [tempo estimado antes do mercado precificar]
DIRECAO: [BUY_YES | BUY_NO | HOLD]
PRECO_JUSTO: [0-100% sua estimativa de probabilidade justa]
EDGE_ESTIMADO: [diferença entre preço atual e preço justo]
IMPACTO_PETROLEO: [+$X/barril ou neutro]
RISCO_RETORNO: [assimetria risco/retorno]
CATALISADORES: [próximos catalisadores que podem mudar o cenário]
CONTRARIAN: [por que a tese oposta pode estar certa]
JUSTIFICATIVA: [3-5 frases analíticas profundas]
---VEREDICTO-FIM---

═══ REGRAS DO TRIBUNAL DE GUERRA ═══

1. VELOCIDADE > PERFEIÇÃO: Mercados se movem em minutos. Uma análise 80% boa AGORA vale mais que 100% em 2 horas.
2. SEMPRE quantifique o edge. "Parece bom" não é análise. "Market at 35%, fair value 52%, edge +17%" é análise.
3. PROPAGANDA ≠ INTELIGÊNCIA. Press TV/IRNA/Tasnim são úteis para detectar posição do governo, NÃO para fatos.
4. ESCALAÇÃO ≠ GUERRA. A história mostra que 90% das escalações Iran terminam em de-escalação. Não entre em pânico.
5. HORMUZ é o REI. Qualquer sinal credível de disruption em Hormuz = trade imediato em oil markets.
6. CONSIDERE O "NOTHING BURGER": 70% dos "breaking news" Iran são ruído. Filtre agressivamente.
7. FONTE ÚNICA TIER 3 = NAO_APORTAR. Sempre.
8. QUANDO EM DÚVIDA: AGUARDAR > APORTAR. Capital preservation é prioridade absoluta com $99.60.`;

/**
 * Generate an Iran-specific tribunal prompt for a news event.
 */
export function generateIranTribunalPrompt(
  article: GeoArticle,
  escalation: EscalationState,
  relatedMarkets?: GeoMarket[],
  additionalContext?: string,
): string {
  const now = new Date().toISOString();
  const articleAge = Math.floor(
    (Date.now() - new Date(article.seenAt).getTime()) / 60000
  );

  let prompt = `══════════════════════════════════════
TRIBUNAL DE GUERRA IRAN — EVENTO PARA JULGAMENTO
══════════════════════════════════════

TITULO: ${article.title}
FONTE: ${article.source} (${article.sourceCountry || 'N/A'})
PUBLICADO: ${article.seenAt} (${articleAge} min atrás)
URGENCIA SISTEMA: ${article.urgency} (score: ${article.urgencyScore})
URL: ${article.url}
ANALISE SOLICITADA: ${now}

══ ESTADO DE ESCALAÇÃO ATUAL ══
FASE: ${escalation.phase} (score: ${escalation.score}/100)
VELOCIDADE: ${escalation.velocity > 0 ? '+' : ''}${escalation.velocity} pontos/hora
FASE ANTERIOR: ${escalation.previousPhase || 'N/A'}
HOTSPOTS NUCLEARES: ${escalation.nuclearStatus.signals.length > 0 ? escalation.nuclearStatus.signals.join(', ') : 'Nenhum'}
PROXIES ATIVOS: ${[
    escalation.proxyActivity.hezbollah !== 'DORMANT' ? `Hezbollah(${escalation.proxyActivity.hezbollah})` : null,
    escalation.proxyActivity.houthis !== 'DORMANT' ? `Houthis(${escalation.proxyActivity.houthis})` : null,
    escalation.proxyActivity.iraqMilitias !== 'DORMANT' ? `Iraq(${escalation.proxyActivity.iraqMilitias})` : null,
  ].filter(Boolean).join(', ') || 'Nenhum'}`;

  if (article.snippet) {
    prompt += `\n\nSNIPPET:\n${article.snippet}`;
  }

  // Polymarket context
  if (relatedMarkets && relatedMarkets.length > 0) {
    prompt += `\n\n══ POLYMARKET (PREÇOS ATUAIS) ══`;
    for (const m of relatedMarkets.slice(0, 8)) {
      const yesPrice = m.outcomePrices[0] ?? 0;
      const yesPct = Math.round(yesPrice * 100);
      const volStr = m.volume >= 1000000
        ? `$${(m.volume / 1000000).toFixed(1)}M`
        : m.volume >= 1000
        ? `$${(m.volume / 1000).toFixed(0)}K`
        : `$${m.volume.toFixed(0)}`;
      const trend = m.priceDirection === 'up' ? '↑' : m.priceDirection === 'down' ? '↓' : '→';
      const changePct = Math.abs(m.priceChangePct) > 0.1
        ? ` (${m.priceChangePct > 0 ? '+' : ''}${m.priceChangePct.toFixed(1)}%)`
        : '';
      prompt += `\n• "${m.question}" → YES: ${yesPct}% ${trend}${changePct} | Vol: ${volStr}`;
    }
    prompt += `\n\nUSE ESTES PREÇOS para calcular seu edge. Se seu fair value difere >5%, identifique como oportunidade.`;
  }

  if (additionalContext) {
    prompt += `\n\n══ CONTEXTO DO OPERADOR ══\n${additionalContext}`;
  }

  prompt += `\n\n══ IMPLICAÇÕES DE MERCADO DETECTADAS ══\n${
    escalation.marketImplications.length > 0
      ? escalation.marketImplications.join('\n')
      : 'Nenhuma implicação detectada pelo engine'
  }`;

  prompt += `\n\n══════════════════════════════════════
Analise este evento no contexto Iran com o framework completo.
Foco: ASSIMETRIA DE INFORMAÇÃO. Onde o mercado está ERRADO?
Lembre-se: nosso capital é $99.60. Cada trade importa.`;

  return prompt;
}

/**
 * Parse Iran tribunal response with enhanced fields.
 */
export function parseIranTribunalResponse(
  rawResponse: string,
  article: GeoArticle,
): IranTribunalResult | null {
  const startMarker = '---VEREDICTO-INICIO---';
  const endMarker = '---VEREDICTO-FIM---';

  let block = rawResponse;
  const startIdx = rawResponse.indexOf(startMarker);
  const endIdx = rawResponse.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1) {
    block = rawResponse.slice(startIdx + startMarker.length, endIdx).trim();
  }

  const verdictMatch = block.match(/VEREDICTO:\s*(APORTAR|NAO_APORTAR|AGUARDAR)/i);
  if (!verdictMatch) return null;

  const extract = (key: string): string => {
    const match = block.match(new RegExp(`${key}:\\s*(.+?)(?:\\n|$)`, 'i'));
    return match?.[1]?.trim() || '';
  };

  const extractNum = (key: string, fallback: number): number => {
    const val = parseInt(extract(key));
    return isNaN(val) ? fallback : val;
  };

  return {
    eventId: article.id,
    headline: article.title,
    verdict: normalizeVerdict(verdictMatch[1]),
    confidence: clamp(extractNum('CONFIANCA', 5), 1, 10),
    impactScore: clamp(extractNum('IMPACTO', 5), 1, 10),
    escalationBefore: extract('ESCALACAO_ANTES') || 'N/A',
    escalationAfter: extract('ESCALACAO_AGORA') || 'N/A',
    probEscalation: clamp(extractNum('PROB_SUBIR_NIVEL', 50), 0, 100),
    affectedMarkets: extract('MERCADOS').split(',').map(s => s.trim()).filter(Boolean),
    timeframe: normalizeTimeframe(extract('TIMEFRAME') || 'CURTO_PRAZO'),
    opportunityWindow: extract('JANELA_OPORTUNIDADE') || 'N/A',
    direction: normalizeDirection(extract('DIRECAO')),
    fairPrice: clamp(extractNum('PRECO_JUSTO', 50), 0, 100),
    estimatedEdge: extract('EDGE_ESTIMADO') || 'N/A',
    oilImpact: extract('IMPACTO_PETROLEO') || 'neutro',
    riskReward: extract('RISCO_RETORNO') || '',
    catalysts: extract('CATALISADORES').split(',').map(s => s.trim()).filter(Boolean),
    contrarian: extract('CONTRARIAN') || '',
    justification: extractMultiline(block, 'JUSTIFICATIVA') || '',
    rawResponse,
    judgedAt: new Date().toISOString(),
  };
}

export interface IranTribunalResult {
  eventId: string;
  headline: string;
  verdict: 'APORTAR' | 'NAO_APORTAR' | 'AGUARDAR';
  confidence: number;
  impactScore: number;
  escalationBefore: string;
  escalationAfter: string;
  probEscalation: number;
  affectedMarkets: string[];
  timeframe: 'IMEDIATO' | 'CURTO_PRAZO' | 'LONGO_PRAZO';
  opportunityWindow: string;
  direction: 'BUY_YES' | 'BUY_NO' | 'HOLD';
  fairPrice: number;
  estimatedEdge: string;
  oilImpact: string;
  riskReward: string;
  catalysts: string[];
  contrarian: string;
  justification: string;
  rawResponse: string;
  judgedAt: string;
}

// ── Helpers ──

function normalizeVerdict(v: string): 'APORTAR' | 'NAO_APORTAR' | 'AGUARDAR' {
  const upper = v.toUpperCase().replace(/\s+/g, '_');
  if (upper.includes('APORTAR') && !upper.includes('NAO')) return 'APORTAR';
  if (upper.includes('NAO') || upper.includes('NÃO')) return 'NAO_APORTAR';
  return 'AGUARDAR';
}

function normalizeTimeframe(t: string): IranTribunalResult['timeframe'] {
  const upper = t.toUpperCase().replace(/\s+/g, '_');
  if (upper.includes('IMEDIATO')) return 'IMEDIATO';
  if (upper.includes('LONGO')) return 'LONGO_PRAZO';
  return 'CURTO_PRAZO';
}

function normalizeDirection(d: string): 'BUY_YES' | 'BUY_NO' | 'HOLD' {
  const upper = d.toUpperCase().replace(/\s+/g, '_');
  if (upper.includes('BUY_YES') || upper.includes('YES')) return 'BUY_YES';
  if (upper.includes('BUY_NO') || upper.includes('NO')) return 'BUY_NO';
  return 'HOLD';
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function extractMultiline(block: string, key: string): string {
  const match = block.match(new RegExp(`${key}:\\s*([\\s\\S]+?)(?:\\n[A-Z_]+:|\n---|\n\n|$)`, 'i'));
  return match?.[1]?.trim() || '';
}
