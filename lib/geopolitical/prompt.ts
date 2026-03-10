import type { GeoArticle, TribunalResult, TribunalVerdict } from './types';
import type { GeoMarket } from '@/hooks/usePolymarketGeo';

/**
 * System prompt for the Claude project (one-time setup).
 * Sophisticated multi-dimensional analysis framework.
 */
export const TRIBUNAL_PROJECT_INSTRUCTIONS = `Você é o TRIBUNAL GEOPOLÍTICO do sistema NEXZEN SPECTER — um analista de inteligência de nível institucional.

═══ MISSÃO ═══
Analisar eventos geopolíticos em tempo real e determinar se representam oportunidade, risco ou ruído para investimentos. Sua análise deve ser de nível de mesa proprietária de hedge fund.

═══ FRAMEWORK DE ANÁLISE (OBRIGATÓRIO) ═══

1. VERIFICAÇÃO DE FONTE
   - Tier 1 (Reuters, AP, Bloomberg, FT): Alta confiabilidade
   - Tier 2 (BBC, Guardian, WSJ): Boa confiabilidade
   - Tier 3 (Regional, blogs, X/Twitter): Verificar com fontes primárias
   - REGRA: Nunca atue com base em fonte única Tier 3

2. ANÁLISE DE IMPACTO MULTI-ORDEM
   - 1ª Ordem: Efeito direto e imediato (o que acontece agora)
   - 2ª Ordem: Consequências indiretas (reação dos outros players)
   - 3ª Ordem: Efeitos sistêmicos (mudanças de regime, precedentes)

3. ANÁLISE DE PRECIFICAÇÃO
   - O mercado JÁ precificou? Verifique probabilidades Polymarket se fornecidas.
   - Se sim → impacto ZERO, não há alfa
   - Se não → quantifique o gap entre consenso e realidade

4. MAPEAMENTO DE CONTÁGIO
   - Quais mercados são afetados? (FX, commodities, bonds, equities, crypto)
   - Qual a correlação histórica entre o evento e movimentos de preço?
   - Existe hedging natural? (ex: oil up → CAD up → USD/CAD down)

5. GAME THEORY
   - Quais são os incentivos de cada player?
   - Qual o cenário base vs. tail risk?
   - Existe risco de escalada ou de-escalada?

6. TIMING & AÇÃO
   - IMEDIATO (0-24h): Trade agora, janela fecha rápido
   - CURTO_PRAZO (1-7d): Posicionar nos próximos dias
   - LONGO_PRAZO (>7d): Tese macro, monitorar catalisadores

═══ FORMATO DE RESPOSTA (SEMPRE EXATO) ═══

---VEREDICTO-INICIO---
VEREDICTO: [APORTAR | NAO_APORTAR | AGUARDAR]
CONFIANCA: [1-10]
IMPACTO: [1-10]
MERCADOS: [lista separada por vírgula]
TIMEFRAME: [IMEDIATO | CURTO_PRAZO | LONGO_PRAZO]
RISCO_RETORNO: [descrição breve da assimetria risco/retorno]
CATALISADORES: [lista de catalisadores-chave separados por vírgula]
CONTRARIAN: [qual seria a tese contrária e por que pode estar errada]
JUSTIFICATIVA: [3-4 frases analíticas, não descritivas]
---VEREDICTO-FIM---

═══ CRITÉRIOS DE DECISÃO ═══

APORTAR (score ≥ 7/10):
- Assimetria clara de risco/retorno ≥ 3:1
- Evento NÃO precificado ou sub-precificado
- Catalisador identificável com timing claro
- Pelo menos 2 fontes Tier 1-2 confirmando

NAO_APORTAR (score < 4/10):
- Risco de ruína > 5%
- Já precificado (Polymarket > 80% na direção esperada)
- Fonte única ou não verificável
- Sem edge claro sobre o consenso

AGUARDAR (score 4-7/10):
- Evento em desenvolvimento, informação incompleta
- Fonte Tier 3 sem confirmação
- Precificação ambígua (40-60% em Polymarket)
- Catalisador secundário pode alterar cenário

═══ REGRAS ABSOLUTAS ═══
- NUNCA sensacionalismo. Fatos e probabilidades.
- SEMPRE considere o cenário "nothing burger" (nada acontece)
- SEMPRE identifique o "pain trade" (o que machucaria a maioria)
- Se não tem edge, diga NAO_APORTAR. Honestidade > atividade.`;

/**
 * Generate a tribunal prompt for a specific news event.
 * Now includes Polymarket context if available.
 */
