// ──────────────────────────────────────────────
// 全局常量
// ──────────────────────────────────────────────

/** 默认窗口不透明度（0.0–1.0） */
export const DEFAULT_OPACITY = 0.85;

/** 默认数据刷新间隔（分钟） */
export const DEFAULT_REFRESH_INTERVAL = 5;

// ──────────────────────────────────────────────
// DeepSeek 余额类型
// ──────────────────────────────────────────────

/** 单个币种的余额信息 */
export interface BalanceInfo {
  /** 货币代码，如 "CNY" */
  currency: string;
  /** 总余额（字符串形式以保持精度） */
  total_balance: string;
  /** 赠送余额 */
  granted_balance: string;
  /** 充值余额 */
  topped_up_balance: string;
}

/** DeepSeek 余额查询的顶层响应 */
export interface DeepSeekBalance {
  /** 账户是否可用 */
  is_available: boolean;
  /** 各币种余额列表 */
  balance_infos: BalanceInfo[];
}

// ──────────────────────────────────────────────
// 火山引擎（arkcli）用量类型
// ──────────────────────────────────────────────

/** 单个用量周期（session / weekly / monthly） */
export interface PeriodUsage {
  /** 周期标签 */
  label: string;
  /** 用量百分比（0.0–100.0） */
  percent: number;
  /** 本周期重置时间的 Unix 毫秒时间戳 */
  reset_at: number;
}

/** 火山引擎 Coding Plan 用量摘要 */
export interface VolcanoUsage {
  /** 用量周期列表 */
  periods: PeriodUsage[];
  /** 数据获取时间的 Unix 毫秒时间戳 */
  updated_at: number;
}

// ──────────────────────────────────────────────
// 应用设置类型
// ──────────────────────────────────────────────

/** 应用设置（前端与 Rust 后端共享的结构） */
export interface AppSettings {
  /** DeepSeek API 密钥 */
  deepseek_api_key: string;
  /** 数据刷新间隔（分钟） */
  refresh_interval: number;
  /** 窗口不透明度（0.0–1.0） */
  opacity: number;
  /** 是否启用开机自启 */
  autostart: boolean;
}
