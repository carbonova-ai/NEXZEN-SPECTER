/**
 * Notification Relay API
 *
 * Server-side endpoint that sends notifications to Discord/Telegram.
 * Credentials stay server-side — client only sends event data.
 *
 * ENV:
 *   DISCORD_WEBHOOK_URL   — Discord channel webhook
 *   TELEGRAM_BOT_TOKEN    — Telegram bot token
 *   TELEGRAM_CHAT_ID      — Telegram chat/group ID
 */

import { NextResponse } from 'next/server';

// Discord embed colors (decimal)
const COLORS = {
  GREEN: 0x00ff41,
  RED: 0xff4444,
  YELLOW: 0xffaa00,
  BLUE: 0x3b82f6,
  ORANGE: 0xff8c00,
  PURPLE: 0x8b5cf6,
};

interface NotificationPayload {
  type: 'TRADE' | 'ALERT' | 'REGIME' | 'HEALTH' | 'CIRCUIT_BREAKER';
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  data?: Record<string, unknown>;
}

function levelToColor(level: string, type: string): number {
  if (type === 'CIRCUIT_BREAKER') return COLORS.RED;
  if (type === 'TRADE') return COLORS.BLUE;
  if (type === 'REGIME') return COLORS.PURPLE;
  if (type === 'HEALTH') return COLORS.ORANGE;
  if (level === 'CRITICAL') return COLORS.RED;
  if (level === 'WARNING') return COLORS.YELLOW;
  return COLORS.GREEN;
}

function levelEmoji(level: string): string {
  return { INFO: 'ℹ️', WARNING: '⚠️', CRITICAL: '🚨' }[level] ?? 'ℹ️';
}

// ── Discord ──

async function sendDiscord(url: string, payload: NotificationPayload): Promise<boolean> {
  const embed = {
    title: `${levelEmoji(payload.level)} ${payload.title}`,
    description: payload.message,
    color: levelToColor(payload.level, payload.type),
    fields: payload.fields ?? [],
    timestamp: new Date().toISOString(),
    footer: { text: 'SPECTER v0.2 • Adaptive Trading Engine' },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Telegram ──

async function sendTelegram(token: string, chatId: string, payload: NotificationPayload): Promise<boolean> {
  const emoji = levelEmoji(payload.level);
  let text = `${emoji} <b>SPECTER ${payload.level}</b>\n`;
  text += `<b>${payload.title}</b>\n`;
  text += `${payload.message}\n`;

  if (payload.fields?.length) {
    text += '\n';
    for (const f of payload.fields) {
      text += `• <b>${f.name}:</b> ${f.value}\n`;
    }
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Route Handler ──

export async function POST(request: Request) {
  try {
    const payload: NotificationPayload = await request.json();

    if (!payload.type || !payload.title || !payload.message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const results: Record<string, boolean> = {};

    // Discord
    const discordUrl = process.env.DISCORD_WEBHOOK_URL;
    if (discordUrl) {
      results.discord = await sendDiscord(discordUrl, payload);
    }

    // Telegram
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChat = process.env.TELEGRAM_CHAT_ID;
    if (telegramToken && telegramChat) {
      results.telegram = await sendTelegram(telegramToken, telegramChat, payload);
    }

    const anyConfigured = discordUrl || (telegramToken && telegramChat);
    if (!anyConfigured) {
      return NextResponse.json({ sent: false, reason: 'No notification channels configured' });
    }

    return NextResponse.json({ sent: true, results });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

// GET: Check configuration status
export async function GET() {
  return NextResponse.json({
    configured: {
      discord: !!process.env.DISCORD_WEBHOOK_URL,
      telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    },
  });
}
