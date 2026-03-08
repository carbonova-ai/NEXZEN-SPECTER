'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { PredictionResult, PaperTrade } from '@/lib/types';
import type { Alert } from '@/lib/engine/alerts';
import type { MarketRegime } from '@/lib/engine/weight-optimizer';

/**
 * useNotifications — watches for trading events and sends notifications
 * via the server-side /api/notifications/send relay.
 *
 * Monitors: alerts, trades (paper/live), regime changes, health events.
 * Rate-limited to prevent flooding.
 */

const RATE_LIMIT_MS = 3000; // Min 3s between notifications

interface NotifyPayload {
  type: 'TRADE' | 'ALERT' | 'REGIME' | 'HEALTH' | 'CIRCUIT_BREAKER';
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  fields?: { name: string; value: string; inline?: boolean }[];
}

export function useNotifications(
  alerts: Alert[],
  regime: MarketRegime,
  history: PredictionResult[],
  paperTrade: PaperTrade | null,
  circuitBreakerActive: boolean
) {
  const lastSentRef = useRef<number>(0);
  const lastAlertCountRef = useRef(0);
  const lastRegimeRef = useRef<MarketRegime>(regime);
  const lastHistoryLenRef = useRef(history.length);
  const lastPaperTradeIdRef = useRef<string | null>(null);
  const cbNotifiedRef = useRef(false);

  const send = useCallback(async (payload: NotifyPayload) => {
    const now = Date.now();
    if (now - lastSentRef.current < RATE_LIMIT_MS) return;
    lastSentRef.current = now;

    try {
      await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // Silent fail — notifications are non-critical
    }
  }, []);

  // Watch for new alerts (from adaptive engine)
  useEffect(() => {
    if (alerts.length <= lastAlertCountRef.current) {
      lastAlertCountRef.current = alerts.length;
      return;
    }

    // Send only the newest alert
    const newest = alerts[alerts.length - 1];
    lastAlertCountRef.current = alerts.length;

    if (newest && (newest.level === 'WARNING' || newest.level === 'CRITICAL')) {
      send({
        type: 'ALERT',
        level: newest.level,
        title: newest.title,
        message: newest.message,
      });
    }
  }, [alerts, send]);

  // Watch for regime changes
  useEffect(() => {
    if (regime === lastRegimeRef.current) return;
    const prev = lastRegimeRef.current;
    lastRegimeRef.current = regime;

    if (regime !== 'UNKNOWN') {
      send({
        type: 'REGIME',
        level: 'INFO',
        title: 'Market Regime Change',
        message: `${prev} → ${regime}`,
        fields: [
          { name: 'Previous', value: prev, inline: true },
          { name: 'Current', value: regime, inline: true },
        ],
      });
    }
  }, [regime, send]);

  // Watch for prediction results (wins/losses)
  useEffect(() => {
    if (history.length <= lastHistoryLenRef.current) {
      lastHistoryLenRef.current = history.length;
      return;
    }

    const newest = history[history.length - 1];
    lastHistoryLenRef.current = history.length;

    if (newest && newest.outcome !== 'PENDING') {
      send({
        type: 'TRADE',
        level: newest.outcome === 'WIN' ? 'INFO' : 'WARNING',
        title: `Prediction ${newest.outcome}`,
        message: `${newest.direction} at $${newest.entryPrice.toFixed(2)} → $${newest.exitPrice?.toFixed(2) ?? '?'}`,
        fields: [
          { name: 'Direction', value: newest.direction, inline: true },
          { name: 'P&L', value: `${(newest.pnlPercent ?? 0) >= 0 ? '+' : ''}${(newest.pnlPercent ?? 0).toFixed(3)}%`, inline: true },
          { name: 'Confidence', value: `${(newest.probability * 100).toFixed(1)}%`, inline: true },
        ],
      });
    }
  }, [history, send]);

  // Watch for paper trade results
  useEffect(() => {
    if (!paperTrade || paperTrade.id === lastPaperTradeIdRef.current) return;
    lastPaperTradeIdRef.current = paperTrade.id;

    if (paperTrade.status === 'WON' || paperTrade.status === 'LOST') {
      send({
        type: 'TRADE',
        level: paperTrade.status === 'WON' ? 'INFO' : 'WARNING',
        title: `Paper Trade ${paperTrade.status}`,
        message: `${paperTrade.direction} $${paperTrade.stake.toFixed(2)} → P&L: ${(paperTrade.pnl ?? 0) >= 0 ? '+' : ''}$${(paperTrade.pnl ?? 0).toFixed(2)}`,
        fields: [
          { name: 'Bankroll', value: `$${(paperTrade.bankrollAfter ?? 0).toFixed(2)}`, inline: true },
          { name: 'Stake', value: `$${paperTrade.stake.toFixed(2)}`, inline: true },
        ],
      });
    }
  }, [paperTrade, send]);

  // Watch for circuit breaker
  useEffect(() => {
    if (circuitBreakerActive && !cbNotifiedRef.current) {
      cbNotifiedRef.current = true;
      send({
        type: 'CIRCUIT_BREAKER',
        level: 'CRITICAL',
        title: 'Circuit Breaker Activated',
        message: 'Trading has been halted due to risk limits.',
      });
    } else if (!circuitBreakerActive) {
      cbNotifiedRef.current = false;
    }
  }, [circuitBreakerActive, send]);
}
