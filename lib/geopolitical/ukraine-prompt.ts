// ══════════════════════════════════════════════════════════════
// UKRAINE TRIBUNAL PROMPT — Frontline Intelligence Analysis
// ══════════════════════════════════════════════════════════════

import type { GeoArticle } from './types';
import type { GeoMarket } from '@/hooks/usePolymarketGeo';
import type { UkraineEscalationState } from './ukraine-intelligence';

export const UKRAINE_TRIBUNAL_INSTRUCTIONS = `Você é o TRIBUNAL DE GUERRA UCRÂNIA do NEXZEN SPECTER — analista de inteligência militar e geopolítica de elite.

═══ MISSÃO ═══
Analisar eventos relacionados à guerra Rússia-Ucrânia em tempo real para detectar ASSIMETRIA DE INFORMAÇÃO em mercados de predição (Polymarket). Seu objetivo: identificar quando o mercado está ERRADO e capitalizar ANTES da correção.

═══ CONTEXTO UCRÂNIA ═══

FRENTES DE COMBATE:
- Donbas (Donetsk/Luhansk): principal zona de combate, Rússia em ofensiva lenta
- Zaporizhzhia: linha defensiva, ponto estratégico para corredor terrestre
- Kherson: controle ucraniano da margem direita, artilharia cruzando o Dnieper
- Kursk: incursão ucraniana em território russo (desde ago/2024)
- Kharkiv: fronteira norte, ofensivas russas periódicas

ARMAMENTO OCIDENTAL CHAVE:
- HIMARS/M270: artilharia de precisão, game-changer logístico
- Patriot/NASAMS: defesa aérea crucial contra mísseis russos
- F-16: superioridade aérea limitada, em processo de integração
- ATACMS: mísseis de longo alcance (300km), permissão para uso em território russo
- Storm Shadow/SCALP: mísseis de cruzeiro franco-britânicos
- Leopard 2/Abrams: tanques ocidentais, desempenho variado

ARSENAL RUSSO:
- Mísseis: Iskander (500km), Kalibr (cruzeiro), Kinzhal (hipersônico), Zircon
- Drones: Shahed-136/Geran-2 (kamikaze iraniano), Lancet (anti-tanque)
- Artilharia: superioridade numérica 5:1 em munição
- Glide bombs: FAB-500/1500/3000 com kits UMPK

RISCO NUCLEAR:
- Zaporizhzhia NPP: maior usina nuclear da Europa, controlada pela Rússia
- Doutrina russa: "uso nuclear se existência do Estado ameaçada"
- Putin alterou doutrina nuclear em 2024 (limiar mais baixo para uso tático)
- Armas táticas: ~2000 ogivas táticas estimadas

NATO/ARTIGO 5:
- 31 membros, comprometidos com defesa coletiva
- Polônia e Bálticos: fronteira direta com Rússia/Belarus
- Incidente em território NATO = risco de Artigo 5
- Rússia testa constantemente limites de engajamento

ENERGIA:
- Nord Stream: destruído (set/2022), rota de gás cortada
- Gás russo para Europa: ~15% do pré-guerra via Turk Stream
- Ucrânia era rota de trânsito — acordo expirou jan/2025
- Ataques à infraestrutura energética ucraniana: blackouts no inverno

═══ FRAMEWORK DE ANÁLISE ═══

1. CLASSIFICAR O EVENTO
   - FRONTLINE: mudança territorial, combate, ofensiva
   - ARMAMENTO: entrega/uso de armas, escalação de sistemas
   - NUCLEAR: ameaças nucleares, incidentes Zaporizhzhia
   - NATO: envolvimento direto, Artigo 5, incidentes fronteira
   - SANÇÕES: novas sanções, evasão, impacto econômico
   - DIPLOMACIA: negociações, summit, mediação
   - ENERGIA: infraestrutura, gas, grain deal

2. IMPACTO NO EQUILÍBRIO MILITAR
   - Este evento muda o momentum? Para qual lado?
   - Impacto em capacidades? (defesa aérea, artilharia, logística)

3. ANÁLISE DE MERCADO
   - Preço atual no Polymarket vs sua estimativa
   - GAP > 5% = oportunidade

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
JANELA_OPORTUNIDADE: [tempo estimado]
DIRECAO: [BUY_YES | BUY_NO | HOLD]
PRECO_JUSTO: [0-100%]
EDGE_ESTIMADO: [diferença]
MOMENTUM_MILITAR: [UKRAINE | RUSSIA | STALEMATE]
RISCO_NUCLEAR: [LOW | MODERATE | ELEVATED | HIGH]
RISCO_RETORNO: [assimetria]
CATALISADORES: [próximos catalisadores]
CONTRARIAN: [tese oposta]
JUSTIFICATIVA: [3-5 frases]
---VEREDICTO-FIM---

═══ REGRAS DO TRIBUNAL ═══
1. ISW é referência para frontline analysis — peso TIER1.
2. Fontes ucranianas (Ukrinform, Kyiv Independent) são rápidas mas otimistas — desconte 20%.
3. RT/TASS são propaganda pura — use apenas para detectar posição do Kremlin.
4. ESCALAÇÃO NUCLEAR: 95% das ameaças são retórica. Mas os 5% podem ser catastróficos.
5. ARMAS ≠ VITÓRIA: Entrega de armas é notícia, mas impacto no campo leva semanas/meses.
6. INVERNO MUDA TUDO: de Nov-Mar, operações terrestres limitadas, foco em ataques à infraestrutura.
7. Capital é $99.60. Preservação > Lucro.`;

