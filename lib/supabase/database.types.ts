export interface Database {
  public: {
    Tables: {
      predictions: {
        Row: {
          id: string;
          direction: string;
          probability: number;
          confidence: string;
          entry_price: number;
          target_price: number;
          exit_price: number | null;
          outcome: string;
          pnl_percent: number | null;
          polymarket_sentiment: number | null;
          chainlink_price: number | null;
          chainlink_delta: number | null;
          resolution_source: string;
          signals: Record<string, number>;
          reasoning: string[];
          indicators: Record<string, unknown>;
          created_at: string;
          expires_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id: string;
          direction: string;
          probability: number;
          confidence: string;
          entry_price: number;
          target_price: number;
          exit_price?: number | null;
          outcome?: string;
          pnl_percent?: number | null;
          polymarket_sentiment?: number | null;
          chainlink_price?: number | null;
          chainlink_delta?: number | null;
          resolution_source?: string;
          signals?: Record<string, number>;
          reasoning?: string[];
          indicators?: Record<string, unknown>;
          created_at?: string;
          expires_at: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          direction?: string;
          probability?: number;
          confidence?: string;
          entry_price?: number;
          target_price?: number;
          exit_price?: number | null;
          outcome?: string;
          pnl_percent?: number | null;
          polymarket_sentiment?: number | null;
          chainlink_price?: number | null;
          chainlink_delta?: number | null;
          resolution_source?: string;
          signals?: Record<string, number>;
          reasoning?: string[];
          indicators?: Record<string, unknown>;
          created_at?: string;
          expires_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      performance_snapshots: {
        Row: {
          id: number;
          total_predictions: number;
          wins: number;
          losses: number;
          win_rate: number;
          streak_current: number;
          streak_best: number;
          max_drawdown: number;
          equity: number;
          created_at: string;
        };
        Insert: {
          total_predictions: number;
          wins: number;
          losses: number;
          win_rate: number;
          streak_current?: number;
          streak_best?: number;
          max_drawdown?: number;
          equity?: number;
          created_at?: string;
        };
        Update: {
          total_predictions?: number;
          wins?: number;
          losses?: number;
          win_rate?: number;
          streak_current?: number;
          streak_best?: number;
          max_drawdown?: number;
          equity?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      chainlink_snapshots: {
        Row: {
          id: number;
          price: number;
          round_id: string;
          updated_at_chain: string;
          staleness_ms: number;
          network: string;
          created_at: string;
        };
        Insert: {
          price: number;
          round_id: string;
          updated_at_chain: string;
          staleness_ms: number;
          network?: string;
          created_at?: string;
        };
        Update: {
          price?: number;
          round_id?: string;
          updated_at_chain?: string;
          staleness_ms?: number;
          network?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      delta_history: {
        Row: {
          id: number;
          binance_price: number;
          chainlink_price: number;
          delta_percent: number;
          delta_direction: string;
          edge_signal: number;
          created_at: string;
        };
        Insert: {
          binance_price: number;
          chainlink_price: number;
          delta_percent: number;
          delta_direction: string;
          edge_signal: number;
          created_at?: string;
        };
        Update: {
          binance_price?: number;
          chainlink_price?: number;
          delta_percent?: number;
          delta_direction?: string;
          edge_signal?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      polymarket_snapshots: {
        Row: {
          id: number;
          market_id: string;
          question: string;
          yes_price: number;
          no_price: number;
          volume: number;
          liquidity: number;
          sentiment_score: number;
          created_at: string;
        };
        Insert: {
          market_id: string;
          question: string;
          yes_price: number;
          no_price: number;
          volume?: number;
          liquidity?: number;
          sentiment_score?: number;
          created_at?: string;
        };
        Update: {
          market_id?: string;
          question?: string;
          yes_price?: number;
          no_price?: number;
          volume?: number;
          liquidity?: number;
          sentiment_score?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      paper_trades: {
        Row: {
          id: string;
          prediction_id: string;
          direction: string;
          confidence: string;
          probability: number;
          stake: number;
          entry_price: number;
          exit_price: number | null;
          yes_price: number;
          payout: number | null;
          pnl: number | null;
          status: string;
          skip_reason: string | null;
          bankroll_before: number;
          bankroll_after: number | null;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id: string;
          prediction_id: string;
          direction: string;
          confidence: string;
          probability: number;
          stake?: number;
          entry_price: number;
          exit_price?: number | null;
          yes_price?: number;
          payout?: number | null;
          pnl?: number | null;
          status?: string;
          skip_reason?: string | null;
          bankroll_before: number;
          bankroll_after?: number | null;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          prediction_id?: string;
          direction?: string;
          confidence?: string;
          probability?: number;
          stake?: number;
          entry_price?: number;
          exit_price?: number | null;
          yes_price?: number;
          payout?: number | null;
          pnl?: number | null;
          status?: string;
          skip_reason?: string | null;
          bankroll_before?: number;
          bankroll_after?: number | null;
          created_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'paper_trades_prediction_id_fkey';
            columns: ['prediction_id'];
            referencedRelation: 'predictions';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
