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
  label: "session" | "weekly" | "monthly";
  percent: number;
  reset_at: number;
}

export interface VolcanoUsage {
  periods: PeriodUsage[];
  updated_at: number;
}

// ──────────────────────────────────────────────
// Volcano Engine Plan Status Types
// ──────────────────────────────────────────────

export interface VolcanoPlan {
  plan_type: string;
  status: string;
  start_time: string;
  end_time: string;
  auto_renew: boolean;
}

// ──────────────────────────────────────────────
// App Settings Types
// ──────────────────────────────────────────────

export interface AppSettings {
  volcano_access_key: string;
  volcano_secret_key: string;
  deepseek_api_key: string;
  refresh_interval: number;
  opacity: number;
}

// ──────────────────────────────────────────────
// Tauri Command Types
// ──────────────────────────────────────────────

/** Response from `get_balance` Tauri command */
export interface GetBalanceResponse {
  balance: DeepSeekBalance | null;
  error?: string;
}

/** Response from `get_usage` Tauri command */
export interface GetUsageResponse {
  usage: VolcanoUsage | null;
  error?: string;
}

/** Response from `get_plan` Tauri command */
export interface GetPlanResponse {
  plan: VolcanoPlan | null;
  error?: string;
}

/** Response from `get_settings` Tauri command */
export interface GetSettingsResponse {
  settings: AppSettings | null;
  error?: string;
}

/** Request payload for `save_credentials` Tauri command */
export interface SaveCredentialsRequest {
  volcanoAccessKey: string;
  volcanoSecretKey: string;
  deepseekApiKey: string;
}

/** Request payload for `save_settings` Tauri command */
export interface SaveSettingsRequest {
  refreshInterval?: number;
  opacity?: number;
}

/** Generic Tauri command result wrapper */
export interface CommandResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
