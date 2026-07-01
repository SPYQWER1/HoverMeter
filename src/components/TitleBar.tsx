/**
 * TitleBar 组件 — 窗口标题栏（拖拽区域）
 *
 * 包含品牌标识、刷新按钮、设置按钮、隐藏按钮。
 * 标题栏本身是可拖拽区域（data-tauri-drag-region），
 * 按钮区域设置为 no-drag 以允许点击交互。
 */

interface TitleBarProps {
  /** 标题文本，显示在品牌标识旁 */
  title: string;
  /** 刷新按钮是否处于旋转动画状态 */
  isRefreshing: boolean;
  /** 点击设置按钮回调 */
  onSettings: () => void;
  /** 点击刷新按钮回调 */
  onRefresh: () => void;
  /** 点击隐藏按钮回调（隐藏到系统托盘） */
  onHide: () => void;
}

export function TitleBar({
  title,
  isRefreshing,
  onSettings,
  onRefresh,
  onHide,
}: TitleBarProps) {
  return (
    <div className="title-bar" data-tauri-drag-region>
      <div className="title-brand">
        <span className="title-dot" />
        <span>{title}</span>
      </div>
      <div className="title-actions">
        <button
          className={`icon-btn${isRefreshing ? " is-spinning" : ""}`}
          title="刷新"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          {"\u21BB"}
        </button>
        <button className="icon-btn" title="设置" onClick={onSettings}>
          {"\u2699"}
        </button>
        <button
          className="icon-btn icon-btn--close"
          title="隐藏到托盘"
          onClick={onHide}
        >
          {"\u2715"}
        </button>
      </div>
    </div>
  );
}
