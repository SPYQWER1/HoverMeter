/**
 * UsageCell 组件 — 单个用量周期卡片
 *
 * 显示周期名称、用量百分比和剩余重置时间。
 * 根据百分比自动切换颜色主题（ok/warn/danger）。
 */

import type { PeriodUsage } from "../types";
import { formatPercent, formatReset, percentStatus } from "../utils/format";

interface UsageCellProps {
  period: PeriodUsage;
}

export function UsageCell({ period }: UsageCellProps) {
  const status = percentStatus(period.percent);
  return (
    <div className={`usage-cell is-${status}`}>
      <span className="usage-label">{period.label}</span>
      <span className="usage-value">{formatPercent(period.percent)}</span>
      <span className="usage-reset">{`in ${formatReset(period.reset_at)}`}</span>
    </div>
  );
}
