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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