export function generateTribunalPrompt(
  article: GeoArticle,
  additionalContext?: string,
  relatedMarkets?: GeoMarket[],
): string {
  const now = new Date().toISOString();
  const articleAge = Math.floor(
    (Date.now() - new Date(article.seenAt).getTime()) / 60000
  );

  let prompt = `══════════════════════════════════════
EVENTO PARA JULGAMENTO
══════════════════════════════════════

TÍTULO: ${article.title}
FONTE: ${article.source} (${article.sourceCountry || 'N/A'})
PUBLICADO: ${article.seenAt} (${articleAge} min atrás)
URGÊNCIA SISTEMA: ${article.urgency} (score: ${article.urgencyScore})
URL: ${article.url}
ANÁLISE SOLICITADA: ${now}`;

  if (article.snippet) {
    prompt += `\n\nSNIPPET:\n${article.snippet}`;
  }

  // Add Polymarket context if available
  if (relatedMarkets && relatedMarkets.length > 0) {
    prompt += `\n\n══ DADOS POLYMARKET (TEMPO REAL) ══`;
    for (const m of relatedMarkets.slice(0, 5)) {
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
    prompt += `\n\nUse estas probabilidades para calibrar sua análise de precificação.`;
  }

  if (additionalContext) {
    prompt += `\n\n══ CONTEXTO DO OPERADOR ══\n${additionalContext}`;
  }

  prompt += `\n\n══════════════════════════════════════
Analise com o framework completo e emita seu veredicto.`;

  return prompt;
}

/**
 * Generate a batch tribunal prompt for multiple events.
 */
export function generateBatchPrompt(
  articles: GeoArticle[],
  markets?: GeoMarket[],
): string {
  const now = new Date().toISOString();

  let prompt = `══════════════════════════════════════
BRIEFING GEOPOLÍTICO — ${now}
══════════════════════════════════════

${articles.length} eventos para análise rápida (priorize os de maior urgência):

`;

  articles.forEach((a, i) => {
    const age = Math.floor((Date.now() - new Date(a.seenAt).getTime()) / 60000);
    prompt += `${i + 1}. [${a.urgency}] [${a.source}] ${a.title} (${age}min atrás)\n`;
    if (a.snippet) {
      prompt += `   → ${a.snippet.slice(0, 120)}...\n`;
    }
  });

  // Add Polymarket snapshot
  if (markets && markets.length > 0) {
    prompt += `\n══ SNAPSHOT POLYMARKET ══\n`;
    for (const m of markets.slice(0, 8)) {
      const yesPct = Math.round((m.outcomePrices[0] ?? 0) * 100);
      const trend = m.priceDirection === 'up' ? '↑' : m.priceDirection === 'down' ? '↓' : '→';
      prompt += `• ${m.question}: ${yesPct}% ${trend}\n`;
    }
  }

  prompt += `\nPara cada evento relevante, emita um veredicto no formato especificado.
Eventos irrelevantes para investimentos: AGUARDAR com IMPACTO: 1.
Priorize QUALIDADE sobre QUANTIDADE — é melhor 3 análises profundas que 10 superficiais.`;

  return prompt;
}

/**
 * Parse a tribunal verdict from Claude's response text.
 * Enhanced to extract new fields (riskReward, catalysts, contrarian).
 */
export function parseTribunalResponse(
  rawResponse: string,
  article: GeoArticle
): TribunalResult | null {
  const startMarker = '---VEREDICTO-INICIO---';
  const endMarker = '---VEREDICTO-FIM---';

  const startIdx = rawResponse.indexOf(startMarker);
  const endIdx = rawResponse.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    return parseLoose(rawResponse, article);
  }

  const block = rawResponse.slice(startIdx + startMarker.length, endIdx).trim();
  return parseVerdictBlock(block, rawResponse, article);
}

function parseLoose(raw: string, article: GeoArticle): TribunalResult | null {
  const verdictMatch = raw.match(/VEREDICTO:\s*(APORTAR|NAO_APORTAR|AGUARDAR)/i);
  if (!verdictMatch) return null;

  const confiancaMatch = raw.match(/CONFIAN[CÇ]A:\s*(\d+)/i);
  const impactoMatch = raw.match(/IMPACTO:\s*(\d+)/i);
  const mercadosMatch = raw.match(/MERCADOS?:\s*(.+?)(?:\n|$)/i);
  const timeframeMatch = raw.match(/TIMEFRAME:\s*(IMEDIATO|CURTO_PRAZO|LONGO_PRAZO)/i);
  const justMatch = raw.match(/JUSTIFICATIVA:\s*([\s\S]+?)(?:\n---|\n\n|$)/i);
  const riskMatch = raw.match(/RISCO_RETORNO:\s*(.+?)(?:\n|$)/i);
  const catalystMatch = raw.match(/CATALISADORES?:\s*(.+?)(?:\n|$)/i);
  const contrarianMatch = raw.match(/CONTRARIAN:\s*([\s\S]+?)(?:\n[A-Z_]+:|\n---|\n\n|$)/i);

  return {
    eventId: article.id,
    headline: article.title,
    verdict: normalizeVerdict(verdictMatch[1]),
    confidence: clamp(parseInt(confiancaMatch?.[1] || '5'), 1, 10),
    impactScore: clamp(parseInt(impactoMatch?.[1] || '5'), 1, 10),
    affectedMarkets: (mercadosMatch?.[1] || '').split(',').map(s => s.trim()).filter(Boolean),
    timeframe: normalizeTimeframe(timeframeMatch?.[1] || 'CURTO_PRAZO'),
    justification: justMatch?.[1]?.trim() || '',
    rawResponse: raw,
    judgedAt: new Date().toISOString(),
    riskReward: riskMatch?.[1]?.trim() || '',
    catalysts: (catalystMatch?.[1] || '').split(',').map(s => s.trim()).filter(Boolean),
    contrarian: contrarianMatch?.[1]?.trim() || '',
  };
}

function parseVerdictBlock(block: string, raw: string, article: GeoArticle): TribunalResult | null {
  return parseLoose(block, article) || parseLoose(raw, article);
}

function normalizeVerdict(v: string): TribunalVerdict {
  const upper = v.toUpperCase().replace(/\s+/g, '_');
  if (upper.includes('APORTAR') && !upper.includes('NAO')) return 'APORTAR';
  if (upper.includes('NAO') || upper.includes('NÃO')) return 'NAO_APORTAR';
  return 'AGUARDAR';
}

function normalizeTimeframe(t: string): TribunalResult['timeframe'] {
  const upper = t.toUpperCase().replace(/\s+/g, '_');
  if (upper.includes('IMEDIATO')) return 'IMEDIATO';
  if (upper.includes('LONGO')) return 'LONGO_PRAZO';
  return 'CURTO_PRAZO';
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
