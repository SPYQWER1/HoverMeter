/**
 * HoverMeter 格式化工具函数
 *
 * 提供百分比状态判断、时间格式化、货币符号映射等纯函数。
 */

/** 用量百分比状态分类 */
export type PercentStatus = "ok" | "warn" | "danger";

/**
 * 根据用量百分比返回对应的警告等级。
 *
 * - ≥80% → `"danger"`（危险）
 * - ≥50% → `"warn"`（警告）
 * - 否则 → `"ok"`（正常）
 */
export function percentStatus(percent: number): PercentStatus {
  if (percent >= 80) return "danger";
  if (percent >= 50) return "warn";
  return "ok";
}

/**
 * 将百分比数值格式化为带一位小数的字符串，如 `"67.5%"`。
 */
export function formatPercent(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

/**
 * 将 Unix 毫秒时间戳格式化为剩余时间的人类可读形式。
 *
 * 返回值示例：`"now"`, `"5m"`, `"2h 30m"`, `"3d"`。
 */
export function formatReset(resetAt: number): string {
  const diff = resetAt - Date.now();
  if (diff <= 0) return "now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMin = mins % 60;
  if (hours < 24) return `${hours}h ${remMin}m`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * 将 Unix 毫秒时间戳格式化为北京时间（HH:MM）。
 *
 * 若时间戳为空，返回 em-dash（—）。
 */
export function formatBeijingTime(ts: number | undefined): string {
  if (!ts) return "\u2014";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

/**
 * 根据货币代码返回对应的货币符号。
 *
 * 支持 CNY/RMB → ¥, USD → $, EUR → €, GBP → £。
 * 未知货币直接返回代码本身。
 */
export function currencySymbol(currency: string): string {
  switch (currency.toUpperCase()) {
    case "CNY":
    case "RMB":
      return "\u00A5";
    case "USD":
      return "$";
    case "EUR":
      return "\u20AC";
    case "GBP":
      return "\u00A3";
    default:
      return `${currency} `;
  }
}