export function generateUkraineTribunalPrompt(
  article: GeoArticle,
  escalation: UkraineEscalationState,
  relatedMarkets?: GeoMarket[],
): string {
  const articleAge = Math.floor((Date.now() - new Date(article.seenAt).getTime()) / 60000);

  let prompt = `══════════════════════════════════════
TRIBUNAL DE GUERRA UCRÂNIA — EVENTO PARA JULGAMENTO
══════════════════════════════════════

TITULO: ${article.title}
FONTE: ${article.source} (${article.sourceCountry || 'N/A'})
PUBLICADO: ${article.seenAt} (${articleAge} min atrás)
URGENCIA: ${article.urgency} (score: ${article.urgencyScore})
URL: ${article.url}

══ ESTADO DE ESCALAÇÃO ══
FASE: ${escalation.phase} (score: ${escalation.score}/100)
VELOCIDADE: ${escalation.velocity > 0 ? '+' : ''}${escalation.velocity} pts/h
RISCO NUCLEAR: ${escalation.nuclearRisk.level}
ZAPORIZHZHIA NPP: ${escalation.nuclearRisk.zaporizhzhiaNPP}
MOMENTUM: ${escalation.frontlineStatus.overallMomentum}`;

  if (article.snippet) {
    prompt += `\n\nSNIPPET:\n${article.snippet}`;
  }

  if (relatedMarkets && relatedMarkets.length > 0) {
    prompt += `\n\n══ POLYMARKET (PREÇOS ATUAIS) ══`;
    for (const m of relatedMarkets.slice(0, 8)) {
      const yesPct = Math.round((m.outcomePrices[0] ?? 0) * 100);
      const trend = m.priceDirection === 'up' ? '↑' : m.priceDirection === 'down' ? '↓' : '→';
      prompt += `\n• "${m.question}" → YES: ${yesPct}% ${trend}`;
    }
  }

  prompt += `\n\n══ FRENTES ATIVAS ══`;
  for (const front of escalation.frontlineStatus.keyFronts) {
    if (front.status !== 'QUIET') {
      prompt += `\n• ${front.name}: ${front.status} (momentum: ${front.momentum})`;
    }
  }

  prompt += `\n\n══════════════════════════════════════
Analise com foco em ASSIMETRIA DE INFORMAÇÃO.`;

  return prompt;
}

export interface UkraineTribunalResult {
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
  direction: 'BUY_YES' | 'BUY_NO' | 'HOLD';
  fairPrice: number;
  estimatedEdge: string;
  militaryMomentum: string;
  nuclearRisk: string;
  riskReward: string;
  catalysts: string[];
  contrarian: string;
  justification: string;
  rawResponse: string;
  judgedAt: string;
}

export function parseUkraineTribunalResponse(
  rawResponse: string,
  article: GeoArticle,
): UkraineTribunalResult | null {
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

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

  const normalizeVerdict = (v: string): 'APORTAR' | 'NAO_APORTAR' | 'AGUARDAR' => {
    const upper = v.toUpperCase().replace(/\s+/g, '_');
    if (upper.includes('APORTAR') && !upper.includes('NAO')) return 'APORTAR';
    if (upper.includes('NAO') || upper.includes('NÃO')) return 'NAO_APORTAR';
    return 'AGUARDAR';
  };

  const normalizeDirection = (d: string): 'BUY_YES' | 'BUY_NO' | 'HOLD' => {
    const upper = d.toUpperCase();
    if (upper.includes('YES')) return 'BUY_YES';
    if (upper.includes('NO')) return 'BUY_NO';
    return 'HOLD';
  };

  const normalizeTimeframe = (t: string): 'IMEDIATO' | 'CURTO_PRAZO' | 'LONGO_PRAZO' => {
    const upper = t.toUpperCase();
    if (upper.includes('IMEDIATO')) return 'IMEDIATO';
    if (upper.includes('LONGO')) return 'LONGO_PRAZO';
    return 'CURTO_PRAZO';
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
    direction: normalizeDirection(extract('DIRECAO')),
    fairPrice: clamp(extractNum('PRECO_JUSTO', 50), 0, 100),
    estimatedEdge: extract('EDGE_ESTIMADO') || 'N/A',
    militaryMomentum: extract('MOMENTUM_MILITAR') || 'STALEMATE',
    nuclearRisk: extract('RISCO_NUCLEAR') || 'LOW',
    riskReward: extract('RISCO_RETORNO') || '',
    catalysts: extract('CATALISADORES').split(',').map(s => s.trim()).filter(Boolean),
    contrarian: extract('CONTRARIAN') || '',
    justification: extract('JUSTIFICATIVA') || '',
    rawResponse,
    judgedAt: new Date().toISOString(),
  };
}
