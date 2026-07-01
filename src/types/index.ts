// ──────────────────────────────────────────────
// DeepSeek Balance Types
// ──────────────────────────────────────────────

export interface BalanceInfo {
  currency: string;
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
}

export interface DeepSeekBalance {
  is_available: boolean;
  balance_infos: BalanceInfo[];
}

// ──────────────────────────────────────────────
// Volcano Engine (arkcli) Usage Types
// ──────────────────────────────────────────────

export interface PeriodUsage {
  label: string;
  percent: number;
  reset_at: number;
}

export interface VolcanoUsage {
  periods: PeriodUsage[];
  updated_at: number;
}

// ──────────────────────────────────────────────
// App Settings Types
// ──────────────────────────────────────────────

export interface AppSettings {
  deepseek_api_key: string;
  refresh_interval: number;
  opacity: number;
  autostart: boolean;
}

