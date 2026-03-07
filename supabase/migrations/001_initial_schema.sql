-- NEXZEN SPECTER — Database Schema
-- Run this SQL in the Supabase SQL Editor (https://supabase.com/dashboard/project/njywixfeaakamntqvmad/sql)

-- ══════════════════════════════════════════════
-- Table: predictions
-- Stores every 5-minute prediction cycle result
-- ══════════════════════════════════════════════
CREATE TABLE predictions (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('UP', 'DOWN')),
  probability DOUBLE PRECISION NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('LOW', 'MED', 'HIGH')),
  entry_price DOUBLE PRECISION NOT NULL,
  target_price DOUBLE PRECISION NOT NULL,
  exit_price DOUBLE PRECISION,
  outcome TEXT NOT NULL DEFAULT 'PENDING' CHECK (outcome IN ('WIN', 'LOSS', 'PENDING')),
  pnl_percent DOUBLE PRECISION,
  polymarket_sentiment DOUBLE PRECISION,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  reasoning TEXT[] NOT NULL DEFAULT '{}',
  indicators JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ
);

-- Index for querying recent predictions
CREATE INDEX idx_predictions_created_at ON predictions (created_at DESC);
CREATE INDEX idx_predictions_outcome ON predictions (outcome);

-- ══════════════════════════════════════════════
-- Table: performance_snapshots
-- Periodic snapshots of engine performance
-- ══════════════════════════════════════════════
CREATE TABLE performance_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  total_predictions INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  losses INTEGER NOT NULL,
  win_rate DOUBLE PRECISION NOT NULL,
  streak_current INTEGER NOT NULL DEFAULT 0,
  streak_best INTEGER NOT NULL DEFAULT 0,
  max_drawdown DOUBLE PRECISION NOT NULL DEFAULT 0,
  equity DOUBLE PRECISION NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_performance_created_at ON performance_snapshots (created_at DESC);

-- ══════════════════════════════════════════════
-- Table: polymarket_snapshots
-- Snapshots of Polymarket odds for BTC markets
-- ══════════════════════════════════════════════
CREATE TABLE polymarket_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_id TEXT NOT NULL,
  question TEXT NOT NULL,
  yes_price DOUBLE PRECISION NOT NULL,
  no_price DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION NOT NULL DEFAULT 0,
  liquidity DOUBLE PRECISION NOT NULL DEFAULT 0,
  sentiment_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_polymarket_market_id ON polymarket_snapshots (market_id, created_at DESC);
CREATE INDEX idx_polymarket_created_at ON polymarket_snapshots (created_at DESC);

-- ══════════════════════════════════════════════
-- Enable Row Level Security (public read, insert)
-- ══════════════════════════════════════════════
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE polymarket_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow anon to read and insert (no auth for v0.1)
CREATE POLICY "Allow public read predictions" ON predictions
  FOR SELECT USING (true);
CREATE POLICY "Allow public insert predictions" ON predictions
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update predictions" ON predictions
  FOR UPDATE USING (true);

CREATE POLICY "Allow public read performance" ON performance_snapshots
  FOR SELECT USING (true);
CREATE POLICY "Allow public insert performance" ON performance_snapshots
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read polymarket" ON polymarket_snapshots
  FOR SELECT USING (true);
CREATE POLICY "Allow public insert polymarket" ON polymarket_snapshots
  FOR INSERT WITH CHECK (true);
