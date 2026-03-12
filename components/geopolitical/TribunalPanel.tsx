'use client';

import { useState, useRef, useEffect } from 'react';
import type { GeoArticle, TribunalResult } from '@/lib/geopolitical/types';
import type { GeoMarket } from '@/hooks/usePolymarketGeo';
import {
  generateTribunalPrompt,
  generateBatchPrompt,
  parseTribunalResponse,
  TRIBUNAL_PROJECT_INSTRUCTIONS,
} from '@/lib/geopolitical/prompt';

interface TribunalPanelProps {
  selectedArticle: GeoArticle | null;
  allArticles: GeoArticle[];
  verdicts: TribunalResult[];
  onNewVerdict: (verdict: TribunalResult) => void;
  geoMarkets: GeoMarket[];
}

function VerdictBadge({ verdict }: { verdict: TribunalResult['verdict'] }) {
  const config = {
    APORTAR: { label: 'APORTAR', bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-400' },
    NAO_APORTAR: { label: 'NAO APORTAR', bg: 'bg-red-500/20', border: 'border-red-500/40', text: 'text-red-400' },
    AGUARDAR: { label: 'AGUARDAR', bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', text: 'text-yellow-400' },
  };
  const c = config[verdict];
  return (
    <span className={`text-xs font-bold px-3 py-1 rounded border ${c.bg} ${c.border} ${c.text}`}>
      {c.label}
    </span>
  );
}

function TimeframeBadge({ timeframe }: { timeframe: TribunalResult['timeframe'] }) {
  const config = {
    IMEDIATO: { label: 'IMEDIATO', color: 'text-red-400 bg-red-500/10' },
    CURTO_PRAZO: { label: 'CURTO PRAZO', color: 'text-amber-400 bg-amber-500/10' },
    LONGO_PRAZO: { label: 'LONGO PRAZO', color: 'text-blue-400 bg-blue-500/10' },
  };
  const c = config[timeframe];
  return (
    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${c.color}`}>
      {c.label}
    </span>
  );
}

function ConfidenceBar({ value, max = 10, label }: { value: number; max?: number; label: string }) {
  const pct = (value / max) * 100;
  const color = value >= 7 ? 'bg-green-500' : value >= 4 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <span className="text-[8px] text-nexzen-muted w-14 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-nexzen-surface overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-nexzen-text tabular-nums w-6 text-right">{value}/{max}</span>
    </div>
  );
}

function VerdictCard({ result }: { result: TribunalResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-nexzen-card/60 rounded-lg border border-nexzen-border/30 p-3 space-y-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-[11px] text-nexzen-text font-medium leading-snug">{result.headline}</h4>
          <div className="flex items-center gap-2 mt-1.5">
            <VerdictBadge verdict={result.verdict} />
            <TimeframeBadge timeframe={result.timeframe} />
          </div>
        </div>
        <span className="text-[8px] text-nexzen-muted/50 shrink-0">
          {new Date(result.judgedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Confidence + Impact bars */}
      <div className="space-y-1">
        <ConfidenceBar value={result.confidence} label="Confianca" />
        <ConfidenceBar value={result.impactScore} label="Impacto" />
      </div>

      {/* Affected markets */}
      {result.affectedMarkets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.affectedMarkets.map((m, i) => (
            <span key={i} className="text-[8px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
              {m}
            </span>
          ))}
        </div>
      )}

      {/* Justification */}
      <p className="text-[10px] text-nexzen-muted leading-relaxed">
        {result.justification}
      </p>

      {/* Risk/Reward */}
      {result.riskReward && (
        <div className="bg-nexzen-surface/50 rounded p-2 border border-nexzen-border/10">
          <span className="text-[8px] text-nexzen-muted uppercase">Risco/Retorno: </span>
          <span className="text-[9px] text-nexzen-text">{result.riskReward}</span>
        </div>
      )}

      {/* Catalysts */}
      {result.catalysts && result.catalysts.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[8px] text-nexzen-muted">Catalisadores:</span>
          {result.catalysts.map((c, i) => (
            <span key={i} className="text-[8px] text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
              {c}
            </span>
          ))}
        </div>
      )}

      {/* Contrarian view */}
      {result.contrarian && (
        <div className="bg-red-500/5 rounded p-2 border border-red-500/10">
          <span className="text-[8px] text-red-400 uppercase">Tese contraria: </span>
          <span className="text-[9px] text-nexzen-muted">{result.contrarian}</span>
        </div>
      )}

      {/* Raw response toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[8px] text-nexzen-muted/50 hover:text-nexzen-muted transition-colors"
      >
        {expanded ? 'Ocultar resposta completa' : 'Ver resposta completa'}
      </button>
      {expanded && (
        <pre className="text-[9px] text-nexzen-muted bg-nexzen-bg rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
          {result.rawResponse}
        </pre>
      )}
    </div>
  );
}

export function TribunalPanel({
  selectedArticle,
  allArticles,
  verdicts,
  onNewVerdict,
  geoMarkets,
}: TribunalPanelProps) {
  const [activeTab, setActiveTab] = useState<'tribunal' | 'setup' | 'history'>('tribunal');
  const [additionalContext, setAdditionalContext] = useState('');
  const [claudeResponse, setClaudeResponse] = useState('');
  const [copied, setCopied] = useState(false);
  const [setupCopied, setSetupCopied] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Find related Polymarket markets for the selected article
  const relatedMarkets = selectedArticle
    ? geoMarkets.filter(m => {
        const q = m.question.toLowerCase();
        const words = selectedArticle.title.toLowerCase().split(/\s+/).filter(w => w.length > 4);
        return words.some(w => q.includes(w));
      }).slice(0, 5)
    : [];

  // Generate prompt with Polymarket context
  const prompt = selectedArticle
    ? generateTribunalPrompt(selectedArticle, additionalContext || undefined, relatedMarkets.length > 0 ? relatedMarkets : geoMarkets.slice(0, 5))
    : null;

  // Batch prompt with Polymarket snapshot
  const batchPrompt = allArticles.length > 0
    ? generateBatchPrompt(allArticles.slice(0, 10), geoMarkets.slice(0, 8))
    : null;

  async function copyToClipboard(text: string, setter: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch {
      // Fallback: select text
    }
  }

  function handleParseVerdict() {
    if (!selectedArticle || !claudeResponse.trim()) return;
    setParseError(null);

    const result = parseTribunalResponse(claudeResponse, selectedArticle);
    if (result) {
      onNewVerdict(result);
      setClaudeResponse('');
    } else {
      setParseError('Nao foi possivel parsear o veredicto. Certifique-se que o Claude usou o formato correto com ---VEREDICTO-INICIO--- e ---VEREDICTO-FIM---.');
    }
  }

  // Auto-focus textarea when article is selected
  useEffect(() => {
    if (selectedArticle && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [selectedArticle]);

  // Verdict stats
  const stats = {
    total: verdicts.length,
    aportar: verdicts.filter(v => v.verdict === 'APORTAR').length,
    naoAportar: verdicts.filter(v => v.verdict === 'NAO_APORTAR').length,
    aguardar: verdicts.filter(v => v.verdict === 'AGUARDAR').length,
    avgConfidence: verdicts.length > 0
      ? (verdicts.reduce((s, v) => s + v.confidence, 0) / verdicts.length)
      : 0,
    avgImpact: verdicts.length > 0
      ? (verdicts.reduce((s, v) => s + v.impactScore, 0) / verdicts.length)
      : 0,
  };

  return (
    <div className="glass-card flex flex-col h-full" style={{ borderColor: 'rgba(245,158,11,0.08)' }}>
      {/* Tabs */}
      <div className="flex border-b border-nexzen-border/20">
        {(['tribunal', 'history', 'setup'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-[10px] uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? 'text-amber-500 border-b-2 border-amber-500'
                : 'text-nexzen-muted hover:text-nexzen-text'
            }`}
          >
            {tab === 'tribunal' ? 'ANALYSIS' : tab === 'history' ? `VEREDICTOS (${verdicts.length})` : 'SETUP'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3" style={{ maxHeight: 'calc(100vh - 220px)' }}>
        {/* ── ANALYSIS TAB ── */}
        {activeTab === 'tribunal' && (
          <div className="space-y-3">
            {!selectedArticle ? (
              <div className="text-center py-6">
                <div className="text-amber-500/30 text-3xl mb-2">&#9878;</div>
                <p className="text-xs text-nexzen-muted">
                  Selecione um evento no feed para julgar
                </p>

                {/* Related Polymarket data */}
                {geoMarkets.length > 0 && (
                  <div className="mt-4 text-left">
                    <div className="text-[9px] text-nexzen-muted uppercase mb-1.5">Polymarket Live (incluido nos prompts)</div>
                    <div className="space-y-1">
                      {geoMarkets.slice(0, 3).map(m => {
                        const yesPct = Math.round((m.outcomePrices[0] ?? 0) * 100);
                        return (
                          <div key={m.id} className="flex items-center justify-between bg-nexzen-surface/30 rounded px-2 py-1">
                            <span className="text-[8px] text-nexzen-muted truncate flex-1 mr-2">{m.question}</span>
                            <span className={`text-[9px] font-bold tabular-nums ${yesPct >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                              {yesPct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {batchPrompt && (
                  <div className="mt-4">
                    <p className="text-[9px] text-nexzen-muted mb-2">
                      Ou analise os top 10 + Polymarket de uma vez:
                    </p>
                    <button
                      onClick={() => copyToClipboard(batchPrompt, setCopied)}
                      className="px-3 py-1.5 text-[10px] rounded border border-amber-500/30 text-amber-500 hover:bg-amber-500/10 transition-colors"
                    >
                      {copied ? 'COPIADO!' : 'COPIAR BRIEFING COMPLETO'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Selected event summary */}
                <div className="bg-amber-500/5 rounded-lg border border-amber-500/20 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[9px] text-amber-500/60 uppercase">Evento Selecionado</div>
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                      selectedArticle.urgency === 'CRITICAL' ? 'text-red-400 bg-red-500/10' :
                      selectedArticle.urgency === 'HIGH' ? 'text-orange-400 bg-orange-500/10' :
                      'text-nexzen-muted bg-nexzen-surface/50'
                    }`}>
                      {selectedArticle.urgency} ({selectedArticle.urgencyScore})
                    </span>
                  </div>
                  <h3 className="text-xs text-nexzen-text font-medium leading-snug">{selectedArticle.title}</h3>
                  {selectedArticle.snippet && (
                    <p className="text-[9px] text-nexzen-muted/60 mt-1 leading-relaxed line-clamp-2">
                      {selectedArticle.snippet}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[9px] text-nexzen-muted">{selectedArticle.source}</span>
                    <a
                      href={selectedArticle.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] text-amber-500/60 hover:text-amber-500 transition-colors"
                    >
                      Ler fonte
                    </a>
                  </div>
                </div>

                {/* Related Polymarket markets */}
                {relatedMarkets.length > 0 && (
                  <div className="bg-purple-500/5 rounded-lg border border-purple-500/20 p-2">
                    <div className="text-[8px] text-purple-400 uppercase mb-1">Polymarket Relacionados</div>
                    {relatedMarkets.map(m => {
                      const yesPct = Math.round((m.outcomePrices[0] ?? 0) * 100);
                      const trend = m.priceDirection === 'up' ? '▲' : m.priceDirection === 'down' ? '▼' : '';
                      return (
                        <div key={m.id} className="flex items-center justify-between py-0.5">
                          <span className="text-[8px] text-nexzen-muted truncate flex-1 mr-2">{m.question}</span>
                          <span className={`text-[9px] font-bold tabular-nums ${yesPct >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                            {trend} {yesPct}%
                          </span>
                        </div>
                      );
                    })}
                    <div className="text-[7px] text-purple-400/50 mt-1">Dados incluidos automaticamente no prompt</div>
                  </div>
                )}

                {/* Additional context */}
                <div>
                  <label className="text-[9px] text-nexzen-muted uppercase block mb-1">
                    Contexto adicional (opcional)
                  </label>
                  <input
                    type="text"
                    value={additionalContext}
                    onChange={e => setAdditionalContext(e.target.value)}
                    placeholder="Ex: BTC caiu 5% na ultima hora, considere correlacao..."
                    className="w-full bg-nexzen-surface border border-nexzen-border rounded px-2 py-1.5 text-[11px] text-nexzen-text placeholder:text-nexzen-muted/40"
                  />
                </div>

                {/* Step 1: Copy prompt */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-amber-500 uppercase font-bold">1. Copie o prompt</span>
                    <button
                      onClick={() => prompt && copyToClipboard(prompt, setCopied)}
                      className={`px-3 py-1 text-[10px] rounded border transition-all ${
                        copied
                          ? 'bg-green-500/20 border-green-500/40 text-green-400'
                          : 'border-amber-500/40 text-amber-500 hover:bg-amber-500/10'
                      }`}
                    >
                      {copied ? 'COPIADO!' : 'COPIAR PROMPT + POLYMARKET'}
                    </button>
                  </div>
                  {prompt && (
                    <pre className="text-[9px] text-nexzen-muted bg-nexzen-bg rounded p-2 max-h-28 overflow-y-auto whitespace-pre-wrap border border-nexzen-border/20">
                      {prompt}
                    </pre>
                  )}
                </div>

                {/* Step 2: Instruction */}
                <div className="text-[9px] text-nexzen-muted bg-nexzen-surface/50 rounded p-2 border border-nexzen-border/10">
                  <span className="text-amber-500 font-bold">2.</span> Cole no seu projeto Claude e aguarde o veredicto
                </div>

                {/* Step 3: Paste response */}
                <div className="space-y-1.5">
                  <span className="text-[9px] text-amber-500 uppercase font-bold">3. Cole a resposta do Claude</span>
                  <textarea
                    ref={textareaRef}
                    value={claudeResponse}
                    onChange={e => { setClaudeResponse(e.target.value); setParseError(null); }}
                    placeholder="Cole aqui a resposta completa do Claude..."
                    rows={6}
                    className="w-full bg-nexzen-surface border border-nexzen-border rounded px-2 py-2 text-[11px] text-nexzen-text placeholder:text-nexzen-muted/40 resize-none"
                  />
                  {parseError && (
                    <div className="text-[9px] text-red-400 bg-red-500/5 rounded p-2 border border-red-500/10">
                      {parseError}
                    </div>
                  )}
                  <button
                    onClick={handleParseVerdict}
                    disabled={!claudeResponse.trim()}
                    className="w-full py-2 text-xs font-bold rounded border border-amber-500 text-amber-500 hover:bg-amber-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    PROCESSAR VEREDICTO
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          <div className="space-y-2">
            {verdicts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs text-nexzen-muted">Nenhum veredicto ainda</p>
                <p className="text-[9px] text-nexzen-muted/60 mt-1">
                  Selecione um evento e envie para análise
                </p>
              </div>
            ) : (
              <>
                {/* Summary stats with bars */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="col-span-2 flex items-center gap-2 bg-nexzen-surface/30 rounded-lg p-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-1 mb-1">
                        <div className="h-2 rounded-full bg-green-500" style={{ width: `${stats.total > 0 ? (stats.aportar / stats.total) * 100 : 0}%`, minWidth: stats.aportar > 0 ? '8px' : '0' }} />
                        <div className="h-2 rounded-full bg-yellow-500" style={{ width: `${stats.total > 0 ? (stats.aguardar / stats.total) * 100 : 0}%`, minWidth: stats.aguardar > 0 ? '8px' : '0' }} />
                        <div className="h-2 rounded-full bg-red-500" style={{ width: `${stats.total > 0 ? (stats.naoAportar / stats.total) * 100 : 0}%`, minWidth: stats.naoAportar > 0 ? '8px' : '0' }} />
                      </div>
                      <div className="flex items-center gap-3 text-[8px]">
                        <span className="text-green-400">{stats.aportar} aportar</span>
                        <span className="text-yellow-400">{stats.aguardar} aguardar</span>
                        <span className="text-red-400">{stats.naoAportar} recusados</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-center bg-nexzen-surface/30 rounded p-2">
                    <div className="text-sm font-bold text-amber-400 tabular-nums">{stats.avgConfidence.toFixed(1)}</div>
                    <div className="text-[8px] text-nexzen-muted uppercase">Conf. Media</div>
                  </div>
                  <div className="text-center bg-nexzen-surface/30 rounded p-2">
                    <div className="text-sm font-bold text-cyan-400 tabular-nums">{stats.avgImpact.toFixed(1)}</div>
                    <div className="text-[8px] text-nexzen-muted uppercase">Imp. Medio</div>
                  </div>
                </div>

                {/* Verdict list */}
                {verdicts.map((v, i) => (
                  <VerdictCard key={`${v.eventId}-${i}`} result={v} />
                ))}
              </>
            )}
          </div>
        )}

        {/* ── SETUP TAB ── */}
        {activeTab === 'setup' && (
          <div className="space-y-3">
            <div className="bg-amber-500/5 rounded-lg border border-amber-500/20 p-3">
              <h3 className="text-xs text-amber-500 font-bold mb-2">Setup do Projeto Claude</h3>
              <ol className="text-[10px] text-nexzen-muted space-y-2 list-decimal list-inside">
                <li>
                  Abra <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:underline">claude.ai</a> e crie um novo <strong className="text-nexzen-text">Projeto</strong>
                </li>
                <li>
                  Nomeie como <strong className="text-nexzen-text">&quot;SPECTER War Room&quot;</strong>
                </li>
                <li>
                  Em <strong className="text-nexzen-text">&quot;Project Instructions&quot;</strong>, cole as instrucoes abaixo
                </li>
                <li>
                  Pronto! Agora use a aba <strong className="text-amber-500">ANALYSIS</strong> para enviar eventos
                </li>
              </ol>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-nexzen-muted uppercase">Instrucoes do Projeto (v3.0 — Framework Institucional)</span>
                <button
                  onClick={() => copyToClipboard(TRIBUNAL_PROJECT_INSTRUCTIONS, setSetupCopied)}
                  className={`px-2 py-0.5 text-[9px] rounded border transition-all ${
                    setupCopied
                      ? 'bg-green-500/20 border-green-500/40 text-green-400'
                      : 'border-amber-500/30 text-amber-500 hover:bg-amber-500/10'
                  }`}
                >
                  {setupCopied ? 'COPIADO!' : 'COPIAR'}
                </button>
              </div>
              <pre className="text-[9px] text-nexzen-muted bg-nexzen-bg rounded p-3 max-h-64 overflow-y-auto whitespace-pre-wrap border border-nexzen-border/20 leading-relaxed">
                {TRIBUNAL_PROJECT_INSTRUCTIONS}
              </pre>
            </div>

            <div className="bg-nexzen-surface/50 rounded p-3 border border-nexzen-border/10">
              <h4 className="text-[10px] text-nexzen-text font-bold mb-1">Novidades v3.0</h4>
              <ul className="text-[9px] text-nexzen-muted space-y-1 list-disc list-inside leading-relaxed">
                <li>DEFCON Threat Meter — nivel de ameaca geopolitica em tempo real</li>
                <li>Smart Clustering — artigos agrupados em threads de historias</li>
                <li>News x Markets Correlation — deteccao automatica de correlacao</li>
                <li>Urgencia melhorada — analise de titulo + snippet combinados</li>
                <li>Tags automaticas — extracao de topicos (paises, armas, economia)</li>
                <li>Alertas de navegador para eventos CRITICAL</li>
                <li>Performance de fontes — latencia e volume por fonte</li>
                <li>Polymarket momentum — RISK ON/OFF baseado em correlacoes</li>
              </ul>
            </div>

            <div className="bg-nexzen-surface/50 rounded p-3 border border-nexzen-border/10">
              <h4 className="text-[10px] text-nexzen-text font-bold mb-1">Por que um Projeto?</h4>
              <p className="text-[9px] text-nexzen-muted leading-relaxed">
                Um projeto no Claude mantem o contexto do War Room permanente.
                Cada evento que voce julga acumula historico no mesmo chat,
                permitindo que o Claude identifique padroes e melhore suas analises ao longo do tempo.
                Zero custo adicional — usa sua assinatura existente.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
