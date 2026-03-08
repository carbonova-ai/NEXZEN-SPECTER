-- NEXZEN SPECTER — Paper Trading Schema
-- Run this SQL in the Supabase SQL Editor

-- ══════════════════════════════════════════════
-- Table: paper_trades
-- Simulated trades for strategy validation
-- ══════════════════════════════════════════════
CREATE TABLE paper_trades (
  id TEXT PRIMARY KEY,
  prediction_id TEXT NOT NULL REFERENCES predictions(id),
  direction TEXT NOT NULL CHECK (direction IN ('UP', 'DOWN')),
  confidence TEXT NOT NULL CHECK (confidence IN ('LOW', 'MED', 'HIGH')),
  probability DOUBLE PRECISION NOT NULL,
  stake DOUBLE PRECISION NOT NULL DEFAULT 0,
  entry_price DOUBLE PRECISION NOT NULL,
  exit_price DOUBLE PRECISION,
  yes_price DOUBLE PRECISION NOT NULL DEFAULT 0.50,
  payout DOUBLE PRECISION,
  pnl DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'WON', 'LOST', 'SKIPPED')),
  skip_reason TEXT,
  bankroll_before DOUBLE PRECISION NOT NULL,
  bankroll_after DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Indexes for querying
CREATE INDEX idx_paper_trades_created_at ON paper_trades (created_at DESC);
CREATE INDEX idx_paper_trades_status ON paper_trades (status);
CREATE INDEX idx_paper_trades_prediction_id ON paper_trades (prediction_id);

-- ══════════════════════════════════════════════
-- RLS policies (public read/insert/update for v0.1)
-- ══════════════════════════════════════════════
ALTER TABLE paper_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read paper_trades" ON paper_trades
  FOR SELECT USING (true);
CREATE POLICY "Allow public insert paper_trades" ON paper_trades
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update paper_trades" ON paper_trades
  FOR UPDATE USING (true);
