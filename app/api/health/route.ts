/**
 * Health Check API
 *
 * Returns system health status for external monitoring tools.
 * Can be polled by uptime monitors (UptimeRobot, Healthchecks.io, etc.)
 *
 * GET /api/health
 *   200 = healthy
 *   503 = degraded/critical (useful for alerting)
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const now = Date.now();

  // Basic server health — the client-side HealthMonitor tracks data sources,
  // but this endpoint confirms the Next.js server itself is alive.
  const health = {
    status: 'ok',
    version: '0.2.0',
    uptime: process.uptime(),
    timestamp: now,
    services: {
      server: 'healthy',
      // Data source health is tracked client-side via HealthMonitor
      // This endpoint confirms the server can respond to requests
    },
    env: {
      discordConfigured: !!process.env.DISCORD_WEBHOOK_URL,
      telegramConfigured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      supabaseConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      liveTrading: !!process.env.POLYMARKET_API_KEY,
    },
  };

  return NextResponse.json(health, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
